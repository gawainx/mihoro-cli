---
name: mihoro-release
description: 用于 mihoro-cli 的项目专属版本发布流程。当用户要求发布版本、更新版本号、更新 CHANGELOG、打 annotated tag、运行 pnpm run pack:dist、推送 origin，或明确要求执行 mihoro-cli 版本发布技能时使用。
---

# mihoro-release

## 发布原则

只在 `mihoro-cli` 使用本技能。发布流程必须更新版本号和 `CHANGELOG.md`，必须把 npm tarball 生成到 `dist/`，必须创建 annotated tag，必须推送当前分支和 tag 到 `origin`。

如果任何检查、验证、打包、提交、tag 或推送步骤失败，立即停止并报告具体失败点。禁止在失败后继续后续发布动作。

## 前置检查

1. 确认当前目录是 `/Users/yat/code/mihoro-cli`。
2. 执行 `git status --porcelain=v1`。
3. 工作区不干净时停止，询问用户是否把现有改动纳入发布。
4. 执行 `git remote -v`，确认 `origin` 存在。
5. 执行 `git branch --show-current`，记录当前分支。
6. 执行 `git describe --tags --abbrev=0`，查找上一个 tag。
7. 找不到上一个 tag 时停止，询问用户首次发布的 changelog 口径。

## 版本确认

1. 读取 `package.json.version`，并根据版本号自动递增，默认为 minor，也就是 `0.1.5` -> `0.1.6`
2. 用户提供目标版本时，使用用户提供的版本号。
3. 目标版本必须是 semver，例如 `0.1.5`。
4. tag 固定为 `v<version>`，例如 `v0.1.5`。
5. 检查 `v<version>` 是否已存在；已存在时停止，不覆盖、不删除。

## CHANGELOG 更新

必须更新 `CHANGELOG.md`。

1. 使用上一个 tag 到 `HEAD` 的 commit 范围汇总变更。
2. 提取 commit subject，过滤没有发布价值的内部噪音。
3. 在 `CHANGELOG.md` 顶部新增版本条目。
4. 标题格式使用 `## v<version> - YYYY-MM-DD`。
5. 内容用列表列出距离上一个 tag 的变更，例如：
   - `- Added ...`
   - `- Fixed ...`
   - `- Changed ...`
   - `- Documented ...`
6. 保留历史 changelog，不删除旧条目。
7. 不写临时验证命令、流水账或无关提交噪音。

## 版本文件更新

1. 更新 `package.json.version`。
2. 如果 `pnpm-lock.yaml` 中存在当前包版本，同步更新。
3. 不修改无关字段。

## 验证与打包

按顺序执行：

1. `pnpm install --frozen-lockfile`
2. `pnpm run typecheck`
3. `pnpm run build`
4. `pnpm run pack:dist`
5. 确认 `dist/mihoro-cli-<version>.tgz` 存在。

禁止运行裸 `pnpm pack`。禁止让 tarball 生成到项目根目录。

## 提交与 tag

1. 暂存版本文件、`CHANGELOG.md`、必要的 lockfile 变化和发布产物规则允许的变更。
2. 提交信息固定为 `chore: release version <version>`。
3. 提交信息必须符合仓库 Conventional Commit 规则。
4. 创建 annotated tag：

```bash
git tag -a v<version> -m "chore: release version <version>"
```

示例：

```bash
git tag -a v0.1.5 -m "chore: release version 0.1.5"
```

## 推送

1. 推送当前分支：

```bash
git push origin <current-branch>
```

2. 推送 tag：

```bash
git push origin v<version>
```

## 禁止事项

- 禁止 `git commit --amend`。
- 禁止覆盖或删除已有 tag。
- 禁止运行裸 `pnpm pack`。
- 禁止自动 npm publish。
- 禁止自动创建 GitHub Release。
- 禁止跳过 `CHANGELOG.md`。
- 禁止把 tarball 放到项目根目录。
- 禁止在验证失败后继续 commit、tag 或 push。
