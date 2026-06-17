# 更新记录

本文件记录公开仓库可理解的变化，不记录凭证、私有路径、授权 URL、真实下载文件或内部验收日志。

## Unreleased

### Added

- Non-phone app shell direction-key spatial focus movement, giving desktop keyboard, iPad keyboard, Android TV, and Apple TV work a shared focus-navigation baseline without adding dependencies.
- Android Tauri project generation with checked-in Gradle/Manifest/resources source and a debug APK/AAB build path for experimental Android work.
- Experimental Android TV entry support: optional Leanback launcher readiness check, Android TV runtime detection, TV layout contract, remote input class, and emulator direction-key focus smoke.
- Android TV / remote key support for shell Back navigation and Reader OK/Back controls.
- Reader 设置新增 iOS 状态栏显示选项；默认阅读时隐藏状态栏，用户可在 Settings 或 Reader 高级面板切换显示。
- 详情页加载态新增返回操作和来源页封面/标题预览，降低 iPad/macOS 上进入详情时的空白等待感。
- 新增统一“删除本地阅读数据”入口：Detail、Shelf/Continue Reading、Library、Reader 控制面板和 Settings 可删除 Reader cache 及对应 EPUB/源图 ZIP 本地阅读文件。
- 新增默认 Reader cache 滚动窗口：保留前一章、当前章和后一章。
- 首页、分类和搜索漫画列表新增按钮分页，并把页码写入 URL 以支持刷新、返回和分享。
- README 增加最近 5 次更新摘要，并指向完整更新记录、验证日志和平台限制文档。
- README.en.md 增加英文最近更新入口，方便英文读者快速理解当前变化。

### Changed

- iPhone/iPad explicit downloads now write to an app-private download root first; users can export or share completed files through the system sheet instead of relying on a Files-visible `Documents` path during download.
- Android phone/tablet platform detection now has explicit runtime classes instead of falling through to Linux desktop behavior.
- Android TV WebView user agents such as `sdk_google_atv64` now map to the TV contract even when WebView includes `Mobile Safari`.
- 默认 KMOE 网站入口切换为 `https://kxo.moe`，并同步前端配置、Rust Web Adapter、Tauri CSP、测试 fixture、E2E routes 和 live smoke 默认源站。
- 详情页封面主题取色改为以真实封面主色桶为准，避免少量高饱和像素把页面洗成不相关的固定色。
- 首页 Continue Reading 区域改为最多展示 6 个最近阅读条目，并使用自适应网格避免长页码撑坏布局。
- 相关漫画卡片改为更清晰的封面、标题和元信息布局，并把封面预览传递到详情加载页。
- Reader 继续阅读和章节切换时会清理滚动窗口外的临时阅读缓存；策略允许时可从可信本地 archive 预取新的后一章。
- 漫画列表翻页时保留旧列表到新页加载完成，筛选变化会回到第 1 页。
- 调整公开定位为 Alpha / 开发预览阶段的轻量在线阅读体验，强调临时缓存、低存储占用和不默认长期下载漫画。
- 将公开文档改为中文主文档和英文轻入口。
- 将许可证更新为 GNU General Public License v3.0。

### Fixed

- 修复 iPhone/iPad 登录表单可能被系统自动大写、自动更正或密码管理辅助影响的问题；邮箱提交前去除首尾空格，密码按原样提交，并把站点 `e400` 显示为明确的账号/密码未被接受提示。
- 修复 Android phone WebView 被识别为 Linux 桌面运行时，导致手机首屏显示桌面 sidebar 的问题。
- 修复 Android native SQLite/app data 路径在无 `HOME` 环境时落到 `./.local/share` 相对路径的问题；Android 现在使用 app-private files root。
- 修复 iPhone/iPad 下载失败时可能写入不可靠 Documents 路径的问题，并区分站点授权/额度错误与本地写入错误，避免把源站拒绝误显示成保存位置权限。
- 修复远程封面返回极小占位图时被当成成功加载，导致详情主题和封面显示异常的问题。
- 修复部分站点 `volinfo` 行源图体积字段为 0、但已有源图元数据时被误判为“无源图”的问题。
- 修复中文 IME 输入时，搜索、筛选和路径输入会把拼音中间态重复写入业务状态的问题。
- 修复“清空阅读缓存”只删除解压页但保留本地源文件，导致再次点击阅读又从旧源文件恢复 cache、看起来没有真正释放空间的问题。
- 修复设置页清空 Reader cache 后，前端持久化的旧 `reading_cache` 快照可能继续让详情页误判“已有阅读缓存”的问题。
- 修复“清理全部阅读缓存”只清理 ready 候选，未覆盖 failed/missing/legacy 阅读缓存行的问题。
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
