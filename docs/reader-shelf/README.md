# Reader、书架和临时缓存

本文档记录 Reader、书架、Library、阅读进度和 Reader cache 的公开工程模型。当前产品方向是轻量在线阅读，Reader cache 默认是临时缓存，不是长期收藏库。

## 当前能力

- 路由包括 Home、Shelf、Search、Categories、Login、Detail、Download Center、Library、Account、Settings 和 `/reader/cache/:chapterCacheId`。
- 前端 store 分离管理 shelf、reading progress/history、cache policy、download queue 和 library state。
- Rust/SQLite schema 覆盖 shelves、shelf_items、reading_progress、reading_history、chapter_cache、page_cache 和 cache_policy。
- Rust native reader commands 负责 ZIP/CBZ/EPUB 检查、cache 准备、cache 修复、安全读取缓存页、统计和清理。
- Reader 支持 cached pages、zoom/pan、目录、缩略图、章节导航、连续模式、RTL/LTR、单页/双页/自动双页、旋转、裁切和快捷键。
- Detail、Shelf 和 Continue Reading 应优先进入临时 Reader cache flow；Library 和显式下载属于高级/兼容路径。

## 必须保持的产品原则

- 普通阅读目标是点开一本读一本，不默认长期保存漫画文件。
- Reader cache 应服务高清阅读、快速翻页和短期恢复；读完、切换章节或达到存储策略限制后应清理。
- 书架、永久下载、Library、Reader cache、阅读进度、阅读历史和下载队列是不同概念。
- 清理 Reader cache 不能删除永久下载、书架记录、阅读进度、阅读历史或下载任务。
- Multi-select download 只创建多个本地单项队列任务，不能调用 package、VIP batch 或 server-side batch。
- Missing/corrupt cache 应提供从可信本地 archive 修复、单项重新获取或返回 Detail/Library 的恢复路径。
- MOBI 只能作为文件打开，除非实现真实 parser。

## 数据模型

Shelf：

- `ShelfCategory`：分类名称、排序、归档状态。
- `ShelfItem`：漫画 metadata、分类、缓存/下载/归档状态、阅读进度快照。
- 多分类语义必须保留；批量分类操作应明确 add、replace、remove。

Reading：

- `ReadingProgress`：comicId、volumeId、pageIndex、pageCount、readingMode、direction、layout、zoom、crop、rotation 和 per-volume spread overrides。
- `ReadingHistoryEntry`：open、page_change、finish、mark_read、mark_unread、restart 等事件。
- 新 volume/chapter 可继承同一 comic 的阅读偏好，但不能继承旧章节页码。

Cache：

- `ChapterCacheRecord`：reading_cache、metadata_cache 或 permanent_download。
- `PageCacheRecord`：单页缓存 metadata/path。
- `CachePolicy`：space_saver、balanced、comfort。
- 普通在线阅读应优先使用 `reading_cache`，并按策略清理。

Download：

- `DownloadTask`：一个漫画卷/章节的显式单项下载任务。
- `DownloadedFile`：永久本地文件记录，不等同于 Reader cache。
- 永久下载必须有明确用户意图。

## Reader UI

iPhone / Android phone：

- 触控优先、safe-area aware、底部导航不遮挡内容。
- Reader 默认突出漫画图片，chrome 轻量显示。
- 缓存策略默认偏节省空间。

iPad / Android tablet：

- 使用 sidebar/rail 和分栏布局。
- 横屏优先支持目录/缩略图侧栏。
- 在高清阅读和缓存占用之间保持可解释策略。

macOS / Windows：

- 保留桌面高密度导航、键盘/focus、hover、文件打开和显示位置。
- 窄桌面窗口仍然按桌面运行时契约处理，不退化成手机壳。

TV future：

- Apple TV 和 Android TV 需要单独设计遥控器输入、焦点导航、横屏布局和缓存策略，不能直接复用手机 UI。

## Native 边界

TypeScript 负责 UI、路由、手势、快捷键、store merge 和 recovery 决策。Rust 负责 SQLite、网站 HTTP、顺序下载队列、archive 检查/解压、Reader cache root enforcement、文件系统安全和 open/reveal/share。

公共 Reader cache commands 必须校验 app-owned ReadingCache root，不能把任意本地路径暴露给 WebView。

## 许可证和外部参考

可以参考 Mihon/Tachiyomi、YACReader、OpenComic、Panels、Chunky 等产品的交互思路，但不能复制不兼容许可证代码。引入外部源码前必须记录来源、版本、许可证、复制文件、修改内容和移除计划。
