# 节点 Hash 索引实现计划

> **给 Claude：** 必需工作流：使用 superpowers:executing-plans 逐任务实现此计划。

**目标：** 为 mihoro-cli 增加 CLI 专属节点 hash 索引，让节点切换命令只使用 hash 或 hash 前缀指定节点。

**相关设计文档：** `docs/design-docs/NodeHashIndex_20260617.md`

**架构：** 新增 JSON 节点索引文件与 `src/config/node-index.ts` 模块，负责 SHA-256 节点 hash、索引刷新、前缀解析和错误处理。CLI 命令从节点名直通改为 hash 解析后调用 mihomo 原始节点名，默认节点配置改为保存完整 hash 并在启动时重新解析。

**技术栈：** TypeScript、Node.js `crypto` / `fs/promises`、内置 `node:test`、现有 `yaml` 配置读写。

**范围 / 非范围：** 范围包含节点索引 JSON、hash-only 节点输入、默认节点 hash 保存与启动解析、README 更新和自动化测试；不包含代理组 hash、TUI、mihomo profile 改名或 mihomo API 扩展。

---

## Stage #1: 节点索引与解析模型

### Task #1: 节点 hash 与索引文件

**状态：** Finished

**文件：**
- 创建：`src/config/node-index.ts`
- 修改：`src/lib/paths.ts`
- 修改：`src/lib/types.ts`
- 验证：`tests/node-index.test.mjs`

- 功能：实现 `hashNodeName()`、`shortNodeHash()`、节点索引 JSON 读写和当前订阅索引刷新。
- 实现说明：使用 SHA-256，输入为 `${subscriptionId}\0${nodeName}`；`node-indexes.json` 使用 JSON 格式；损坏或缺失文件按空索引处理。
- 预期验证结果：构建后测试能断言 hash 稳定、短 hash 为 8 位、不同订阅或节点生成不同 hash。
- 完成时间：2026-06-17

### Task #2: hash 前缀解析

**状态：** Finished

**文件：**
- 修改：`src/config/node-index.ts`
- 验证：`tests/node-index.test.mjs`

- 功能：实现 `resolveNodeHash()`，支持完整 hash 和唯一前缀解析。
- 实现说明：解析时只匹配 `entry.hash.startsWith(value)`；不按原始节点名 fallback；缺失时允许刷新一次索引；多匹配时报错并提示使用更长前缀。
- 预期验证结果：完整 hash、唯一前缀解析通过；原始节点名、未知 hash、冲突前缀均失败且错误信息明确。
- 完成时间：2026-06-17

## Stage #2: 默认节点 hash 状态

### Task #3: 默认节点保存与兼容读取

**状态：** Finished

**文件：**
- 修改：`src/lib/types.ts`
- 修改：`src/config/state.ts`
- 验证：`tests/state.test.mjs`

- 功能：新增 `subscriptionDefaultNodeHashes`，新写入只保存完整 hash；读取时兼容旧 `subscriptionDefaultNodes`。
- 实现说明：优先读取 `subscriptionDefaultNodeHashes[subscriptionId]`；旧值如果可解析为 hash 或节点名，则迁移到 hash；保留 `subscriptionDefaultNodes` 只作为旧数据来源。
- 预期验证结果：新 helper 写入完整 hash；旧节点名在索引存在时能迁移；读取结果用于启动默认节点应用。
- 完成时间：2026-06-17

## Stage #3: CLI 与启动流程接入

### Task #4: 节点命令 hash 化

**状态：** Finished

**文件：**
- 修改：`src/index.ts`
- 修改：`README.md`
- 验证：`pnpm run build`

- 功能：`node list` 刷新并展示短 hash；`node use` 和 `group use` 只接受 hash 或 hash 前缀。
- 实现说明：命令参数改为 `<node-hash>`；解析后使用 `entry.name` 调用 `assertGroupCanUseNode()` 和 `useGroupNode()`；保存默认节点时写完整 hash。
- 预期验证结果：编译通过；README 示例体现 hash-only 节点输入。
- 完成时间：2026-06-17

### Task #5: 服务启动应用默认 hash

**状态：** Finished

**文件：**
- 修改：`src/mihomo/core.ts`
- 修改：`src/config/state.ts`
- 验证：`pnpm run build`

- 功能：`startCore()` 应用默认节点时读取完整 hash，并重新解析为当前订阅下的原始节点名。
- 实现说明：mihomo API ready 后刷新或读取节点索引；解析失败时抛出明确错误，提示重新 `node list` 并重新选择节点。
- 预期验证结果：编译通过；相关单元测试通过。
- 完成时间：2026-06-17

## Stage #4: 整体验证与计划回写

### Task #6: 构建、测试与状态回写

**状态：** Finished

**文件：**
- 修改：`docs/plans/2026-06-17-node-hash-index.md`
- 验证：`pnpm run typecheck`、`pnpm run build`、`pnpm test`

- 功能：运行完整验证，回写任务状态和完成记录。
- 实现说明：验证通过后按项目提交纪律创建 Conventional Commit。
- 预期验证结果：typecheck、build、test 全部 exit 0，工作区只包含本功能相关改动。
- 完成时间：2026-06-17
