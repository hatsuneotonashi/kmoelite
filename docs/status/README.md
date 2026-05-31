# 当前状态

本文档公开记录项目当前能力和限制，避免使用内部验收或稳定版口吻。

## Alpha / 开发预览

截至 2026-05-31，Kmoe Client 仍处于 Alpha / 开发预览阶段。它不是稳定版本，也不是正式发行版。部分平台尚未完成完整测试。

## 当前产品定位

- 项目是非官方 KMOE 在线漫画阅读器和个人阅读管理工具。
- 核心痛点是手持设备存储成本高、漫画长期缓存容易导致本地存储膨胀。
- 默认产品方向是在线阅读优先：点开一本看一本，以临时 Reader cache 支撑高清阅读，看完或达到策略限制后清理缓存。
- 永久下载、Library 和文件打开能力保留为高级/兼容能力，不是普通阅读默认路径。
- Production runtime 是 live-first，不提供用户可见 mock/demo 模式。
- 真实站点 smoke 和真实下载验证默认关闭，必须通过显式 runtime 环境变量执行。
- Reader、书架、Library、下载队列、Reader cache、阅读进度和历史是独立模型。
- 当前仓库准备的是源码发布，不是公开二进制发行。

## 最近记录的本地验证

历史整理阶段记录过以下本地 gate 结果：

- TypeScript typecheck：passed。
- Vitest：45 files / 245 tests passed。
- Rust lib tests：76 passed。
- `pnpm check:platforms`：`pass=32 warn=0 external=2 fail=0`。
- Playwright E2E：114 passed / 50 skipped。

这些记录是本地阶段性结果；公开上传前应重新运行当前树的检查，并以最新输出为准。

## 平台状态摘要

- iPhone：开发预览可用；适合个人测试和日常试用，签名真机完整验证仍需继续补齐。
- iPad：开发预览可用；平板布局和 Reader 体验已作为当前重点，签名真机完整验证仍需继续补齐。
- Android 手机：计划支持，尚未实现完整 Android runtime、打包和真机验证。
- Android 平板：计划支持，尚未完成平板布局和真机验证。
- Windows：源码和打包脚本存在，真实 Windows 安装/卸载/open/reveal 验证未完成。
- macOS：开发预览可用；当前主要本地开发和日常试用平台，公开二进制仍需签名、公证、stapling 和干净机器验证。
- Apple TV / Android TV：后续研究方向，不属于当前 Alpha 可用范围。

## 未完成的发布验证

- macOS 签名、公证、stapling、干净机器安装/打开验证未完成。
- Windows 真机安装、卸载、open file、reveal folder、签名验证未完成。
- iPhone/iPad signed physical-device install、文件导出/分享、前后台行为验证未完成。
- Android phone/tablet 运行时、打包和真机验证未完成。
- Apple TV / Android TV 输入、布局、缓存策略和平台可行性未完成。
- 本轮默认不运行真实站点 smoke 和真实下载验证。
- Store 分发仍需要平台政策、签名、provisioning 和 packaging review。

## 验证模型

默认自动化测试使用 fixture 和本地 archives。Live website 和 real-download checks 是显式、脱敏、默认关闭的开发者验证流程。

公开二进制发布前，每个目标平台都需要当前 native smoke，覆盖登录、目录/详情读取、在线 Reader 打开、临时 cache 准备、翻页、继续阅读、缓存清理，以及显式下载/Library 兼容路径。
