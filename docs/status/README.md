# 当前状态

本文档公开记录项目当前能力和限制，避免使用内部验收或稳定版口吻。

无上下文 AI 或维护者应先读根目录 `AGENTS.md`。本文档是当前状态和平台限制的事实源；阶段性验证结果以根目录 `TASK_PROGRESS.md` 为准。

## Alpha / 开发预览

截至 2026-06-17，kmoelite 仍处于 Alpha / 开发预览阶段。它不是稳定版本，也不是正式发行版。部分平台尚未完成完整测试。

## 当前产品定位

- 项目是非官方 KMOE 在线漫画阅读器和个人阅读管理工具。
- 当前默认 KMOE 网站入口为 `https://kxo.moe`；前端、Rust Web Adapter、Tauri CSP、测试 fixture 和 live smoke 默认源站应保持一致。
- 核心痛点是手持设备存储成本高、漫画长期缓存容易导致本地存储膨胀。
- 默认产品方向是在线阅读优先：点开一本看一本，以临时 Reader cache 支撑高清阅读，默认保留前一章、当前章和后一章，并在继续阅读时清理窗口外缓存。
- 永久下载、Library 和文件打开能力保留为高级/兼容能力，不是普通阅读默认路径。
- iPhone/iPad 显式下载先写入 App 私有保存区；用户需要放入“文件”App 或其他位置时再通过系统分享/导出。
- Production runtime 是 live-first，不提供用户可见 mock/demo 模式。
- 真实站点 smoke 和真实下载验证默认关闭，必须通过显式 runtime 环境变量执行。
- Reader、书架、Library、下载队列、Reader cache、阅读进度和历史是独立模型。
- 当前仓库准备的是源码发布，不是公开二进制发行。

## 最近记录的本地验证

最近一次本地 source gate 记录了以下结果：

- TypeScript typecheck：passed。
- Vitest：55 files / 292 tests passed。
- Rust lib tests：86 passed。
- `pnpm check:platforms`：`pass=49 warn=0 external=4 fail=0`。
- Playwright E2E：114 passed / 50 skipped。
- 真实 EPUB 单项下载到 Reader：passed，覆盖下载、Library 记录、Reader cache、翻页、继续阅读进度和 cache cleanup；输出已脱敏，本地文件使用临时目录清理。
- 真实 source ZIP 单项下载：failed，站点未返回可用 source ZIP 下载地址；普通自动阅读路径已改为 EPUB 优先，source ZIP 仍保留为显式高级格式。
- macOS debug `.app` bundle：build passed，并完成一次启动/退出 smoke。
- Android debug APK/AAB：build passed。
- Android phone emulator：Pixel 8 API 36 install/launch smoke passed；真实登录、账号页、详情页、EPUB 单项下载、Reader cache 准备、翻页和显式本地阅读数据删除 passed。
- Android tablet emulator：Pixel Tablet API 36 install/launch smoke passed，确认 tablet contract；真实登录、详情页、EPUB 单项下载、Reader cache 准备、双页翻页和显式本地阅读数据删除 passed。
- Android TV emulator：Android TV API 36 install/launch smoke passed，确认 Leanback launcher、`androidTv` runtime、`tv` layout contract、`remote` input class、方向键焦点移动、native DPAD/OK 输入桥、Settings Back 和合成本地 Reader cache OK/Back smoke。
- Android TV / remote input：源码层已支持 remote Back 导航、native DPAD/OK 输入桥和 Reader OK/Back 键位；聚焦 Vitest passed。
- iPad/iPhone native runtime：本机 Xcode signing/provisioning 未配置完整，实机部署和模拟器 native run 未完成。

这些记录是本地阶段性结果；公开上传前或发布二进制前应重新运行当前树的检查，并以最新输出为准。

## 平台状态摘要

- iPhone：开发预览可用；适合个人测试和日常试用，签名真机完整验证仍需继续补齐。
- iPad：开发预览可用；平板布局和 Reader 体验已作为当前重点，签名真机完整验证仍需继续补齐。
- Android 手机：实验预览源码路径存在；Android debug APK/AAB 构建通过，Pixel 8 API 36 模拟器可启动手机布局，并通过真实登录、详情、EPUB 下载、Reader、翻页和本地阅读数据删除 smoke；真机、文件导出/分享和签名发布仍未完整验证。
- Android 平板：实验预览源码路径存在；Android tablet contract 已纳入布局模型，Pixel Tablet API 36 模拟器可启动并通过真实登录、详情、EPUB 下载、Reader、双页翻页和本地阅读数据删除 smoke；真机、文件导出/分享和签名发布仍未完整验证。
- Android TV：实验预览入口存在；Leanback launcher、TV runtime 识别、宽屏 shell、方向键焦点、native DPAD/OK 输入桥和合成本地 Reader cache OK/Back smoke 已在 Android TV API 36 模拟器验证；Reader 下载、缓存清理、签名发布和实体 TV 验证仍未完成。
- Windows：源码和打包脚本存在，真实 Windows 安装/卸载/open/reveal 验证未完成。
- macOS：开发预览可用；当前主要本地开发和日常试用平台，公开二进制仍需签名、公证、stapling 和干净机器验证。
- Apple TV：后续研究方向，不属于当前 Alpha 可用范围；本机已确认 tvOS SDK、Apple TV simulator device type 和 tvOS Rust targets，仍缺 tvOS simulator runtime 和可运行 tvOS shell。

## 未完成的发布验证

- macOS 签名、公证、stapling、干净机器安装/打开验证未完成。
- Windows 真机安装、卸载、open file、reveal folder、签名验证未完成。
- iPhone/iPad signed physical-device install、文件导出/分享、前后台行为验证未完成。
- Android phone/tablet 真机、文件导出/分享、签名发布和分发验证未完成。
- Android TV Reader 下载、缓存清理、实体设备、签名发布和分发验证未完成；当前 TV Reader smoke 只覆盖合成本地 Reader cache 的 OK/Back 行为，不覆盖真实站点、下载或缓存清理链路。
- Apple TV 输入、布局、缓存策略和可运行 tvOS shell 未完成；当前 readiness 检查只证明部分工具链存在，不代表 Apple TV App 已可启动。
- 最近一轮运行了真实 EPUB 单项下载验证，并在 Android phone/tablet emulator 中验证 native 下载、Reader、翻页和本地阅读数据删除 smoke；真实站点 smoke、source ZIP 成功验证和其余平台 native 下载/Reader/cache 清理 smoke 仍需按发布目标重新执行。
- Store 分发仍需要平台政策、签名、provisioning 和 packaging review。

## 验证模型

默认自动化测试使用 fixture 和本地 archives。Live website 和 real-download checks 是显式、脱敏、默认关闭的开发者验证流程。

公开二进制发布前，每个目标平台都需要当前 native smoke，覆盖登录、目录/详情读取、在线 Reader 打开、临时 cache 准备、翻页、继续阅读、缓存清理，以及显式下载/Library 兼容路径。
