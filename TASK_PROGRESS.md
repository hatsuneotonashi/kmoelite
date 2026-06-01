# 任务进度

本文件只记录脱敏的当前状态、验证结果和已知缺口。不要在这里写入凭证、Cookie、Session、Token、授权 URL、真实下载路径或本机私有证据路径。

## 当前基线

日期：2026-05-31

- 项目定位为 Alpha / 开发预览阶段的轻量非官方 KMOE 在线漫画阅读器和个人阅读管理工具。
- 产品主目标是在线阅读优先、临时 Reader cache、低存储占用和高清阅读体验；永久下载/Library 是显式用户意图或兼容路径。
- Production runtime 是 live-first：没有用户可见 mock/demo 模式，不伪造下载完成，不暴露 admin/upload/destructive website paths。
- macOS、iPhone、iPad simulator 路径有历史本地验证记录，但本轮公开整理默认不重跑真实 app smoke。Windows 有源码和包装脚本，但未在真实 Windows 机器上完成 release 验证。
- Detail cover theme 以真实封面像素作为主取色来源，固定色板只作为失败兜底。
- 桌面/平板 shell 应保持 sidebar/rail 固定，主内容区独立滚动。
- Reader-capable archives 是 source ZIP/CBZ 和 EPUB。MOBI 仍为 file-only。
- Detail、Shelf、Library、Continue Reading 共享 Reader cache entry model。
- Download Center 动作由真实 native queue state 和 native snapshot refresh 驱动。

## 最近历史验证记录

2026-05-31 公开仓库整理阶段记录过以下本地 gate：

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

这些是历史记录；当前整理后的最终上传目录应重新运行验证，并以最新命令输出为准。

## 本轮公开整理

- 许可证目标改为 GNU General Public License v3.0。
- README 改为中文主文档，并新增英文简版。
- 安全、贡献、发布、平台、状态、Web adapter、Reader/Shelf 文档改为公开合规口径。
- 真实 KMOE 集成能力保留，但文档不传播站点内部下载授权接口参数，不加入绕过会员、配额、验证、反滥用或版权限制的内容。
- 公开定位已调整为“不想长期下载漫画、点开一本看一本、读完按策略清理缓存”的 Alpha 产品方向。
- GitHub issue/PR 模板加入脱敏和合规提示。
- CI 改为 source checks，不默认上传未签名 app、DMG、MSI 或 NSIS。

## Release blockers

- macOS public distribution 仍需 Apple Developer 签名、hardened runtime review、公证、stapling、干净机器安装/打开验证。
- Windows package/install/open/reveal validation 仍需真实 Windows host。
- iPhone/iPad signed physical-device install、share/export、orientation、foreground/background、file-access 行为仍需验证。
- Android phone/tablet 尚未完成 runtime、打包和真机验证。
- Apple TV / Android TV 仍是未来研究方向，未完成遥控器输入、焦点导航和缓存策略设计。
- 真实站点 smoke 和真实下载验证默认不在公开整理阶段运行；需要 runtime-only credentials 和显式确认。
- 大型 archive profiling 和持续 Reader memory/performance QA 仍是公开二进制发布前工作。

## 下一步

- 对最终目录运行敏感信息扫描和文件清理检查。
- 跑 typecheck、Vitest、build、Rust fmt/check/lib-test、platform check、iOS asset check。
- 只在用户明确要求时运行 live-site smoke 或真实下载验证。
