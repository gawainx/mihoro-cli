# ProxyTestDiagnostics_20260618

## 核心功能（WHAT）

新增顶层诊断命令：

```bash
mihoro-cli test <url>
```

该命令通过 mihoro 当前配置的 mihomo `mixed-port` 代理访问用户提供的 HTTP/HTTPS URL，并以分步骤、美化输出的形式展示诊断过程和最终结论。

### 需求背景（WHY）

用户在使用命令行代理时，访问失败可能来自多个层级：

- URL 输入错误或协议不支持。
- mihoro 配置异常。
- mihomo 服务未运行。
- mihomo API 不可用。
- `mixed-port` 未监听或端口被其他进程占用。
- 代理转发阶段出现 DNS、TCP、TLS 或请求超时错误。
- 目标服务返回 `4xx/5xx`。

现有 `proxy enable` 和 `service status` 能处理部分启动和状态问题，但缺少一个面向“访问某个 URL 为什么失败”的诊断命令。

### 需求目标（GOAL）

- 用户执行 `mihoro-cli test <url>` 后，能看到代理访问链路的关键步骤。
- 命令默认通过 mihoro/mihomo 代理链路访问目标 URL。
- 命令无副作用，不启动或重启 mihomo，不修改系统代理或节点配置。
- 输出能明确标记失败阶段和失败原因。
- URL 输出默认脱敏，避免泄露账号密码和 token 类 query。
- HTTP `4xx/5xx` 被归类为目标服务返回错误，不误判为代理链路失败。

### 范围边界

纳入范围：

- 新增 `src/diagnostics/proxy-test.ts` 诊断模块。
- 新增 `mihoro-cli test <url>` 命令注册。
- 实现 URL 解析、脱敏、协议校验。
- 读取 mihoro `proxyHost` 和 mihomo `mixed-port`。
- 检查 mihomo 服务状态、mihomo API 可用性和代理 TCP 端口可用性。
- 通过 mihomo mixed-port 代理发起 HTTP/HTTPS 请求。
- 输出诊断步骤表格与最终结论。
- 为 URL 脱敏、结果分类和失败原因映射补充自动化测试。
- 更新 README 命令说明。

不纳入范围：

- 不自动启动、重启或停止 mihomo。
- 不修改配置文件、系统代理设置或代理节点选择。
- 不做直连对比。
- 不新增 `--json`。
- 不做批量节点测速、批量代理组测试、TUI、traceroute、抓包或证书链深度分析。

## 实现流程（HOW）

### 总体技术决策

采用“诊断步骤收集 + 统一渲染”的模型：

1. 每个检查步骤返回结构化 `DiagnosticStep`。
2. 命令层只负责调用诊断函数并渲染输出。
3. 诊断函数不修改任何运行状态。
4. 失败步骤不会隐藏前序结果，输出保留已经完成的检查信息。

建议类型：

```ts
export type DiagnosticStatus = 'ok' | 'warn' | 'fail' | 'skip'

export interface DiagnosticStep {
  name: string
  status: DiagnosticStatus
  detail: string
  durationMs?: number
}

export interface ProxyTestResult {
  target: string
  proxyEndpoint?: string
  steps: DiagnosticStep[]
  summary: string
  exitCode: number
}
```

命令执行成功但诊断失败时，建议通过 `exitCode` 控制 CLI 退出码：

- 代理链路连通并拿到 HTTP 状态码：`0`。
- URL 校验失败、服务/API/端口/代理请求失败：`1`。
- 目标返回 `4xx/5xx`：`0`，步骤状态使用 `warn`，总结说明目标服务返回错误状态。

### URL 校验与脱敏

新增工具函数建议放在 `src/diagnostics/proxy-test.ts`：

- `parseTestUrl(value: string): URL`
- `redactUrl(url: URL): string`

协议规则：

- 只接受 `http:` 和 `https:`。
- 其他协议抛出 `MihoroError`，提示只支持 HTTP/HTTPS URL。

脱敏规则：

- 如果 URL 存在 `username` 或 `password`，输出中替换为 `***`。
- 常见敏感 query 参数值替换为 `***`，包括：
  - `token`
  - `access_token`
  - `auth`
  - `authorization`
  - `key`
  - `apikey`
  - `api_key`
  - `password`
  - `passwd`
  - `secret`
  - `signature`
  - `sign`

脱敏只影响打印，不影响实际请求。

### 配置和状态检查

诊断过程读取：

- `readConfig()` 获取 `proxyHost`。
- `readControlledConfig()` 获取 `mixed-port`，缺省按现有逻辑使用 `7890`。
- `serviceStatus()` 获取 mihomo 服务状态。
- `mihomoClient()` 或轻量 API 调用判断 Unix socket API 是否可用。

建议不要复用会等待较久或带启动语义的函数。端口检查使用新的轻量 TCP probe，避免调用只面向启动流程的等待函数。

代理端点格式：

```text
<proxyHost>:<mixed-port>
```

### TCP 端口检查

新增轻量 TCP 检查函数：

```ts
async function probeTcp(host: string, port: number, timeoutMs = 1500): Promise<ProbeResult>
```

结果用于判断 mihomo mixed-port 是否能接受连接。该检查只建立 TCP 连接，不发送代理协议数据。

失败时输出示例：

```text
mixed-port TCP check    fail    cannot connect 127.0.0.1:7890 within 1500ms
```

### 代理 HTTP/HTTPS 请求

Node.js 内置 `fetch` 不直接支持 HTTP 代理。仓库已有 `axios`，依赖树中已有 `https-proxy-agent` 和 `proxy-from-env`，但 `https-proxy-agent` 当前是 transitive dependency，不应直接依赖其包名。

推荐实现方式：

- 使用 Node.js `net` / `tls` / `http` / `https` 手写最小代理请求逻辑，避免新增依赖。
- HTTP URL：向 mixed-port 发送 absolute-form HTTP request。
- HTTPS URL：先向 mixed-port 发送 `CONNECT host:port HTTP/1.1`，收到 `200` 后在 socket 上建立 TLS，再发送 origin-form HTTPS request。
- 请求方法固定为 `GET`。
- 默认不下载完整大响应体；拿到响应头后即可判定 HTTP 状态，必要时销毁连接。
- 总超时建议 10 秒。
- User-Agent 使用 `mihoro-cli/<version>`。

这样可以更清楚地区分失败阶段：

- `proxy_connect_failed`：无法连接 mixed-port。
- `proxy_connect_rejected`：HTTPS CONNECT 被代理拒绝。
- `tls_failed`：TLS 握手失败。
- `request_timeout`：请求超时。
- `http_response`：拿到目标 HTTP 状态码。

### 输出设计

命令输出包含三块：

1. 目标和代理端点摘要。
2. 步骤表格。
3. 诊断结论。

示例：

```text
Target: https://example.com/
Proxy: 127.0.0.1:7890

┌──────────────────────┬────────┬────────┬────────────────────────────────────────┐
│ Step                 │ Status │ Time   │ Detail                                 │
├──────────────────────┼────────┼────────┼────────────────────────────────────────┤
│ URL                  │ ok     │ -      │ https://example.com/                   │
│ Config               │ ok     │ -      │ proxy endpoint 127.0.0.1:7890          │
│ Service              │ ok     │ -      │ running pid=12345                      │
│ Mihomo API           │ ok     │ 12ms   │ API is reachable                       │
│ Proxy TCP            │ ok     │ 2ms    │ connected to 127.0.0.1:7890            │
│ HTTP via proxy       │ ok     │ 438ms  │ HTTP 200 OK                            │
└──────────────────────┴────────┴────────┴────────────────────────────────────────┘

Result: proxy path reached the target and returned HTTP 200.
```

状态含义：

- `ok`：该步骤成功。
- `warn`：代理链路到达目标，但目标返回错误类状态，或存在非阻断性异常。
- `fail`：该步骤导致诊断失败。
- `skip`：前置步骤失败，后续步骤未执行。

### 文件触点

- `src/diagnostics/proxy-test.ts`
  - 新增诊断主流程、URL 脱敏、TCP probe、代理 HTTP/HTTPS 请求和结果分类。
- `src/index.ts`
  - 注册 `test <url>` 命令。
  - 调用诊断模块并渲染表格。
  - 根据诊断结果设置 `process.exitCode`。
- `src/lib/types.ts`
  - 如需共享诊断类型，可新增类型；若只在诊断模块内部使用，则不改。
- `README.md`
  - 增加诊断命令示例和行为说明。
- `tests/proxy-test.test.mjs`
  - 覆盖 URL 脱敏、协议校验、HTTP 状态分类和失败结果分类。

### 失败处理

- URL 无效：抛出 `MihoroError('Expected an HTTP or HTTPS URL.')`。
- 配置中的 `mixed-port` 非法：复用现有错误风格，提示具体值。
- mihomo 未运行：服务状态步骤为 `fail`，代理请求步骤为 `skip`。
- API 不可用：API 步骤为 `fail`，但如果 mixed-port 可用，仍可继续代理请求；API 失败作为诊断信号，不直接阻断请求。
- mixed-port 不可连接：TCP 步骤为 `fail`，代理请求步骤为 `skip`。
- CONNECT 非 2xx：代理请求步骤为 `fail`，说明代理拒绝建立 HTTPS 隧道。
- 目标 `4xx/5xx`：代理请求步骤为 `warn`，总结说明目标服务返回错误状态。

## 测试用例

### 编译检查

- `pnpm run typecheck`
- `pnpm run build`

### 自动化检查

- `redactUrl()` 会隐藏 username/password。
- `redactUrl()` 会隐藏常见敏感 query 参数值。
- `parseTestUrl()` 接受 HTTP/HTTPS URL。
- `parseTestUrl()` 拒绝非 HTTP/HTTPS 协议。
- HTTP 代理请求拿到 `2xx/3xx` 时结果为成功。
- HTTP 代理请求拿到 `4xx/5xx` 时结果为 warning，退出码仍为 0。
- TCP 端口不可用时结果为失败，并跳过代理请求。

### 手工检查

- mihomo 正常运行时执行 `mihoro-cli test https://example.com`，确认输出包含目标、代理端点、步骤表格和成功结论。
- mihomo 停止时执行同一命令，确认输出指出服务或端口不可用，且不会启动 mihomo。
- 使用带敏感 query 的 URL 执行命令，确认输出脱敏。
- 使用 `ftp://example.com` 执行命令，确认协议错误明确。

### 回归检查

- `mihoro-cli service status` 行为不变。
- `mihoro-cli proxy enable` 仍能启动/重启 mihomo 并启用系统代理。
- `mihoro-cli info` 输出不变。
- 现有 `node list`、`group list`、`sub list` 表格输出不受影响。
