# DB GeoData 外部资源实现计划

> **给 Claude：** 必需工作流：使用 superpowers:executing-plans 逐任务实现此计划。

**目标：** 为 mihoro-cli 增加 db 模式 GeoIP/MMDB/ASN 外部资源准备、自动更新配置和手动更新命令。

**相关设计文档：** 当前需求来自本轮对 Clash Party 源码的只读分析，无独立设计文档。

**架构：** 沿用 Clash Party 的核心路径：资源文件进入 mihomo `-d` 工作目录，配置通过 controlled config 合并进运行时配置，更新动作交给 mihomo API `/configs/geo`。只实现 db 模式，不提供 dat 模式切换。

**技术栈：** TypeScript、Node.js 20、commander、axios、mihomo REST API。

**范围 / 非范围：** 范围包含 `geoip.metadb`、`country.mmdb`、`ASN.mmdb` 的默认下载、配置透传、手动更新和 CLI 配置命令；非范围包含 `geoip.dat`、`geosite.dat`、dat 模式切换、Geo 数据解析器。

---

## Phase #1: 资源准备与配置

### Task #1: db 模式默认配置

**状态：** Finished

**文件：**
- 修改：`src/config/controlled.ts`

- 功能：补齐 mihomo db 模式需要的 `geo-auto-update`、`geo-update-interval`、`geox-url` 默认配置，并固定 `geodata-mode: false`。
- 实现说明：沿用现有 `defaultControlledConfig`，URL 使用 MetaCubeX `meta-rules-dat` latest release 的 `geoip.metadb`、`country-lite.mmdb`、`GeoLite2-ASN.mmdb`。
- 预期验证结果：生成的 runtime config 包含 db 模式 geodata 字段。

### Task #2: 启动前资源文件准备

**状态：** Finished

**文件：**
- 创建：`src/mihomo/geodata.ts`
- 修改：`src/lib/paths.ts`
- 修改：`src/mihomo/core.ts`

- 功能：启动 mihomo 前确保 `geoip.metadb`、`country.mmdb`、`ASN.mmdb` 存在于 `workDir()`。
- 实现说明：缺失才下载；下载失败抛出 `MihoroError`；不覆盖已有文件，避免破坏 mihomo 自动更新后的资源。
- 预期验证结果：首次启动前会创建 runtime 目录并准备三个 db 资源文件。

## Phase #2: CLI 与更新能力

### Task #3: mihomo geo 更新 API

**状态：** Finished

**文件：**
- 修改：`src/mihomo/api.ts`

- 功能：新增 `upgradeGeo()`，调用 mihomo `POST /configs/geo`。
- 实现说明：复用现有 Unix socket axios 客户端，保持错误处理一致。
- 预期验证结果：核心运行时 `geo update` 可以触发 mihomo 下载更新资源。

### Task #4: geo 命令组

**状态：** Finished

**文件：**
- 修改：`src/index.ts`
- 修改：`src/config/controlled.ts`

- 功能：新增 `geo update`、`geo auto on/off`、`geo interval <hours>`、`geo urls` 命令。
- 实现说明：配置命令只写 controlled config 并重新生成 runtime config；`geo update` 调用运行中 mihomo API。
- 预期验证结果：命令输出清楚显示更新或配置结果。

## Phase #3: 验证与收尾

### Task #5: 构建验证和计划回写

**状态：** Finished

**文件：**
- 修改：`docs/plans/2026-06-16-db-geodata-resources.md`

- 功能：运行 TypeScript 构建检查，更新任务状态。
- 实现说明：执行 `pnpm run build`，如因环境或网络失败，记录实际失败点。
- 预期验证结果：构建通过，计划任务均标记为 Finished。
