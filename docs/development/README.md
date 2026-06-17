# 开发

## 环境准备

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

## 仓库结构

- `AGENTS.md`：无上下文 AI 接手入口、长期工程约束、项目记忆和提交纪律。
- `TASK_PROGRESS.md`：脱敏验证日志和 release blocker。
- `CHANGELOG.md`：对外更新记录。
- `apps/kmoe-app/src/`：前端源码。
- `apps/kmoe-app/src-tauri/src/`：Rust native source。
- `apps/kmoe-app/src/tests/`：Vitest tests 和 fixtures。
- `apps/kmoe-app/e2e/`：Playwright tests 和 approved visual baselines。
- `scripts/`：release、platform、iOS、guarded live verification scripts。
- `docs/`：公开文档。

`dist`、`target`、Apple build folders、reports、runtime DB、本地下载、auth state 和 cache 不是业务源码，必须保持 ignored。

## 默认检查

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

Android debug APK/AAB 构建入口：

```bash
pnpm tauri:android:build:debug
```

iPhone/iPad simulator debug bundle 构建与安装启动 smoke：

```bash
pnpm --dir apps/kmoe-app exec tauri ios build --debug --target aarch64-sim --no-sign
pnpm smoke:ios-sim
```

`pnpm smoke:ios-sim` 会优先选择已启动的 iOS simulator；如果同时启动了 Apple TV simulator，也不会把 iOS app 误装到 tvOS。启动后脚本会截一张临时 simulator 截图并确认系统可解码，截图自动删除、不进入仓库。不要用裸 `xcodebuild` 替代 Tauri iOS 构建脚本；它缺少 Tauri mobile RPC 上下文。打包入口也必须保持相对资源路径，不要在 `index.html` 写根 `<base href="/">`。

提交前默认运行以上完整 gate。涉及路由、布局、Reader、accessibility、视觉基线或浏览器可见工作流时再运行 `pnpm --dir apps/kmoe-app e2e`。不能运行的命令必须写入 `TASK_PROGRESS.md`，说明原因和风险。

## 无上下文接手

没有历史聊天上下文的 AI 或维护者必须先阅读根目录 `AGENTS.md`。实现前需要完成 `AGENTS.md` 指定的核心文档阅读、任务相关源码/测试/脚本检查，并先输出接手摘要。项目当前状态以 `docs/status/README.md` 和 `TASK_PROGRESS.md` 为准。

## 真实站点检查

默认测试必须使用 fixture，保证可复现。真实站点 smoke 只在开发者显式设置 runtime 环境变量时运行：

```bash
KMOE_SMOKE_EMAIL='your-account@example.com' \
KMOE_SMOKE_PASSWORD='your-runtime-password' \
pnpm verify:real-site-smoke
```

单项真实下载验证同样必须显式确认，且可能消耗账号配额：

```bash
KMOE_VERIFY_EMAIL='your-account@example.com' \
KMOE_VERIFY_PASSWORD='your-runtime-password' \
KMOE_REAL_DOWNLOAD_VERIFY=I_UNDERSTAND_THIS_MAY_USE_QUOTA \
pnpm verify:real-source-zip-reader
```

不要打印、保存、提交或截图真实凭证、Cookie、Session、授权 URL、私有路径、runtime DB 或下载文件。

## 在线阅读和缓存开发规则

默认产品模型：

```text
detail option -> temporary Reader cache -> Reader -> progress save -> rolling window cleanup + next-chapter prefetch
```

普通阅读不应默认长期保存漫画文件。Reader cache 是临时缓存，用于高清显示、快速翻页和短期恢复；默认策略保留前一章、当前章和后一章，进入下一章时清理上上章等窗口外缓存，并在条件允许时预取新的后一章。

显式下载仍然存在，但属于高级/兼容能力：

```text
explicit download option -> local task -> native queue -> runtime authorization -> .part file -> final file -> library row
```

队列是顺序单任务。多选只创建多个普通本地任务，不调用站点 package、VIP batch 或 server-side batch。Browser development 不得伪造已完成文件、Reader cache 或清理状态。

## UI 开发规则

- macOS/Windows：桌面导航、键盘/focus、hover、文件打开和显示位置。
- iPad/Android tablet：rail/sidebar、分栏或多列布局。
- iPhone/Android phone：safe-area aware touch navigation 和紧凑控件。
- Android TV：已有实验 runtime/Leanback 入口、方向键焦点、native DPAD/OK 输入桥和 remote Back；Android TV emulator 已通过真实登录、详情、EPUB 下载、Reader、遥控器翻页和本地阅读数据删除 smoke，实体 TV 和签名发行仍需单独验证。
- Apple TV：未来方向；`check:platforms` 已检查 tvOS SDK、Apple TV simulator device type、实际 simulator device、tvOS simulator runtime、tvOS WebKit availability 和 tvOS Rust targets；本机可启动 Apple TV 模拟器，但 tvOS SDK 不提供 WebKit，不能直接复用当前 Tauri/WKWebView 壳，仍需要 TVMLKit、TVUIKit 或原生 TV UI 设计、遥控器输入、焦点导航和横屏 Reader。

Cover-aware 页面应尽量从真实封面像素取色。CSS 可以压暗和提高对比，但不能把所有作品洗成固定色板。
