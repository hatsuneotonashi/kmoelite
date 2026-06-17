# 发布

当前目标是公开源码仓库，不是公开安装包。项目仍处于 Alpha / 开发预览阶段；公开二进制发布还需要平台签名、公证、真机或真系统验证。

## 源码发布

建议使用 fresh public repository，不公开旧私有 Git 历史：

```bash
git init --initial-branch=main
git add -A
git commit -m "chore: publish initial public source"
git remote add origin <public-repository-url>
git push -u origin main
```

只上传干净 Git tree。不要上传旧 `.git`、workspace 压缩包、local cache、runtime DB、构建产物、临时截图、真实下载文件、凭证、Cookie、Session、Token、授权 URL 或本机私有路径。

## GitHub 更新说明写法

每次准备公开 push 或 GitHub Release 前，更新内容按用途分开写：

- `CHANGELOG.md`：面向用户和外部贡献者的变化摘要，写功能、修复、文档和安全边界，不写内部验收过程。
- `TASK_PROGRESS.md`：本地阶段性验证记录和仍未完成的 release blocker，只写脱敏命令结果。
- `README.md`：只保留最近 5 次公开更新摘要，并链接到 `CHANGELOG.md`、`TASK_PROGRESS.md` 和平台状态文档。
- PR description / GitHub release notes：复用 `CHANGELOG.md` 的用户可读摘要，再补充验证命令和剩余限制。

## 提交前记录纪律

- 每次提交都必须更新 `TASK_PROGRESS.md`，记录变更范围、实际运行命令、未运行命令、风险和 release blocker。
- 用户可见或贡献者可理解的变化必须更新 `CHANGELOG.md`。
- 公开入口变化才更新 `README.md` 的最近 5 次更新，并保持最多 5 条。
- 长期规则、架构不变量、安全边界、AI 接手流程或提交纪律变化必须更新 `AGENTS.md`。
- 提交信息使用 `feat:`、`fix:`、`docs:`、`test:`、`chore:` 等 conventional prefix。

## 默认提交前 gate

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

涉及路由、布局、Reader、accessibility、视觉基线或浏览器可见工作流时，再运行：

```bash
pnpm --dir apps/kmoe-app e2e
```

无法运行的命令不能记为通过；必须在 `TASK_PROGRESS.md` 写明原因和风险。

本次滚动缓存更新建议使用：

```md
Summary:
- Added the default rolling Reader cache window: previous chapter, current chapter, and next chapter.
- Reader cleanup now removes cache entries outside that rolling window as the active chapter advances.
- Next-chapter prefetch is controlled by the cache policy's next-chapter window, while permanent downloads, shelf records, reading progress, history, and download tasks remain protected.
- Updated Settings and public docs to describe the low-storage online reading behavior accurately.

Validation:
- pnpm --dir apps/kmoe-app typecheck
- pnpm --dir apps/kmoe-app test:run
- pnpm --dir apps/kmoe-app build
- cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check
- cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml
- cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib
- pnpm check:platforms
- node scripts/check-ios-assets.mjs
- pnpm --dir apps/kmoe-app e2e
```

## 上传前清理检查

```bash
find . -name .git -print
find . \( -name '.env*' -o -name node_modules -o -name dist -o -name target -o -name test-results -o -name '*.sqlite*' -o -name '*.db' -o -name '*cookie*' -o -name '*session*' \) -print
```

以上命令在最终发布目录中应无输出。

## 本地 release gate

```bash
pnpm verify:release
```

该 gate 包含敏感文件扫描、开发残留扫描、平台 readiness self-test、release manifest self-test、Vitest、TypeScript typecheck、production build、iOS asset check、Rust fmt/check/test、Playwright 和可选 debug app build。

常用跳过项：

```bash
KMOE_SKIP_E2E=1
KMOE_SKIP_TAURI_BUNDLE=1
KMOE_SKIP_DMG=1
```

## 必跑源码检查

```bash
pnpm typecheck
pnpm test:run
pnpm build
cargo fmt --all --manifest-path apps/kmoe-app/src-tauri/Cargo.toml -- --check
cargo check --manifest-path apps/kmoe-app/src-tauri/Cargo.toml
cargo test --manifest-path apps/kmoe-app/src-tauri/Cargo.toml --lib
pnpm check:platforms
node scripts/check-ios-assets.mjs
```

涉及 Reader、路由、布局、视觉基线或 accessibility 时再跑 `pnpm e2e`。

## Release manifest

```bash
pnpm manifest:release -- --profile debug --require-artifacts
```

manifest 记录 artifact metadata 和 SHA-256 digest。它不得包含凭证、Cookie、Session、Token、授权 URL、runtime 私有路径或本地下载。

## 二进制发布限制

macOS：

- Apple Developer signing identity。
- hardened runtime review。
- notarization。
- stapling。
- clean-machine install/open verification。

Windows：

- 真机安装/卸载验证。
- open file 和 reveal folder 验证。
- code-signing certificate。
- SmartScreen 策略。

iPhone/iPad：

- 完整 Xcode 环境。
- Apple Developer account。
- bundle identifiers。
- provisioning profiles。
- simulator packaged debug app install/launch/render smoke 已在 iPhone 17 和 iPad Air 13-inch 模拟器通过。
- signed physical-device validation。
- App Store policy review，尤其是 download/cache 行为。

Android phone/tablet：

- Android runtime 源码和 debug APK/AAB 构建路径已经存在。
- 真机安装、网络、生命周期、下载、Reader、缓存清理和文件访问验证。
- Android 平板模拟器/真机布局验证。
- 签名 release、Play 分发和 TV 分发策略。

Android TV：

- Leanback launcher、TV runtime 识别、方向键焦点、Remote Back 和 native DPAD/OK 输入桥已有实验 smoke。
- 真实登录、详情、EPUB 下载、Reader、遥控器翻页和本地阅读数据删除已在 Android TV 模拟器验证。
- 实体 TV、文件导出/分享、签名 release 和 TV 分发验证仍未完成。

Apple TV：

- 当前仅为未来研究方向。
- `check:platforms` 已覆盖 tvOS SDK、Apple TV simulator device type、实际 simulator device、tvOS simulator runtime 和 tvOS Rust targets。
- 本机已可启动 Apple TV 4K 1080p 模拟器；当前仍缺可运行 tvOS/WKWebView 壳验证。
- 需要先完成遥控器输入、焦点导航、横屏 Reader、缓存策略和平台分发可行性设计。

## 安全规则

发布产物、docs、manifest、logs 和 screenshots 都不能包含凭证、Cookie、Session、Token、授权 URL、真实下载文件、runtime DB 或本机私有路径。
