# 更新记录

本文件记录公开仓库可理解的变化，不记录凭证、私有路径、授权 URL、真实下载文件或内部验收日志。

## Unreleased

### Added

- Platform readiness now checks iPhone/iPad display-name and file-export metadata in both XcodeGen source and generated Info.plist, so app-private download export support cannot silently drift.
- Platform readiness now checks the root `pnpm smoke:ios-sim` entry so iPhone/iPad simulator smoke coverage cannot drift out of the release checklist unnoticed.
- `pnpm smoke:ios-sim` can now open a safe `kmoelite://comic/<id>` URL when `IOS_SIM_COMIC_ID` is set, making iPhone/iPad deep-link smoke repeatable without committing screenshots.
- Added `pnpm smoke:ios-sim`, a minimal iPhone/iPad simulator build/install/launch smoke that selects an iOS simulator explicitly instead of accidentally targeting a booted Apple TV simulator.
- iOS packaged builds can now receive safe `kmoelite://comic/<id>` links and route them to the in-app comic detail page.
- Android debug builds can now receive safe `kmoelite://comic/<id>` links and route them to the in-app comic detail page for emulator/device validation.
- Android FileProvider roots are now limited to app-owned files/cache directories instead of broad external storage.
- Android builds now include a system share bridge for app-owned downloaded files after the Rust path/SQLite open-file guard succeeds.
- Android debug builds now include a debug-only app-private share smoke method that creates a temporary cache file and exercises the same system share bridge without requiring `adb root`.
- Apple TV/tvOS platform-readiness checks for tvOS SDK, simulator runtime, Apple TV simulator device types, actual simulator devices, and tvOS Rust targets.
- Non-phone app shell direction-key spatial focus movement, giving desktop keyboard, iPad keyboard, Android TV, and Apple TV work a shared focus-navigation baseline without adding dependencies.
- Android Tauri project generation with checked-in Gradle/Manifest/resources source and a debug APK/AAB build path for experimental Android work.
- Experimental Android TV entry support: optional Leanback launcher readiness check, Android TV runtime detection, TV layout contract, remote input class, and emulator direction-key focus smoke.
- Android TV native remote input bridge for DPAD direction keys and OK/Enter inside the Tauri Android WebView, plus emulator Reader OK/Back smoke with a synthetic local Reader cache.
- Android TV / remote key support for shell Back navigation and Reader OK/Back controls.
- Reader 设置新增 iOS 状态栏显示选项；默认阅读时隐藏状态栏，用户可在 Settings 或 Reader 高级面板切换显示。
- 详情页加载态新增返回操作和来源页封面/标题预览，降低 iPad/macOS 上进入详情时的空白等待感。
- 新增统一“删除本地阅读数据”入口：Detail、Shelf/Continue Reading、Library、Reader 控制面板和 Settings 可删除 Reader cache 及对应 EPUB/源图 ZIP 本地阅读文件。
- 新增默认 Reader cache 滚动窗口：保留前一章、当前章和后一章。
- 首页、分类和搜索漫画列表新增按钮分页，并把页码写入 URL 以支持刷新、返回和分享。
- README 增加最近 5 次更新摘要，并指向完整更新记录、验证日志和平台限制文档。
- README.en.md 增加英文最近更新入口，方便英文读者快速理解当前变化。

### Changed

- `pnpm smoke:ios-sim` now captures and validates a temporary simulator screenshot after launch, so the iPhone/iPad smoke catches more than a live process id.
- Default explicit download format now starts at EPUB for new or invalid settings, and explicit format pickers now show EPUB before source ZIP and MOBI so the ordinary path stays aligned with Reader-capable online reading.
- Mobile and TV Settings now present the download location as an app-private read-only storage area with export/share guidance, while desktop keeps the editable save-location field.
- Platform readiness now marks the known Apple TV/tvOS WebKit absence as a warning instead of hiding it as an external host-tool gap.
- Tightened production UI/native copy for Shelf, Download Center, mobile download preflight, file export fallback, and oversized-download errors so the app explains current behavior without future-plan or "not implemented" wording in normal flows.
- Visible app branding is now consistently `kmoelite` across the HTML title, app shell, Tauri product/window metadata, Android display strings, iOS bundle product metadata, and macOS DMG packaging names, while preserving legacy storage identifiers for compatibility.
- 详情页“开始阅读”和离线下载“自动”格式改为优先使用 EPUB，源图 ZIP/CBZ 保留为用户显式选择的高画质选项，避免普通阅读路径默认排入更容易被站点授权拒绝的源图 ZIP 任务。
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

- iPhone/iPad file-sharing metadata is now preserved in the XcodeGen `project.yml`, so regenerating the iOS project keeps app-private downloads exportable through iOS document sharing.
- iPhone/iPad app metadata now sets an explicit `CFBundleDisplayName` of `kmoelite`, so the installed app name no longer depends on inferred bundle defaults.
- GitHub Source CI no longer asks `actions/setup-node` to restore a pnpm cache before Corepack enables pnpm, making fresh GitHub Actions source checks less brittle.
- Reader cache repair can now fall back to another available Reader-capable archive for the same volume, such as rebuilding a stale source ZIP cache from an EPUB Library file.
- MOBI library records now stay file-only even when another local archive has already prepared a Reader cache for the same volume.
- Local reading-data deletion actions no longer treat metadata-only Library records as real local files, so the app will not offer a fake cleanup path when there is no device file or Reader cache to remove.
- Detail Reader entry now keeps the online EPUB/source retrieval path available when the Library only has metadata-only records without a real local file.
- Native queue startup now reports an empty queue as an error instead of returning a successful zero-task run.
- Native queue startup now reports an already-running queue as an error instead of returning a successful zero-task run.
- Download enqueue boundaries now reject empty task batches in both the frontend native helper and the Rust command, so empty download requests cannot be reported as successful.
- Explicit Detail offline downloads now fail cleanly when task creation returns no tasks, instead of sending an empty task set to the native download queue.
- Detail Reader startup now fails cleanly when the website/task parser returns no reader-download tasks, instead of enqueueing an empty native queue and showing a misleading existing-queue message.
- Mobile download path planning now ignores stale desktop save-location settings and always presents the app-private save area for iPhone, iPad, Android, Android tablet, Android TV, and future Apple TV targets.
- Android deep-link fallback state is now consumed once and cleared after native route events, preventing stale comic routes from being replayed later.
- Android deep-link startup now avoids reusing a stale global fallback route after the native pending-route bridge has already consumed it.
- Android packaged apps no longer crash when a safe `kmoelite://comic/<id>` link is delivered while the app is already running.
- iPhone/iPad/Android Library and Download Center file actions now use export/share wording instead of desktop-only folder-location wording, and mobile EPUB/source archives keep a clear Reader plus export path.
- Fixed download failure copy so site-side quota/permission responses such as `no permission` are not misreported as local save-location permission errors.
- iOS deep-link routing now stores a pending native route and uses a frontend Tauri event listener, making cold-start route delivery less dependent on direct `history.pushState` timing.
- Android system share export now checks that a chooser target exists before reporting success, and bridge failures are surfaced to the UI instead of being treated as successful exports.
- 修复已恢复站点会话但账号页字段暂不可解析时，首页仍把用户误判为未登录并显示“登录账号”的问题。
- 修复 Android 手机 WebView 在封面取色详情页中可能把目录标题、说明和目录条目文字绘制到错误层级，导致系统截图/设备画面出现大块断层或文字消失的问题。
- 修复 iPhone/iPad simulator 打包 App 启动后白屏的问题；打包入口不再写死根 `<base href="/">`，保持移动 bundle 资源相对加载。
- 修复平板/移动端详情页 Reader 自动下载在原生队列短暂启动失败后可能留下排队任务、需要手动进入下载中心启动的问题；目标任务仍处于排队状态时会自动重试一次启动队列。
- 修复 native 登录成功后账号页会被误判为未建立有效会话的问题；登录表单现在始终请求站点会话 cookie，同时“记住登录状态”只控制本地会话持久化。
- 修复 iPhone/iPad 登录表单可能被系统自动大写、自动更正或密码管理辅助影响的问题；邮箱提交前去除首尾空格，密码按原样提交，并把站点 `e400` 显示为明确的账号/密码未被接受提示。
- 修复 Android phone WebView 被识别为 Linux 桌面运行时，导致手机首屏显示桌面 sidebar 的问题。
- 修复 Android TV 上系统 Back 可能直接退出 Activity、以及 Android WebView 不稳定派发遥控器 OK/方向键导致 Reader 无法可靠显示 chrome 或关闭面板的问题。
- 修复 Reader chrome 隐藏后，隐藏的顶部/底部按钮仍可能被遥控器或键盘焦点激活的问题。
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

- Documented the Apple TV/tvOS WebKit platform blocker: current tvOS SDKs do not provide WebKit, so Apple TV cannot reuse the existing Tauri/WKWebView app shell.
- 明确项目为非官方 KMOE 漫画阅读器和个人阅读管理工具。
- 收紧 Web Adapter、下载、安全和 release 文档，不公开传播站点内部下载授权接口细节。
- 保持真实站点集成能力，但强调合规、单项、低频、脱敏和 runtime-only 凭证处理。
- 将 `TASK_PROGRESS.md` 明确为验证日志，将 `CHANGELOG.md` 明确为对外更新记录。
- 将 `AGENTS.md` 明确为无上下文 AI 接手入口，并同步文档职责、提交纪律和默认验证 gate。

### Validation

- Android Pixel 8 emulator has passed debug APK install/direct launch and running-app `kmoelite://comic/<id>` delivery without the previous native intent crash.
- Android Pixel 8 emulator has passed debug APK install/launch, WebView share-bridge injection smoke, and app-private debug share chooser smoke; real downloaded-file record share validation remains incomplete.
- Android phone/tablet/TV emulator packaged smoke passed for app launch and primary home/detail rendering after the mobile detail visual fix.
- iPad simulator has passed packaged launch, live EPUB download-to-Reader, page-turn, and progress-persistence smoke; iPhone simulator has passed packaged launch and session-restore smoke. Signed physical-device validation remains incomplete.
- Android TV emulator has passed live login, detail, EPUB download, Reader, remote page-turn, and local reading-data deletion smoke; real TV hardware and signed distribution remain incomplete.
- 最新本地验证结果记录在 [TASK_PROGRESS.md](TASK_PROGRESS.md)。

## 0.1.0

- 初始公开源码基线。
- Tauri 2 + React + TypeScript + Rust 应用结构。
- 包含目录/详情、书架、Library、下载队列、本地 SQLite、Reader cache 和跨平台 Reader 基础能力。
