# SubscriptionUpdate_20260627

## 关联设计文档

- [SubscriptionUpdate_20260627](../design-docs/SubscriptionUpdate_20260627.md)

## Stage #1: 更新核心能力

### 任务 #1: 抽出可复用订阅下载能力

**Status:** Designed

**Files:** Modify `src/config/subscriptions.ts`; Verify `tests/subscription-update.test.mjs`

功能：把现有 `sub add` 使用的远程 profile 下载、YAML 解析和 profile 校验整理为可复用 helper，支持返回实际下载模式。

实现说明：新增或导出 `fetchSubscriptionProfile()`、`validateProfile()` 等最小必要 helper。下载策略按设计文档实现为 direct、proxy、proxy-fallback：不传 `--proxy` 时先直连，直连失败后尝试 mihomo mixed-port 代理；传 `--proxy` 时直接走代理。代理端点从 `readConfig()` 和 `readControlledConfig()` 读取，使用 axios 的 HTTP proxy 配置对齐 Clash Party。

预期验证结果：自动化测试能证明 direct 成功不会触发代理、direct 失败后 proxy 成功会返回 `proxy-fallback`、显式 proxy 会直接使用 `proxy`，profile YAML 校验仍拒绝缺少 `proxies` 和 `proxy-providers` 的内容。

### 任务 #2: 实现订阅更新编排模块

**Status:** Designed

**Files:** Create `src/config/subscription-update.ts`; Modify `src/config/subscriptions.ts`; Verify `tests/subscription-update.test.mjs`

功能：新增单个订阅和批量订阅更新服务，返回结构化结果供 CLI 表格渲染。

实现说明：新增 `updateSubscription(idOrName, options)` 和 `updateAllSubscriptions(options)`。单个更新按 name 或 id 查找订阅，命中无 URL 订阅时返回 `failed`；批量更新先处理非当前订阅，最后处理当前订阅，命中无 URL 订阅时返回 `skipped`，每个订阅串行执行并记录 `updated`、`failed` 或 `skipped`。更新成功时覆盖 `profiles/<id>.yaml`，更新 `subscriptions.yaml.items[].updatedAt`。

预期验证结果：测试能覆盖单个更新成功、单个无 URL 失败、批量无 URL 跳过、批量失败后继续处理剩余订阅、批量结果顺序为非当前订阅优先且当前订阅最后。

### 任务 #3: 当前订阅 runtime 与 core 刷新

**Status:** Designed

**Files:** Create `src/config/subscription-update.ts`; Modify as needed `src/config/subscription-switch.ts` or service helpers; Verify `tests/subscription-update.test.mjs`

功能：当更新目标是当前订阅时，成功写入 profile 后重新生成 runtime，并刷新正在运行的 mihomo core。

实现说明：在订阅更新模块内新增当前订阅刷新 helper，复用 `generateRuntimeConfig()` 和现有 service/core 刷新能力。mihomo 未运行时只生成 runtime；mihomo 正在运行时执行与 `sub use` 一致的刷新语义。刷新失败时本次订阅结果标记为 `failed`，详情说明失败发生在 runtime/core 刷新阶段。

预期验证结果：测试能证明当前订阅更新成功后调用 runtime 生成路径；在模拟运行状态下会触发 core 刷新；刷新失败时结果为 `failed`，批量模式继续处理后续订阅。

## Stage #2: CLI 接入与输出

### 任务 #4: 注册 `sub update` 命令

**Status:** Designed

**Files:** Modify `src/index.ts`; Verify `tests/subscription-update.test.mjs`

功能：在现有 `sub` 命令组下新增 `update`，支持 `[name-or-id]`、`-a/--all`、`-p/--proxy`。

实现说明：命令参数按设计文档校验：无 `--all` 时必须提供 `[name-or-id]`；有 `--all` 时不能同时提供 `[name-or-id]`；`--proxy` 可用于单个更新或批量更新。参数错误使用 `MihoroError`，保持现有 CLI 错误格式。

预期验证结果：测试或命令级断言能覆盖缺少目标、`--all` 与目标同时出现、单个更新、批量更新和 `--proxy` 组合。

### 任务 #5: 渲染更新结果表格与退出码

**Status:** Designed

**Files:** Modify `src/index.ts`; Verify `tests/subscription-update.test.mjs`

功能：单个更新和批量更新都使用统一表格展示结果，并根据结果设置退出码。

实现说明：复用 `formatTable()` 渲染 `Subscription | ID | Current | Status | Mode | Detail`。`updated`、`failed`、`skipped` 都必须有明确详情，`mode` 展示 direct、proxy、proxy-fallback 或 `-`。任意结果为 `failed` 时设置 `process.exitCode = 1`；只有 `updated` 和 `skipped` 时退出码为 `0`。

预期验证结果：测试能验证表格行包含每个订阅结果，失败不会隐藏成功和跳过项，失败汇总会设置非 0 退出码。

## Stage #3: 文档与回归验证

### 任务 #6: 更新 README 命令说明

**Status:** Designed

**Files:** Modify `README.md`

功能：把 `sub update` 的用法、`--all`、`--proxy` 和 Clash Party 风格代理 fallback 行为写入 README。

实现说明：在订阅命令区域补充单个更新、批量更新和代理更新示例。说明默认先直连，直连失败后尝试代理 fallback；显式 `--proxy` 直接走 mihomo mixed-port 代理。说明批量更新会跳过无 URL 订阅并用表格展示结果。

预期验证结果：README 与实际 CLI 行为一致，Markdown 段落不出现段内硬换行。

### 任务 #7: 最终验证与计划状态回写

**Status:** Designed

**Files:** Verify `src/config/subscription-update.ts`, `src/config/subscriptions.ts`, `src/index.ts`, `README.md`, `tests/subscription-update.test.mjs`; Modify `docs/plans/SubscriptionUpdate_20260627.md`

功能：完成整体构建、测试和文档状态回写，确保实现与设计文档一致。

实现说明：运行 `pnpm run build`，再运行与本功能相关的测试。由于本仓库测试导入 `dist`，必须先 build 再 test。根据实际完成情况把本计划中已完成任务状态更新为 `Finished`，并检查没有未计划的 scope 扩展。

预期验证结果：构建通过，相关测试通过，`git diff --check` 通过，计划状态与实际实现一致。
