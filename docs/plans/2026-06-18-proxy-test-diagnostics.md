# 代理测试诊断命令实现计划

> **给 Claude：** 必需工作流：使用 superpowers:executing-plans 逐任务实现此计划。

**目标：** 实现 `mihoro-cli test <url>`，通过 mihoro/mihomo 代理链路访问目标 URL，并打印清晰的连接诊断过程。

**相关设计文档：** `docs/design-docs/ProxyTestDiagnostics_20260618.md`

**架构：** 新增 `src/diagnostics/proxy-test.ts` 承载诊断流程和底层 probe。CLI 入口只注册命令、调用诊断模块、渲染步骤表格，并按诊断结果设置退出码。

**技术栈：** TypeScript、Node.js `net` / `tls` / `http` / `https`、commander、现有 `cli-table3` 表格输出、Node.js 内置 `node:test`。

**范围 / 非范围：** 范围包含 URL 校验与脱敏、服务/API/端口检查、经 mihomo mixed-port 的 HTTP/HTTPS 代理请求、诊断输出、README 和自动化测试；不包含自动启动 mihomo、修改配置、直连对比、`--json`、批量测速、TUI、traceroute 或抓包。

---

## Stage #1: 诊断数据模型与 URL 处理

### Task #1: 诊断类型、URL 校验和脱敏

**状态：** Designed

**文件：**
- 创建：`src/diagnostics/proxy-test.ts`
- 创建：`tests/proxy-test.test.mjs`
- 验证：`pnpm test`

- 功能：定义 `DiagnosticStep`、`ProxyTestResult` 等诊断结构，实现 `parseTestUrl()` 和 `redactUrl()`。
- 实现说明：`parseTestUrl()` 只接受 `http:` 与 `https:`；`redactUrl()` 只影响展示，隐藏 username/password 和常见敏感 query 参数，包括 `token`、`access_token`、`auth`、`authorization`、`key`、`apikey`、`api_key`、`password`、`passwd`、`secret`、`signature`、`sign`。
- 预期验证结果：HTTP/HTTPS URL 被接受；非 HTTP/HTTPS URL 被拒绝；敏感字段在输出 URL 中显示为 `***`。

## Stage #2: 本地代理链路检查

### Task #2: 配置、服务、API 和 TCP probe

**状态：** Designed

**文件：**
- 修改：`src/diagnostics/proxy-test.ts`
- 验证：`pnpm run typecheck`

- 功能：实现读取 mihoro/mihomo 配置、记录 mihomo 服务状态、检查 mihomo API 可用性和 mixed-port TCP 连通性。
- 实现说明：读取 `readConfig()` 的 `proxyHost` 和 `readControlledConfig()` 的 `mixed-port`；调用 `serviceStatus()` 记录服务状态；用轻量 API 请求判断 Unix socket API 可用性；新增 `probeTcp(host, port, timeoutMs)`，只建立 TCP 连接，不发送代理协议数据。
- 预期验证结果：配置读取能生成 `proxyHost:mixed-port` 代理端点；TCP 不可连接时返回失败步骤；API 不可用时记录失败但不直接阻断后续 TCP/代理请求。

## Stage #3: 代理 HTTP/HTTPS 请求诊断

### Task #3: HTTP 和 HTTPS 代理请求

**状态：** Designed

**文件：**
- 修改：`src/diagnostics/proxy-test.ts`
- 修改：`tests/proxy-test.test.mjs`
- 验证：`pnpm test`

- 功能：通过 mihomo mixed-port 请求目标 URL，拿到 HTTP 状态码、耗时和失败原因。
- 实现说明：HTTP URL 使用 absolute-form request；HTTPS URL 先发送 `CONNECT host:port HTTP/1.1`，CONNECT 成功后在同一 socket 上建立 TLS 并发送 origin-form request；请求方法固定为 `GET`；拿到响应头后即可关闭连接；总超时建议 10 秒；不新增直接依赖。
- 预期验证结果：`2xx/3xx` 分类为成功；`4xx/5xx` 分类为 warning 且退出码为 0；连接失败、CONNECT 被拒绝、TLS 失败和超时分类为失败。

## Stage #4: CLI 接入和输出

### Task #4: 注册 `test <url>` 命令并渲染结果

**状态：** Designed

**文件：**
- 修改：`src/index.ts`
- 修改：`README.md`
- 验证：`pnpm run build`

- 功能：新增顶层 `mihoro-cli test <url>` 命令，打印目标、代理端点、诊断步骤表格和最终结论。
- 实现说明：命令调用 `testProxyUrl(url)`；使用现有 `formatTable()` 渲染 `Step`、`Status`、`Time`、`Detail`；诊断失败时设置 `process.exitCode = result.exitCode`，保留已完成步骤输出；README 增加命令示例和无副作用说明。
- 预期验证结果：构建通过；命令帮助中出现 `test <url>`；手动执行时输出格式清晰，URL 展示已脱敏。

## Stage #5: 整体验证与计划回写

### Task #5: 完整验证和任务状态回写

**状态：** Designed

**文件：**
- 修改：`docs/plans/2026-06-18-proxy-test-diagnostics.md`
- 验证：`pnpm run typecheck`、`pnpm run build`、`pnpm test`

- 功能：运行完整验证，回写计划任务状态和完成记录。
- 实现说明：完成实现后逐项确认任务状态为 `Finished`；验证通过后按项目提交纪律创建 Conventional Commit，建议提交信息为 `feat: add proxy URL diagnostics command`。
- 预期验证结果：typecheck、build、test 全部 exit 0，工作区只包含本功能相关改动，并完成一次符合规则的提交。
