# 平台状态

Kmoe Client 当前开发预览可用的平台是 iPhone、iPad 和 macOS。Windows 有源码和打包路径但未完成真机发行验证。Android 手机、Android 平板、Apple TV 和 Android TV 是未来计划。源码支持、开发预览和公开二进制可发布是不同状态。

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

- 计划支持，当前未完成完整 Android runtime、打包和真机验证。
- 设计原则与 iPhone 一致：触控优先、低存储占用、在线阅读优先。
- 实现前需要补齐 Android 文件系统、缓存清理、网络状态和生命周期策略。

## Android 平板

- 计划支持，当前未完成平板布局、打包和真机验证。
- 设计原则与 iPad 一致：分栏、多列、横屏高清阅读和可控缓存。

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

- 后续研究方向，不属于当前 Alpha 可用范围。
- 需要先设计遥控器输入、横屏阅读、焦点导航、缓存清理和平台分发策略。

## 正常用户入口

正常用户入口包括 Home、Shelf、Search、Categories、Account、Settings、Login/session、Detail 和 Reader。Download Center 与 Library 属于显式本地保存和兼容能力，不应压过在线阅读主流程。

开发诊断、内部平台说明、下载链路解释、维护/admin 检查页面不能出现在正常用户导航中。

## 文件系统和缓存要求

- 不直接信任站点提供的文件名。
- Reader cache 是临时阅读缓存，默认应服务高清阅读和快速翻页，而不是长期收藏。
- 写入永久文件必须有明确用户意图。
- 先写 `.part`，再 final rename。
- 拒绝 path traversal。
- 打开、显示位置、分享、解压前都要验证路径。
