# 文档目录

本目录是 kmoelite 的公开文档入口。中文文档为主，技术词保留英文原名。

- [architecture](architecture/README.md)：Tauri/React/Rust 边界、数据模型分离和临时 Reader cache 架构。
- [development](development/README.md)：开发环境、命令、测试、真实站点检查规则。
- [release](release/README.md)：源码发布、验证命令、二进制发布限制。
- [platforms](platforms/README.md)：iPhone、iPad、Android、Windows、macOS 和 TV 方向的平台状态。
- [security](security/README.md)：仓库安全、runtime 凭证、native trust boundary 和合规边界。
- [status](status/README.md)：当前公开状态、已验证项、未完成平台发布事项。
- [web-adapter](web-adapter/README.md)：Web adapter 行为、安全边界和禁止路径。
- [reader-shelf](reader-shelf/README.md)：Reader、书架、Library、临时 cache、阅读进度模型。

项目是 Alpha / 开发预览阶段的轻量非官方 KMOE 在线漫画阅读器和个人阅读管理工具，不隶属于 KMOE，也不代表 KMOE 官方。默认产品方向是在线阅读优先、临时缓存、低存储占用。

## 无上下文接手

没有历史聊天上下文的 AI 或维护者应先读根目录 [AGENTS.md](../AGENTS.md)。`AGENTS.md` 是唯一 AI 接手入口，规定必读顺序、事实源优先级、提交纪律和验证要求。

当前事实源分工：

- 当前平台状态和 release blocker：`docs/status/README.md`。
- 阶段验证日志和未跑项：根目录 `TASK_PROGRESS.md`。
- 对外更新记录：根目录 `CHANGELOG.md`。
- 公开读者入口和最近 5 次更新：根目录 `README.md`。
