# 平台状态

kmoelite 当前开发预览可用的平台是 iPhone、iPad 和 macOS。iPad simulator 已通过真实 EPUB 下载到 Reader 和翻页 smoke；iPhone simulator 已通过 packaged render、session restore、可重复 `kmoelite://comic/<id>` open-url smoke 和 debug 内部详情页路由/视觉 smoke，`kmoelite://comic/<id>` scheme 已注册并加固 pending route 交付，`pnpm smoke:ios-sim` 可用 `IOS_SIM_DEVICE_KIND=iphone|ipad` 分别固定验证 iPhone 或 iPad simulator，但还没有完成 iPhone 下载、Reader 和缓存清理 smoke。Windows 有源码和打包路径但未完成真机发行验证。Android 手机和平板已经有实验预览源码路径和 debug APK/AAB 构建路径；Android phone emulator 已通过真实登录、详情、EPUB 下载、Reader、翻页、本地阅读数据清理、运行中 `kmoelite://comic/<id>` deep link smoke 和 `pnpm smoke:android-live-reader` live Reader smoke；Android tablet emulator 已通过真实登录、详情、EPUB 下载、Reader、双页翻页、本地阅读数据清理和 `pnpm smoke:android-live-reader` live Reader smoke；系统分享桥源码、debug build、Android WebView bridge 注入 smoke 和 app-private debug share chooser smoke 已通过，但两者仍未完成真机、真实 downloaded-file 记录分享 smoke 和签名发布验证。Android TV 已有实验入口，Android TV emulator 已通过通用 packaged smoke 的安装、启动、运行中 deep link 和截图解码，并通过真实登录、详情、EPUB 下载、Reader、遥控器翻页、本地阅读数据清理和 `pnpm smoke:android-live-reader` live Reader smoke；系统分享桥源码、debug build、手机 WebView bridge 注入 smoke 和 app-private debug share chooser smoke 已通过，但不等同于实体 TV、真实 downloaded-file 记录分享或签名发行完成。Apple TV 已有独立原生 tvOS 开发预览工程和 simulator smoke，但还不是 Reader 可用平台。源码支持、开发预览和公开二进制可发布是不同状态。

## iPhone

- 开发预览可用，适合个人测试和日常试用。
- 目标是触控优先、安全区适配、单手操作、低存储占用。
- Reader 应优先使用临时 cache，避免长期保存大体积漫画文件。
- iPhone 17 simulator 已通过 packaged debug app 安装、启动、首屏渲染、session restore smoke 和 debug 内部详情页路由/视觉 smoke。
- `kmoelite://comic/<id>` scheme 已注册并加固 pending route 交付；`IOS_SIM_DEVICE_KIND=iphone IOS_SIM_COMIC_ID=10817 pnpm smoke:ios-sim` 可重复执行 iPhone simulator open-url smoke；`IOS_SIM_DEVICE_KIND=iphone IOS_SIM_INTERNAL_COMIC_ID=10817 pnpm smoke:ios-sim` 可绕过 iOS 系统确认框直接验证 debug 包内详情页。Reader、下载、缓存清理、签名真机、文件导出/分享和前后台行为验证仍需继续补齐。

## iPad

- 开发预览可用，适合个人测试和日常试用。
- iPad UI 应使用 rail/sidebar 和分栏布局，不能拉伸手机 UI。
- 目标是横竖屏都适合高清漫画阅读，同时控制缓存占用。
- iPad simulator 可通过 `IOS_SIM_DEVICE_KIND=ipad pnpm smoke:ios-sim` 固定安装、启动和截图 smoke；iPad Air 13-inch simulator 已通过 packaged debug app 安装、启动、平板布局渲染、真实 EPUB 下载到 Reader、翻页和进度写入 smoke。
- 登录 UI 自动化、显式缓存清理、签名真机、文件导出/分享和前后台行为验证仍需继续补齐。

## Android 手机

- 实验预览源码路径存在。
- `src-tauri/gen/android` 已生成 Tauri Android 工程，debug APK/AAB 构建通过。
- Pixel 8 API 36 模拟器可安装并启动，首屏使用 phone contract 和底部导航。
- Pixel 8 API 36 模拟器已通过真实登录、账号页、详情、EPUB 单项下载、Reader cache 准备、翻页和显式本地阅读数据删除 smoke；`pnpm smoke:android-live-reader` 也已覆盖 runtime 登录、详情、EPUB Reader 打开、页面图片渲染和翻页。
- Pixel 8 API 36 模拟器已通过运行中 `kmoelite://comic/<id>` deep link smoke，确认 packaged app 不再触发 native intent 崩溃。
- 设计原则与 iPhone 一致：触控优先、低存储占用、在线阅读优先。
- Android 系统分享桥源码、debug build、WebView bridge 注入 smoke 和 app-private debug share chooser smoke 已通过；真机、真实 downloaded-file 记录分享 smoke、签名发布仍未完整验证。

## Android 平板

- 实验预览源码路径存在。
- 布局模型已有 Android tablet contract，原则与 iPad 一致：分栏、多列、横屏高清阅读和可控缓存。
- Pixel Tablet API 36 模拟器可安装并启动 tablet contract，并通过真实登录、详情、EPUB 单项下载、Reader cache 准备、双页翻页和显式本地阅读数据删除 smoke；`pnpm smoke:android-live-reader` 也已覆盖 runtime 登录、详情、EPUB Reader 打开、页面图片渲染和翻页。
- Android 系统分享桥源码、debug build、手机 WebView bridge 注入 smoke 和 app-private debug share chooser smoke 已通过；Android 平板真机、真实 downloaded-file 记录分享 smoke 和签名发布仍未完整验证。

## Windows

- 源码和 Tauri MSI/NSIS 打包脚本存在，但未完成完整 Windows 发行验证。
- 文件名清洗覆盖保留字符和 Windows 设备名。
- 公开二进制发布前仍需真机验证安装、卸载、打开文件、显示位置、暂停/恢复、取消、重试和签名。

## macOS

- 开发预览可用，当前主要本地开发和日常试用平台。
- debug `.app` 构建脚本存在：`pnpm tauri:build:mac-app:debug`。
- 可复跑本机 smoke 入口存在：`pnpm smoke:mac-app`，覆盖 debug `.app` 构建、启动、临时截图解码和退出。
- 公开二进制发布前仍需 Apple Developer 签名、hardened runtime 审查、公证、stapling、干净机器安装/打开验证。

## Apple TV

- 原生 tvOS 开发预览工程位于 `apps/kmoe-appletv`，不复用 Tauri/WKWebView。
- `pnpm test:appletv` passed，覆盖 catalog/detail/book_data parser、登录/profile 标记和 SQLite progress round-trip。
- `pnpm smoke:appletv-sim` passed，覆盖 Apple TV 4K 1080p simulator build、install、launch 和临时截图解码。
- tvOS simulator SDK 不提供 WebKit；当前 Tauri/WKWebView 前端壳不能直接复用到 Apple TV。
- 真实登录、EPUB 获取、横屏 Reader、遥控器翻页、前一章/当前章/后一章缓存窗口、显式删除本地阅读数据、实体 Apple TV、签名和分发验证仍未完成。

## Android TV

- 实验入口存在，不属于当前 Alpha 稳定可用范围。
- Android manifest 已声明 optional Leanback launcher；Android TV API 36 模拟器可安装并启动。
- Android TV API 36 模拟器已通过 `pnpm smoke:android-device`，覆盖 debug APK build、adb install、app launch、运行中 `kmoelite://comic/<id>` deep link 和临时截图解码。
- 前端可识别 Android TV WebView UA，进入 `androidTv` runtime、`tv` layout contract 和 `remote` input class。
- 方向键焦点 smoke 已验证可从 shell 进入导航项。
- App shell 已在 remote 输入下处理 Back 导航；Android native WebView bridge 可把 DPAD 方向键和 OK/Enter 交给前端。
- Android TV API 36 模拟器已通过真实登录、详情、EPUB 单项下载、Reader cache 准备、`DPAD_CENTER` 显示 Reader chrome、`DPAD_LEFT` 双页翻页和显式本地阅读数据删除 smoke；`pnpm smoke:android-live-reader` 也已覆盖 runtime 登录、详情、EPUB Reader 打开、页面图片渲染和翻页。
- Android 系统分享桥源码、debug build、手机 WebView bridge 注入 smoke 和 app-private debug share chooser smoke 已通过；实体 TV、真实 downloaded-file 记录分享 smoke、签名发布和分发验证仍未完成。

## 正常用户入口

正常用户入口包括 Home、Shelf、Search、Categories、Account、Settings、Login/session、Detail 和 Reader。Download Center 与 Library 属于显式本地保存和兼容能力，不应压过在线阅读主流程。

开发诊断、内部平台说明、下载链路解释、维护/admin 检查页面不能出现在正常用户导航中。

## 文件系统和缓存要求

- 不直接信任站点提供的文件名。
- Reader cache 是临时阅读缓存，默认应服务高清阅读和快速翻页，而不是长期收藏。
- 写入永久文件必须有明确用户意图。
- iPhone/iPad 显式下载先写入 App 私有保存区；导出、打开或查看位置时通过系统分享表交给“文件”App 或其他目标。
- 先写 `.part`，再 final rename。
- 拒绝 path traversal。
- 打开、显示位置、分享、解压前都要验证路径。
