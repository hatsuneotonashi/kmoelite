# 贡献指南

感谢你改进 kmoelite。这个项目是 Alpha / 开发预览阶段的非官方 KMOE 在线漫画阅读器，贡献必须保持合规、安全和可复现。

## 开发准备

```bash
corepack enable
corepack prepare pnpm@11.1.3 --activate
pnpm install
pnpm --dir apps/kmoe-app exec playwright install chromium
```

浏览器开发：

```bash
pnpm dev
```

Tauri 桌面开发：

```bash
pnpm tauri dev
```

## PR 要求

- 保持改动聚焦，一次 PR 只处理一个行为或一个清理主题。
- 没有历史上下文的维护者或 AI 必须先阅读 `AGENTS.md`，再按其中顺序阅读核心文档和任务相关源码。
- 不提交账号、密码、Cookie、Session、Token、授权 URL、本机私有路径、runtime 数据库、本地下载文件或构建产物。
- 默认测试使用 fixture；测试 fixture 只能放在 `apps/kmoe-app/src/tests/fixtures/` 或 `apps/kmoe-app/e2e/fixtures/`。
- 行为、平台支持、发布步骤或安全边界变化时，同步更新文档。
- 每次提交都要更新 `TASK_PROGRESS.md`；用户可见或贡献者可理解的变化同步更新 `CHANGELOG.md`。
- 不添加用户可见 mock/demo 模式，不伪造下载成功、登录成功或 Reader cache 状态。
- 不添加绕过登录、会员、配额、验证、反滥用、版权限制或批量滥用下载的功能。
- 优先支持轻量在线阅读、临时 Reader cache、低存储占用和高清阅读体验。
- 永久下载、Library 和文件打开能力属于显式用户意图或兼容路径，不应变成普通阅读默认路径。

默认提交前检查：

```bash
git diff --check
pnpm --dir apps/kmoe-app typecheck
pnpm --dir apps/kmoe-app test:run
pnpm --dir apps/kmoe-app build
cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check
cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml
cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib
pnpm check:platforms
node scripts/check-ios-assets.mjs
```

涉及路由、布局、Reader、可访问性或视觉基线时运行：

```bash
pnpm --dir apps/kmoe-app e2e
```

不能运行的检查必须写入 `TASK_PROGRESS.md`，说明原因和风险。

## 真实站点检查

默认测试必须是确定性的 fixture 测试。真实站点 smoke 和真实下载验证只允许通过 [docs/development](docs/development/README.md) 与 [docs/security](docs/security/README.md) 记录的显式 runtime 环境变量执行。

不要把真实凭证、Cookie、Session、授权 URL、私有路径、下载文件或真实账号状态写入 commit、docs、screenshots、fixtures 或日志。

## 代码风格

- 遵循现有 React、TypeScript、Rust 和 CSS 结构。
- 优先复用 shared helpers、store 和 native command boundaries，避免页面直接绕过边界。
- 保持 Reader、Shelf、Library、download tasks、reading progress、history 和 temporary cache 数据模型分离。
- 使用 `rg` 搜索仓库；生成产物和本地运行状态必须留在 ignore 之外。

## 许可证

提交到本项目的贡献将按 [GNU General Public License v3.0](LICENSE) 发布。
