# 验证日志

本文件只记录脱敏验证结果、发布检查和已知 release blocker。不要在这里写入凭证、Cookie、Session、Token、授权 URL、真实下载路径、本机私有证据路径或对外宣传文案。

对外更新记录写入 [CHANGELOG.md](CHANGELOG.md)；README 只保留最近 5 次公开更新摘要。

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
