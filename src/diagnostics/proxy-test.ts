import { Socket } from 'node:net'
import { connect as connectTls } from 'node:tls'
import { getMihomoAxios } from '../mihomo/api.js'
import { readControlledConfig } from '../config/controlled.js'
import { readConfig } from '../config/state.js'
import { serviceStatus } from '../service/service.js'
import { MihoroError, errorMessage } from '../lib/errors.js'
import { packageInfo } from '../lib/package-info.js'

export type DiagnosticStatus = 'ok' | 'warn' | 'fail' | 'skip'

export interface DiagnosticStep {
  /** Human-readable step name shown in CLI output. */
  name: string
  /** Diagnostic status for this step. */
  status: DiagnosticStatus
  /** Concise detail shown in CLI output. */
  detail: string
  /** Optional step duration in milliseconds. */
  durationMs?: number
}

export interface ProxyTestResult {
  /** Redacted target URL shown to the user. */
  target: string
  /** Proxy endpoint used for the test. */
  proxyEndpoint?: string
  /** Ordered diagnostic steps. */
  steps: DiagnosticStep[]
  /** Final human-readable diagnosis. */
  summary: string
  /** CLI exit code represented by the diagnosis. */
  exitCode: number
}

export interface ProxyEndpoint {
  /** Proxy listener host. */
  host: string
  /** Proxy listener port. */
  port: number
  /** Optional request timeout in milliseconds. */
  timeoutMs?: number
}

export interface ProxyHttpResponse {
  /** HTTP status code returned by the target. */
  statusCode: number
  /** HTTP status message returned by the target. */
  statusMessage: string
  /** Request duration in milliseconds. */
  durationMs: number
}

const sensitiveQueryKeys = new Set([
  'token',
  'access_token',
  'auth',
  'authorization',
  'key',
  'apikey',
  'api_key',
  'password',
  'passwd',
  'secret',
  'signature',
  'sign'
])

/**
 * Parses and validates a URL accepted by the proxy test command.
 *
 * @param value User-provided URL string.
 * @returns Parsed HTTP or HTTPS URL.
 */
export function parseTestUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new MihoroError('Expected an HTTP or HTTPS URL.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new MihoroError('Expected an HTTP or HTTPS URL.')
  }
  return url
}

/**
 * Returns a display-safe URL with credentials and sensitive query values hidden.
 *
 * @param url Parsed URL to redact.
 * @returns Redacted URL string.
 */
export function redactUrl(url: URL): string {
  const redacted = new URL(url.toString())
  if (redacted.username) redacted.username = '***'
  if (redacted.password) redacted.password = '***'
  for (const key of Array.from(redacted.searchParams.keys())) {
    if (sensitiveQueryKeys.has(key.toLowerCase())) redacted.searchParams.set(key, '***')
  }
  return redacted.toString()
}

/**
 * Classifies an HTTP status code for proxy diagnostic output.
 *
 * @param statusCode HTTP status code returned by the target.
 * @returns Diagnostic status and CLI exit code.
 */
export function classifyHttpStatus(statusCode: number): { status: DiagnosticStatus; exitCode: number } {
  if (statusCode >= 400) return { status: 'warn', exitCode: 0 }
  return { status: 'ok', exitCode: 0 }
}

/**
 * Runs the full proxy URL diagnostic flow.
 *
 * @param value User-provided URL string.
 * @returns Structured diagnostic result.
 */
export async function testProxyUrl(value: string): Promise<ProxyTestResult> {
  const steps: DiagnosticStep[] = []
  const url = parseTestUrl(value)
  const target = redactUrl(url)
  steps.push({ name: 'URL', status: 'ok', detail: target })

  const config = await readConfig()
  const controlled = await readControlledConfig()
  const port = Number(controlled['mixed-port'] || 7890)
  if (!Number.isInteger(port) || port <= 0) {
    throw new MihoroError(`Invalid mihomo mixed-port: ${String(controlled['mixed-port'])}`)
  }
  const endpoint: ProxyEndpoint = { host: config.proxyHost, port, timeoutMs: 10_000 }
  const proxyEndpoint = `${endpoint.host}:${endpoint.port}`
  steps.push({ name: 'Config', status: 'ok', detail: `proxy endpoint ${proxyEndpoint}` })

  const status = await serviceStatus()
  const serviceIsRunning = status.startsWith('running ')
  steps.push({ name: 'Service', status: serviceIsRunning ? 'ok' : 'fail', detail: status })

  const apiStep = await measureStep('Mihomo API', async () => {
    await getMihomoAxios().get('/')
    return 'API is reachable'
  })
  steps.push(apiStep)

  const tcpStep = await measureStep('Proxy TCP', async () => {
    await probeTcp(endpoint.host, endpoint.port, 1500)
    return `connected to ${proxyEndpoint}`
  })
  steps.push(tcpStep)

  if (tcpStep.status === 'fail') {
    steps.push({ name: 'HTTP via proxy', status: 'skip', detail: 'proxy TCP check failed' })
    return {
      target,
      proxyEndpoint,
      steps,
      summary: `proxy listener is not reachable at ${proxyEndpoint}.`,
      exitCode: 1
    }
  }

  try {
    const response = await requestViaHttpProxy(url, endpoint)
    const classified = classifyHttpStatus(response.statusCode)
    steps.push({
      name: 'HTTP via proxy',
      status: classified.status,
      durationMs: response.durationMs,
      detail: `HTTP ${response.statusCode}${response.statusMessage ? ` ${response.statusMessage}` : ''}`
    })
    const summary = classified.status === 'warn'
      ? `proxy path reached the target, but the target returned HTTP ${response.statusCode}.`
      : `proxy path reached the target and returned HTTP ${response.statusCode}.`
    return { target, proxyEndpoint, steps, summary, exitCode: classified.exitCode }
  } catch (error) {
    steps.push({ name: 'HTTP via proxy', status: 'fail', detail: errorMessage(error) })
    return {
      target,
      proxyEndpoint,
      steps,
      summary: `proxy request failed: ${errorMessage(error)}`,
      exitCode: 1
    }
  }
}

/**
 * Checks whether a TCP endpoint accepts connections.
 *
 * @param host TCP host.
 * @param port TCP port.
 * @param timeoutMs Connection timeout in milliseconds.
 * @returns Nothing after a connection succeeds.
 */
export async function probeTcp(host: string, port: number, timeoutMs: number): Promise<void> {
  await openTcpSocket(host, port, timeoutMs).then((socket) => socket.destroy())
}

/**
 * Sends one GET request to a target URL through an HTTP proxy endpoint.
 *
 * @param url Target HTTP or HTTPS URL.
 * @param endpoint Proxy endpoint and timeout.
 * @returns HTTP response status metadata.
 */
export async function requestViaHttpProxy(url: URL, endpoint: ProxyEndpoint): Promise<ProxyHttpResponse> {
  const started = Date.now()
  const timeoutMs = endpoint.timeoutMs ?? 10_000
  if (url.protocol === 'http:') {
    const socket = await openTcpSocket(endpoint.host, endpoint.port, timeoutMs)
    try {
      socket.write(buildHttpProxyRequest(url))
      const headers = await readHttpHeaderBlock(socket, timeoutMs)
      return { ...parseStatusLine(headers.statusLine), durationMs: Date.now() - started }
    } finally {
      socket.destroy()
    }
  }

  const socket = await openTcpSocket(endpoint.host, endpoint.port, timeoutMs)
  try {
    socket.write(connectRequest(url))
    const connectStatus = parseStatusLine((await readHttpHeaderBlock(socket, timeoutMs)).statusLine)
    if (connectStatus.statusCode < 200 || connectStatus.statusCode >= 300) {
      throw new MihoroError(`proxy CONNECT rejected: HTTP ${connectStatus.statusCode}${connectStatus.statusMessage ? ` ${connectStatus.statusMessage}` : ''}`)
    }
    const tlsSocket = connectTls({
      socket,
      servername: url.hostname
    })
    try {
      await onceSecure(tlsSocket, timeoutMs)
      tlsSocket.write(buildHttpOriginRequest(url))
      const headers = await readHttpHeaderBlock(tlsSocket, timeoutMs)
      return { ...parseStatusLine(headers.statusLine), durationMs: Date.now() - started }
    } finally {
      tlsSocket.destroy()
    }
  } catch (error) {
    socket.destroy()
    throw error
  }
}

/**
 * Measures a diagnostic step and maps thrown errors to a failed step.
 *
 * @param name Step name.
 * @param body Step body returning success detail.
 * @returns Diagnostic step.
 */
async function measureStep(name: string, body: () => Promise<string>): Promise<DiagnosticStep> {
  const started = Date.now()
  try {
    return { name, status: 'ok', detail: await body(), durationMs: Date.now() - started }
  } catch (error) {
    return { name, status: 'fail', detail: errorMessage(error), durationMs: Date.now() - started }
  }
}

/**
 * Opens a TCP socket with timeout handling.
 *
 * @param host TCP host.
 * @param port TCP port.
 * @param timeoutMs Timeout in milliseconds.
 * @returns Connected socket.
 */
function openTcpSocket(host: string, port: number, timeoutMs: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = new Socket()
    let settled = false
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      socket.removeAllListeners()
      socket.setTimeout(0)
      if (error) {
        socket.destroy()
        reject(error)
        return
      }
      resolve(socket)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish())
    socket.once('error', (error) => finish(new MihoroError(`cannot connect ${host}:${port}: ${error.message}`)))
    socket.once('timeout', () => finish(new MihoroError(`cannot connect ${host}:${port} within ${timeoutMs}ms`)))
    socket.connect(port, host)
  })
}

/**
 * Builds an absolute-form HTTP proxy GET request.
 *
 * @param url Target URL.
 * @returns Raw HTTP request string.
 */
export function buildHttpProxyRequest(url: URL): string {
  return httpRequest(url, url.toString())
}

/**
 * Builds an origin-form HTTP GET request.
 *
 * @param url Target URL.
 * @returns Raw HTTP request string.
 */
export function buildHttpOriginRequest(url: URL): string {
  return httpRequest(url, originForm(url))
}

/**
 * Builds an HTTP GET request.
 *
 * @param url Target URL.
 * @param requestTarget HTTP request target.
 * @returns Raw HTTP request string.
 */
function httpRequest(url: URL, requestTarget: string): string {
  return [
    `GET ${requestTarget} HTTP/1.1`,
    `Host: ${hostHeader(url)}`,
    `User-Agent: mihoro-cli/${packageInfo.version}`,
    'Accept: */*',
    'Connection: close',
    '',
    ''
  ].join('\r\n')
}

/**
 * Builds an HTTPS CONNECT request.
 *
 * @param url Target HTTPS URL.
 * @returns Raw CONNECT request string.
 */
function connectRequest(url: URL): string {
  const authority = `${url.hostname}:${url.port || '443'}`
  return [
    `CONNECT ${authority} HTTP/1.1`,
    `Host: ${authority}`,
    `User-Agent: mihoro-cli/${packageInfo.version}`,
    'Proxy-Connection: keep-alive',
    '',
    ''
  ].join('\r\n')
}

/**
 * Builds an HTTP host header, including non-default ports.
 *
 * @param url Target URL.
 * @returns Host header value.
 */
function hostHeader(url: URL): string {
  if (!url.port) return url.hostname
  if (url.protocol === 'http:' && url.port === '80') return url.hostname
  if (url.protocol === 'https:' && url.port === '443') return url.hostname
  return `${url.hostname}:${url.port}`
}

/**
 * Builds origin-form path and query for HTTPS requests after CONNECT.
 *
 * @param url Target URL.
 * @returns Origin-form request target.
 */
function originForm(url: URL): string {
  return `${url.pathname || '/'}${url.search}`
}

/**
 * Reads an HTTP header block from a socket.
 *
 * @param socket Connected socket.
 * @param timeoutMs Timeout in milliseconds.
 * @returns Raw HTTP status line and header block.
 */
function readHttpHeaderBlock(socket: Socket, timeoutMs: number): Promise<{ statusLine: string; headers: string }> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const cleanup = (): void => {
      socket.off('data', onData)
      socket.off('error', onError)
      socket.off('timeout', onTimeout)
      socket.setTimeout(0)
    }
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString('latin1')
      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return
      const headers = buffer.slice(0, headerEnd)
      const lineEnd = headers.indexOf('\r\n')
      cleanup()
      resolve({ statusLine: lineEnd === -1 ? headers : headers.slice(0, lineEnd), headers })
    }
    const onError = (error: Error): void => {
      cleanup()
      reject(error)
    }
    const onTimeout = (): void => {
      cleanup()
      reject(new MihoroError(`request timed out after ${timeoutMs}ms`))
    }
    socket.setTimeout(timeoutMs)
    socket.on('data', onData)
    socket.once('error', onError)
    socket.once('timeout', onTimeout)
  })
}

/**
 * Parses an HTTP status line.
 *
 * @param statusLine Raw HTTP status line.
 * @returns Parsed status code and message.
 */
function parseStatusLine(statusLine: string): Pick<ProxyHttpResponse, 'statusCode' | 'statusMessage'> {
  const match = /^HTTP\/\d(?:\.\d)?\s+(\d{3})(?:\s+(.*))?$/.exec(statusLine)
  if (!match) throw new MihoroError(`invalid HTTP response from proxy: ${statusLine}`)
  return { statusCode: Number(match[1]), statusMessage: match[2] || '' }
}

/**
 * Waits for TLS secure connection establishment.
 *
 * @param socket TLS socket.
 * @param timeoutMs Timeout in milliseconds.
 * @returns Nothing after TLS is ready.
 */
function onceSecure(socket: NodeJS.EventEmitter & { setTimeout(timeout: number): unknown }, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      socket.off('secureConnect', onSecure)
      socket.off('error', onError)
      socket.off('timeout', onTimeout)
      socket.setTimeout(0)
    }
    const onSecure = (): void => {
      cleanup()
      resolve()
    }
    const onError = (error: Error): void => {
      cleanup()
      reject(new MihoroError(`TLS handshake failed: ${error.message}`))
    }
    const onTimeout = (): void => {
      cleanup()
      reject(new MihoroError('TLS handshake timed out'))
    }
    socket.setTimeout(timeoutMs)
    socket.once('secureConnect', onSecure)
    socket.once('error', onError)
    socket.once('timeout', onTimeout)
  })
}
