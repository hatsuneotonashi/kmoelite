# 验证日志

本文件只记录脱敏验证结果、发布检查和已知 release blocker。不要在这里写入凭证、Cookie、Session、Token、授权 URL、真实下载路径、本机私有证据路径或对外宣传文案。

对外更新记录写入 [CHANGELOG.md](CHANGELOG.md)；README 只保留最近 5 次公开更新摘要。

## 2026-06-18 下载队列空任务边界拦截

- 变更范围：`apps/kmoe-app/src/platform/nativeCommands.ts`、`apps/kmoe-app/src-tauri/src/commands.rs`、对应 Vitest/Rust tests、README、CHANGELOG、TASK_PROGRESS。
- 行为摘要：前端 `enqueueNativeDownloadTasks` 和 Rust `enqueue_download_tasks` command 都会拒绝空任务批次；任何入口即使漏掉页面级检查，也不能再把空下载请求当作成功写入 native 队列。
- 验证：
  - `pnpm --dir apps/kmoe-app exec vitest run src/tests/nativeCommands.test.ts src/tests/detailReaderEntry.test.tsx`：passed，2 files / 43 tests。
  - `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，89 tests。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `git diff --check`：passed。
  - 本轮改动文件敏感扫描：passed，无账号、密码、Cookie、Session、Token、授权 URL 或本机私有路径命中。
- 未运行项：未运行完整 Vitest/build/Rust cargo check/platform/E2E gate；本轮只改下载队列空任务边界和对应测试。未运行真实下载验证、iPhone/iPad 真机、Android 真机/TV 实体设备或 Windows 真机。
- 待发布风险：该修复收紧空任务边界；各平台真实下载、导出/分享、签名发布和真机验证仍按平台文档继续验证。

## 2026-06-18 Detail 显式离线下载空任务拦截

- 变更范围：`apps/kmoe-app/src/pages/DetailPage.tsx`、`apps/kmoe-app/src/tests/detailReaderEntry.test.tsx`、README、CHANGELOG、TASK_PROGRESS。
- 行为摘要：详情页显式“离线下载/加入队列/加入并开始”路径如果没有生成任何下载任务，会直接提示刷新详情后重试，不再把空任务集合传给 native 下载队列，也不再显示“已创建 0 个任务”的误导结果。
- 验证：
  - `git diff --check`：passed。
  - `pnpm --dir apps/kmoe-app exec vitest run src/tests/detailReaderEntry.test.tsx`：passed，1 file / 13 tests。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - 本轮改动文件敏感扫描：passed，无账号、密码、Cookie、Session、Token、授权 URL 或本机私有路径命中。
- 未运行项：未运行完整 Vitest/build/Rust/platform/E2E gate；本轮只改 Detail 显式离线下载异常分支和对应测试。未运行真实下载验证、iPhone/iPad 真机、Android 真机/TV 实体设备或 Windows 真机。
- 待发布风险：该修复只消除显式离线下载空任务入队分支；各平台真实下载、导出/分享、签名发布和真机验证仍按平台文档继续验证。

## 2026-06-18 Detail Reader 空下载任务拦截

- 变更范围：`apps/kmoe-app/src/pages/DetailPage.tsx`、`apps/kmoe-app/src/tests/detailReaderEntry.test.tsx`、README、CHANGELOG、TASK_PROGRESS。
- 行为摘要：详情页 Reader 自动获取 EPUB/source ZIP 时，如果站点解析或任务生成层没有返回任何本地下载任务，前端会直接显示“没有生成下载任务”并停止流程，不再调用 native enqueue 空队列，也不再误导用户“队列已有任务”。
- 验证：
  - `pnpm --dir apps/kmoe-app exec vitest run src/tests/detailReaderEntry.test.tsx`：passed，1 file / 12 tests。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
- 未运行项：未运行完整 Vitest/build/Rust/platform/E2E gate；本轮只改 Detail Reader 异常分支和对应测试。未运行真实下载验证、iPhone/iPad 真机、Android 真机/TV 实体设备或 Windows 真机。
- 待发布风险：该修复只消除空任务假队列分支；各平台真实下载、导出/分享和签名发布仍按平台文档继续验证。

## 2026-06-18 移动端下载路径规划对齐 App 私有保存区

- 变更范围：`apps/kmoe-app/src/download/pathPlanner.ts`、`apps/kmoe-app/src/tests/downloadPathPlanner.test.ts`、README、CHANGELOG、TASK_PROGRESS。
- 行为摘要：iPhone、iPad、Android phone/tablet/TV 和未来 Apple TV 目标的前端下载路径规划不再使用旧的桌面保存位置设置，始终显示 App 私有保存区并标记需要导出/分享；native 下载保存根目录已经强制使用 App 私有路径，本次让 UI 计划和真实 native 行为一致。
- 验证：
  - `pnpm --dir apps/kmoe-app exec vitest run src/tests/downloadPathPlanner.test.ts`：passed，1 file / 7 tests。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
- 未运行项：未运行完整 Vitest/build/Rust/platform/E2E gate；本轮只改 TypeScript 下载路径规划和对应测试。未运行真实下载验证、移动真机导出/分享、Windows 真机或 TV 实体设备验证。
- 待发布风险：移动端真实 downloaded-file 系统分享/导出和签名发布仍需按平台文档继续做实机验证。

## 2026-06-18 Android deep link fallback 一次性消费

- 变更范围：`apps/kmoe-app/src/App.tsx`、`apps/kmoe-app/src/tests/androidTvInputBridge.test.ts`、CHANGELOG、TASK_PROGRESS。
- 行为摘要：Android packaged app 前端读取 `window.__kmoeliteAndroidPendingRoute` fallback 后会立即清空该全局值；收到 Android native bridge route 事件时也会清空 fallback，避免旧漫画 deep link 在 listener 重新挂载或 bridge 异常兜底时被重复播放。
- 验证：
  - `pnpm --dir apps/kmoe-app exec vitest run src/tests/androidTvInputBridge.test.ts`：passed，1 file / 5 tests。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
- 未运行项：未运行完整 Vitest/build/Rust/platform/E2E gate；本轮只改 Android deep-link 前端 fallback 状态消费和对应 source-level 检查。未重新构建或安装 Android APK。
- 待发布风险：该改动继续收紧 Android packaged deep-link handoff；Android 真机、真实 downloaded-file 分享、签名发布和实体 TV 验证仍未完成。

## 2026-06-18 Android deep link stale route 兜底修复

- 变更范围：`apps/kmoe-app/src/App.tsx`、`apps/kmoe-app/src/tests/androidTvInputBridge.test.ts`、CHANGELOG、TASK_PROGRESS。
- 行为摘要：Android packaged app 前端读取 deep-link pending route 时，如果 `KmoeliteAndroidApp.takePendingRoute()` bridge 已存在，就只消费 native bridge 的结果；bridge 返回空值时不再回退读取旧的 `window.__kmoeliteAndroidPendingRoute`，避免 listener 重新挂载时重复使用已消费的旧漫画路由。
- 验证：
  - `pnpm --dir apps/kmoe-app exec vitest run src/tests/androidTvInputBridge.test.ts`：passed，1 file / 5 tests。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
- 未运行项：未运行完整 Vitest/build/Rust/platform/E2E gate；本轮只改 Android deep-link 前端兜底读取逻辑和对应 source-level 检查。未重新构建或安装 Android APK。
- 待发布风险：该改动减少重复路由风险，但 Android 真机、真实 downloaded-file 分享和签名发布仍按平台文档保留为未完成验证。

## 2026-06-18 Android deep link 运行中崩溃修复

- 变更范围：`apps/kmoe-app/src-tauri/gen/android/app/src/main/java/moe/kzo/client/MainActivity.kt`、`apps/kmoe-app/src/App.tsx`、`apps/kmoe-app/src/tests/androidTvInputBridge.test.ts`、README、CHANGELOG、TASK_PROGRESS。
- 行为摘要：Android packaged app 收到安全 `kmoelite://comic/<id>` intent 时，先由 `MainActivity` 识别并交给前端 pending-route bridge；运行中的 app 不再把自有 deep link 继续传给 Tauri native `onNewIntent` 路径触发崩溃。前端启动时会读取 Android pending route，运行中则监听 Android bridge 派发的 route 事件。
- 验证：
  - `pnpm --dir apps/kmoe-app exec vitest run src/tests/androidTvInputBridge.test.ts`：passed，1 file / 5 tests。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `pnpm --dir apps/kmoe-app tauri:android:build:debug`：passed，debug APK/AAB generated；构建产物保持 ignored。
  - `Pixel_8_API_36` emulator debug APK install/direct launch：passed，`moe.kzo.client/.MainActivity` 启动后进程保持存活。
  - `Pixel_8_API_36` emulator running-app `kmoelite://comic/53339` smoke：passed，intent delivered to the running top activity，进程号保持不变，最近日志未见 `Rust_onNewIntent`、panic、fatal crash 或 `AndroidRuntime` fatal 关键字。
- 未运行项：未运行完整 Vitest/build/Rust/platform/E2E gate；本轮只改 Android deep-link bridge、前端 route handoff 和对应 source-level 测试。未运行真实登录、真实下载验证、Android 真机、iPhone/iPad 或 Windows 验证。
- 待发布风险：Android 模拟器已覆盖运行中 deep link 崩溃回归，但 signed Android 真机、真实下载文件分享、Android 平板/TV 实体设备和商店分发仍需继续验证。

## 2026-06-18 移动端文件动作死代码清理

- 变更范围：`apps/kmoe-app/src/platform/nativeCommands.ts`、`apps/kmoe-app/src/tests/downloadCenterReaderAction.test.tsx`、TASK_PROGRESS。
- 行为摘要：删除上一轮移动端导出语义修复后不再被生产代码调用的 `showLocalFileLocation` helper 和对应测试 mock；移动端文件导出统一走 `exportLocalFile`，桌面文件夹定位继续走 `revealLocalFile`。
- 验证：
  - `rg -n "showLocalFileLocation" apps/kmoe-app/src apps/kmoe-app/e2e apps/kmoe-app/src-tauri || true`：passed，无命中。
  - `pnpm --dir apps/kmoe-app exec vitest run src/tests/nativeCommands.test.ts src/tests/downloadCenterReaderAction.test.tsx`：passed，2 files / 33 tests。
  - `git diff --check`：passed。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
- 未运行项：未重复运行完整 Vitest/build/Rust/platform/E2E gate；本轮只删除无调用 TypeScript helper，不改变 native/Rust 边界或用户可见 UI。
- 待发布风险：无新增平台风险；真实 iPhone/iPad/Android 文件导出仍以对应设备 smoke 结果为准。

## 2026-06-18 移动端资料库/下载中心导出语义修复

- 变更范围：`apps/kmoe-app/src/pages/LibraryPage.tsx`、`apps/kmoe-app/src/pages/DownloadCenterPage.tsx`、对应 Vitest、mobile Playwright visual snapshots、README、CHANGELOG、TASK_PROGRESS。
- 行为摘要：iPhone、iPad、Android phone/tablet/TV 和 Apple TV runtime 的资料库文件动作改为“导出文件”，不再显示桌面“打开文件/查看位置”组合；下载中心在移动端对 Reader-capable EPUB/source ZIP 保留“阅读 + 导出文件”，对非 Reader 文件只保留一个导出动作，避免重复系统分享按钮和桌面文件夹语义。
- 验证：
  - `pnpm --dir apps/kmoe-app exec vitest run src/tests/libraryReaderEntry.test.tsx src/tests/downloadCenterReaderAction.test.tsx`：passed，2 files / 9 tests。
  - `git diff --check`：passed。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `pnpm --dir apps/kmoe-app test:run`：passed，55 files / 305 tests。
  - `pnpm --dir apps/kmoe-app build`：passed，production Vite build and iOS asset sync completed; generated outputs remain ignored.
  - `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
  - `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，88 tests。
  - `pnpm check:platforms`：passed，`pass=52 warn=1 external=2 fail=0`。
  - `node scripts/check-ios-assets.mjs`：passed，files=27。
  - `pnpm --dir apps/kmoe-app e2e`：passed，114 passed / 50 skipped。第一次全量 E2E 暴露移动端资料库预期截图变化和一个书架像素漂移；更新对应 mobile visual snapshots 后重跑全量通过。
- 未运行项：未运行真实下载验证；`KMOE_REAL_DOWNLOAD_VERIFY` 未设置，本轮不下载文件、不保存授权 URL。未重新部署 iPad/Android 真机。
- 待发布风险：该修复保证移动端 UI 语义与 app-private 导出路径一致，但 iPhone/iPad 真机真实下载、系统分享表、文件导出到 Files 和 Reader 下载后打开仍需继续实机验证。

## 2026-06-18 移动端保存位置设置只读化

- 变更范围：`apps/kmoe-app/src/pages/SettingsPage.tsx`、`apps/kmoe-app/src/tests/settingsNativeConfig.test.tsx`、README、CHANGELOG、TASK_PROGRESS。
- 行为摘要：iPhone、iPad、Android phone/tablet/TV 和 Apple TV runtime 的 Settings 不再显示可编辑保存位置和“保存”按钮，改为展示 App 私有保存区和导出/分享说明。桌面仍保留可编辑保存位置。移动端点击“恢复默认值”后会重新读取 native download dir，避免短暂回到桌面默认路径。
- 验证：
  - `pnpm --dir apps/kmoe-app exec vitest run src/tests/settingsNativeConfig.test.tsx`：passed，1 file / 9 tests。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `pnpm --dir apps/kmoe-app build`：passed，production Vite build and iOS asset sync completed; generated outputs remain ignored.
- 未运行项：未运行完整 Vitest/Rust/platform/E2E gate；本轮只改 Settings UI 和对应测试。未运行真实 iPhone/iPad/Android 设备验证。
- 待发布风险：该改动减少移动端下载保存位置误解，但 iPhone/iPad 真机真实下载、导出分享表、前后台行为和显式缓存清理仍需继续验证。

## 2026-06-18 下载失败文案归因修复

- 变更范围：`apps/kmoe-app/src/lib/format.ts`、`apps/kmoe-app/src/tests/formatMessages.test.ts`、README、CHANGELOG、TASK_PROGRESS。
- 行为摘要：站点返回 `no permission`、下载权限不足、额度不足等下载授权/站点限制文案时，前端不再误显示为“保存位置权限”。本地文件系统 `Permission denied` 仍保持为保存位置权限提示。
- 验证：
  - `git diff --check`：passed。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `pnpm --dir apps/kmoe-app test:run -- src/tests/formatMessages.test.ts`：passed，Vitest reported 55 files / 302 tests passed。
  - `pnpm --dir apps/kmoe-app build`：passed，production Vite build and iOS asset sync completed; generated outputs remain ignored.
  - `node scripts/verify-real-site-smoke.mjs` with runtime-only credentials from `.env.local`：passed；checked login_page、login_post、profile、catalog、detail、book_data on `https://kxo.moe`，forbiddenEndpointsCalled=false。
  - 新增/修改文件敏感扫描：passed，未发现账号、密码、Cookie、Session、Token、授权 URL 或本机私有路径。
- 未运行项：未运行真实下载验证；`KMOE_REAL_DOWNLOAD_VERIFY` 未设置，本轮不下载文件、不保存授权 URL。
- 待发布风险：该修复只解决错误归因和 kxo live smoke；iPhone/iPad 真机真实下载、导出分享表和 Reader 下载后打开仍需继续验证。

## 2026-06-18 Apple TV readiness warning classification

- 变更范围：`scripts/check-platform-readiness.mjs`、CHANGELOG、docs/status、TASK_PROGRESS。
- 行为摘要：Apple TV/tvOS SDK 缺少 WebKit 是已知平台架构 blocker，不是缺本机工具。因此 `appletv.webkit_unavailable` 从 `external` 改为 `warn`，让平台 gate 明确暴露 Apple TV 当前不能复用 Tauri/WKWebView 壳。
- 验证：
  - `git diff --check`：passed。
  - `node scripts/check-platform-readiness.mjs --self-test`：passed。
  - `pnpm check:platforms`：passed，`pass=52 warn=1 external=2 fail=0`。
- 未运行项：未运行完整 TypeScript/Vitest/build/Rust/E2E gate；本轮只改平台 readiness 分类和文档。
- 待发布风险：Apple TV 仍未可用；后续必须先设计 TVMLKit、TVUIKit 或原生 TV UI。

## 2026-06-18 Apple TV WebKit platform blocker documentation

- 变更范围：`scripts/check-platform-readiness.mjs`、README、AGENTS、CHANGELOG、docs/status、docs/platforms、docs/development、docs/release、docs/reader-shelf。
- 行为摘要：尝试走最薄 tvOS `WKWebView` 壳时，`xcodebuild` 在 tvOS simulator SDK 下无法解析 `WebKit`。随后用 SDK 文件检查确认 `WebKit.framework` 不存在，而 `TVMLKit.framework`、`TVUIKit.framework` 和 `UIKit.framework` 存在。本轮撤回失败 tvOS target，改为把 Apple TV 明确记录为架构 blocker：当前 Tauri/WKWebView 前端壳不能直接复用到 tvOS，后续必须先设计 TVMLKit、TVUIKit 或原生 TV UI 路线。
- 验证：
  - `git diff --check`：passed。
  - `node scripts/check-platform-readiness.mjs --self-test`：passed。
  - `pnpm check:platforms`：passed，`pass=52 warn=0 external=3 fail=0`；新增 external 是 `appletv.webkit_unavailable`。
  - tvOS simulator SDK framework check：passed；确认 WebKit missing，TVMLKit/TVUIKit/UIKit present。
- 未运行项：未运行完整 TypeScript/Vitest/build/Rust/E2E gate；本轮只改平台检查脚本和文档。未构建 Apple TV app，因为 WKWebView 方案被平台 SDK 阻断。
- 待发布风险：Apple TV 仍不是可用目标；任何后续 Apple TV 工作必须先完成 TVMLKit、TVUIKit 或原生 TV UI 方案，再谈遥控器输入、Reader、缓存清理和分发验证。

## 2026-06-18 iOS deep link cold-start route hardening

- 变更范围：`App.tsx` Tauri deep-link route listener、Rust pending deep-link route command、README/README.en/CHANGELOG/docs/status/docs/platforms/TASK_PROGRESS。
- 行为摘要：iOS/desktop Tauri 收到安全 `kmoelite://comic/<id>` 后，会把 `/comic/<id>` 保存为 pending native route，同时向前端发 `kmoelite-deep-link-route` 事件，并保留直接 `history.pushState` 兜底。前端启动后会读取一次 `get_pending_deep_link_route`，运行中监听同一事件并用 React Router `navigate()` 进入详情，降低 packaged cold-start 时 native eval 早于前端 ready 导致路由丢失的风险。
- 验证：
  - `git diff --check`：passed。
  - `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml deep_links --lib`：passed，2 tests。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `pnpm --dir apps/kmoe-app exec tauri ios build --debug --target aarch64-sim --no-sign`：passed；production web build、iOS asset sync、Rust/iOS simulator build passed；构建产物保持 ignored。
  - iPhone 17 simulator packaged open-url check：partial；`xcrun simctl openurl ... kmoelite://comic/10817` 可到达 iOS 系统“在 kmoelite 中打开?”确认框。自动化环境无法可靠点击该系统确认按钮完成详情页视觉确认；回车未触发确认。
  - 敏感文本扫描：passed；唯一命中是 `scripts/verify-release-readiness.sh` 中用于检测敏感信息的正则规则文本，未发现真实账号、密码、Cookie、Session、Token、授权 URL 或本机私有路径。
- 未运行项：未跑完整 Vitest/build/Rust/platform/E2E gate；未完成 iPhone 详情、Reader、下载、缓存清理或签名实机验证。
- 待发布风险：代码路径已加固并通过编译，但 iOS deep-link 详情页视觉 smoke 仍需人工确认系统弹窗后或可用 UI automation 后补跑。

## 2026-06-18 iOS packaged deep link 入口

- 变更范围：Tauri Rust app run event、iOS `Info.plist` / `project.yml` URL scheme、README/README.en/CHANGELOG/docs/status/docs/platforms/TASK_PROGRESS。
- 行为摘要：iOS packaged app 注册 `kmoelite://` scheme；系统打开 `kmoelite://comic/<id>` 时，Rust 只接受 1-80 位 `[A-Za-z0-9_-]` comic id，并把它路由到应用内 `/comic/<id>`。非 `comic` host、路径穿越、百分号编码路径和过长 id 会被拒绝。
- 验证：
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml deep_links --lib`：passed，2 tests。
  - `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
  - `git diff --check`：passed。
  - `plutil -p apps/kmoe-app/src-tauri/gen/apple/kmoe-app_iOS/Info.plist | rg "CFBundleURLTypes|kmoelite|CFBundleURLName|CFBundleURLSchemes"`：passed。
  - `pnpm --dir apps/kmoe-app exec tauri ios build --debug --target aarch64-sim --no-sign`：passed；production web build、iOS asset sync、Rust/iOS simulator build passed；构建产物保持 ignored。
  - iPhone 17 simulator install/launch/open-url：passed；安装生成的 `kmoelite.app`，启动 bundle id `moe.kzo.client`，`xcrun simctl openurl ... kmoelite://comic/10817` 成功返回。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - 敏感文本扫描：passed；唯一命中是 `scripts/verify-release-readiness.sh` 中用于检测敏感信息的正则规则文本，未发现真实账号、密码、Cookie、Session、Token、授权 URL 或本机私有路径。
- 未运行项：本轮未跑完整 Vitest/Rust/platform/E2E gate；未做签名 iPhone/iPad 实机验证，未做 iPhone 详情页加载、Reader、下载、文件分享或缓存清理 smoke。
- 待发布风险：iOS packaged app 已能接收安全漫画 deep link，但这不是 signed physical-device、Reader/download 或 App Store 分发验证。

## 2026-06-18 Android app-private 分享表 smoke

- 变更范围：Android `MainActivity.kt` share bridge、Android source-level 测试、CHANGELOG/docs/status/docs/platforms/TASK_PROGRESS。
- 行为摘要：Android debug build 新增 `shareDebugTempFile()` WebView bridge 方法，仅在 `BuildConfig.DEBUG` 下可用。它在 app-private cache 中创建临时 smoke 文件，并复用正式 `FileProvider` / `ACTION_SEND` 分享路径，避免再依赖 `adb root` 或 `run-as` 伪造 app 私有文件。
- 验证：
  - `pnpm --dir apps/kmoe-app exec vitest run src/tests/androidTvInputBridge.test.ts src/tests/nativeCommands.test.ts`：passed，2 files / 34 tests。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `pnpm --dir apps/kmoe-app tauri:android:build:debug`：passed，production web build、iOS asset sync、Rust Android targets、Kotlin/Gradle/XML resources、debug APK/AAB packaging passed；构建产物未进入 git 状态。
  - `Pixel_8_API_36` emulator install/launch：passed，debug APK 安装成功，`moe.kzo.client/.MainActivity` 启动后进程保持存活。
  - Android WebView debug share chooser smoke：passed，DevTools Runtime 中 `window.KmoeliteAndroidFile.shareDebugTempFile()` 返回 `ok`，确认 app-private cache 临时文件能触发系统分享路径；最近日志未见崩溃关键字。
- 未运行项：本轮未使用真实 downloaded-file/Library 记录触发分享表；未运行完整 Vitest/build/Rust/platform gate，因为本轮只改 Android bridge 和文档；未运行 Android 真机、TV 实机、iPhone/iPad/Windows。
- 待发布风险：Android app-private 文件分享路径已有 emulator chooser smoke，但真实 downloaded-file 记录分享、真机和签名 release 仍需继续验证。

## 2026-06-18 Android 系统分享失败回传

- 变更范围：Android `MainActivity.kt` share bridge、前端 native command Android fallback、Android source-level 测试、native command 测试、README/CHANGELOG/TASK_PROGRESS。
- 行为摘要：Android 系统分享 bridge 现在会在返回 `ok` 前确认系统存在可处理的 chooser target；无有效文件、无分享目标或原生异常会返回 `error:*`，前端据此显示失败，不再把 bridge 失败伪造成“已打开系统分享”。
- 验证：
  - `pnpm --dir apps/kmoe-app exec vitest run src/tests/nativeCommands.test.ts src/tests/androidTvInputBridge.test.ts`：passed，2 files / 33 tests。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `pnpm --dir apps/kmoe-app tauri:android:build:debug`：passed，Kotlin/Gradle/XML resources/debug APK/AAB packaging passed；构建产物未进入 git 状态。
  - `Pixel_8_API_36` emulator install/launch：passed，debug APK 安装成功，`moe.kzo.client/.MainActivity` 启动后进程保持存活，最近日志未见崩溃关键字。
  - Android WebView share bridge failure smoke：passed，DevTools Runtime 中 `window.KmoeliteAndroidFile.shareFile('/data/user/0/moe.kzo.client/files/Downloads/Kmoe/missing.epub')` 返回 `error:invalid-file`，确认缺失文件不会被桥接层伪造成 `ok`。
- 未运行项：真实 downloaded-file 系统分享 chooser 尚未完整触发；本轮只验证缺失文件失败路径，不使用真实下载文件。未运行完整 Vitest/build/Rust/platform gate，因为本轮只改 Android bridge 和前端 fallback；未运行 Android 真机、TV 实机、iPhone/iPad/Windows。
- 待发布风险：该改动消除了 Android 分享 bridge 的假成功路径，但真实 downloaded-file 分享 chooser 仍需在 emulator/device 上用实际本地下载文件触发后才能移除 release blocker。

## 2026-06-17 Android 系统分享导出桥

- 变更范围：Android `MainActivity.kt`、前端 native command fallback、Android source-level 测试、native command 测试、README/CHANGELOG/docs/status/docs/platforms/TASK_PROGRESS。
- 行为摘要：Android WebView 注册 `KmoeliteAndroidFile.shareFile(path)`，只允许 app-owned `filesDir` / `cacheDir` 下的真实文件通过 `FileProvider` 和系统 `ACTION_SEND` chooser 导出。前端仍先调用 Rust `open_file` / `reveal_in_folder`，只有 Rust 路径/SQLite 校验通过并返回 Android 系统分享未支持错误时，才调用 Android bridge；其他 native 错误不会被吞掉或伪造成成功。
- 验证：
  - `pnpm --dir apps/kmoe-app exec vitest run src/tests/nativeCommands.test.ts src/tests/androidTvInputBridge.test.ts`：passed，2 files / 32 tests。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `git diff --check`：passed。
  - `pnpm --dir apps/kmoe-app test:run`：passed，55 files / 300 tests。
  - `pnpm --dir apps/kmoe-app build`：passed，production build and iOS asset sync passed；构建产物未进入 git 状态。
  - `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
  - `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，86 tests。
  - `pnpm check:platforms`：passed，`pass=52 warn=0 external=2 fail=0`。
  - `node scripts/check-ios-assets.mjs`：passed，27 files。
  - `pnpm --dir apps/kmoe-app tauri:android:build:debug`：passed，Kotlin/Gradle/XML resources/debug APK/AAB packaging passed；构建产物未进入 git 状态。
  - `Pixel_8_API_36` emulator cold boot：passed，使用 Android SDK `emulator` 完整路径、`-read-only`、software renderer 后 boot completed；ADB `sys.boot_completed=1`。
  - Android debug APK install/launch：passed，`moe.kzo.client/.MainActivity` 启动后进程保持存活，首页真实 catalog 和封面渲染成功。
  - Android WebView bridge injection smoke：passed，DevTools Runtime 中 `typeof window.KmoeliteAndroidFile === "object"` 且 `typeof window.KmoeliteAndroidFile.shareFile === "function"`。
- 未运行项：Android 系统分享 chooser 尚未用真实 downloaded-file 记录完整触发；本轮尝试向 emulator app-private `files` 目录注入临时文件时，Play Store production emulator 不允许 `adb root`，`run-as` 写入也不可用，因此没有伪造完成分享表验证。未运行 Playwright E2E，因为本轮没有改路由、布局、Reader、accessibility 或浏览器可见工作流；未运行 Android 真机、TV 实机、iPhone/iPad/Windows。
- 待发布风险：Android 系统分享桥已编译、前端 fallback 测试通过，并在 Android WebView runtime 中确认 bridge 注入；仍需要 emulator/device 上用真实 downloaded-file 记录触发系统分享表，才能把 Android 文件导出/分享从 release blocker 中移除。

## 2026-06-17 Android FileProvider 私有目录边界

- 变更范围：Android `file_paths.xml`、Android 壳 source-level 测试、CHANGELOG/TASK_PROGRESS。
- 行为摘要：Android FileProvider 共享根从宽泛的 external storage 改为 app-owned `files-path` 和 `cache-path`。这与 Android/iOS 显式下载先写入 App 私有保存区的架构一致，也为后续 Android 系统分享导出桥接保留正确边界；本轮没有假装 Android share/export 已完成。
- 验证：
  - `pnpm --dir apps/kmoe-app exec vitest run src/tests/androidTvInputBridge.test.ts`：passed，1 file / 3 tests。
  - `git diff --check`：passed。
  - `pnpm --dir apps/kmoe-app tauri:android:build:debug`：passed，Android XML resources and debug APK/AAB packaging passed；构建产物未进入 git 状态。
- 未运行项：Android emulator runtime share smoke、完整 gate 尚未在本条记录完成；本轮没有实现 Android native share/export bridge。
- 待发布风险：Android 文件导出/分享仍需要真实 native bridge 和 emulator/device smoke；本轮只收紧可分享路径边界。

## 2026-06-17 Android comic deep link 入口

- 变更范围：Android Manifest、Android `MainActivity.kt`、Android 壳 source-level 测试、CHANGELOG/TASK_PROGRESS。
- 行为摘要：Android debug app 新增安全的 `kmoelite://comic/<id>` deep link 入口。Manifest 只注册 `kmoelite` scheme 的 `comic` host；Activity 只接受 1-80 位 `[A-Za-z0-9_-]` comic id，并通过 WebView `history.pushState` 进入应用内 `/comic/<id>` 路由。该入口用于模拟器/真机直接打开详情页验证，不改变登录、下载、Reader 或文件权限逻辑。
- 验证：
  - `pnpm --dir apps/kmoe-app exec vitest run src/tests/androidTvInputBridge.test.ts`：passed，1 file / 2 tests。
  - `git diff --check`：passed。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `pnpm --dir apps/kmoe-app test:run`：passed，55 files / 296 tests。
  - `pnpm --dir apps/kmoe-app build`：passed。
  - `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
  - `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，86 tests。
  - `pnpm check:platforms`：passed，`pass=52 warn=0 external=2 fail=0`。
  - `node scripts/check-ios-assets.mjs`：passed，27 files。
  - `pnpm --dir apps/kmoe-app tauri:android:build:debug`：passed，生成 Android debug APK/AAB；Kotlin/Gradle 编译通过，构建产物未进入 git 状态。
  - 敏感文本扫描：passed；仅命中 `TASK_PROGRESS.md`/`CHANGELOG.md` 中关于 cookie/session 的脱敏说明和安全规则文本，未发现真实账号、密码、Cookie、Session、Token、授权 URL 或本机私有路径。
  - tracked 风险文件扫描：passed；未发现 `.env`、cookie/session 文件、SQLite/runtime DB、`node_modules`、`dist`、`target`、`test-results`、下载目录或临时构建文件进入 tracked tree。
- 未运行项：本轮未安装 APK 到 Android emulator/device，也未通过 `adb shell am start -a android.intent.action.VIEW -d ...` 做运行时 deep link smoke；未运行 Playwright E2E 或真实站点/下载回归，因为没有改浏览器可见布局、Reader、登录、下载或站点适配逻辑。
- 待发布风险：该入口只补 Android 验证/导航能力，不代表 Android 实体设备、文件导出/分享、签名发布或真实下载流程完成。

## 2026-06-17 iPhone session restore 登录状态误判修复

- 变更范围：`WebKmoeApi.getSession()`、native API 聚焦测试、README/README.en/CHANGELOG/TASK_PROGRESS。
- 行为摘要：已恢复站点会话时，只要 `getUserProfile()` 成功解析为非登录页，就把 session 视为 authenticated；不再要求账号页必须解析出昵称、KMOE ID、等级或额度字段。parser 仍负责识别未登录页并抛出“当前会话未登录或已过期”。
- iPhone simulator packaged app：
  - `pnpm --dir apps/kmoe-app exec tauri ios build --debug --target aarch64-sim --no-sign`：passed，生成 `kmoelite.app`。
  - iPhone 17 simulator install/launch：passed，bundle id `moe.kzo.client`。
  - 通过 runtime credentials 获取站点 session 并写入 app-private simulator SQLite：passed；输出未打印账号、密码或最终修复后的 session cookie。
  - session restore UI：passed；首页账号入口从“登录账号”变为“账号中心”。
- 验证：
  - `pnpm --dir apps/kmoe-app exec vitest run src/tests/webKmoeApiNativeErrors.test.ts`：passed，1 file / 10 tests。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
- 安全记录：本轮第一次临时管道命令错误地把一个 runtime session cookie 写入了工具输出；没有写入仓库、文件、截图、提交或文档。后续命令改为 0600 临时文件 + SQLite 写入 + 立即删除临时文件。该旧 session 应通过站点退出登录或账号密码轮换使其失效。
- 未运行项：iPhone 详情/Reader/下载/缓存清理仍未完成；`simctl openurl` 只会打开 Safari，Computer Use 无法读取 Simulator 窗口，坐标点击未能稳定进入详情页。
- 待发布风险：iPhone packaged app 的会话恢复 UI 已修复并验证，但 iPhone 真实 Reader/download/cache smoke 仍是 release blocker。

## 2026-06-17 生产界面临时文案收敛

- 变更范围：Shelf、Download Center、mobile download preflight、file export fallback、oversized-download error copy。
- 行为摘要：移除生产界面中的“后续/暂未/当前版本”等临时口吻，改为说明当前真实行为：书架只描述本地状态，移动端下载提示保持 App 打开，iPhone/iPad 可用系统分享表导出，Android 保存在 App 私有下载目录，超大下载直接报告无法保存。
- 验证：
  - `git diff --check`：passed。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
  - 生产源码残留扫描：passed；剩余 `placeholderData: keepPreviousData` 命中是 TanStack Query 正式 API 名称，不是用户可见 mock/placeholder。
- 未运行项：本轮未改业务逻辑、路由、布局、Reader、SQLite schema 或测试 fixture，未运行完整 Vitest/build/E2E/native test gate。
- 待发布风险：本轮只是文案收敛，不改变下载、导出或平台验证状态。

## 2026-06-17 kmoelite 可见应用名统一与 iPhone packaged smoke

- 变更范围：web title、桌面 sidebar 品牌、Tauri product/window metadata、Android app display strings、iOS Xcode product metadata、macOS DMG packaging script、iOS asset sync cleanup script、Rust test fixture path、AGENTS/README/CHANGELOG/TASK_PROGRESS、Playwright visual baselines。
- 行为摘要：可见产品名统一为 `kmoelite`。保留 bundle id、SQLite 文件名、localStorage key 等兼容标识，避免无迁移设计时影响现有本地数据。iOS 构建脚本会清理旧 `Kmoe Client.app` 和新 `kmoelite.app` stale bundle，再生成当前产品名 bundle。
- iPhone simulator packaged smoke：
  - `pnpm --dir apps/kmoe-app exec tauri ios build --debug --target aarch64-sim --no-sign`：passed，生成 `kmoelite.app`。
  - iPhone 17 simulator install/launch：passed，bundle id `moe.kzo.client`。
  - `Info.plist` inspection：passed，`CFBundleName = kmoelite`，`CFBundleExecutable = kmoelite`，`CFBundleIdentifier = moe.kzo.client`。
  - 临时截图只用于本地确认首屏渲染和底部导航，未写入仓库。
- 验证：
  - `git diff --check`：passed。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `pnpm --dir apps/kmoe-app test:run`：passed，55 files / 294 tests。
  - `pnpm --dir apps/kmoe-app build`：passed。
  - `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
  - `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，86 tests。
  - `pnpm check:platforms`：passed，`pass=52 warn=0 external=2 fail=0`。
  - `node scripts/check-ios-assets.mjs`：passed，27 files。
  - `pnpm --dir apps/kmoe-app e2e --update-snapshots`：passed，114 passed / 50 skipped；更新 12 张大桌面/平板视觉基线，差异仅来自左侧品牌文字。
  - `pnpm --dir apps/kmoe-app e2e`：passed，114 passed / 50 skipped。
  - 敏感文本扫描：passed，唯一命中是 `scripts/verify-release-readiness.sh` 中用于检测敏感信息的正则规则文本；未发现真实账号、密码、Cookie、Session、Token、授权 URL 或本机私有路径。
- 未运行项：本轮未运行 signed physical iPhone/iPad install、macOS signed/notarized app、Windows 真机、Android 实体设备/TV、Apple TV runnable app、真实站点登录/下载回归。
- 待发布风险：本轮只证明可见命名和 iPhone simulator packaged 启动链路；签名发行、实体设备安装、Windows 真机和 Apple TV 产品壳仍按平台状态文档保留为未完成项。

## 2026-06-17 Apple TV tvOS runtime 安装与模拟器启动

- 变更范围：Apple TV readiness 脚本、Android AVD manager readiness 检查、README/README.en/CHANGELOG/AGENTS/docs/status/docs/platforms/docs/development/docs/release 文档。
- 行为摘要：本机通过 Xcode 安装 tvOS 26.5 simulator runtime，并启动 Apple TV 4K 1080p 模拟器。`check:platforms` 新增 actual Apple TV simulator device 检查，用于区分“只有 device type”与“runtime 安装后实际有可用 simulator device”；同时把 Android `avdmanager` 检查改为有效且不输出本机 AVD 路径的 `list device`。该结果仍不代表 kmoelite 已有可运行 Apple TV App。
- 本机工具状态：
  - `xcodebuild -downloadPlatform tvOS`：passed，安装 `tvOS 26.5 (23L470)` runtime。
  - `xcrun simctl list runtimes`：passed，存在 `com.apple.CoreSimulator.SimRuntime.tvOS-26-5`。
  - `xcrun simctl list devicetypes`：passed，存在 Apple TV simulator device types。
  - `xcrun simctl list devices 'tvOS 26.5'`：passed，存在 Apple TV 4K simulator devices。
  - `xcrun simctl bootstatus ... -b`：passed，Apple TV 4K (3rd generation) 1080p simulator boot completed。
- 验证：
  - `git diff --check`：passed。
  - `node scripts/check-platform-readiness.mjs --self-test`：passed。
  - `pnpm check:platforms`：passed，`pass=52 warn=0 external=2 fail=0`；剩余 external 均为 Windows 主机专属 signing/NSIS 工具检查。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `pnpm --dir apps/kmoe-app test:run`：passed，55 files / 294 tests。
  - `pnpm --dir apps/kmoe-app build`：passed。
  - `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
  - `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，86 tests。
  - `node scripts/check-ios-assets.mjs`：passed，27 files。
  - 敏感文本扫描：passed，唯一命中是 `scripts/verify-release-readiness.sh` 中用于检测敏感信息的正则规则文本；未发现真实账号、密码、Cookie、Session、Token、授权 URL 或本机私有路径。
- 未运行项：本轮未运行 Playwright E2E，因为没有改路由、布局、Reader UI、accessibility 或浏览器可见工作流；未生成 tvOS/WKWebView 壳，未安装 kmoelite 到 Apple TV simulator，未验证 Apple TV 遥控器输入、Reader、下载、缓存清理或平台分发。
- 待发布风险：Apple TV 仍是研究方向；工具链和模拟器已可用，但产品还缺 tvOS shell、焦点/遥控器输入、Reader 横屏体验和 native bridge 设计。

## 2026-06-17 Android 手机详情页目录合成层修复与平台 smoke

- 变更范围：移动端 cover-theme 详情页目录 CSS、移动详情页 Playwright 视觉基线、README/CHANGELOG/TASK_PROGRESS。
- 前置状态：
  - `git status --short --branch`：dirty，仅包含本轮 CSS/视觉基线/文档改动；ignored 产物包括 `.env.local`、`dist`、Tauri Android/iOS build、`target`、`test-results` 和 `node_modules`。
  - 本轮截图证据均为临时本地文件，未写入仓库；未打印账号、密码、Cookie、Session、Token 或授权 URL。
- 修复：
  - Android 手机 WebView 系统截图中，封面取色详情页的目录标题、说明和目录条目普通文字可能被绘制到错误层级，表现为目录区域大块断层、只剩按钮/Badge 可见。
  - 移动端 cover-theme 目录容器改为透明布局容器；标题区、提示区和目录条目的主内容/操作区使用独立稳定背景层，并显式提升文本绘制层。
- Android phone emulator：
  - `Pixel_8_API_36` cold boot、debug APK install、package launch：passed。
  - 首页：passed，真实 catalog 和封面渲染成功，底部导航和 safe-area 可用。
  - 详情页：passed，从首页进入 `/comic/20213`；系统截图确认目录标题、说明、目录条目标题/页数、状态和阅读按钮均可见。
- Android tablet emulator：
  - `Kmoelite_Tablet_API_36` cold boot、debug APK install、package launch：passed。
  - 首页：passed，平板 rail/sidebar、宽屏搜索区、Continue Reading 和 catalog 卡片布局正常。
- Android TV emulator：
  - `Kmoelite_TV_API_36` cold boot、debug APK install、package launch：passed。
  - 首页：passed，Leanback/TV 入口可打开，深色 TV sidebar、搜索区和 Continue Reading 布局正常。
- iOS simulator / physical-device 状态：
  - `pnpm --dir apps/kmoe-app exec tauri ios build --debug --target aarch64-sim --no-sign`：passed。
  - iPhone 17 simulator install/launch/home render：passed。
  - signed physical iPad build/install：未完成。Xcode 自动签名命令能进入设备部署阶段，但真机当时处于 locked 状态，DDI 挂载返回 device locked；需要解锁并保持唤醒后重试。
- 提交前验证：
  - `git diff --check`：passed。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `pnpm --dir apps/kmoe-app test:run`：passed，55 files / 294 tests。
  - `pnpm --dir apps/kmoe-app build`：passed，并同步 iOS assets。
  - `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
  - `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，86 tests。
  - `pnpm check:platforms`：passed，`pass=49 warn=0 external=4 fail=0`。
  - `node scripts/check-ios-assets.mjs`：passed，27 files。
  - `pnpm --dir apps/kmoe-app e2e`：initial run found the expected mobile detail visual baseline diff; updated the one fixture screenshot baseline, reran full suite, passed 114 / skipped 50。
- 未运行项：Android/iOS signed release build、Android 实体手机/平板/TV、iPad 真机重新部署、Windows 真机、真实登录/下载回归、长时间 Reader/前后台验证。
- 待发布风险：Android phone/tablet/TV emulator packaged smoke 已覆盖启动和关键 UI 渲染；这不等同于实体设备、签名发行或真实下载全流程验证完成。iPad 真机仍需要在设备解锁且 DDI 可用时重试安装。

## 2026-06-17 iPad simulator 真实 EPUB Reader smoke

- 变更范围：验证日志和平台状态文档；产品代码未变更。
- 前置状态：
  - `git status --short --branch`：clean，`main...origin/main`。
  - `.env.local`：present and ignored；runtime credentials present。本轮未打印账号、密码、Cookie、Session 或授权 URL。
  - packaged iOS simulator app 使用 `apps/kmoe-app/src-tauri/gen/apple/build/arm64-sim/Kmoe Client.app`，不是 Mac `5173` dev server。
- iPad Air 13-inch simulator：
  - install/launch：passed，bundle id `moe.kzo.client`。
  - 首屏：passed，真实 catalog 数据和封面加载成功，账号入口识别为已登录状态。
  - 登录会话：真实站点登录请求 passed；因 Simulator 文本输入自动化不稳定，本轮通过写入 app-private native SQLite `app_settings.kmoe_session_cookie_header` seed 会话后继续验证。该 cookie 只存在 simulator app container，未输出、未写入仓库。
  - 详情页：passed，从首页真实条目进入详情页，平板 rail/sidebar 保持完整。
  - Reader flow：passed，详情页“开始阅读”创建并执行 EPUB 单项任务，下载完成后自动准备 Reader cache 并进入 Reader。
  - Native SQLite 状态：`download_tasks` completed epub = 1；`downloaded_files` epub = 1；ready `reading_cache` epub = 1；`page_cache` rows = 192。
  - Reader：第 1 页图片加载成功；显示 Reader chrome 后，RTL 下一页翻到第 2 / 192 页。
  - Reading persistence：`reading_progress.page_index = 1`，`reading_history` recorded `open` and `page_change` events。
  - 临时截图只用于本地视觉确认，未写入仓库。
- iPhone 17 simulator：
  - install/launch：passed。
  - 首屏：passed，iPhone safe-area + bottom navigation 渲染成功。
  - 登录会话 restore：passed，受控 session seed 后账号入口变为账号中心，真实封面加载成功。
  - 未完成：本轮未获得稳定的 iPhone simulator UI 点击自动化链路，未继续执行 iPhone 详情、Reader、下载或缓存清理 smoke。
- 提交前验证：
  - `git diff --check`：passed。
  - 敏感文本扫描：passed，修改文档未发现真实账号、密码、Cookie、Session、Token、授权 URL 或本机私有路径；命中项为安全规则词和脱敏说明。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `pnpm --dir apps/kmoe-app test:run`：passed，55 files / 294 tests。
  - `pnpm --dir apps/kmoe-app build`：passed，并同步 iOS assets。
  - `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
  - `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，86 tests。
  - `pnpm check:platforms`：passed，`pass=49 warn=0 external=4 fail=0`。
  - `node scripts/check-ios-assets.mjs`：passed，27 files。
- 未运行项：signed physical-device install、iPhone 详情/Reader/下载、iPad/iPhone 文件导出/分享、前后台行为、设置清理本地阅读数据、source ZIP 成功验证、Windows 真机。
- 待发布风险：iPad simulator 已跑通真实 EPUB detail -> download -> Reader -> page turn -> progress；这仍不等同于 iPad 签名真机、文件导出/分享或长期前后台行为验证。iPhone simulator 本轮只覆盖 packaged render、session restore 和真实封面加载。

## 2026-06-17 iPhone/iPad simulator packaged app 白屏修复

- 变更范围：移动打包入口 HTML、Tauri 安全配置测试、AGENTS/README/README.en/CHANGELOG/docs/status/docs/platforms/docs/development/docs/release 文档。
- 问题：iPhone 17 和 iPad Air 13-inch simulator 可安装并启动 app 进程，但 packaged debug app 首屏为纯白。
- 根因：`index.html` 手写根 `<base href="/">`；在 iOS bundle/file-style 加载路径下，模块脚本可能被解析到根目录资源路径，导致前端 JS 没有执行。
- 修复：删除根 `<base href="/">`，保留 Vite `base: './'` 生成的相对资源路径；新增测试防止该标签回归。
- 发现的工具链行为：
  - 裸 `xcodebuild` 调用失败，因为 Tauri iOS prebuild script 缺少 Tauri mobile RPC 上下文。
  - `pnpm --dir apps/kmoe-app exec tauri ios build --debug` 默认走 `iphoneos`，因本机未配置 development team signing 失败。
  - `pnpm --dir apps/kmoe-app exec tauri ios build --debug --target aarch64-sim --no-sign`：passed。
- iOS simulator smoke：
  - iPhone 17 simulator：app install passed，launch passed，首屏渲染 passed，确认不再白屏。
  - iPad Air 13-inch simulator：app install passed，launch passed，平板 rail/sidebar 布局和首页内容渲染 passed。
  - 临时截图只用于本地视觉确认，未写入仓库。
- 聚焦验证：
  - `pnpm --dir apps/kmoe-app exec vitest run src/tests/tauriSecurityConfig.test.ts`：passed，1 file / 5 tests。
  - `pnpm --dir apps/kmoe-app build`：passed，并同步 iOS assets。
- 完整 source gate：
  - `git diff --check`：passed。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `pnpm --dir apps/kmoe-app test:run`：passed，55 files / 294 tests。
  - `pnpm --dir apps/kmoe-app build`：passed，并同步 iOS assets。
  - `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
  - `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，86 tests。
  - `pnpm check:platforms`：passed，`pass=49 warn=0 external=4 fail=0`。
  - `node scripts/check-ios-assets.mjs`：passed，27 files。
  - `pnpm --dir apps/kmoe-app e2e`：passed，114 passed / 50 skipped。
- 补充记录：后续同日已追加 iPad simulator 真实 EPUB detail -> download -> Reader -> page turn -> progress smoke；iPhone simulator 追加了 session restore 和真实封面加载 smoke。
- 未运行项：本轮白屏修复提交时尚未在 iPhone/iPad simulator 执行真实登录、详情、Reader、下载、缓存清理；未运行 signed physical-device install、文件导出/分享或前后台行为验证。
- 待发布风险：iPhone/iPad simulator packaged app 已能安装、启动并渲染首屏；这不等同于签名真机或完整 Reader/download 验收完成。

## 2026-06-17 Android TV emulator 真实 EPUB Reader 与清理验证

- 变更范围：验证日志和平台状态文档；产品代码未变更。
- Android TV emulator：
  - `Kmoelite_TV_API_36` cold boot reached `device` and `sys.boot_completed=1`。
  - Debug APK installed successfully and launched with package `moe.kzo.client`。
  - WebView URL was packaged `http://tauri.localhost/`, not a Mac dev-server URL。
  - Runtime model was `androidTv` / `tv` / `remote`。
- 真实站点 smoke：
  - 登录：passed，使用 runtime credentials；输出未打印账号、密码、Cookie、Session 或授权 URL。
  - Account：passed，账号页确认 authenticated account state。
  - Detail：passed，`/comic/53339` 真实详情页和目录加载成功。
- 真实 EPUB 单项下载到 Reader：
  - 详情页目录项“阅读 / 获取 EPUB”创建并执行 EPUB 单项下载。
  - 下载完成后自动准备 Reader cache，并打开 `/reader/cache/reader-cache%3A53339%3A3001%3Aepub`。
  - Reader 第 1 页图片加载成功。
- Android TV remote Reader smoke：
  - `DPAD_CENTER`：passed，显示 Reader chrome。
  - `DPAD_LEFT`：passed，翻到双页 `第 2-3 / 235 页`，两张图片加载成功。
- 本地阅读数据删除验证：
  - Settings “删除全部本地阅读数据”：passed。
  - 重新打开旧 Reader cache URL 不再显示漫画图片，提示本地没有找到章节缓存，需要重新准备。
- 进程清理：emulator 已通过 ADB 关闭，`adb devices -l` 为空。
- 提交前检查：
  - `git diff --check`：passed。
  - 敏感文本扫描：passed，修改文档中未发现真实账号、密码、Cookie、Session、Token、授权 URL 或本机私有路径。
  - `pnpm check:platforms`：passed，`pass=49 warn=0 external=4 fail=0`。
- 未运行项：本轮未运行 Android TV 实体设备、签名 release、TV 分发、长时间遥控器焦点巡航、文件导出/分享或 source ZIP 成功下载。
- 待发布风险：Android TV emulator 已验证真实登录、详情、EPUB 下载、Reader、遥控器翻页和本地阅读数据删除；这仍不等同于实体 TV、签名发行或商店分发完成。

## 2026-06-17 Apple TV readiness 检查入口

- 变更范围：平台 readiness 脚本、CHANGELOG/docs/status/docs/platforms/docs/development/docs/release 文档。
- 行为摘要：`pnpm check:platforms` 现在显式检查 Apple TV/tvOS 前置条件，包括 tvOS SDK、tvOS simulator runtime、Apple TV simulator device type，以及 `aarch64-apple-tvos` / `aarch64-apple-tvos-sim` Rust targets。该检查只用于暴露真实环境和源码前置条件，不代表 Apple TV App 已可运行。
- 本机工具状态：
  - `xcodebuild -showsdks`：tvOS SDK present，`appletvos26.5`。
  - `xcrun simctl list devicetypes`：Apple TV simulator device types present。
  - `xcrun simctl list runtimes`：tvOS simulator runtime missing；当前只有 iOS runtime 可用。
  - `rustup target add aarch64-apple-tvos-sim`：passed。
  - `rustup target add aarch64-apple-tvos`：passed。
  - `xcodebuild -downloadPlatform tvOS`：failed twice，Apple MobileAsset catalog download returned a general networking error while fetching `com.apple.MobileAsset.appleTVOSSimulatorRuntime`。Shell proxy env 未设置。
- 验证：
  - `git diff --check`：passed。
  - `node scripts/check-platform-readiness.mjs --self-test`：passed。
  - `pnpm check:platforms`：passed，`pass=49 warn=0 external=4 fail=0`。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `pnpm --dir apps/kmoe-app test:run`：passed，55 files / 293 tests。
  - `pnpm --dir apps/kmoe-app build`：passed，并同步 iOS assets。
  - `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
  - `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，86 tests。
  - `node scripts/check-ios-assets.mjs`：passed，27 files。
  - 敏感文本扫描：passed，修改文件中未发现真实账号、密码、Cookie、Session、Token、授权 URL 或本机私有路径；命中项仅为文档中的环境变量名和占位示例。
- 未运行项：本轮未生成 tvOS/WKWebView 壳，未运行 Apple TV simulator 安装/启动、遥控器焦点、Reader、下载或缓存清理验证。
- 待发布风险：Apple TV 仍未达到可运行平台；下一步需要先让 Xcode 成功安装 tvOS simulator runtime，再实现最薄 tvOS 壳并接入现有前端和必要 native bridge。

## 2026-06-17 Android tablet Reader 自动下载重试与真实 EPUB Reader smoke

- 变更范围：详情页 Reader 自动下载队列启动重试、详情页 Reader 入口测试、README/README.en/CHANGELOG/docs/status/docs/platforms 文档。
- 行为摘要：详情页为 Reader 创建 EPUB 单项任务后，如果第一次启动 native 下载队列短暂失败，但目标任务仍处于 `queued` 状态，会等待后重试一次启动队列。该逻辑避免移动/平板端偶发留下排队任务、需要用户手动进入下载中心启动。
- Android tablet emulator：
  - Pixel Tablet API 36 emulator reached `device` and `sys.boot_completed=1`.
  - Debug APK installed and launched with package `moe.kzo.client`；WebView URL was packaged `http://tauri.localhost/`, not a Mac dev-server URL.
  - Runtime viewport was tablet-sized and used the tablet rail/sidebar contract.
  - 登录：passed，使用 runtime credentials；输出未打印账号、密码、Cookie、Session 或授权 URL。
  - Detail：passed，`/comic/53339` 真实详情页和目录加载成功。
  - 详情页目录 `話 089-095` 自动 Reader flow：passed，创建并启动 EPUB 单项任务，下载完成后自动准备 Reader cache，并打开 `/reader/cache/reader-cache%3A53339%3A3089%3Aepub`。
  - Reader：第 1 页图片加载成功，快捷翻页后进入双页 `第 2-3 / 175 页`，两张图片均加载成功。
  - Settings 本地阅读数据删除：passed，删除 1 个 Reader cache 和 1 个本地阅读文件记录，统计归零。
  - 重新打开旧 Reader cache URL 不再显示漫画图片，提示本地没有找到章节缓存，需要重新准备。
  - 进程清理：emulator 已通过 ADB 关闭，`adb devices -l` 为空。
- 聚焦验证：
  - `pnpm --dir apps/kmoe-app exec vitest run src/tests/detailReaderEntry.test.tsx`：passed，1 file / 11 tests。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `pnpm --dir apps/kmoe-app exec tauri android build --debug`：passed，生成 debug APK/AAB；Gradle 仅报告上游 deprecation warning。
- 完整 source gate：
  - `git diff --check`：passed。
  - 敏感文本扫描：passed，修改文件中未发现账号、密码、Cookie、Session、Token、授权 URL 或本机私有路径。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `pnpm --dir apps/kmoe-app test:run`：passed，55 files / 293 tests。
  - `pnpm --dir apps/kmoe-app build`：passed，并同步 iOS assets。
  - `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
  - `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，86 tests。
  - `pnpm check:platforms`：passed，`pass=45 warn=0 external=3 fail=0`。
  - `node scripts/check-ios-assets.mjs`：passed，27 files。
  - `pnpm --dir apps/kmoe-app e2e`：passed，114 passed / 50 skipped。
- 未运行项：本轮尚未运行 Android tablet 真机、Android signed release、Android 文件导出/分享、iPhone/iPad 真机、Windows 真机或 Apple TV。
- 待发布风险：Android tablet emulator 已验证真实登录、详情、EPUB 下载、Reader、双页翻页和显式本地阅读数据删除；这仍不等同于 Android tablet 真机、签名发行或分发完成。详情页在会话检查尚未完成时仍会提示“正在确认登录状态，请稍后再试”，后续可改成按钮 loading/disabled 的体验优化。

## 2026-06-17 Android phone emulator 真实下载到 Reader 与清理验证

- 变更范围：验证日志和平台状态文档；产品代码未变更。
- Android phone emulator：
  - Pixel 8 API 36 emulator cold boot reached `device` and `sys.boot_completed=1`.
  - Debug APK installed successfully from `apps/kmoe-app/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`.
  - App launched with package `moe.kzo.client`; WebView URL was packaged `http://tauri.localhost/`, not a Mac dev-server URL.
  - Runtime viewport was phone-sized and used the mobile shell/bottom navigation.
- 真实站点 smoke：
  - 登录：passed，使用 runtime credentials；输出未打印账号、密码、Cookie、Session 或授权 URL。
  - Account：passed，登录后账号页可读取 authenticated account state。
  - Detail：passed，`/comic/53339` 真实详情页和目录加载成功。
- 真实 EPUB 单项下载到 Reader：
  - 详情页“开始阅读”创建并执行 EPUB 单项下载，下载进度进入 `正在下载EPUB`。
  - 下载完成后自动准备 Reader cache，并打开 `/reader/cache/reader-cache%3A53339%3A3001%3Aepub`。
  - Reader 第 1 页图片加载成功，快捷翻页后进入第 2 页，图片加载成功。
- 本地阅读数据删除验证：
  - Settings 显示本次阅读数据占用约 52 MB，1 章 / 235 页。
  - “删除全部本地阅读数据” passed，删除 1 个 Reader cache 和 1 个本地阅读文件记录，统计归零。
  - 重新打开旧 Reader cache URL 不再显示漫画图片，提示本地没有找到章节缓存，需要重新准备。
- 进程清理：emulator 已通过 ADB 关闭，`adb devices -l` 为空。
- 未运行项：本轮未运行 Android phone 真机、Android tablet 下载/Reader/cache 清理、Android signed release、iPhone/iPad 真机、Windows 真机或 Apple TV。
- 待发布风险：Android phone emulator 已验证安装、真实登录、详情、EPUB 下载、Reader、翻页和显式本地阅读数据清理；这仍不等同于 Android phone 真机、Android tablet 或签名发行完成。

## 2026-06-17 Android debug 构建复核与 Reader E2E EPUB 证据同步

- 变更范围：Playwright Reader 入口 fixture 和 E2E 断言；产品代码未变更。
- 行为摘要：详情页默认 Reader 自动下载已经是 EPUB 优先，本轮把 `reader-entry.spec.ts` 从旧的 source ZIP 断言同步为 EPUB 任务、EPUB Reader cache 准备和 Reader 打开路径。Library 入口仍保留 source ZIP 本地归档准备 Reader 的覆盖。
- Android 构建复核：
  - `pnpm --dir apps/kmoe-app exec tauri android build --debug`：passed，生成 debug APK/AAB；Gradle 仅报告上游 deprecation warning。
- Android emulator 复核：
  - `Kmoelite_Tablet_API_36`：本轮本机 emulator 未完成启动，ADB 一直停在 `offline` 或进程退出，未达到 `sys.boot_completed`。
  - `Pixel_8_API_36`：本轮本机 emulator 未完成启动；`-no-window`、`-gpu swiftshader_indirect` 和 `-wipe-data` 尝试后仍未进入可安装验证状态。
  - 结论：本轮没有完成 Android phone/tablet app 安装、下载、Reader 或缓存清理验证；这不是 Android 支持通过结论。
- 聚焦验证：
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `pnpm --dir apps/kmoe-app exec playwright test e2e/reader-entry.spec.ts --project=desktop-chromium`：passed，3 tests。
- 完整 source gate：
  - `git diff --check`：passed。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `pnpm --dir apps/kmoe-app test:run`：passed，55 files / 292 tests。
  - `pnpm --dir apps/kmoe-app build`：passed，并同步 iOS assets。
  - `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
  - `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，86 tests。
  - `pnpm check:platforms`：passed，`pass=45 warn=0 external=3 fail=0`。
  - `node scripts/check-ios-assets.mjs`：passed，27 files。
  - `pnpm --dir apps/kmoe-app e2e`：passed，114 passed / 50 skipped。
- 未运行项：本轮未运行 Android 真机、iPad 真机、真实站点 smoke 或真实下载验证。
- 待发布风险：Android phone/tablet 仍需要在能正常启动 emulator 或实体设备的环境里完成安装、登录、下载、Reader、缓存清理验证。

## 2026-06-17 详情页自动 Reader 下载格式改为 EPUB 优先

- 变更范围：详情页自动下载格式选择、Reader entry 自动缺失归档选择、详情页 Reader 入口测试、README/CHANGELOG/AGENTS 文档。
- 行为摘要：详情页“开始阅读”和离线下载“自动”格式现在优先创建 EPUB 单项任务；源图 ZIP/CBZ 仍作为用户显式选择的高画质/手动格式保留。该调整避免普通阅读路径默认排入当前真实站点上更容易授权失败的 `source_zip` 任务。
- 真实下载验证：
  - `KMOE_REAL_DOWNLOAD_VERIFY=I_UNDERSTAND_THIS_MAY_USE_QUOTA KMOE_VERIFY_FORMAT=source_zip KMOE_VERIFY_COMIC_IDS=53339 KMOE_VERIFY_ALLOW_UNKNOWN_SOURCE_ZIP=1 KMOE_VERIFY_MAX_MB=120 KMOE_VERIFY_MAX_CANDIDATE_ATTEMPTS=6 pnpm verify:real-source-zip-reader`：failed，站点未返回可用 source ZIP 下载地址；输出已脱敏，未打印账号、密码、Cookie、Session、授权 URL 或本地下载路径。
  - `KMOE_REAL_DOWNLOAD_VERIFY=I_UNDERSTAND_THIS_MAY_USE_QUOTA KMOE_VERIFY_FORMAT=epub KMOE_VERIFY_COMIC_IDS=53339,14140,10180 KMOE_VERIFY_MAX_MB=120 KMOE_VERIFY_MAX_CANDIDATE_ATTEMPTS=3 pnpm verify:real-source-zip-reader`：passed，`format=epub`，完成真实单项下载、Library 记录、Reader cache 准备、前后翻页、继续阅读进度和 cache cleanup 验证；输出已脱敏，下载目录使用临时目录并在验证后清理。
- 聚焦验证：
  - `pnpm --dir apps/kmoe-app exec vitest run src/tests/detailReaderEntry.test.tsx`：passed，1 file / 10 tests。
- 回归修复：首次全量 Vitest 发现旧 source ZIP 任务会被新的 EPUB 默认选择忽略，已修复为“新建默认 EPUB，但已有 EPUB/source ZIP Reader 任务都必须识别，避免重复排队”。
- 补充聚焦验证：
  - `pnpm --dir apps/kmoe-app exec vitest run src/tests/readerEntryState.test.ts src/tests/detailReaderEntry.test.tsx`：passed，2 files / 17 tests。
- 完整 source gate：
  - `git diff --check`：passed。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `pnpm --dir apps/kmoe-app test:run`：passed，55 files / 292 tests。
  - `pnpm --dir apps/kmoe-app build`：passed，并同步 iOS assets。
  - `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
  - `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，86 tests。
  - `pnpm check:platforms`：passed，`pass=45 warn=0 external=3 fail=0`。
  - `node scripts/check-ios-assets.mjs`：passed，27 files。
  - `pnpm --dir apps/kmoe-app e2e`：passed，114 passed / 50 skipped。
- 未运行项：本轮未运行 Android/iPad 真机部署、Android/iPad 下载 UI 手工 smoke、macOS signed bundle、Windows 真机、真实 source ZIP 成功验证或 GitHub push。
- 待发布风险：source ZIP 仍可能在真实站点授权阶段失败；本次修复只改变普通自动阅读/自动下载默认选择，不声称 source ZIP 授权已修复。

## 2026-06-17 Android 平板 native 登录会话修复验证

- 变更范围：Rust native KMOE Web Adapter 登录表单、native 会话 cookie 传递、账号页 authenticated profile 判定、浏览器 fallback 登录表单、登录回归测试、README/CHANGELOG/docs/status/docs/platforms/AGENTS 文档。
- 行为摘要：KMOE 登录 POST 现在始终请求站点会话 cookie；“记住登录状态”只控制 native app 是否在本地持久化网站会话，不再决定是否向站点请求 keepalive。native adapter 额外维护一份安全的 KMOE 会话 cookie header，用于 Android/iOS 等 native runtime 中的登录、账号页、目录、详情、book data 和下载授权请求。账号页判定改为强认证标记优先，避免已登录账号页里残留 `login_do.php` 字符串时被误判为未建立有效会话。
- 真实站点 smoke：
  - `KMOE_SMOKE_INCLUDE_BOOK_DATA=0 KMOE_SMOKE_TIMEOUT_MS=25000 pnpm verify:real-site-smoke`：passed，检查 login_page、login_post、profile、catalog、detail；book_data 显式跳过；输出已脱敏，未打印账号、密码、Cookie、Session 或授权 URL。
  - `pnpm verify:real-site-smoke`：passed，检查 login_page、login_post、profile、catalog、detail、book_data；`bookDataStatus=200`，`bookDataMarkers=true`；输出已脱敏，未打印账号、密码、Cookie、Session 或授权 URL。
- Android 平板模拟器 smoke：
  - `avdmanager create avd -n Kmoelite_Tablet_API_36 -k "system-images;android-36;google_apis_playstore;arm64-v8a" -d pixel_tablet --force`：passed。
  - `pnpm --dir apps/kmoe-app exec tauri android build --debug`：passed，生成 debug APK/AAB；Gradle 报告上游 deprecation warning，未导致失败。
  - Pixel Tablet API 36 emulator：APK install/launch passed。
  - WebView CDP 验证：页面为 `http://tauri.localhost/`，`runtime=androidTablet`、`layout=tablet`、`device=tablet`、`input=touch`。
  - 干净安装后真实 app 登录 smoke：passed，登录后进入 `/account`，账号页显示已登录状态；验证过程未打印凭证或会话。
- 聚焦验证：
  - `pnpm --dir apps/kmoe-app test:run src/tests/webKmoeApiNativeErrors.test.ts`：passed，1 file / 9 tests。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib manual_session_cookie_store_keeps_only_cookie_pairs`：passed，1 test。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib remembered_session_cookie_header_round_trips_through_native_settings`：passed，1 test。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib native_login_form_always_requests_site_session_cookie`：passed，1 test。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib profile_html_authentication_detection_rejects_login_pages`：passed，1 test。
- 完整 source gate：
  - `git diff --check`：passed。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `pnpm --dir apps/kmoe-app test:run`：passed，55 files / 291 tests。
  - `pnpm --dir apps/kmoe-app build`：passed，并同步 iOS assets。
  - `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
  - `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，86 tests。
  - `pnpm check:platforms`：passed，`pass=45 warn=0 external=3 fail=0`。
  - `node scripts/check-ios-assets.mjs`：passed，27 files。
  - `pnpm --dir apps/kmoe-app e2e`：passed，114 passed / 50 skipped。
- 未运行项：本轮尚未运行真实下载验证、Android 平板下载/Reader/cache 清理、Android 真机、iPhone/iPad 真机部署、Windows 真机或 signed release。
- 待发布风险：Android 平板已证明 debug APK 启动和真实 app 登录链路，不等同于 Android 平板下载、Reader、缓存清理、真机或公开签名发布完成。

## 2026-06-17 Android TV native remote input bridge 与 Reader emulator smoke

- 变更范围：Tauri App Back listener helper、非手机 App shell native Back 订阅、Reader native Back 订阅、Reader 隐藏 chrome 焦点隔离、Android MainActivity remote DPAD/OK WebView 输入桥、Android TV 输入桥测试、Reader/AppLayout 回归测试、README/README.en/CHANGELOG/docs/status/docs/platforms/docs/development/docs/release/docs/reader-shelf/AGENTS 文档。
- 行为摘要：Android TV 上系统 Back 通过 Tauri AppPlugin `onBackButtonPress` 进入 App/Reader 作用域，避免 Activity 直接退出；DPAD 方向键和 OK/Enter 在 Android WebView 不可靠派发 DOM keydown 时由 native WebView bridge 转成前端键盘事件。Reader 隐藏 chrome 后会移除隐藏 top/bottom controls 的焦点能力，OK/Enter 会优先切换 Reader chrome，Back 会先关闭 Reader 面板，再离开 Reader。
- 聚焦验证：
  - `pnpm --dir apps/kmoe-app test:run src/tests/androidTvInputBridge.test.ts src/tests/readerPage.test.tsx src/tests/appLayoutShell.test.ts`：passed，3 files / 33 tests。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
- Android TV 工具链与 smoke：
  - `pnpm --dir apps/kmoe-app exec tauri android build --debug`：passed，生成 debug APK/AAB；Gradle 报告上游 deprecation warning，未导致失败。
  - Android TV API 36 emulator：APK install/launch passed。
  - Android TV Reader smoke：使用 App 私有目录内的合成 source ZIP 准备本地 Reader cache，`DPAD_CENTER` 可显示 Reader chrome，目录面板可打开，系统 Back 可关闭面板，再次 Back 可离开 Reader；进程保持存活。
  - Android TV Settings smoke：进入 Settings 后系统 Back 可返回首页，未退出 Activity。
- 完整 source gate：
  - `git diff --check`：passed。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `pnpm --dir apps/kmoe-app test:run`：passed，55 files / 290 tests。
  - `pnpm --dir apps/kmoe-app build`：passed，并同步 iOS assets。
  - `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
  - `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，84 tests。
  - `pnpm check:platforms`：passed，`pass=45 warn=0 external=3 fail=0`。
  - `node scripts/check-ios-assets.mjs`：passed，27 files。
  - `pnpm --dir apps/kmoe-app e2e`：首次运行 desktop 首批 5 个 accessibility 页面未等到 `main`，截图为空白页；立即完整复跑 passed，114 passed / 50 skipped。
- 未运行项：本轮尚未运行真实站点 smoke、真实下载验证、Android TV 下载/缓存清理/实体 TV/signed release、Android phone/tablet 真机、iPhone/iPad 真机、Windows 真机或 Apple TV。
- 待发布风险：该改动证明 Android TV remote 输入桥和合成本地 Reader cache 的 OK/Back 行为，不等同于 Android TV 下载、缓存清理、真实站点业务链路、实体 TV 或公开二进制支持完成。

## 2026-06-17 Android TV remote Back 与 Reader OK/Back 键位

- 变更范围：remote/TV 键位 helper、非手机 App shell Back 导航、Reader OK/Back 键位、Reader/布局聚焦测试、README/README.en/CHANGELOG/docs/status/docs/platforms/docs/development/docs/release/docs/reader-shelf/AGENTS 文档。
- 行为摘要：`remote` 输入契约下，App shell 可把 Back/BrowserBack/Backspace 等返回键映射到浏览历史返回；Reader 可用 OK/Enter 显示或隐藏 chrome，并用 Back/BrowserBack/Backspace 先关闭打开的 Reader 面板，再返回上一页。文本输入框仍不会被 Backspace 劫持。
- 聚焦验证：
  - `pnpm --dir apps/kmoe-app test:run src/tests/spatialFocus.test.ts src/tests/appLayoutShell.test.ts src/tests/readerPage.test.tsx`：passed，3 files / 35 tests。
- 完整 source gate：
  - `git diff --check`：passed。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `pnpm --dir apps/kmoe-app test:run`：passed，54 files / 289 tests。
  - `pnpm --dir apps/kmoe-app build`：passed，并同步 iOS assets。
  - `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
  - `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，84 tests。
  - `pnpm check:platforms`：passed，`pass=45 warn=0 external=3 fail=0`。
  - `node scripts/check-ios-assets.mjs`：passed，27 files。
  - `pnpm --dir apps/kmoe-app e2e`：passed，114 passed / 50 skipped。
- 未运行项：本轮尚未重新运行 Android TV emulator 安装/Reader Back smoke、真实站点 smoke、真实下载验证、实体 TV、Android phone/tablet 真机、iPhone/iPad 真机、Windows 真机或 Apple TV。
- 待发布风险：该改动补齐 remote 键位语义和源码验证，不等同于 Android TV Reader、下载、缓存清理或实体设备支持完成。

## 2026-06-17 Android TV 实验入口与遥控器焦点 smoke

- 变更范围：Android TV/WebView 平台识别、TV layout contract、remote input class、Android TV manifest readiness check、README/README.en/CHANGELOG/docs/status/docs/platforms/docs/development/docs/release/docs/reader-shelf/AGENTS 文档。
- 行为摘要：Android TV WebView UA（包括 `sdk_google_atv64...Mobile Safari`）不再被误判为 Android phone/tablet；前端进入 `androidTv` runtime、`tv` layout contract、`remote` input class，复用非手机宽屏 shell 和方向键空间焦点。Android manifest 已静态检查 optional Leanback feature 和 `LEANBACK_LAUNCHER`。
- 聚焦验证：
  - `pnpm --dir apps/kmoe-app test:run src/tests/downloadPathPlanner.test.ts src/tests/layoutMode.test.ts src/tests/appLayoutShell.test.ts src/tests/spatialFocus.test.ts`：passed，4 files / 13 tests。
  - `pnpm --dir apps/kmoe-app test:run src/tests/downloadPathPlanner.test.ts src/tests/layoutMode.test.ts`：passed，2 files / 10 tests。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
- 完整 source gate：
  - `git diff --check`：passed。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `pnpm --dir apps/kmoe-app test:run`：首次运行 1 个 Reader 测试未找到跳过后的第 2 页；单测复跑 passed，随后全量复跑 passed，54 files / 286 tests。
  - `pnpm --dir apps/kmoe-app build`：passed，并同步 iOS assets。
  - `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
  - `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，84 tests。
  - `pnpm check:platforms`：passed，`pass=45 warn=0 external=3 fail=0`。
  - `node scripts/check-ios-assets.mjs`：passed，27 files。
  - `pnpm --dir apps/kmoe-app e2e`：passed，114 passed / 50 skipped。
- Android TV 工具链与 smoke：
  - `sdkmanager "system-images;android-36;android-tv;arm64-v8a"`：passed。
  - `avdmanager create avd -n Kmoelite_TV_API_36 -k "system-images;android-36;android-tv;arm64-v8a" -d tv_1080p --force`：passed。
  - `pnpm --dir apps/kmoe-app exec tauri android build --debug`：passed，生成 debug APK/AAB；Gradle 报告上游 deprecation warning，未导致失败。
  - Android TV API 36 emulator：APK install passed。
  - `adb shell am start -W -n moe.kzo.client/.MainActivity`：passed，进程启动成功。
  - WebView CDP 验证：页面为 `http://tauri.localhost/`，`runtime=androidTv`、`layout=desktop`、`contract=tv`、`device=tv`、`input=remote`。
  - Android TV 方向键 smoke：`DPAD_DOWN` 可把焦点从 WebView 移到 shell 品牌按钮，再移到“首页”导航项。
  - CDP screenshot 显示宽屏 sidebar shell 渲染正常；系统 `screencap` 在该 TV emulator 上截到黑屏，未作为视觉证据来源。
- 未运行项：本轮尚未运行 Android TV Reader、下载、缓存清理、返回键、实体 TV、signed release、Google Play/TV 分发验证；未运行 Apple TV runtime；未运行真实站点 smoke 或真实下载验证。
- 待发布风险：Android TV 仍只是实验入口和焦点基础，不等同于完整 TV 支持。Reader 横屏、遥控器 Reader 操作、下载/缓存清理、返回键和实体设备验证仍是 blocker。

## 2026-06-17 Android 工程生成、手机布局与 app data 路径验证

- 变更范围：Tauri Android 工程生成、Android schema、Android platform detection、Android phone/tablet layout contract、Android/mobile 下载路径、Android app data 目录、README/README.en/CHANGELOG/docs/status/docs/platforms/AGENTS 文档。
- 行为摘要：Android phone/tablet 不再落入 Linux 桌面平台；Android phone 强制使用 phone contract 和底部导航，Android tablet 使用 tablet/tabletCompact contract；Android native app data 使用 app-private files root，避免 SQLite 路径落到 `./.local/share` 相对路径；移动端下载保存根目录统一走 App private download root。
- 聚焦验证：
  - `pnpm --dir apps/kmoe-app test:run src/tests/downloadPathPlanner.test.ts src/tests/layoutMode.test.ts`：passed，2 files / 10 tests。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib mobile_download_dir_uses_app_private_downloads_root`：passed，1 test。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib android_app_data_dir_uses_private_files_root`：passed，1 test。
- 完整 source gate：
  - `git diff --check`：passed。
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `pnpm --dir apps/kmoe-app test:run`：passed，54 files / 286 tests。
  - `pnpm --dir apps/kmoe-app build`：passed，并同步 iOS assets。
  - `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
  - `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，84 tests。
  - `pnpm check:platforms`：passed，`pass=44 warn=0 external=3 fail=0`。
  - `node scripts/check-ios-assets.mjs`：passed，27 files。
  - `pnpm --dir apps/kmoe-app e2e`：passed，114 passed / 50 skipped。
- 安全扫描：私有路径和凭证模式扫描无真实命中；唯一命中为 release readiness 脚本自身的敏感正则文本。
- Android 工具链与构建：
  - `tauri android init --ci`：passed，生成 `src-tauri/gen/android`。
  - `pnpm --dir apps/kmoe-app exec tauri android build --debug`：passed，生成 debug APK/AAB；Gradle 报告上游 deprecation warning，未导致失败。
- Android 模拟器 smoke：
  - Pixel 8 API 36 emulator：APK install passed。
  - `adb shell am start -W -n moe.kzo.client/.MainActivity`：passed，进程启动成功。
  - 启动后截图确认 Android phone 使用底部导航，不再显示桌面 sidebar。
  - 清理 logcat 后重新启动，未再出现 `Invalid path: ./.local/share/...kmoe-client.sqlite3`。
- 未运行项：本轮尚未运行 Android 真机、Android 平板模拟器、Android 下载/Reader 全链路、Android signed release、Google Play/TV 分发验证。
- 待发布风险：Android 仍是实验预览源码路径，不等同于稳定 Android 支持；Android 文件导出/分享、后台/前台下载、Reader cache 清理和真实站点登录下载仍需单独验证。

## 2026-06-17 非手机方向键空间焦点导航验证

- 变更范围：非手机 App shell 方向键空间焦点移动、空间焦点 helper、聚焦测试、README/README.en/CHANGELOG/AGENTS 文档。
- 行为摘要：桌面、iPad/平板和未来 TV shell 可用方向键把焦点移动到方向上最近的可见可操作元素；输入框、select、textarea 和 contenteditable 不会被方向键焦点逻辑劫持。Reader 路由不在 AppLayout 内，保留原有 Reader 翻页快捷键作用域。
- 聚焦验证：
  - `pnpm --dir apps/kmoe-app test:run src/tests/spatialFocus.test.ts src/tests/appLayoutShell.test.ts`：passed，2 files / 3 tests。
- `pnpm --dir apps/kmoe-app typecheck`：passed。
- `pnpm --dir apps/kmoe-app test:run`：passed，54 files / 286 tests。
- `pnpm --dir apps/kmoe-app build`：passed，并同步 iOS assets。
- `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
- `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
- `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，83 tests。
- `pnpm check:platforms`：passed，`pass=32 warn=0 external=2 fail=0`。
- `node scripts/check-ios-assets.mjs`：passed，27 files。
- `pnpm --dir apps/kmoe-app e2e`：passed，114 passed / 50 skipped。
- 未运行项：本轮尚未运行真实站点 smoke、真实下载验证、真实 TV emulator/device 安装运行。
- 待发布风险：该改动只补齐共享方向键焦点基础，不等同于 Android TV 或 Apple TV runtime、打包、遥控器实机/模拟器验证完成。

## 2026-06-08 iPad 登录 e400 输入与提示修复验证

- 变更范围：LoginPage 输入属性和本地校验、WebKmoeApi 登录邮箱规范化和 `e400` 文案、Rust native login 邮箱规范化、登录回归测试、README/README.en/CHANGELOG/AGENTS 文档。
- 行为摘要：站点当前登录表单仍使用 `email` / `passwd` / `keepalive`，无凭证探测确认假账号返回 `parent.display_codeinfo( "e400", 0 )`。App 现在会关闭邮箱/密码输入的移动端自动大写、自动更正和拼写辅助；邮箱提交前去除首尾空格，密码按用户输入原样提交；空邮箱/空密码会在本地拦截；站点 `e400` 会显示为“站点没有接受这组邮箱和密码”而不是技术码。
- 聚焦验证：
  - `pnpm --dir apps/kmoe-app test:run src/tests/loginPage.test.tsx src/tests/webKmoeApiNativeErrors.test.ts src/tests/formatMessages.test.ts`：passed，3 files / 12 tests。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml native_login_success_detection_matches_site_markers --lib`：passed，1 test。
- `git diff --check`：passed。
- `pnpm --dir apps/kmoe-app typecheck`：passed。
- `pnpm --dir apps/kmoe-app test:run`：passed，53 files / 284 tests。
- `pnpm --dir apps/kmoe-app build`：passed，并同步 iOS assets。
- `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed；首次检查发现一处格式差异，已执行 `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml` 后复跑通过。
- `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
- `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，83 tests。
- `pnpm check:platforms`：passed，`pass=32 warn=0 external=2 fail=0`。
- `node scripts/check-ios-assets.mjs`：passed，27 files。
- `pnpm --dir apps/kmoe-app e2e`：passed，114 passed / 50 skipped。
- 无凭证站点探测：`https://kxo.moe/login.php` 返回 200，表单包含 `email`、`passwd` 和 `keepalive`；使用假账号 POST `/login_do.php` 返回 200 且包含 `e400` 标记。本探测未使用真实账号、密码、Cookie、Session 或授权 URL。
- 未运行项：本轮尚未用真实账号做 live 登录，因为当前仓库没有 `.env.local` runtime credential 文件，且真实凭证不能写入命令、文档或日志。需要用户在 iPad 上重新输入并验证，或通过 runtime env 临时提供给 live smoke。

## 2026-06-08 iPhone/iPad 下载保存与登录会话修复验证

- 变更范围：iPhone/iPad 下载保存根目录、下载中心/详情页移动端保存位置文案、下载错误分类、native 登录会话确认、下载队列启动前会话检查、Rust/TypeScript 回归测试、README/README.en/CHANGELOG/AGENTS/docs/status/docs/platforms/docs/architecture 文档。
- 行为摘要：iPhone/iPad 显式下载先写入 App 私有保存区下的 `Downloads/Kmoe`，不再依赖 `HOME/Documents` 或假定 Files 可见目录可写；用户需要导出时再通过系统分享/导出路径离开 App。下载错误提示会区分站点登录/授权/额度问题与本地写入问题，避免把站点拒绝下载误报成“没有访问权限”。native 登录成功后会访问账号页确认会话有效，下载队列启动前也会确认登录会话仍有效。
- 聚焦验证：
  - `pnpm --dir apps/kmoe-app test:run src/tests/formatMessages.test.ts src/tests/downloadPathPlanner.test.ts src/tests/nativeCommands.test.ts`：passed，3 files / 34 tests。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，83 tests。
- `git diff --check`：passed。
- `pnpm --dir apps/kmoe-app typecheck`：passed。
- `pnpm --dir apps/kmoe-app test:run`：passed，52 files / 281 tests。
- `pnpm --dir apps/kmoe-app build`：passed，并同步 iOS assets。
- `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed；首次检查发现一处格式差异，已执行 `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml` 后复跑通过。
- `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
- `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，83 tests。
- `pnpm check:platforms`：passed，`pass=32 warn=0 external=2 fail=0`。
- `node scripts/check-ios-assets.mjs`：passed，27 files。
- `pnpm --dir apps/kmoe-app e2e`：passed，114 passed / 50 skipped。移动端下载任务卡因“App 内 / Kmoe”文案变化更新了对应 visual baseline 后复跑通过。
- iOS simulator 列表：passed，`xcrun simctl list devices available` 可列出 iOS 26.5 iPhone/iPad simulators。
- iOS simulator Tauri run：blocked。`tauri ios run "iPad Pro 11-inch (M5)"` 启动 simulator，但 Tauri CLI 仍走 `iphoneos` 构建并被 Xcode signing/provisioning 阻塞。
- iPad 实机识别：passed，`xcrun devicectl list devices` 可识别已配对可用的 iPad Pro 11-inch (M5)。
- iPad 实机部署：blocked。`tauri ios run iPad` 能识别设备并开始构建，但当前 Xcode 没有 Accounts，也没有 `moe.kzo.client` 的 iOS App Development provisioning profile；临时加入的本机 `DEVELOPMENT_TEAM` 配置已恢复，未纳入待提交源码。
- 发布风险扫描：tracked risky path scan 未发现 `.env`、cookie/session、SQLite/runtime DB、`node_modules`、`dist`、`target`、`test-results`、`playwright-report`、本地下载目录或临时构建文件进入 tracked tree。
- 敏感文本扫描：未发现真实账号、密码、Cookie、Token、Session、Authorization header、本机私有路径或下载授权 URL；命中均为 release 检查脚本自身的安全扫描正则或源码中的安全字段/函数名。
- 未运行项：本轮未运行真实账号登录、真实下载验证、macOS 签名/公证、Windows 真机、Android/TV 验证。iPad 实机下载 smoke 需要在 Xcode 账号和 provisioning profile 配好后补跑。
- 待发布风险：本次修复已通过源码 gate 和浏览器 E2E；iPad 实机安装与 Tauri iOS simulator run 仍受本机 Xcode signing/provisioning 阻塞。发布前应补跑 iPad 登录、单项下载、导出/打开和 Reader 准备链路。

## 2026-06-08 默认 KMOE 入口切换到 kxo.moe 验证

- 变更范围：默认 KMOE 网站入口、TypeScript 配置、Rust web adapter、Tauri CSP、安全 host 校验、解析器 fixtures、E2E fixtures、live smoke 脚本、AGENTS/README/README.en/CHANGELOG/docs/status/docs/web-adapter 文档。
- 行为摘要：主入口从 `https://kzo.moe` 切换为 `https://kxo.moe`；生产 app、native website commands、封面/链接解析、CSP 和测试 fixtures 使用同一入口事实源。Bundle id 仍保持当前应用标识，不作为网站来源判断。
- 改动前无凭证连通性检查：`https://kxo.moe/`、`/login.php`、`/data_list.php?p=1`、示例详情页均返回 200；无效账号登录探测与旧入口返回相同错误语义。本检查未使用真实账号、Cookie、Session 或下载授权 URL。
- 聚焦验证：
  - `pnpm --dir apps/kmoe-app test:run src/tests/parseComicDetailHtml.test.ts src/tests/parseDataList.test.ts src/tests/parseDesktopList.test.ts src/tests/parseLinkInfo.test.ts src/tests/tauriSecurityConfig.test.ts src/tests/nativeCommands.test.ts`：passed，6 files / 45 tests。
- `git diff --check`：passed。
- `pnpm --dir apps/kmoe-app typecheck`：passed。
- `pnpm --dir apps/kmoe-app test:run`：passed，51 files / 279 tests。
- `pnpm --dir apps/kmoe-app build`：passed，并同步 iOS assets。
- `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
- `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
- `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，81 tests。
- `pnpm check:platforms`：passed，`pass=32 warn=0 external=2 fail=0`。
- `node scripts/check-ios-assets.mjs`：passed，27 files。
- `pnpm --dir apps/kmoe-app e2e`：passed，114 passed / 50 skipped。
- iPad 实机部署：`tauri ios run iPad` 完成 build/sign，但 Tauri 最后 export plist 读取失败；已使用 `devicectl` 安装并启动同一 signed debug app。临时 Xcode 签名/工程改动已恢复，未纳入待提交源码。
- 发布风险扫描：tracked risky path scan 未发现 `.env`、cookie/session、SQLite/runtime DB、`node_modules`、`dist`、`target`、`test-results`、`playwright-report` 或本地下载目录进入 tracked tree。
- 敏感文本扫描：未发现真实账号、密码、Cookie、Token、Session、Authorization header、本机私有路径或下载授权 URL；唯一命中为 release 检查脚本自身的安全扫描正则。
- 未运行项：本轮未运行真实账号登录、真实下载验证、macOS 签名/公证、Windows 真机、Android/TV 验证。
- 待发布风险：站点入口已切换并通过无凭证连通性检查；完整业务链路仍需后续用显式 live profile 跑真实登录、详情、阅读和下载 smoke。

## 2026-06-07 详情加载、封面取色、源图判断和 Reader 状态栏验证

- 变更范围：Detail 加载页/相关漫画 UI、列表到详情的封面预览传递、CoverImage 空图恢复、详情封面主色取样、`volinfo` 源图可用性判断、Continue Reading 自适应布局、Reader iOS 状态栏设置、Settings 入口、native `set_ios_status_bar_hidden` 命令、iOS plist/project 设置、视觉基线、README/README.en/CHANGELOG/AGENTS/docs/status。
- 行为摘要：从漫画列表或相关漫画进入详情时，加载页会带返回按钮、动画和可用的来源封面/标题；详情背景主色来自真实封面主色桶而不是单个高饱和像素；远程封面空图会走 native 封面恢复；源图体积为 0 但有生成/分辨率元数据的章节不再误判为“无源图”；Reader 默认在 iPhone/iPad 隐藏状态栏，并可在 Settings 或 Reader 高级面板显示；Continue Reading 最多展示 6 个最近条目并避免长页码撑坏布局。
- 聚焦验证：
  - `pnpm --dir apps/kmoe-app test:run src/tests/coverTheme.test.ts src/tests/coverImage.test.tsx src/tests/parseVolInfo.test.ts src/tests/readerEntryState.test.ts src/tests/homePage.test.tsx src/tests/detailReaderEntry.test.tsx src/tests/readerPage.test.tsx src/tests/settingsNativeConfig.test.tsx src/tests/nativeCommands.test.ts`：passed，9 files / 96 tests。
- `pnpm --dir apps/kmoe-app typecheck`：passed。
- `pnpm --dir apps/kmoe-app test:run`：passed，51 files / 279 tests。
- `pnpm --dir apps/kmoe-app build`：passed，并同步 iOS assets。
- `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
- `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
- `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，81 tests。
- `pnpm check:platforms`：passed，`pass=32 warn=0 external=2 fail=0`。
- `node scripts/check-ios-assets.mjs`：passed，27 files。
- `pnpm --dir apps/kmoe-app e2e`：passed，114 passed / 50 skipped。新增 Settings 状态栏设置导致的 large-desktop/tablet 视觉基线已按稳定 UI 更新后复跑通过。
- `pnpm --dir apps/kmoe-app tauri:build:mac-app:debug`：passed，生成 macOS debug `.app` bundle。
- macOS debug app smoke：passed，`Kmoe Client.app` 可启动到 `kmoe-app` 进程并正常退出。
- iPad 实机部署尝试：blocked。已连接 iPad 可被 Xcode 识别，但 `tauri ios run iPad` / 直接 `xcodebuild` 均因本机 Xcode 账号或 provisioning profile 缺失失败：需要在 Xcode Accounts 中配置账号并为 bundle id `moe.kzo.client` 准备 iOS App Development profile。
- iPhone 模拟器尝试：blocked。Tauri CLI 传模拟器名后仍走 `iphoneos` 签名构建；直接 `xcodebuild -sdk iphonesimulator` 又因 Tauri `xcode-script` 缺少 CLI 上下文服务失败，不能作为有效 iPhone native runtime 验证。
- 未运行项：本轮尚未完成真实站点 smoke、真实下载验证、macOS 签名/公证/干净机器安装、Windows 真机、iPhone/iPad 物理签名设备完整验证。
- 待发布风险：iOS 状态栏隐藏使用 native iOS command boundary，桌面/浏览器自动化只能验证命令注册和调用，不能替代实机视觉确认；需要修复 Xcode signing/provisioning 后重新部署 iPad/iPhone 验证。

## 2026-06-07 中文输入与本地阅读数据删除修复验证

- 变更范围：IME-safe 输入组件、首页/搜索/资料库/书架/设置文本输入、统一本地阅读数据删除 helper、Detail/Shelf/Library/Reader/Settings 删除入口、native `delete_local_reading_data` 命令、SQLite 删除函数、Reader 控制样式、visual baselines、README/CHANGELOG/AGENTS/Reader/Shelf/Architecture 文档。
- 行为摘要：中文 IME 组合输入期间只更新输入框草稿，不写入业务状态、URL query 或筛选条件；组合结束后只提交最终中文一次。显式“删除本地阅读数据”会通过 native 边界删除 Reader cache、对应 Reader-capable `source_zip` / `epub` 本地源文件、资料库记录和终态源文件任务；保留书架、阅读进度和阅读历史；native 不可用或失败时不伪造成功。
- 聚焦验证：
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `pnpm --dir apps/kmoe-app test:run`：passed，51 files / 270 tests。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，81 tests。
- `git diff --check`：passed。
- `pnpm --dir apps/kmoe-app typecheck`：passed。
- `pnpm --dir apps/kmoe-app test:run`：passed，51 files / 270 tests。
- `pnpm --dir apps/kmoe-app build`：passed，并同步 iOS assets。
- `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
- `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
- `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，81 tests。
- `pnpm check:platforms`：passed，`pass=32 warn=0 external=2 fail=0`。
- `node scripts/check-ios-assets.mjs`：passed，26 files。
- `pnpm --dir apps/kmoe-app e2e`：passed，114 passed / 50 skipped。Settings 和 Library 文案/按钮变更导致的三张 visual baseline 已按实际稳定 UI 更新后复跑通过。
- 发布风险扫描：tracked risky path scan 未发现 `.env`、cookie/session、SQLite/runtime DB、`node_modules`、`dist`、`target`、`test-results`、`playwright-report` 或本地下载目录进入 tracked tree；本地 `node_modules` 仅作为 ignored 依赖目录存在。
- 敏感文本扫描：未发现真实账号、密码、Cookie、Token、Session、Authorization header、本机私有路径或下载授权 URL；唯一命中为 release 检查脚本自身的安全扫描正则。
- 未运行项：本轮未运行真实站点 smoke、真实下载验证、Tauri app bundle/DMG、Windows 真机、iPhone/iPad 物理签名设备验证或 iPad 部署；这些不属于本轮默认修复 gate。
- 待发布风险：删除本地阅读数据的真实设备文件行为仍需在 iPad/macOS Tauri runtime 做手动 smoke，确认删除后再次阅读会重新获取且设备存储释放符合预期。

## 2026-06-07 设置页 Reader cache 清理修复验证

- 变更范围：前端 Reader cache store、native chapter-cache 同步、Tauri command 参数桥接、设置页清理文案、Reader/Shelf 文档、README 最近更新、CHANGELOG 和视觉基线。
- 行为摘要：设置页“清理全部阅读缓存”在 Tauri runtime 会调用 native `clear_reading_cache`，并同步移除前端所有 reading-cache 行，包括 failed/missing/legacy 状态；native SQLite 已不存在的 reading cache 会在同步时从前端持久化 store 删除，避免详情页沿用旧缓存快照。再次打开章节仍会按在线阅读路径重新生成当前章节临时缓存。
- 聚焦验证：
  - `pnpm --dir apps/kmoe-app test:run -- cacheStore nativeChapterCacheSync settingsNativeConfig nativeCommands`：passed，49 files / 263 tests。
- `git diff --check`：passed。
- `pnpm --dir apps/kmoe-app typecheck`：passed。
- `pnpm --dir apps/kmoe-app test:run`：passed，49 files / 263 tests。
- `pnpm --dir apps/kmoe-app build`：passed，并同步 iOS assets。
- `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
- `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
- `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，79 tests。
- `pnpm check:platforms`：passed，`pass=32 warn=0 external=2 fail=0`。
- `node scripts/check-ios-assets.mjs`：passed，26 files。
- `pnpm --dir apps/kmoe-app e2e`：passed，114 passed / 50 skipped。设置页说明文案和当前移动端 Chromium 字形渲染导致的视觉基线已按实际稳定 UI 更新后复跑通过。
- iPad debug 部署验证：`pnpm --dir apps/kmoe-app tauri ios build --debug --export-method debugging` passed；已安装并启动到已连接 iPad。临时 Xcode 自动签名改动已恢复，生成的 iOS build/Externals 目录已清理，未跟踪 IPA/app 产物。
- 发布风险扫描：tracked risky path scan 未发现 `.env`、cookie/session、SQLite/runtime DB、`node_modules`、`dist`、`target` 或 `test-results` 进入 tracked tree。
- 敏感文本扫描：未发现真实账号、密码、Cookie、Token、Session、Authorization header、本机私有路径或下载授权 URL；命中均为运行时环境变量名、文档示例占位符或 release 检查脚本自身的安全扫描正则。

## 2026-06-07 iPad 实机资料库读取修复验证

- 变更范围：iOS app data 目录选择、SQLite schema 兼容迁移、旧下载队列/资料库表回归测试、README 最近更新和 CHANGELOG 对外记录。
- 行为摘要：iPhone/iPad native SQLite 默认数据目录改为 app-private `Library/Application Support`；旧版实机数据库若缺少当前 `download_tasks` / `downloaded_files` 等表列，会在 `init_schema` 时补齐，避免详情页读取本地下载队列/资料库时反复显示“暂时无法读取资料库”。
- 聚焦验证：
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml init_schema_migrates_existing_download_library_columns --lib`：passed。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml legacy_ios_database_migration_copies_without_overwriting --lib`：passed。
  - `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml ios_app_data_dir_uses_private_application_support --lib`：passed。
- `git diff --check`：passed。
- `pnpm --dir apps/kmoe-app typecheck`：passed。
- `pnpm --dir apps/kmoe-app test:run`：passed，49 files / 259 tests。
- `pnpm --dir apps/kmoe-app build`：passed，并同步 iOS assets。
- `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
- `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
- `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，79 tests。
- `pnpm check:platforms`：passed，`pass=32 warn=0 external=2 fail=0`。
- `node scripts/check-ios-assets.mjs`：passed，26 files。
- `pnpm --dir apps/kmoe-app e2e`：未运行。本轮没有改 React 路由、布局、Reader、accessibility、视觉基线或浏览器可见交互；问题根因位于 native SQLite/schema 和 iOS app data 目录。
- 发布风险扫描：tracked risky path scan 未发现 `.env`、cookie/session、SQLite/runtime DB、`node_modules`、`dist`、`target` 或 `test-results` 进入 tracked tree。
- 敏感文本扫描：未发现真实账号、密码、Cookie、Token、Session、Authorization header、本机私有路径或下载授权 URL；命中均为运行时环境变量名、文档示例占位符或 release 检查脚本自身的安全扫描正则。

## 2026-06-01 无上下文 AI 接手规范验证

- 变更范围：`AGENTS.md` 顶部接手入口、文档职责、提交纪律、默认验证 gate，以及 `docs/README.md`、`docs/development/README.md`、`docs/release/README.md`、`docs/status/README.md`、`CONTRIBUTING.md`、`README.md`、`README.en.md`、`CHANGELOG.md` 的同步说明。
- 行为摘要：`AGENTS.md` 成为唯一无上下文 AI 第一入口；新 AI 必须先运行 `git status --short --branch`，读全量核心文档和任务相关源码，输出接手摘要，再开始实现；当前状态以 `docs/status/README.md` 和本文件为准。
- `git diff --check`：passed。
- `pnpm --dir apps/kmoe-app typecheck`：passed。
- `pnpm --dir apps/kmoe-app test:run`：passed，49 files / 259 tests。
- `pnpm --dir apps/kmoe-app build`：passed，并同步 iOS assets。
- `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
- `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
- `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，76 tests。
- `pnpm check:platforms`：passed，`pass=32 warn=0 external=2 fail=0`。
- `node scripts/check-ios-assets.mjs`：passed，26 files。
- `pnpm --dir apps/kmoe-app e2e`：未运行。本轮只改文档和接手规则，不涉及路由、布局、Reader、accessibility、视觉基线或浏览器可见工作流。
- 文档一致性检查：`AGENTS.md` 已包含 `No-Context AI Handoff`、`Project Snapshot`、`Documentation Source Of Truth` 和 `Development Hygiene`；README 最近更新条目数为 5。
- 发布风险扫描：tracked risky path scan 未发现 `.env`、cookie/session、SQLite/runtime DB、`node_modules`、`dist`、`target` 或 `test-results` 进入 tracked tree。
- 敏感文本扫描：修改文档未发现真实账号、密码、Cookie、Token、Session、Authorization header、本机私有路径或下载授权 URL。

## 2026-06-01 漫画列表分页验证

- 变更范围：首页、分类页、搜索页漫画列表分页，Catalog query URL 工具，共享分页组件和对应测试。
- 行为摘要：按钮分页覆盖首页/分类/搜索；页码写入 URL；筛选变化重置第 1 页；无 `totalPages` 时隐藏分页；翻页时保留旧列表直到新页加载完成。
- `pnpm --dir apps/kmoe-app typecheck`：passed。
- `pnpm --dir apps/kmoe-app test:run -- catalogQuery catalogPagination homePage categoriesPage searchPagePagination`：passed，49 files / 259 tests。
- `pnpm --dir apps/kmoe-app test:run`：passed，49 files / 259 tests。
- `pnpm --dir apps/kmoe-app build`：passed，并同步 iOS assets。
- `git diff --check`：passed。
- 上传前复核：
  - `pnpm --dir apps/kmoe-app typecheck`：passed。
  - `pnpm --dir apps/kmoe-app test:run`：passed，49 files / 259 tests。
  - `pnpm check:platforms`：passed，`pass=32 warn=0 external=2 fail=0`。
  - `node scripts/check-ios-assets.mjs`：passed，26 files。
  - tracked risky path scan：未发现 `.env`、cookie/session、SQLite/runtime DB、`node_modules`、`dist`、`target` 或 `test-results` 进入 tracked tree。
  - tracked sensitive text scan：未发现真实账号、密码、Cookie、Token、Session、Authorization header 或本机私有路径；唯一命中为 release 检查脚本自身的安全扫描正则。

## 2026-06-01 文档分层验证

- 变更范围：README 最近 5 次更新、CHANGELOG 对外更新记录、TASK_PROGRESS 验证日志定位、release 文档写法说明。
- `git diff --check`：passed。
- README 最近更新条目数检查：5。
- 链接目标检查：`CHANGELOG.md`、`TASK_PROGRESS.md`、`docs/status/README.md` 存在。
- 编辑文档敏感文本扫描：未发现真实账号、密码、Cookie、Token、Session、Authorization header 或本机私有路径。
- 本轮只改 Markdown，未运行 typecheck、build、Vitest、Rust 或 Playwright。

## 2026-06-01 Reader 滚动缓存验证

- 变更范围：默认 Reader cache 策略、设置页文案、公开文档和对应测试。
- 策略摘要：默认保留前一章、当前章和后一章；进入下一章后，窗口外旧阅读缓存成为清理候选；策略允许时可从可信本地 archive 预取新的后一章。
- 聚焦验证：`pnpm --dir apps/kmoe-app test:run -- cacheStore cachePolicyRuntime readerPrefetchRuntime settingsNativeConfig` passed，45 files / 247 tests。

完整本地 gate：

- `git diff --check`：passed。
- `pnpm --dir apps/kmoe-app typecheck`：passed。
- `pnpm --dir apps/kmoe-app test:run`：passed，45 files / 247 tests。
- `pnpm --dir apps/kmoe-app build`：passed，并同步 iOS assets。
- `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
- `cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
- `cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，76 tests。
- `pnpm check:platforms`：passed，`pass=32 warn=0 external=2 fail=0`。
- `node scripts/check-ios-assets.mjs`：passed，26 files。
- `pnpm --dir apps/kmoe-app e2e`：passed，114 passed / 50 skipped。设置页文案变化导致的两张视觉基线已按实际新 UI 更新后复跑通过。

发布检查：

- tracked 文件未包含 `node_modules`、`dist`、`target`、`test-results`、`.env`、cookie/session 文件、SQLite/runtime DB。
- 私有路径扫描未发现本机用户目录、临时目录或系统缓存目录进入待发布源码。
- 敏感文本扫描未发现真实账号、密码、Cookie、Token、Session 或 Authorization header；唯一命中为 release 检查脚本自身的安全扫描正则。

## 2026-05-31 公开源码整理验证

以下为历史本地 gate 记录；后续发布应以最新命令输出为准。

- `git diff --check`：passed。
- `pnpm --dir apps/kmoe-app typecheck`：passed。
- `pnpm --dir apps/kmoe-app test:run`：passed，45 files / 245 tests。
- `pnpm --dir apps/kmoe-app build`：passed，并同步 iOS assets。
- `cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check`：passed。
- `CARGO_TARGET_DIR=$TMPDIR/kmoelite-cargo-target cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml`：passed。
- `CARGO_TARGET_DIR=$TMPDIR/kmoelite-cargo-target cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib`：passed，76 tests。
- `pnpm check:platforms`：passed，`pass=32 warn=0 external=2 fail=0`。
- `node scripts/check-ios-assets.mjs`：passed。
- `pnpm --dir apps/kmoe-app e2e`：passed，114 passed / 50 skipped。

## Release blockers

- macOS public distribution 仍需 Apple Developer 签名、hardened runtime review、公证、stapling、干净机器安装/打开验证。
- Windows package/install/open/reveal validation 仍需真实 Windows host。
- iPhone/iPad signed physical-device install、share/export、orientation、foreground/background、file-access 行为仍需验证。
- Android phone/tablet 尚未完成 runtime、打包和真机验证。
- Apple TV / Android TV 仍是未来研究方向，未完成遥控器输入、焦点导航和缓存策略设计。
- 真实站点 smoke 和真实下载验证默认不在公开整理阶段运行；需要 runtime-only credentials 和显式确认。
- 大型 archive profiling 和持续 Reader memory/performance QA 仍是公开二进制发布前工作。

## 下一次发布前验证

- 运行敏感信息扫描和文件清理检查。
- 跑 typecheck、Vitest、build、Rust fmt/check/lib-test、platform check、iOS asset check。
- 涉及 Reader、路由、布局、视觉基线或 accessibility 时再跑 Playwright E2E。
- 只在用户明确要求时运行 live-site smoke 或真实下载验证。
