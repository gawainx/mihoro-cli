# subscription switch runtime state 实现计划

> **给 Claude：** 必需工作流：使用 superpowers:executing-plans 逐任务实现此计划。

**目标：** 实现订阅切换后的 runtime、运行中 mihomo core、节点列表、代理组列表和默认节点偏好一致性。

**相关设计文档：** `docs/design-docs/SubscriptionSwitchRuntimeState_20260616.md`

**架构：** 新增订阅切换编排模块负责 current 更新、runtime 生成、运行态刷新和失败回滚。默认节点偏好从全局 `defaultNodes` 迁移为 `subscriptionDefaultNodes[subscriptionId]`，启动和 group/node use 都按当前订阅读写。

**技术栈：** TypeScript、Node.js 20+、commander、YAML 文件状态、mihomo Unix socket API。

**范围 / 非范围：** 范围包含 `sub use` 运行态刷新、订阅作用域默认节点、旧 `defaultNodes` 兼容读取和定向验证；非范围包含 hot reload、GUI、Clash Party 源码修改、Sub-Store、Smart Core、WebDAV。

---

## Stage #1: 状态模型与默认节点作用域

### Task #1: 扩展 MihoroConfig 默认节点结构

**状态：** Finished

**文件：**
- 修改：`src/lib/types.ts`
- 修改：`src/config/state.ts`

- 功能：新增 `subscriptionDefaultNodes`，并提供按订阅读取、保存默认节点的 helper。
- 实现说明：保留 `defaultNodes` 兼容读取；新写入只写 `subscriptionDefaultNodes[subscriptionId]`。
- 预期验证结果：`tsc --noEmit -p tsconfig.json` 通过。

## Stage #2: 订阅切换编排

### Task #2: 新增 subscription switch 模块

**状态：** Finished

**文件：**
- 创建：`src/config/subscription-switch.ts`
- 修改：`src/config/subscriptions.ts`

- 功能：实现 `switchSubscription()`，负责切换 current、生成 runtime、运行中重启 mihomo、失败时回滚。
- 实现说明：目标订阅不存在时不写状态；core 重启失败时回滚 current 并重新生成旧 runtime。
- 预期验证结果：`sub use` 代码路径能拿到 runtime path 和可选 restarted pid。

## Stage #3: CLI 接线与验证

### Task #3: 接入 CLI 与启动默认节点应用

**状态：** Finished

**文件：**
- 修改：`src/index.ts`
- 修改：`src/mihomo/core.ts`

- 功能：`sub use` 使用切换编排；`node use` / `group use` 保存当前订阅作用域默认节点；`startCore()` 按当前订阅应用默认节点。
- 实现说明：mihomo 未运行时 `sub use` 不自动启动；运行中才重启并输出 pid。
- 预期验证结果：typecheck/build 通过，临时 `MIHORO_HOME` smoke 验证订阅切换会更新 runtime。

### Task #4: 整体验证与提交

**状态：** Finished

**文件：**
- 验证：`tsc --noEmit -p tsconfig.json`
- 验证：`tsc -p tsconfig.json`
- 验证：临时 `MIHORO_HOME` smoke flow

- 功能：确认编译、构建、订阅切换 runtime 生成和订阅作用域默认节点写入符合设计。
- 实现说明：使用 `/private/tmp` 临时目录，不触碰真实用户配置。
- 预期验证结果：所有验证通过，创建符合 Conventional Commits 的提交。
