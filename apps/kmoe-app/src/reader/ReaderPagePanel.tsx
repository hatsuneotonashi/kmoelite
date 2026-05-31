import { X } from 'lucide-react'
import type { NativeReaderCachedPageImage } from '../platform/nativeCommands'
import type { ChapterCacheRecord, PageCacheRecord } from '../types/cache'

export function ReaderPagePanel({
  id,
  title,
  pages,
  pageImages,
  pageIndex,
  progress,
  chapters,
  currentChapterId,
  onClose,
  onScrimClick,
  onSelectChapter,
  onSelectPage
}: {
  id: string
  title: string
  pages: PageCacheRecord[]
  pageImages: Record<number, NativeReaderCachedPageImage>
  pageIndex: number
  progress: number
  chapters: ChapterCacheRecord[]
  currentChapterId?: string
  onClose: () => void
  onScrimClick: () => void
  onSelectChapter: (chapter: ChapterCacheRecord) => void
  onSelectPage: (pageIndex: number) => void
}) {
  return (
    <div className="reader-panel-layer" data-reader-interactive="true">
      <button className="reader-panel-scrim" type="button" aria-label="关闭目录" onClick={onScrimClick} />
      <aside id={id} className="reader-side-panel" aria-label="目录和页面缩略图">
        <div className="reader-panel-header">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">Pages</p>
            <h2 className="mt-1 truncate text-base font-semibold text-white">{title}</h2>
            <p className="mt-1 text-xs text-white/58">
              当前第 {pageIndex + 1} 页 · {Math.round(progress)}%
            </p>
          </div>
          <button className="reader-panel-close" type="button" aria-label="关闭目录" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="reader-panel-progress" aria-hidden="true">
          <span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>

        <div className="reader-directory-scroll">
          <section className="reader-chapter-section" aria-label="章节列表">
            <div className="reader-directory-heading">
              <span>Chapters</span>
              <strong>{chapters.length} 章本地缓存</strong>
            </div>
            {chapters.length > 0 ? (
              <div className="reader-chapter-list">
                {chapters.map((item) => {
                  const current = item.id === currentChapterId
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="reader-chapter-card"
                      data-current={current ? 'true' : undefined}
                      aria-current={current ? 'page' : undefined}
                      aria-label={`打开章节 ${item.volumeTitle}`}
                      onClick={() => onSelectChapter(item)}
                    >
                      <span>
                        <strong>{item.volumeTitle}</strong>
                        <small>{item.status === 'ready' ? '已准备阅读缓存' : cacheStatusLabel(item.status)}</small>
                      </span>
                      <em>{item.pageCount ?? 0} 页</em>
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="reader-directory-empty">当前漫画还没有其它本地章节缓存。</p>
            )}
          </section>

          <section className="reader-page-section" aria-label="页面列表">
            <div className="reader-directory-heading">
              <span>Pages</span>
              <strong>{pages.length} 页</strong>
            </div>
            <div className="reader-thumbnail-grid" aria-label="页面缩略图列表">
              {pages.map((page) => {
                const image = pageImages[page.pageIndex]
                const current = page.pageIndex === pageIndex
                return (
                  <button
                    key={page.id}
                    type="button"
                    className="reader-thumbnail-card"
                    data-current={current ? 'true' : undefined}
                    aria-current={current ? 'page' : undefined}
                    aria-label={`跳到第 ${page.pageIndex + 1} 页`}
                    onClick={() => onSelectPage(page.pageIndex)}
                  >
                    <span className="reader-thumbnail-frame">
                      {image ? (
                        <img src={image.dataUrl} alt="" loading="lazy" />
                      ) : (
                        <span className="reader-thumbnail-page-number">
                          第 {page.pageIndex + 1} 页
                        </span>
                      )}
                    </span>
                    <span className="reader-thumbnail-meta">
                      <span>第 {page.pageIndex + 1} 页</span>
                      <span>{formatBytes(page.sizeBytes)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        </div>
      </aside>
    </div>
  )
}

function formatBytes(value?: number): string {
  if (!value || value <= 0) return '大小未知'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function cacheStatusLabel(status: ChapterCacheRecord['status']): string {
  if (status === 'preparing') return '正在准备'
  if (status === 'failed') return '缓存失败'
  if (status === 'evicting') return '正在清理'
  if (status === 'missing') return '缓存缺失'
  return '已准备阅读缓存'
}
