# 平台状态

kmoelite 当前开发预览可用的平台是 iPhone、iPad 和 macOS。Windows 有源码和打包路径但未完成真机发行验证。Android 手机和平板已经有实验预览源码路径和 debug APK/AAB 构建路径，但还没有完成真机、下载、Reader 和签名发布验证。Android TV 已有最薄实验入口和模拟器启动/方向键焦点 smoke，但不等同于完整 TV 支持。Apple TV 是未来研究方向。源码支持、开发预览和公开二进制可发布是不同状态。

## iPhone

- 开发预览可用，适合个人测试和日常试用。
- 目标是触控优先、安全区适配、单手操作、低存储占用。
- Reader 应优先使用临时 cache，避免长期保存大体积漫画文件。
- simulator 路径存在；签名真机完整验证仍需继续补齐。

## iPad

- 开发预览可用，适合个人测试和日常试用。
- iPad UI 应使用 rail/sidebar 和分栏布局，不能拉伸手机 UI。
- 目标是横竖屏都适合高清漫画阅读，同时控制缓存占用。
- simulator 路径存在；签名真机完整验证仍需继续补齐。

## Android 手机

- 实验预览源码路径存在。
- `src-tauri/gen/android` 已生成 Tauri Android 工程，debug APK/AAB 构建通过。
- Pixel 8 API 36 模拟器可安装并启动，首屏使用 phone contract 和底部导航。
- 设计原则与 iPhone 一致：触控优先、低存储占用、在线阅读优先。
- 真机、登录、下载、Reader、缓存清理、文件导出/分享、签名发布仍未完整验证。

## Android 平板

- 实验预览源码路径存在。
- 布局模型已有 Android tablet contract，原则与 iPad 一致：分栏、多列、横屏高清阅读和可控缓存。
- Android 平板模拟器/真机、下载、Reader、缓存清理和签名发布仍未完整验证。

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
- 需要先设计遥控器输入、横屏阅读、焦点导航、缓存清理和平台分发策略。

## Android TV

- 实验入口存在，不属于当前 Alpha 稳定可用范围。
- Android manifest 已声明 optional Leanback launcher；Android TV API 36 模拟器可安装并启动。
- 前端可识别 Android TV WebView UA，进入 `androidTv` runtime、`tv` layout contract 和 `remote` input class。
- 方向键焦点 smoke 已验证可从 shell 进入导航项。
- Reader、下载、缓存清理、返回键、实体 TV、签名发布和分发验证仍未完成。

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
