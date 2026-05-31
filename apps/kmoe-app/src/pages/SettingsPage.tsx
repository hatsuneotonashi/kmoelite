import { Database, FolderSync, Palette, RefreshCcw, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../components/Button'
import { TextField } from '../components/Field'
import { PageHeader } from '../components/layout/PageHeader'
import { clearNativeReadingCache, getNativeCacheStats, getNativeDownloadDir, setNativeDownloadDir } from '../platform/nativeCommands'
import { useCacheStore } from '../store/cacheStore'
import { useSettingsStore } from '../store/settingsStore'
import { formatBytes, mbToBytes, readableAppMessage } from '../lib/format'
import type { CachePolicyMode, CacheStats } from '../types/cache'
import type { DownloadFormat, ReaderPageTurnAnimation } from '../types/domain'
import { useNativeAppConfigSync } from '../hooks/useNativeAppConfigSync'

const cacheModes: Array<{ value: CachePolicyMode; label: string; description: string }> = [
  { value: 'space_saver', label: '省空间', description: '只保留当前章，适合 iPhone 存储紧张时使用。' },
  { value: 'balanced', label: '均衡', description: '保留前一章、当前章和下一章，默认策略。' },
  { value: 'comfort', label: '舒适', description: '保留更多最近章节，适合 iPad 和桌面连续阅读。' }
]

const readerPageTurnAnimations: Array<{ value: ReaderPageTurnAnimation; label: string; description: string }> = [
  { value: 'slide', label: '顺滑滑页', description: '轻微位移和阴影过渡，适合长时间阅读。' },
  { value: 'curl', label: '纸页翻折', description: '带透视的翻页感，双页阅读更接近实体书。' },
  { value: 'fade', label: '柔和淡入', description: '低干扰渐隐渐显，适合对动效敏感的用户。' }
]

export function SettingsPage() {
  useNativeAppConfigSync()
  const settings = useSettingsStore()
  const cache = useCacheStore()
  const [nativeMessage, setNativeMessage] = useState('')
  const [cacheMessage, setCacheMessage] = useState('')
  const [nativeCacheStats, setNativeCacheStats] = useState<CacheStats | null>(null)
  const localCacheStats = cache.stats()
  const shownCacheStats = nativeCacheStats ?? localCacheStats
  const cleanupCandidates = cache.cleanupCandidates({ reason: 'policy', limit: 20 })
  const storageCleanupCandidates = cache.cleanupCandidates({ reason: 'storage_pressure', limit: 20 })
  const cacheLimitMb = cache.policy.maxCacheBytes ? bytesToMbInput(cache.policy.maxCacheBytes) : ''

  useEffect(() => {
    void refreshCacheStats(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refreshCacheStats(quiet = false) {
    const result = await getNativeCacheStats()
    if (result.ok && result.value) {
      setNativeCacheStats(result.value)
      if (!quiet) setCacheMessage('已刷新本机阅读缓存占用。')
      return
    }
    if (!quiet) {
      setCacheMessage(result.available
        ? readableAppMessage(result.message, '暂时无法读取阅读缓存占用。')
        : '当前是浏览器预览，显示本地预览缓存统计。')
    }
  }

  async function clearReadingCache(chapterIds?: string[], scope: 'policy' | 'storage' | 'all' = 'all') {
    const result = await clearNativeReadingCache(chapterIds)
    if (result.ok && result.value) {
      cache.clearReadingCache(chapterIds)
      setNativeCacheStats(result.value)
      setCacheMessage(cleanupDoneMessage(scope, chapterIds?.length ?? 0, true))
      return
    }
    if (!result.available) {
      cache.clearReadingCache(chapterIds)
      setNativeCacheStats(null)
      setCacheMessage(cleanupDoneMessage(scope, chapterIds?.length ?? 0, false))
      return
    }
    setCacheMessage(readableAppMessage(result.message, '暂时无法清理阅读缓存，请稍后重试。'))
  }

  return (
    <div className="content-grid">
      <PageHeader eyebrow="设置" title="设置" description="配置默认下载格式、保存位置和阅读缓存策略。" />

      <section className="settings-card settings-appearance-card grid gap-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--app-muted)]">Appearance</p>
            <h2 className="mt-1 text-xl font-semibold">作品详情主题</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--app-muted)]">
              开启后，作品详情页会从封面提取主色，让整页背景、目录和按钮进入同一套色彩氛围；关闭后完全使用全局白天/深色模式。
            </p>
          </div>
          <label className="settings-theme-switch">
            <input
              type="checkbox"
              aria-label="作品详情随封面变色"
              checked={settings.colorizeDetailPage}
              onChange={(event) => settings.setColorizeDetailPage(event.target.checked)}
            />
            <span />
          </label>
        </div>

        <div className="settings-theme-preview" data-enabled={settings.colorizeDetailPage ? 'true' : undefined}>
          <div className="settings-theme-preview-cover">
            <Palette className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold">{settings.colorizeDetailPage ? '封面色主题已开启' : '跟随系统外观'}</div>
            <div className="mt-1 text-sm text-[var(--app-muted)]">
              {settings.colorizeDetailPage ? '详情页使用封面主色、柔和渐变和半透明行列表现。' : '详情页不读取封面色，只使用当前浅色或深色模式。'}
            </div>
          </div>
        </div>
      </section>

      <section className="settings-card grid gap-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--app-muted)]">Reader</p>
            <h2 className="mt-1 text-xl font-semibold">翻页动画</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--app-muted)]">
              选择分页阅读时的页面切换效果。动效只在翻页时触发，打开目录、帮助或控制面板不会改变漫画尺寸。
            </p>
          </div>
          <Sparkles className="h-5 w-5 text-[var(--app-muted)]" aria-hidden="true" />
        </div>

        <div className="settings-choice-grid grid gap-3 md:grid-cols-3">
          {readerPageTurnAnimations.map((option) => (
            <button
              key={option.value}
              type="button"
              className="settings-choice-card text-left"
              data-active={settings.readerPageTurnAnimation === option.value ? 'true' : undefined}
              aria-pressed={settings.readerPageTurnAnimation === option.value}
              onClick={() => settings.setReaderPageTurnAnimation(option.value)}
            >
              <span className="settings-choice-card-head">
                <span className="font-semibold">{option.label}</span>
                <span className="settings-choice-card-check" aria-hidden="true">✓</span>
              </span>
              <span className="mt-1 block text-sm leading-6 text-[var(--app-muted)]">{option.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-card settings-download-card grid gap-5 p-5">
        <div className="settings-primary-grid grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-[var(--app-muted)]">默认格式</span>
            <select value={settings.preferredFormat} onChange={(event) => settings.setPreferredFormat(event.target.value as DownloadFormat)} className="liquid-input h-11 rounded-full px-4 outline-none">
              <option value="mobi">MOBI</option>
              <option value="epub">EPUB</option>
              <option value="source_zip">源图 ZIP</option>
            </select>
          </label>
          <div className="metric-tile p-3 text-sm">
            <div className="font-medium">队列方式</div>
            <div className="mt-1 text-[var(--app-muted)]">按顺序处理下载任务。</div>
          </div>
        </div>

        <TextField label="保存位置" value={settings.downloadDirectory} onChange={(event) => settings.setDownloadDirectory(event.target.value)} />

        <div className="settings-actions flex flex-wrap gap-2">
          <Button
            onClick={() => {
              settings.resetSafetyDefaults()
              setNativeMessage('已恢复默认下载设置。')
            }}
          >
            恢复默认值
          </Button>
          <Button
            onClick={async () => {
              const result = await getNativeDownloadDir()
              if (result.value) settings.setDownloadDirectory(result.value)
              setNativeMessage(readableAppMessage(result.message, '暂时无法读取保存位置，请稍后重试。'))
            }}
          >
            <FolderSync className="h-4 w-4" />
            读取保存位置
          </Button>
          <Button
            variant="primary"
            onClick={async () => {
              const result = await setNativeDownloadDir(settings.downloadDirectory)
              if (result.value) settings.setDownloadDirectory(result.value)
              setNativeMessage(readableAppMessage(result.message, '暂时无法保存设置，请稍后重试。'))
            }}
          >
            保存
          </Button>
        </div>
        {nativeMessage ? <div className="metric-tile p-3 text-sm text-[var(--app-muted)]">{nativeMessage}</div> : null}
      </section>

      <section className="settings-card settings-cache-card grid gap-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--app-muted)]">Reader cache</p>
            <h2 className="mt-1 text-xl font-semibold">阅读缓存</h2>
            <p className="mt-1 text-sm text-[var(--app-muted)]">
              缓存只保存解包后的阅读页面。清理缓存不会删除书架、阅读进度、历史记录或永久下载文件。
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--app-border)] bg-[var(--app-glass)] px-3 py-2 text-sm font-semibold text-[var(--app-muted)]">
            <Database className="h-4 w-4" />
            {cacheModeLabel(cache.policy.mode)}
          </div>
        </div>

        <div className="settings-cache-metrics grid gap-3 md:grid-cols-4">
          <CacheMetric label="总占用" value={formatBytes(shownCacheStats.totalBytes)} />
          <CacheMetric label="阅读缓存" value={formatBytes(shownCacheStats.readingCacheBytes)} />
          <CacheMetric label="永久下载" value={formatBytes(shownCacheStats.permanentDownloadBytes)} />
          <CacheMetric label="章节 / 页面" value={`${shownCacheStats.chapterCount} / ${shownCacheStats.pageCount}`} />
        </div>

        <div className="settings-cache-policy-grid grid gap-3 lg:grid-cols-3">
          {cacheModes.map((mode) => (
            <button
              key={mode.value}
              type="button"
              className="metric-tile p-4 text-left transition hover:-translate-y-0.5 hover:bg-[var(--app-card-strong)]"
              data-selected={cache.policy.mode === mode.value ? 'true' : undefined}
              aria-pressed={cache.policy.mode === mode.value}
              onClick={() => {
                cache.updatePolicy({ mode: mode.value })
                setCacheMessage(`已切换为${mode.label}缓存策略。`)
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{mode.label}</span>
                {cache.policy.mode === mode.value ? <span className="rounded-full bg-[var(--app-fg)] px-2 py-0.5 text-xs text-[var(--app-bg)]">当前</span> : null}
              </div>
              <p className="mt-2 text-sm text-[var(--app-muted)]">{mode.description}</p>
            </button>
          ))}
        </div>

        <div className="settings-cache-toggle-grid grid gap-3 md:grid-cols-2">
          <label className="metric-tile flex items-start gap-3 p-4 text-sm">
            <input
              type="checkbox"
              checked={cache.policy.wifiPrefetch}
              onChange={(event) => cache.updatePolicy({ wifiPrefetch: event.target.checked })}
              className="mt-1 h-4 w-4 accent-[var(--app-fg)]"
            />
            <span>
              <span className="block font-semibold">Wi-Fi 下预取下一章</span>
              <span className="mt-1 block text-[var(--app-muted)]">桌面和 iPad 连续阅读时更顺滑，移动端仍保持前台显式缓存。</span>
            </span>
          </label>
          <label className="metric-tile flex items-start gap-3 p-4 text-sm">
            <input
              type="checkbox"
              checked={cache.policy.lowPowerReducePrefetch}
              onChange={(event) => cache.updatePolicy({ lowPowerReducePrefetch: event.target.checked })}
              className="mt-1 h-4 w-4 accent-[var(--app-fg)]"
            />
            <span>
              <span className="block font-semibold">低电量时减少预取</span>
              <span className="mt-1 block text-[var(--app-muted)]">为 iPhone/iPad 保留电量和存储空间，桌面端不影响已下载文件。</span>
            </span>
          </label>
        </div>

        <div className="settings-cache-limit metric-tile grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)] md:items-end">
          <div>
            <div className="font-semibold">阅读缓存容量上限</div>
            <p className="mt-1 text-sm text-[var(--app-muted)]">
              超过上限时优先清理最早访问的已就绪阅读缓存，先保留当前阅读章节和策略窗口，硬上限不足时也不会删除当前章节。永久下载、书架和进度不受影响。
            </p>
            <p className="mt-2 text-xs font-semibold text-[var(--app-muted)]">
              当前上限：{cache.policy.maxCacheBytes ? formatBytes(cache.policy.maxCacheBytes) : '未设置'}
            </p>
          </div>
          <TextField
            label="上限 MB"
            type="number"
            min="0"
            step="64"
            inputMode="numeric"
            value={cacheLimitMb}
            onChange={(event) => {
              const next = mbToBytes(event.target.value)
              cache.updatePolicy({ maxCacheBytes: next })
              setCacheMessage(next ? `已设置阅读缓存上限为 ${formatBytes(next)}。` : '已取消阅读缓存容量上限。')
            }}
          />
        </div>

        {cleanupCandidates.length > 0 ? (
          <div className="metric-tile p-4 text-sm">
            <div className="font-semibold">最早可清理的阅读缓存</div>
            <div className="mt-3 grid gap-2">
              {cleanupCandidates.slice(0, 3).map((item) => (
                <div key={item.chapter.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[var(--app-glass)] px-3 py-2">
                  <span className="min-w-0 truncate">{item.chapter.comicTitle} · {item.chapter.volumeTitle}</span>
                  <span className="text-[var(--app-muted)]">{formatBytes(item.chapter.sizeBytes)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {storageCleanupCandidates.length > 0 ? (
          <div className="metric-tile p-4 text-sm">
            <div className="font-semibold">超过容量上限后可清理</div>
            <p className="mt-1 text-[var(--app-muted)]">
              这些项目来自容量压力规划，会按最早访问顺序清理，直到阅读缓存回到上限内或只剩当前阅读章节。
            </p>
            <div className="mt-3 grid gap-2">
              {storageCleanupCandidates.slice(0, 3).map((item) => (
                <div key={item.chapter.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[var(--app-glass)] px-3 py-2">
                  <span className="min-w-0 truncate">{item.chapter.comicTitle} · {item.chapter.volumeTitle}</span>
                  <span className="text-[var(--app-muted)]">{formatBytes(item.chapter.sizeBytes)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="settings-cache-actions flex flex-wrap gap-2">
          <Button onClick={() => void refreshCacheStats()}>
            <RefreshCcw className="h-4 w-4" />
            刷新缓存占用
          </Button>
          <Button
            disabled={cleanupCandidates.length === 0}
            onClick={() => void clearReadingCache(cleanupCandidates.map((item) => item.chapter.id), 'policy')}
          >
            <Trash2 className="h-4 w-4" />
            按策略清理 {cleanupCandidates.length} 项
          </Button>
          <Button
            disabled={storageCleanupCandidates.length === 0}
            onClick={() => void clearReadingCache(storageCleanupCandidates.map((item) => item.chapter.id), 'storage')}
          >
            <Trash2 className="h-4 w-4" />
            按容量清理 {storageCleanupCandidates.length} 项
          </Button>
          <Button variant="danger" disabled={shownCacheStats.readingCacheBytes <= 0 && cleanupCandidates.length === 0} onClick={() => void clearReadingCache(undefined, 'all')}>
            <Trash2 className="h-4 w-4" />
            清理全部阅读缓存
          </Button>
        </div>
        {cacheMessage ? <div className="metric-tile p-3 text-sm text-[var(--app-muted)]">{cacheMessage}</div> : null}
      </section>
    </div>
  )
}

function CacheMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-tile p-4">
      <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-muted)]">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  )
}

function cacheModeLabel(mode: CachePolicyMode): string {
  if (mode === 'space_saver') return '省空间'
  if (mode === 'comfort') return '舒适'
  return '均衡'
}

function cleanupDoneMessage(scope: 'policy' | 'storage' | 'all', count: number, native: boolean): string {
  const runtime = native ? '本机' : '浏览器预览'
  const suffix = '书架、阅读记录和永久下载不会被删除。'
  if (scope === 'policy') return `已按当前策略清理 ${count} 个${runtime}阅读缓存。${suffix}`
  if (scope === 'storage') return `已按容量上限清理 ${count} 个${runtime}阅读缓存。${suffix}`
  return `已清理全部${runtime}阅读缓存。${suffix}`
}

function bytesToMbInput(bytes: number): string {
  const mb = bytes / 1024 / 1024
  if (mb >= 10) return Math.round(mb).toString()
  if (mb >= 1) return Number(mb.toFixed(1)).toString()
  return Number(mb.toPrecision(3)).toString()
}
