# 平台状态

kmoelite 当前开发预览可用的平台是 iPhone、iPad 和 macOS。iPad simulator 已通过真实 EPUB 下载到 Reader 和翻页 smoke；iPhone simulator 已通过 packaged render、session restore 和 `kmoelite://comic/<id>` open-url smoke，但还没有完成详情、下载和 Reader smoke。Windows 有源码和打包路径但未完成真机发行验证。Android 手机和平板已经有实验预览源码路径和 debug APK/AAB 构建路径；Android phone emulator 已通过真实登录、详情、EPUB 下载、Reader、翻页和本地阅读数据清理 smoke；Android tablet emulator 已通过真实登录、详情、EPUB 下载、Reader、双页翻页和本地阅读数据清理 smoke；系统分享桥源码、debug build、Android WebView bridge 注入 smoke 和 app-private debug share chooser smoke 已通过，但两者仍未完成真机、真实 downloaded-file 记录分享 smoke 和签名发布验证。Android TV 已有实验入口，Android TV emulator 已通过真实登录、详情、EPUB 下载、Reader、遥控器翻页和本地阅读数据清理 smoke，系统分享桥源码、debug build、手机 WebView bridge 注入 smoke 和 app-private debug share chooser smoke 已通过，但不等同于实体 TV、真实 downloaded-file 记录分享或签名发行完成。Apple TV 是未来研究方向。源码支持、开发预览和公开二进制可发布是不同状态。

## iPhone

- 开发预览可用，适合个人测试和日常试用。
- 目标是触控优先、安全区适配、单手操作、低存储占用。
- Reader 应优先使用临时 cache，避免长期保存大体积漫画文件。
- iPhone 17 simulator 已通过 packaged debug app 安装、启动、首屏渲染、session restore 和 `kmoelite://comic/<id>` open-url smoke。
- 详情、Reader、下载、缓存清理、签名真机、文件导出/分享和前后台行为验证仍需继续补齐。

## iPad

- 开发预览可用，适合个人测试和日常试用。
- iPad UI 应使用 rail/sidebar 和分栏布局，不能拉伸手机 UI。
- 目标是横竖屏都适合高清漫画阅读，同时控制缓存占用。
- iPad Air 13-inch simulator 已通过 packaged debug app 安装、启动、平板布局渲染、真实 EPUB 下载到 Reader、翻页和进度写入 smoke。
- 登录 UI 自动化、显式缓存清理、签名真机、文件导出/分享和前后台行为验证仍需继续补齐。

## Android 手机

- 实验预览源码路径存在。
- `src-tauri/gen/android` 已生成 Tauri Android 工程，debug APK/AAB 构建通过。
- Pixel 8 API 36 模拟器可安装并启动，首屏使用 phone contract 和底部导航。
- Pixel 8 API 36 模拟器已通过真实登录、账号页、详情、EPUB 单项下载、Reader cache 准备、翻页和显式本地阅读数据删除 smoke。
- 设计原则与 iPhone 一致：触控优先、低存储占用、在线阅读优先。
- Android 系统分享桥源码、debug build、WebView bridge 注入 smoke 和 app-private debug share chooser smoke 已通过；真机、真实 downloaded-file 记录分享 smoke、签名发布仍未完整验证。

## Android 平板

- 实验预览源码路径存在。
- 布局模型已有 Android tablet contract，原则与 iPad 一致：分栏、多列、横屏高清阅读和可控缓存。
- Pixel Tablet API 36 模拟器可安装并启动 tablet contract，并通过真实登录、详情、EPUB 单项下载、Reader cache 准备、双页翻页和显式本地阅读数据删除 smoke。
- Android 系统分享桥源码、debug build、手机 WebView bridge 注入 smoke 和 app-private debug share chooser smoke 已通过；Android 平板真机、真实 downloaded-file 记录分享 smoke 和签名发布仍未完整验证。

## Windows

- 源码和 Tauri MSI/NSIS 打包脚本存在，但未完成完整 Windows 发行验证。
- 文件名清洗覆盖保留字符和 Windows 设备名。
- 公开二进制发布前仍需真机验证安装、卸载、打开文件、显示位置、暂停/恢复、取消、重试和签名。

## macOS

- 开发预览可用，当前主要本地开发和日常试用平台。
- debug `.app` 构建脚本存在：`pnpm tauri:build:mac-app:debug`。
- 公开二进制发布前仍需 Apple Developer 签名、hardened runtime 审查、公证、stapling、干净机器安装/打开验证。

## Apple TV

- 后续研究方向，不属于当前 Alpha 可用范围。
- 本机平台检查已覆盖 tvOS SDK、tvOS simulator runtime、Apple TV simulator device type、实际 simulator device 和 tvOS Rust targets。
- Apple TV 4K 1080p 模拟器已可启动，但当前仍没有可运行的 tvOS/WKWebView 壳。
- 需要先实现最薄 Apple TV 壳，再验证遥控器输入、横屏阅读、焦点导航、缓存清理和平台分发策略。

## Android TV

- 实验入口存在，不属于当前 Alpha 稳定可用范围。
- Android manifest 已声明 optional Leanback launcher；Android TV API 36 模拟器可安装并启动。
- 前端可识别 Android TV WebView UA，进入 `androidTv` runtime、`tv` layout contract 和 `remote` input class。
- 方向键焦点 smoke 已验证可从 shell 进入导航项。
- App shell 已在 remote 输入下处理 Back 导航；Android native WebView bridge 可把 DPAD 方向键和 OK/Enter 交给前端。
- Android TV API 36 模拟器已通过真实登录、详情、EPUB 单项下载、Reader cache 准备、`DPAD_CENTER` 显示 Reader chrome、`DPAD_LEFT` 双页翻页和显式本地阅读数据删除 smoke。
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
