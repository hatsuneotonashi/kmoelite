# 更新记录

本文件记录公开仓库可理解的变化，不记录凭证、私有路径、授权 URL、真实下载文件或内部验收日志。

## Unreleased

### Added

- 新增默认 Reader cache 滚动窗口：保留前一章、当前章和后一章。
- 首页、分类和搜索漫画列表新增按钮分页，并把页码写入 URL 以支持刷新、返回和分享。
- README 增加最近 5 次更新摘要，并指向完整更新记录、验证日志和平台限制文档。
- README.en.md 增加英文最近更新入口，方便英文读者快速理解当前变化。

### Changed

- Reader 继续阅读和章节切换时会清理滚动窗口外的临时阅读缓存；策略允许时可从可信本地 archive 预取新的后一章。
- 漫画列表翻页时保留旧列表到新页加载完成，筛选变化会回到第 1 页。
- 调整公开定位为 Alpha / 开发预览阶段的轻量在线阅读体验，强调临时缓存、低存储占用和不默认长期下载漫画。
- 将公开文档改为中文主文档和英文轻入口。
- 将许可证更新为 GNU General Public License v3.0。

### Fixed

- 修复 iPhone/iPad 实机沿用旧 SQLite schema 时，详情页读取下载队列/资料库失败并反复提示“暂时无法读取资料库”的问题。
- iOS 本地 app data 改为使用 app-private `Library/Application Support`，避免落到 Linux-style fallback 路径。

### Docs

- 明确项目为非官方 KMOE 漫画阅读器和个人阅读管理工具。
- 收紧 Web Adapter、下载、安全和 release 文档，不公开传播站点内部下载授权接口细节。
- 保持真实站点集成能力，但强调合规、单项、低频、脱敏和 runtime-only 凭证处理。
- 将 `TASK_PROGRESS.md` 明确为验证日志，将 `CHANGELOG.md` 明确为对外更新记录。
- 将 `AGENTS.md` 明确为无上下文 AI 接手入口，并同步文档职责、提交纪律和默认验证 gate。

### Validation

- 最新本地验证结果记录在 [TASK_PROGRESS.md](TASK_PROGRESS.md)。

## 0.1.0

- 初始公开源码基线。
- Tauri 2 + React + TypeScript + Rust 应用结构。
- 包含目录/详情、书架、Library、下载队列、本地 SQLite、Reader cache 和跨平台 Reader 基础能力。
