# import-clash-party-config 实现计划

> **给 Claude：** 必需工作流：使用 superpowers:executing-plans 逐任务实现此计划。

**目标：** 实现 `mihoro-cli import clash-party <data-dir>`，把 Clash Party 配置复制/转换到 mihoro-cli 独立数据目录。

**相关设计文档：** Notion `Design: import Clash Party configuration into mihoro-cli`

**架构：** 新增导入模块读取 Clash Party `profile.yaml`、`profiles/*.yaml`、`mihomo.yaml`，转换为 mihoro `subscriptions.yaml` 与受控配置。CLI 入口只负责参数解析和输出，导入完成后复用 `generateRuntimeConfig()` 写出 runtime config。

**技术栈：** Node.js 20、TypeScript、commander、YAML 文件状态、fs/promises。

**范围 / 非范围：** 范围包含显式路径导入、冲突检测、`--overwrite` 备份、profile 转换、mihomo.yaml 导入、runtime 生成。非范围包含 GUI 偏好、override/rules、双向同步、自动启动 service。

---

## Stage #1: 导入数据模型与转换

### Task #1: 扩展订阅类型

**状态：** Finished

**文件：**
- 修改：`src/lib/types.ts`
- 修改：`src/config/subscriptions.ts`

- 功能：支持 imported local profile，没有 URL 的 profile 也能作为当前 profile 被 runtime 读取。
- 实现说明：`SubscriptionItem.url` 改为可选，增加 `type`、`source` 字段；远程 `sub add` 仍写入 URL。
- 预期验证结果：`pnpm run typecheck` 通过。

### Task #2: Clash Party 导入模块

**状态：** Finished

**文件：**
- 创建：`src/import/clash-party.ts`

- 功能：读取源目录、检测冲突、备份、复制 profile、写 `subscriptions.yaml` 和 `mihomo.yaml`。
- 实现说明：默认遇到目标文件冲突停止；`--overwrite` 时备份到 `backups/clash-party-import-<timestamp>/`。
- 预期验证结果：临时目录手工导入成功，重复导入不带 `--overwrite` 会失败。

## Stage #2: CLI 入口与验证

### Task #3: 注册 import 命令

**状态：** Finished

**文件：**
- 修改：`src/index.ts`
- 修改：`README.md`

- 功能：新增 `mihoro-cli import clash-party <data-dir> [--overwrite]`。
- 实现说明：命令输出 imported count、current、controlled config、runtime、backup/skipped。
- 预期验证结果：`node dist/index.js import clash-party <tmp>` 可执行。

### Task #4: 整体验证与提交

**状态：** Finished

**文件：**
- 验证：`pnpm run typecheck`
- 验证：`pnpm run build`
- 验证：临时 Clash Party dataDir smoke flow

- 功能：确认编译、构建、导入、冲突、overwrite 备份都符合设计。
- 实现说明：使用 `/private/tmp` 下临时目录，不写真实用户配置。
- 预期验证结果：所有验证通过，创建 1 个符合 Conventional Commits 的提交。
