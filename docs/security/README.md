# 安全

本页记录公开仓库和 runtime 的安全边界。项目是 Alpha / 开发预览阶段的非官方 KMOE 在线漫画阅读器和个人阅读管理工具，不代表 KMOE 官方。

## 仓库安全

以下内容不得提交：

- 凭证、账号、密码。
- Cookie、Session、Token、API key。
- 临时授权 URL 或下载授权响应。
- runtime SQLite 数据库。
- 本地下载文件、漫画文件、封面缓存、临时 Reader cache。
- 本机私有路径。
- `.env.local` 或其他本地环境文件。
- 构建、打包、缓存、报告输出。

`.gitignore` 已覆盖 `.env.*`、`node_modules/`、`dist/`、`target/`、`test-results/`、runtime DB、partial downloads、cookie/session/auth state files、本地下载目录和 generated Apple build outputs。

## Runtime 凭证

真实站点检查只能从显式 runtime 变量读取凭证：

- `KMOE_SMOKE_EMAIL`
- `KMOE_SMOKE_PASSWORD`
- `KMOE_VERIFY_EMAIL`
- `KMOE_VERIFY_PASSWORD`

应用在用户显式启用 remembered login 时，可以把站点 session cookie header 存在 app-private runtime settings 中。登出或非 remembered login 成功后必须清除。该值不得记录、导出、写入文档或提交。

## Native trust boundary

Tauri/Rust 负责：

- website HTTP 和 cookie jar。
- SQLite persistence。
- filesystem validation。
- archive inspection 和 extraction limits。
- temporary Reader cache、download writes 和 `.part` cleanup。
- file open/reveal/share actions。
- Reader cache root enforcement。

Frontend 代码应调用 typed native commands，不应直接信任任意路径、URL 或本地文件。

## Live download safety

真实下载验证必须是显式、单项、低频、脱敏的流程。它只能处理开发者明确确认的普通队列项，并且可能消耗账号配额。

禁止自动化或暴露：

- upload/admin/maintenance 路径。
- package download。
- VIP batch。
- 元数据修改。
- 评论删除。
- 账号删除。
- 绕过登录、会员、配额、地区、验证、反滥用或版权限制的行为。

## Dependabot 和 security alerts

公开 GitHub 仓库应启用 GitHub security alerts。仓库已提供 npm/cargo 的 Dependabot 配置。依赖升级应先跑默认 fixture tests，再根据影响范围跑平台和 Reader 检查。
