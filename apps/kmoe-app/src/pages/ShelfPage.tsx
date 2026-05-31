import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Archive,
  BookMarked,
  CheckSquare,
  Clock3,
  FolderPlus,
  LibraryBig,
  RotateCcw,
  Search,
  Trash2
} from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { CoverImage } from '../components/CoverImage'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/layout/PageHeader'
import { ProgressBar } from '../components/ProgressBar'
import { readableAppMessage } from '../lib/format'
import { clearNativeReadingCache } from '../platform/nativeCommands'
import { resolveContinueReadingTarget } from '../reading/continueTarget'
import { useCacheStore } from '../store/cacheStore'
import { useReadingStore } from '../store/readingStore'
import { queryShelfItems, useShelfStore } from '../store/shelfStore'
import type { ShelfBatchAction, ShelfItem, ShelfQuery, ShelfSortKey } from '../types/shelf'

type ShelfFilter = 'all' | 'updates' | 'unfinished' | 'completed' | 'series_completed' | 'cached' | 'downloaded' | 'archived'

const filterOptions: Array<{ id: ShelfFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'updates', label: '有更新' },
  { id: 'unfinished', label: '未读完' },
  { id: 'completed', label: '已读完' },
  { id: 'series_completed', label: '已完结' },
  { id: 'cached', label: '已缓存' },
  { id: 'downloaded', label: '已下载' },
  { id: 'archived', label: '已归档' }
]

const sortOptions: Array<{ value: ShelfSortKey; label: string }> = [
  { value: 'recent_read', label: '最近阅读' },
  { value: 'recent_update', label: '最近更新' },
  { value: 'added_at', label: '加入时间' },
  { value: 'title', label: '标题' },
  { value: 'reading_progress', label: '阅读进度' },
  { value: 'unread_count', label: '未读更新' }
]

export function ShelfPage() {
  const itemsByComicId = useShelfStore((state) => state.itemsByComicId)
  const categories = useShelfStore((state) => state.categories)
  const createCategory = useShelfStore((state) => state.createCategory)
  const batchUpdate = useShelfStore((state) => state.batchUpdate)
  const removeFromShelf = useShelfStore((state) => state.removeFromShelf)
  const markProgressRead = useReadingStore((state) => state.markRead)
  const markProgressUnread = useReadingStore((state) => state.markUnread)
  const chaptersById = useCacheStore((state) => state.chaptersById)
  const clearLocalReadingCache = useCacheStore((state) => state.clearReadingCache)
  const [keyword, setKeyword] = useState('')
  const [filter, setFilter] = useState<ShelfFilter>('all')
  const [sortBy, setSortBy] = useState<ShelfSortKey>('recent_read')
  const [categoryId, setCategoryId] = useState('')
  const [batchCategoryId, setBatchCategoryId] = useState('')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [selectedComicIds, setSelectedComicIds] = useState<string[]>([])
  const [cacheMessage, setCacheMessage] = useState('')

  const items = useMemo(() => Object.values(itemsByComicId), [itemsByComicId])
  const cachedChapters = useMemo(() => Object.values(chaptersById), [chaptersById])
  const query = useMemo<ShelfQuery>(() => ({
    keyword,
    categoryId: categoryId || undefined,
    sortBy,
    sortDirection: sortBy === 'title' ? 'asc' : 'desc',
    includeArchived: filter === 'archived',
    filters: {
      hasUpdates: filter === 'updates' || undefined,
      unfinished: filter === 'unfinished' || undefined,
      completed: filter === 'completed' || undefined,
      seriesCompleted: filter === 'series_completed' || undefined,
      cached: filter === 'cached' || undefined,
      downloaded: filter === 'downloaded' || undefined,
      archived: filter === 'archived' ? true : undefined
    }
  }), [categoryId, filter, keyword, sortBy])

  const filteredItems = useMemo(() => queryShelfItems(items, query), [items, query])
  const continueReading = useMemo(() => items
    .filter((item) => item.readingProgress && !item.readingProgress.finished && !item.archived)
    .sort((left, right) => (right.lastReadAt ?? '').localeCompare(left.lastReadAt ?? ''))
    .slice(0, 8), [items])
  const updated = useMemo(() => items
    .filter((item) => hasUpdates(item) && !item.archived)
    .sort((left, right) => (right.latestUpdatedAt ?? '').localeCompare(left.latestUpdatedAt ?? ''))
    .slice(0, 8), [items])

  const selectedSet = useMemo(() => new Set(selectedComicIds), [selectedComicIds])
  const selectedReadingCacheIds = useMemo(() => cachedChapters
    .filter((chapter) => selectedSet.has(chapter.comicId) && chapter.cacheKind === 'reading_cache')
    .map((chapter) => chapter.id), [cachedChapters, selectedSet])
  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every((item) => selectedSet.has(item.comicId))
  const unreadCount = items.reduce((total, item) => total + item.unreadCount, 0)
  const cachedCount = items.filter((item) => item.cached).length
  const activeBatchCategoryId = batchCategoryId || categories[0]?.id || ''

  function toggleSelected(comicId: string) {
    setSelectedComicIds((current) => current.includes(comicId) ? current.filter((id) => id !== comicId) : [...current, comicId])
  }

  function toggleAllFiltered() {
    setSelectedComicIds(allFilteredSelected ? [] : filteredItems.map((item) => item.comicId))
  }

  function runBatchForComics(comicIds: string[], action: Parameters<typeof batchUpdate>[1]) {
    if (comicIds.length === 0) return
    syncReadingStoreForShelfAction(comicIds, action)
    batchUpdate(comicIds, action)
  }

  function runSelectedBatch(action: Parameters<typeof batchUpdate>[1]) {
    if (selectedComicIds.length === 0) return
    runBatchForComics(selectedComicIds, action)
    setSelectedComicIds([])
  }

  function markAllFilteredRead() {
    const comicIds = filteredItems.map((item) => item.comicId)
    if (comicIds.length === 0) return
    runBatchForComics(comicIds, { type: 'mark_read' })
    setSelectedComicIds([])
  }

  function syncReadingStoreForShelfAction(comicIds: string[], action: Parameters<typeof batchUpdate>[1]) {
    if (action.type !== 'mark_read' && action.type !== 'mark_unread') return
    for (const comicId of comicIds) {
      const progress = itemsByComicId[comicId]?.readingProgress
      if (!progress) continue
      if (action.type === 'mark_read') markProgressRead(comicId, progress.volumeId)
      if (action.type === 'mark_unread') markProgressUnread(comicId, progress.volumeId)
    }
  }

  function removeSelected() {
    if (selectedComicIds.length === 0) return
    removeFromShelf(selectedComicIds)
    setSelectedComicIds([])
  }

  function createNewCategory() {
    const name = newCategoryName.trim()
    if (!name) return
    const category = createCategory(name)
    setCategoryId(category.id)
    setBatchCategoryId(category.id)
    setNewCategoryName('')
  }

  function runSelectedCategoryMove(mode: 'replace' | 'add' | 'remove') {
    if (!activeBatchCategoryId || selectedComicIds.length === 0) return
    runSelectedBatch({ type: 'move_categories', categoryIds: [activeBatchCategoryId], mode })
  }

  async function clearSelectedReadingCache() {
    const chapterIds = [...selectedReadingCacheIds]
    if (chapterIds.length === 0) {
      setCacheMessage('所选漫画没有可清理的阅读缓存。永久下载、书架和阅读记录不受影响。')
      return
    }

    const result = await clearNativeReadingCache(chapterIds)
    if (result.ok || !result.available) {
      clearLocalReadingCache(chapterIds)
      syncShelfCacheFlagsAfterClear(selectedComicIds)
      setCacheMessage(`已清理 ${chapterIds.length} 个${result.ok ? '本机' : '浏览器预览'}阅读缓存。永久下载、书架和阅读记录不受影响。`)
      return
    }

    setCacheMessage(readableAppMessage(result.message, '暂时无法清理阅读缓存，请稍后重试。'))
  }

  function syncShelfCacheFlagsAfterClear(comicIds: string[]) {
    const remainingReadingCacheComicIds = new Set(Object.values(useCacheStore.getState().chaptersById)
      .filter((chapter) => chapter.cacheKind === 'reading_cache')
      .map((chapter) => chapter.comicId))
    const readingCacheOnlyComicIds = comicIds.filter((comicId) => {
      const item = itemsByComicId[comicId]
      return item?.cacheStatus === 'reading_cache' && !remainingReadingCacheComicIds.has(comicId)
    })
    if (readingCacheOnlyComicIds.length > 0) {
      batchUpdate(readingCacheOnlyComicIds, { type: 'set_cached', cached: false, cacheStatus: 'none' })
    }
  }

  return (
    <div className="content-grid">
      <PageHeader
        title="书架"
        description="本地优先的阅读工作台。收藏、阅读进度、缓存状态和下载记录保持分离，后续登录同步不会覆盖本机记录。"
      />

      <section className="shelf-metrics-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ShelfMetric icon={<LibraryBig className="h-4 w-4" />} label="收藏" value={`${items.length}`} />
        <ShelfMetric icon={<Clock3 className="h-4 w-4" />} label="继续阅读" value={`${continueReading.length}`} />
        <ShelfMetric icon={<BookMarked className="h-4 w-4" />} label="未读更新" value={`${unreadCount}`} />
        <ShelfMetric icon={<Archive className="h-4 w-4" />} label="已缓存" value={`${cachedCount}`} />
      </section>

      <section className="shelf-toolbar glass-toolbar grid gap-3 p-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
        <label className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-muted)]" />
          <input
            aria-label="搜索书架标题、作者、卷话"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            className="liquid-input h-12 w-full rounded-full pl-11 pr-4 outline-none phone-touch-target"
          />
        </label>
        <select className="liquid-input h-12 rounded-full px-4 text-sm font-semibold outline-none" value={sortBy} onChange={(event) => setSortBy(event.target.value as ShelfSortKey)}>
          {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <Button onClick={toggleAllFiltered} disabled={filteredItems.length === 0}>
          <CheckSquare className="h-4 w-4" />
          {allFilteredSelected ? '取消选择' : '选择当前'}
        </Button>
        <Button onClick={markAllFilteredRead} disabled={filteredItems.length === 0}>
          全部标为已读
        </Button>
      </section>

      <section className="grid gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {filterOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className="liquid-chip shrink-0"
              data-selected={filter === option.id}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="glass-panel grid gap-3 rounded-[var(--radius-panel)] p-3 md:grid-cols-[1fr_auto] md:items-center">
          <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0">
            <button type="button" className="liquid-chip shrink-0" data-selected={!categoryId} onClick={() => setCategoryId('')}>全部分类</button>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className="liquid-chip shrink-0"
                data-selected={categoryId === category.id}
                onClick={() => setCategoryId(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              aria-label="新分类名称"
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              className="liquid-input h-11 min-w-0 rounded-full px-4 text-sm outline-none"
            />
            <Button onClick={createNewCategory} disabled={!newCategoryName.trim()}>
              <FolderPlus className="h-4 w-4" />
              新建
            </Button>
          </div>
        </div>
      </section>

      {selectedComicIds.length > 0 ? (
        <section className="glass-panel sticky top-3 z-10 flex flex-wrap items-center gap-2 rounded-[var(--radius-panel)] p-3">
          <Badge tone="info">已选 {selectedComicIds.length} 项</Badge>
          <Button onClick={() => runSelectedBatch({ type: 'mark_read' })}>标为已读</Button>
          <Button onClick={() => runSelectedBatch({ type: 'mark_unread' })}>标为未读</Button>
          <Button onClick={() => runSelectedBatch({ type: 'set_cached', cached: true, cacheStatus: 'reading_cache' })}>标记已缓存</Button>
          <Button onClick={() => void clearSelectedReadingCache()} disabled={selectedReadingCacheIds.length === 0}>
            <Trash2 className="h-4 w-4" />
            删除阅读缓存 {selectedReadingCacheIds.length}
          </Button>
          <Button onClick={() => runSelectedBatch({ type: 'archive', archived: true })}>归档</Button>
          {categories.length > 0 ? (
            <>
              <select
                aria-label="批量分类"
                className="liquid-input h-10 rounded-full px-3 text-sm font-semibold outline-none"
                value={activeBatchCategoryId}
                onChange={(event) => setBatchCategoryId(event.target.value)}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
              <Button onClick={() => runSelectedCategoryMove('add')}>加入分类</Button>
              <Button onClick={() => runSelectedCategoryMove('replace')}>移动分类</Button>
              <Button onClick={() => runSelectedCategoryMove('remove')}>移出分类</Button>
            </>
          ) : (
            <Badge>先新建分类</Badge>
          )}
          <Button variant="danger" onClick={removeSelected}>
            <Trash2 className="h-4 w-4" />
            移出书架
          </Button>
          {cacheMessage ? <Badge tone="info">{cacheMessage}</Badge> : null}
        </section>
      ) : null}

      {items.length === 0 ? (
        <EmptyState title="书架还没有内容">
          <div className="grid gap-3">
            <p>在首页、搜索结果或详情页点击书签按钮，就可以把漫画加入本地书架。</p>
            <Link to="/search" className="mx-auto">
              <Button variant="primary">去搜索漫画</Button>
            </Link>
          </div>
        </EmptyState>
      ) : null}

      {continueReading.length > 0 ? (
        <ShelfSection title="继续阅读" description="按最近阅读时间排序；有本地阅读缓存时会直接进入 Reader。">
          {continueReading.map((item) => (
            <ShelfItemCard key={item.comicId} item={item} selected={selectedSet.has(item.comicId)} cachedChapters={cachedChapters} onSelect={() => toggleSelected(item.comicId)} onRemove={() => removeFromShelf([item.comicId])} onBatch={runBatchForComics} compact />
          ))}
        </ShelfSection>
      ) : null}

      {updated.length > 0 ? (
        <ShelfSection title="有更新" description="来自本地记录的未读数或最近更新时间，后续可接入网站收藏同步。">
          {updated.map((item) => (
            <ShelfItemCard key={item.comicId} item={item} selected={selectedSet.has(item.comicId)} cachedChapters={cachedChapters} onSelect={() => toggleSelected(item.comicId)} onRemove={() => removeFromShelf([item.comicId])} onBatch={runBatchForComics} compact />
          ))}
        </ShelfSection>
      ) : null}

      {items.length > 0 ? (
        <section className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">全部收藏</h2>
              <p className="mt-1 text-sm text-[var(--app-muted)]">当前显示 {filteredItems.length} / {items.length} 本。</p>
            </div>
            {filteredItems.length === 0 ? <Badge tone="warning">没有匹配项</Badge> : null}
          </div>
          {filteredItems.length === 0 ? <EmptyState title="没有匹配的书架项目">调整搜索词、分类或筛选条件。</EmptyState> : null}
          <div className="grid gap-3 xl:grid-cols-2">
            {filteredItems.map((item) => (
              <ShelfItemCard key={item.comicId} item={item} selected={selectedSet.has(item.comicId)} cachedChapters={cachedChapters} onSelect={() => toggleSelected(item.comicId)} onRemove={() => removeFromShelf([item.comicId])} onBatch={runBatchForComics} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function ShelfMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="shelf-metric metric-tile flex items-center gap-3 p-4">
      <div className="shelf-metric-icon grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[var(--app-glass-strong)] text-[var(--app-fg)] shadow-[var(--app-glow)]">{icon}</div>
      <div>
        <div className="shelf-metric-label text-xs font-semibold text-[var(--app-muted)]">{label}</div>
        <div className="shelf-metric-value mt-0.5 text-2xl font-bold leading-none">{value}</div>
      </div>
    </div>
  )
}

function ShelfSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="mt-1 text-sm text-[var(--app-muted)]">{description}</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {children}
      </div>
    </section>
  )
}

function ShelfItemCard({
  item,
  selected,
  cachedChapters,
  onSelect,
  onRemove,
  onBatch,
  compact = false
}: {
  item: ShelfItem
  selected: boolean
  cachedChapters: Parameters<typeof resolveContinueReadingTarget>[1]
  onSelect: () => void
  onRemove: () => void
  onBatch: (comicIds: string[], action: ShelfBatchAction) => void
  compact?: boolean
}) {
  const progress = item.readingProgress?.progressPercent ?? 0
  const primaryTarget = item.readingProgress ? resolveContinueReadingTarget(item.readingProgress, cachedChapters) : `/comic/${encodeURIComponent(item.comicId)}`
  const progressLabel = item.readingProgress
    ? `读到 ${item.readingProgress.volumeTitle} · 第 ${item.readingProgress.pageIndex + 1}${item.readingProgress.pageCount ? ` / ${item.readingProgress.pageCount}` : ''} 页`
    : '尚未开始阅读'

  return (
    <article className={`download-task-card grid gap-3 p-3 ${compact ? 'md:grid-cols-[86px_1fr]' : 'md:grid-cols-[104px_1fr]'}`}>
      <div className="flex gap-3 md:block">
        <label className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[var(--app-border)] bg-[var(--app-glass)] md:mb-3" aria-label={`选择 ${item.comicTitle}`}>
          <input type="checkbox" checked={selected} onChange={onSelect} className="h-4 w-4 accent-[var(--app-accent)]" />
        </label>
        <Link to={`/comic/${item.comicId}`} className="cover-art block aspect-[7/10] w-20 shrink-0 overflow-hidden subtle-fill md:w-full">
          <CoverImage src={item.coverUrl} title={item.comicTitle} subtitle={item.author} />
        </Link>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <Link to={`/comic/${item.comicId}`} className="line-clamp-2 break-words text-base font-bold hover:underline">
              {item.comicTitle}
            </Link>
            <div className="mt-1 text-sm text-[var(--app-muted)]">{item.latestVolume ?? '暂无卷话记录'}</div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {item.unreadCount > 0 ? <Badge tone="info">{item.unreadCount} 未读</Badge> : <Badge tone="success">已读</Badge>}
            {item.status ? <Badge tone="info">{item.status}</Badge> : null}
            {item.cached ? <Badge tone="success">已缓存</Badge> : <Badge>未缓存</Badge>}
            {item.archived ? <Badge tone="warning">归档</Badge> : null}
          </div>
        </div>
        <div className="mt-3 grid gap-2">
          <div className="flex items-center justify-between gap-3 text-xs font-semibold text-[var(--app-muted)]">
            <span className="truncate">{progressLabel}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <ProgressBar value={progress} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to={primaryTarget}>
            <Button variant="primary">{item.readingProgress ? '继续阅读' : '打开详情'}</Button>
          </Link>
          <Button onClick={() => onBatch([item.comicId], { type: 'mark_read' })}>已读</Button>
          <Button onClick={() => onBatch([item.comicId], { type: 'mark_unread' })}>未读</Button>
          <Button onClick={() => onBatch([item.comicId], { type: 'set_cached', cached: !item.cached, cacheStatus: item.cached ? 'none' : 'reading_cache' })}>
            {item.cached ? '取消缓存标记' : '标记缓存'}
          </Button>
          <Button onClick={() => onBatch([item.comicId], { type: 'archive', archived: !item.archived })}>
            {item.archived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {item.archived ? '取消归档' : '归档'}
          </Button>
          <Button variant="danger" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
            移出
          </Button>
        </div>
      </div>
    </article>
  )
}

function hasUpdates(item: ShelfItem): boolean {
  return item.unreadCount > 0 || Boolean(item.latestUpdatedAt && (!item.lastReadAt || item.latestUpdatedAt > item.lastReadAt))
}
