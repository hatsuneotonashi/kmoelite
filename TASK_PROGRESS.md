# 验证日志

本文件只记录脱敏验证结果、发布检查和已知 release blocker。不要在这里写入凭证、Cookie、Session、Token、授权 URL、真实下载路径、本机私有证据路径或对外宣传文案。

对外更新记录写入 [CHANGELOG.md](CHANGELOG.md)；README 只保留最近 5 次公开更新摘要。

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
