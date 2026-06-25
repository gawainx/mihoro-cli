# CLI 表格输出美化实现计划

> **给 Claude：** 必需工作流：使用 superpowers:executing-plans 逐任务实现此计划。

**目标：** 引入必要 npm 包，统一美化 mihoro-cli 列表型命令输出，优先覆盖 `node list`。

**相关设计文档：** 本需求为窄范围 CLI 输出体验优化，直接按用户需求与现有 CLI 结构实施。

**架构：** 新增轻量表格渲染 helper，基于 `cli-table3` 渲染 ASCII 表格；CLI 命令仍负责业务数据获取，输出层只接收标题与行数据。先接入 `node list`、`group list`、`sub list`、`geo urls`、`geo prepare`，保留非列表命令现有结果输出。

**技术栈：** TypeScript、commander、cli-table3、Node.js 内置测试。

**范围 / 非范围：** 范围包含依赖引入、表格渲染 helper、列表命令接入、README/计划更新与输出测试；不包含 TUI、颜色主题、交互选择器、JSON 输出模式。

---

## Stage #1: 表格渲染基础

### Task #1: 引入表格依赖和 helper

**状态：** Finished

**文件：**
- 修改：`package.json`
- 修改：`pnpm-lock.yaml`
- 创建：`src/lib/table.ts`
- 验证：`tests/table.test.mjs`

- 功能：引入 `cli-table3`，新增 `formatTable()` 统一生成 CLI 表格字符串。
- 实现说明：helper 接收 `head` 和 `rows`；统一使用紧凑边框、禁用颜色；空行由调用方处理。
- 预期验证结果：单元测试能断言输出包含表头、行内容和表格边框。
- 完成时间：2026-06-17

## Stage #2: 列表命令接入

### Task #2: 节点和代理组列表表格化

**状态：** Finished

**文件：**
- 修改：`src/index.ts`
- 验证：`tests/cli-output.test.mjs`

- 功能：`node list` 输出 Hash、Name、Type、Groups 表格；`group list` 输出 Group、Selected、Options 表格。
- 实现说明：`node list` 保持刷新节点索引逻辑，渲染时把 group/options 数组用逗号拼接；空态输出不变。
- 预期验证结果：命令输出测试能覆盖表头与关键字段。
- 完成时间：2026-06-17

### Task #3: 订阅与资源列表表格化

**状态：** Finished

**文件：**
- 修改：`src/index.ts`
- 验证：`pnpm run build`

- 功能：`sub list`、`geo urls`、`geo prepare` 使用统一表格输出。
- 实现说明：订阅列表显示 Current、ID、Name、Updated；GeoData 资源显示 File、Status、Path；Geo URLs 显示 Key、URL。
- 预期验证结果：构建通过，手动检查 help/列表命令输出结构清晰。
- 完成时间：2026-06-17

## Stage #3: 验证与提交

### Task #4: 完整验证和计划回写

**状态：** Finished

**文件：**
- 修改：`docs/plans/2026-06-17-cli-table-output.md`
- 修改：`README.md`（如命令示例需要调整）
- 验证：`pnpm run typecheck`、`pnpm run build`、`pnpm test`

- 功能：回写任务状态，运行完整验证并提交。
- 实现说明：提交信息使用 Conventional Commits，描述表格输出能力。
- 预期验证结果：三项验证全部 exit 0，工作区只包含本功能相关改动。
- 完成时间：2026-06-17
