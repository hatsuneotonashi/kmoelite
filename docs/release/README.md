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
- simulator validation。
- signed physical-device validation。
- App Store policy review，尤其是 download/cache 行为。

Android phone/tablet：

- Android runtime 和打包配置。
- 真机安装、网络、生命周期、缓存清理和文件访问验证。
- Android 平板布局验证。

Apple TV / Android TV：

- 当前仅为未来研究方向。
- 需要先完成遥控器输入、焦点导航、横屏 Reader、缓存策略和平台分发可行性设计。

## 安全规则

发布产物、docs、manifest、logs 和 screenshots 都不能包含凭证、Cookie、Session、Token、授权 URL、真实下载文件、runtime DB 或本机私有路径。
