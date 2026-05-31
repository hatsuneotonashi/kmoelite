# 安全政策

Kmoe Client 是 Alpha / 开发预览阶段的非官方项目。请不要在公开 issue、PR、日志、截图或文档中提交账号、密码、Cookie、Session、Token、授权 URL、runtime 数据库、本地下载文件或本机私有路径。

## 报告安全问题

如果 GitHub private vulnerability reporting 已启用，请使用仓库的私有安全报告入口。若该入口不可用，请只创建一个最小公开 issue，说明“需要私下报告安全问题”，不要公开复现细节、漏洞利用步骤、凭证、Cookie、Token 或私有 URL。

## 不能提交的内容

- 账号邮箱、密码或验证码。
- Cookie、Session header、Token、API key。
- 临时授权 URL 或下载授权响应。
- runtime SQLite 数据库。
- 本地下载文件、漫画文件、封面缓存或临时 Reader cache。
- `.env.local`、`.env.*` 等本机环境文件。
- 构建产物、安装包、临时报告、日志和本机绝对路径。

## Runtime 凭证规则

真实站点 smoke 和真实下载验证只能从显式环境变量读取凭证，例如 `KMOE_SMOKE_EMAIL`、`KMOE_SMOKE_PASSWORD`、`KMOE_VERIFY_EMAIL`、`KMOE_VERIFY_PASSWORD`。

应用在用户显式启用“记住登录”时，只能把站点 session cookie header 存在 app-private runtime settings 中；登出或非记住登录成功后必须清除。该值不能导出、打印、写进文档、提交到仓库或进入迁移快照。

## 支持的安全边界

Tauri/Rust 负责文件系统校验、SQLite、archive 检查和解压限制、临时 Reader cache、本地下载写入、文件打开/显示位置、网站 HTTP 和 Reader cache root enforcement。React UI 应通过 typed native command boundary 调用这些能力，不应直接信任任意本地路径或远程 URL。

Reader 页面读取必须限制在 app-owned ReadingCache root 内。Archive 解压必须在写入缓存页之前执行页数、单页大小和总解压大小限制。

## 合规边界

项目保留真实站点集成能力，但不应被用于绕过登录、会员、配额、地区、验证、反滥用或版权限制。真实下载验证必须是显式、单项、低频、脱敏的流程，不允许自动化 upload、admin、package、VIP batch、元数据修改、评论删除、账号删除或其他破坏性站点路径。

## 当前发布限制

当前仓库只准备源码公开。公开二进制发布仍需 macOS 签名/公证、Windows 安装包真机验证、iPhone/iPad 签名真机验证，以及平台政策审查。详见 [docs/status](docs/status/README.md)。
