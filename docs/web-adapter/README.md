# Web Adapter

Web Adapter 负责把现有 KMOE 网站页面解析成应用内部数据。项目不增加后端接口，不绕过登录、会员、配额、地区、验证、权限、反滥用或版权限制。

本文档只公开 adapter 的行为边界和安全原则，不传播站点内部下载授权接口参数。

当前默认网站入口为 `https://kxo.moe`。若未来主入口变化，必须同时更新 TypeScript 配置、Rust Web Adapter URL、Tauri CSP、safe host checks、Vitest fixtures、Playwright routes 和 live smoke 默认源站，避免浏览器预览、Tauri runtime 和验证脚本指向不同站点。

## 读取范围

允许的低频读取包括：

- 首页、目录、搜索和分类列表。
- 漫画详情页。
- 登录页和账号状态页。
- 详情页关联的动态章节数据。

这些读取用于目录、详情、书架、Library 和 Reader 准备流程。真实站点检查必须低频、脱敏、可显式关闭。

## Session 规则

登录响应本身不能作为认证成功的唯一依据。Adapter 必须在登录后验证账号状态页或等价 profile 读取，确认 session 实际生效。

Tauri live mode 使用 Rust HTTP client 和 in-memory cookie jar。Browser development 只在 native command 不可用时使用浏览器 fallback，并可能受 CORS/cookie 行为影响。

如果 native live command 可用但失败，错误应显示给用户或开发者，不应静默回退到伪造数据。

## 解析边界

Adapter 解析：

- catalog/search/category 列表。
- detail metadata，例如标题、别名、封面、作者、状态、地区、语言、分类、热度、配额提示。
- chapter/volume metadata。
- related comic cards。
- account/profile summary。

Parser 应保守处理 XHTML、inline JavaScript、转义字符串和字段顺序变化。未知字段可以忽略，但不能把解析失败包装成成功空数据来覆盖真实状态。

## 下载安全边界

下载相关能力只允许单项普通任务：

- Detail 或 Reader recovery 创建一个本地队列任务。
- Native queue 在 runtime 阶段请求一次授权。
- 下载先写 `.part`，完成校验后再写最终文件和 Library row。
- Reader-capable 格式可准备 Reader cache；MOBI 仍然是 file-only。

禁止公开或实现：

- package / whole-comic download。
- VIP batch。
- server-side batch。
- 多 volume 合并授权。
- upload/admin/maintenance。
- 元数据编辑、评论删除、账号删除等破坏性操作。
- 持久化授权 URL、Cookie、Session 或真实下载链接。

Rust 下载路径必须拒绝危险 URL、非可信 host、URL credentials、本地/private/link-local host、路径穿越和不受信任文件名。

## Live verification

`pnpm verify:real-site-smoke` 只在设置 runtime 凭证时运行。脚本应使用 in-memory cookie jar、browser-compatible user agent、低频请求、脱敏失败输出，并避开下载授权、package、batch、VIP batch、upload/admin 和破坏性路径。

真实下载验证必须通过显式确认变量开启，且只处理允许的普通单项任务。它可能消耗账号配额，因此不能作为默认 CI 或普通测试运行。

## 风险

- 网站 XHTML 和 inline JavaScript 可能变化。
- 动态章节数据可能需要有效 session。
- Cookie/session 是 runtime-only。
- Browser fetch 可能受 CORS 限制；Tauri HTTP commands 是主要路径。
- 下载授权可能影响账号配额，必须保持手动、单项、低频和脱敏。
