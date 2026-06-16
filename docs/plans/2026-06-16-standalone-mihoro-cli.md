# standalone mihoro-cli 实现计划

> **给 Claude：** 必需工作流：使用 superpowers:executing-plans 逐任务实现此计划。

**目标：** 实现独立 mihoro-cli 的 Ubuntu/Linux 与 macOS 第一版闭环命令。

**相关设计文档：** Notion `Design: standalone mihoro-cli architecture based on Clash Party runtime model`

**架构：** CLI 入口只做参数解析和输出，业务能力分到配置/订阅、runtime config、mihomo core、mihomo API、系统代理/TUN、service 模块。mihomo 内核启动、runtime config 合并、API 控制和系统代理路线参考 `/Users/yat/code/clash-party-cli/src/main/core/*`、`src/main/config/*`、`src/main/sys/sysproxy.ts`。

**技术栈：** Node.js 20、TypeScript、YAML 文件状态、mihomo REST API over Unix socket、systemd/launchctl 辅助命令。

**范围 / 非范围：** 范围包含 `sub`、`service`、`proxy`、`tun`、`node`、`group` 命令。非范围包含 Windows、Electron、Clash Party 仓库修改、Sub-Store、Smart Core、WebDAV、GUI 双向同步。

---

## Phase #1: 配置、订阅与 runtime config

### Task #1: 项目依赖和基础模块

**状态：** Finished

**文件：**
- 修改：`package.json`
- 修改：`pnpm-lock.yaml`
- 创建：`src/lib/paths.ts`
- 创建：`src/lib/yaml.ts`
- 创建：`src/lib/errors.ts`
- 创建：`src/lib/logger.ts`

- 功能：提供独立配置目录、YAML 读写、错误和日志基础设施。
- 实现说明：配置目录默认 `~/.config/mihoro`，路径结构对齐 Clash Party `dirs.ts` 的 data/work/profiles/logs 分层。
- 预期验证结果：`pnpm run typecheck` 通过。

### Task #2: 订阅管理命令

**状态：** Finished

**文件：**
- 创建：`src/config/subscriptions.ts`
- 创建：`src/config/state.ts`
- 修改：`src/index.ts`

- 功能：实现 `sub list/add/remove/use`，保存 profile YAML 和订阅状态。
- 实现说明：参考 Clash Party `profile.ts` 的 profile config/current profile 思路；远程订阅下载后保存为独立 profile 文件。
- 预期验证结果：使用临时 `MIHORO_HOME` 手动执行 add/list/use/remove。

### Task #3: runtime config 与 TUN 受控配置

**状态：** Finished

**文件：**
- 创建：`src/config/runtime.ts`
- 创建：`src/config/controlled.ts`
- 修改：`src/index.ts`

- 功能：把当前 profile 与受控 mihomo 配置合并，写出 `runtime/config.yaml`；实现 `tun enable/disable`。
- 实现说明：参考 Clash Party `factory.ts` 与 `controledMihomo.ts`，第一版使用深合并并确保 `tun.enable=true` 时 `dns.enable=true`。
- 预期验证结果：生成的 runtime config 包含 profile proxies/proxy-groups 与受控 tun/dns 配置。

## Phase #2: mihomo core 与 API 控制

### Task #4: mihomo API client

**状态：** Finished

**文件：**
- 创建：`src/mihomo/api.ts`
- 创建：`src/commands/node.ts`
- 创建：`src/commands/group.ts`
- 修改：`src/index.ts`

- 功能：实现 `node list`、`group list`、`group use <group> <node>`。
- 实现说明：参考 Clash Party `mihomoApi.ts`，Unix socket 调用 `/proxies` 和 `/proxies/:group`，`group use` 同步保存默认节点偏好。
- 预期验证结果：连接运行中的 mihomo 后能列出节点/组并切换组节点。

### Task #5: core manager 和 service 命令

**状态：** Finished

**文件：**
- 创建：`src/mihomo/core.ts`
- 创建：`src/service/service.ts`
- 创建：`src/commands/service.ts`
- 修改：`src/index.ts`

- 功能：实现 `service install/start/stop/status/logs`，优先使用系统 `mihomo`。
- 实现说明：启动模型对齐 Clash Party：`mihomo -d <workDir> -ext-ctl-unix <socketPath>`；使用 pid 文件、日志文件和 systemd/launchctl unit 管理生命周期。
- 预期验证结果：无真实 mihomo 时 status 给出清晰未运行状态；有 mihomo 时能生成 runtime config 并启动。

## Phase #3: 系统代理与收尾

### Task #6: proxy 命令

**状态：** Finished

**文件：**
- 创建：`src/system/proxy.ts`
- 创建：`src/commands/proxy.ts`
- 修改：`src/index.ts`

- 功能：实现 `proxy enable/disable`。
- 实现说明：路线参考 Clash Party `sysproxy.ts`；Linux 优先使用 `gsettings` 手动代理，macOS 使用 `networksetup` 写入 HTTP/HTTPS/SOCKS 代理。
- 预期验证结果：命令能输出实际执行的系统代理结果，失败时保留可操作错误。

### Task #7: 文档、验证和原子提交收尾

**状态：** Finished

**文件：**
- 修改：`README.md`
- 修改：`docs/plans/2026-06-16-standalone-mihoro-cli.md`

- 功能：补充命令说明，完成 typecheck/build，按功能提交并追加 Notion Progress 一级列表条目。
- 实现说明：提交信息必须满足仓库 AGENTS.md 的 Conventional Commits 白名单。
- 预期验证结果：`pnpm run typecheck` 与 `pnpm run build` 通过。
