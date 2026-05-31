import type { Page } from '@playwright/test'

type NativeCall = { cmd: string; args?: Record<string, unknown> }
type NativeReaderFixtureOptions = {
  chapters?: ReturnType<typeof makeNativeReaderChapter>[]
  downloadedFiles?: ReturnType<typeof makeNativeReaderDownloadedFile>[]
  readingProgress?: ReturnType<typeof makeNativeReadingProgress>[]
}

const imageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

const fixtureDetailHtml = `
<!doctype html>
<html>
  <head>
    <title>尖帽子的魔法工房</title>
    <meta name="og:image" content="/covers/witch-hat.png" />
  </head>
  <body>
    <input name="bookid" value="53339" />
    <div class="text_bglight_big">尖帽子的魔法工房</div>
    <div class="text_bglight">Atelier Of Witch Hat, 魔法帽的工作室</div>
    <a href="/list.php?s=%E7%99%BD%E6%B5%9C%E9%B7%97">白浜鴎</a>
    <div>狀態 : 連載 地區 : 日本 語言 : 繁體 最後出版 : 2026-04-21 熱度 : 22176 分類：</div>
    <font color="#000000">魔幻</font>
    <span class="hd_logo">[魔法]</span>
    <p>簡介：一位向往魔法的少女偶然发现魔法师的秘密，进入工房后开始学习与规则、责任和创造相关的魔法。</p>
    <iframe src="/book_data.php?h=fixture53339"></iframe>
  </body>
</html>
`

const fixtureBookData = `
<script>
parent.postMessage("volinfo=3001,0,0,話,1,話 001-006,232,232,60.0,51.9,43.0,51.0,,,2025-08-23 960x1280,2026-04-21 960x1280,2026-04-21 860x1146", "*");
parent.postMessage("volinfo=3089,0,0,話,89,話 089-095,94,94,26.0,22.4,21.1,21.7,,,2025-08-23 960x1280,2026-04-21 960x1280,2026-04-21 860x1146", "*");
parent.postMessage("linkinfo=14140,地下忍者,10180,GRAND BLUE 碧藍之海", "*");
parent.postMessage("volcount=2", "*");
</script>
`

const fixtureProfileHtml = `
<html>
  <body>
    <div>登錄郵箱 : reader@example.invalid ( KMOE ID : 123456 )</div>
    <div>昵稱 : reader-safe 修改昵稱</div>
    <div>你是本站 Lv1 用戶，且不是本站 VIP 。</div>
    <div>Lv1 每月額度 : 2048.0 M , 剩餘 : 1920.0 M</div>
    <div>今日已用 : 0.0 M , 本月已用免費額度 : 128.0 M</div>
  </body>
</html>
`

export async function installNativeReaderFixture(page: Page, options: NativeReaderFixtureOptions = {}): Promise<void> {
  const defaultChapter = makeNativeReaderChapter('cache-53339-3089', '3089', '話 089-095', 6)
  const chapters = options.chapters ?? [
    makeNativeReaderChapter('cache-53339-3001', '3001', '話 001-006', 3),
    defaultChapter,
    makeNativeReaderChapter('cache-53339-3096', '3096', '話 096-100', 4)
  ]
  const pagesByChapter = Object.fromEntries(chapters.map((item) => [item.id, makePages(item)]))
  const imagesByChapter = makeImagesByChapter(pagesByChapter)
  const downloadedFiles = options.downloadedFiles ?? []
  const readingProgress = options.readingProgress ?? []

  await page.addInitScript(({ chapters, pagesByChapter, imagesByChapter, downloadedFiles, readingProgress, imageDataUrl, fixtureDetailHtml, fixtureBookData, fixtureProfileHtml }) => {
    type NativeCall = { cmd: string; args?: Record<string, unknown> }
    type FixtureChapter = {
      id: string
      comicId: string
      comicTitle: string
      volumeId: string
      volumeTitle: string
      format: 'source_zip'
      cacheKind: 'reading_cache'
      sourceTaskId?: string
      cacheDir: string
      sizeBytes: number
      pageCount: number
      status: 'ready'
      policy: 'balanced'
      lastAccessedAt: string
      createdAt: string
      updatedAt: string
    }
    type FixturePage = {
      id: string
      chapterCacheId: string
      comicId: string
      volumeId: string
      pageIndex: number
      filePath: string
      sizeBytes: number
      createdAt: string
      lastAccessedAt: string
    }
    const calls: NativeCall[] = []
    const state = {
      chapters: chapters as FixtureChapter[],
      pagesByChapter: pagesByChapter as Record<string, FixturePage[]>,
      imagesByChapter: imagesByChapter as Record<string, Record<string, unknown>>,
      downloadedFiles: downloadedFiles as unknown[],
      readingProgress: readingProgress as unknown[],
      downloadTasks: [] as unknown[]
    }

    function nowIso() {
      return '2026-05-24T00:00:00.000Z'
    }

    function readerChapterCacheId(comicId: string, volumeId: string) {
      return `cache-${comicId}-${volumeId}`
    }

    function makePreparedChapter(input: {
      comicId: string
      comicTitle: string
      volumeId: string
      volumeTitle: string
      sourceTaskId?: string
      policy?: string
    }): FixtureChapter {
      const createdAt = nowIso()
      return {
        id: readerChapterCacheId(input.comicId, input.volumeId),
        comicId: input.comicId,
        comicTitle: input.comicTitle,
        volumeId: input.volumeId,
        volumeTitle: input.volumeTitle,
        format: 'source_zip',
        cacheKind: 'reading_cache',
        sourceTaskId: input.sourceTaskId,
        cacheDir: `/tmp/Kmoe/ReadingCache/${input.comicId}/${input.volumeId}/source_zip`,
        sizeBytes: 3,
        pageCount: 3,
        status: 'ready',
        policy: 'balanced',
        lastAccessedAt: createdAt,
        createdAt,
        updatedAt: createdAt
      }
    }

    function makePreparedPages(chapter: FixtureChapter): FixturePage[] {
      return Array.from({ length: chapter.pageCount }, (_item, pageIndex) => ({
        id: `${chapter.id}:page-${pageIndex}`,
        chapterCacheId: chapter.id,
        comicId: chapter.comicId,
        volumeId: chapter.volumeId,
        pageIndex,
        filePath: `${chapter.cacheDir}/${String(pageIndex + 1).padStart(5, '0')}.jpg`,
        sizeBytes: 1024 * (pageIndex + 1),
        createdAt: chapter.createdAt,
        lastAccessedAt: chapter.lastAccessedAt
      }))
    }

    function makePreparedImages(pages: FixturePage[]) {
      return Object.fromEntries(pages.map((cachedPage) => [
        cachedPage.pageIndex,
        {
          chapterCacheId: cachedPage.chapterCacheId,
          comicId: cachedPage.comicId,
          volumeId: cachedPage.volumeId,
          pageIndex: cachedPage.pageIndex,
          fileName: `${String(cachedPage.pageIndex + 1).padStart(5, '0')}.jpg`,
          mimeType: 'image/png',
          sizeBytes: cachedPage.sizeBytes,
          dataUrl: imageDataUrl
        }
      ]))
    }

    function makeManifest(chapter: FixtureChapter) {
      return {
        fileName: `${chapter.volumeTitle}.zip`,
        pageCount: chapter.pageCount,
        pages: Array.from({ length: chapter.pageCount }, (_item, index) => ({
          index,
          archiveIndex: index,
          name: `${String(index + 1).padStart(5, '0')}.jpg`,
          normalizedPath: `${String(index + 1).padStart(5, '0')}.jpg`,
          extension: 'jpg',
          compressedSize: 1,
          uncompressedSize: 1
        }))
      }
    }

    function downloadedFileFromTask(task: Record<string, unknown>) {
      const comicId = String(task.comicId ?? '53339')
      const volId = String(task.volId ?? '3089')
      const volumeTitle = String(task.volumeTitle ?? '話 089-095')
      const format = String(task.format ?? 'source_zip')
      const extension = format === 'epub' ? 'epub' : format === 'mobi' ? 'mobi' : 'zip'
      const localPath = typeof task.localPath === 'string' && task.localPath.length > 0
        ? task.localPath
        : `/Users/example/Downloads/Kmoe/${String(task.comicTitle ?? '尖帽子的魔法工房')}/${volumeTitle}.${extension}`
      return {
        id: `file-${comicId}-${volId}-${format}`,
        taskId: String(task.id ?? `task-${comicId}-${volId}-${format}`),
        comicId,
        comicTitle: String(task.comicTitle ?? '尖帽子的魔法工房'),
        volId,
        volumeTitle,
        format,
        localPath,
        sizeBytes: Number(task.totalBytes ?? 2048),
        downloadedAt: nowIso()
      }
    }

    Object.defineProperty(window, '__KMOE_E2E_NATIVE_CALLS__', {
      configurable: true,
      value: calls
    })
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {
        callbacks: {},
        convertFileSrc: (filePath: string) => filePath,
        invoke: async (cmd: string, args?: Record<string, unknown>) => {
          calls.push({ cmd, args })
          if (cmd === 'get_app_config') return { concurrency: 1, downloadDirectory: '' }
          if (cmd === 'kmoe_fetch_comic_detail_html') return fixtureDetailHtml
          if (cmd === 'kmoe_fetch_book_data') return fixtureBookData
          if (cmd === 'kmoe_fetch_user_profile_html') return fixtureProfileHtml
          if (cmd === 'list_shelves') return []
          if (cmd === 'list_shelf_items') return []
          if (cmd === 'list_reading_progress') return state.readingProgress
          if (cmd === 'list_chapter_cache') return state.chapters
          if (cmd === 'list_cached_chapter_pages') {
            return state.pagesByChapter[String(args?.chapterCacheId)] ?? []
          }
          if (cmd === 'read_cached_reader_page') {
            const chapterCacheId = String(args?.chapterCacheId)
            const pageIndex = Number(args?.pageIndex)
            const images = state.imagesByChapter[chapterCacheId]
            const image = images?.[String(pageIndex)]
            if (!image) throw new Error(`missing fixture page ${chapterCacheId}:${pageIndex}`)
            return image
          }
          if (cmd === 'save_reading_progress') {
            const input = args?.input as { progress?: unknown } | undefined
            return input?.progress
          }
          if (cmd === 'list_downloaded_files') return state.downloadedFiles
          if (cmd === 'list_download_tasks') return state.downloadTasks
          if (cmd === 'preflight_download_queue') {
            const queuedTasks = state.downloadTasks.filter((task) => typeof task === 'object' && task && (task as { status?: string }).status === 'queued')
            return {
              ok: queuedTasks.length > 0,
              mode: 'real_download',
              queuedCount: queuedTasks.length,
              activeCount: 0,
              downloadDirectory: '/Users/example/Downloads/Kmoe',
              firstTaskId: queuedTasks.length > 0 && typeof queuedTasks[0] === 'object' && queuedTasks[0] && 'id' in queuedTasks[0] ? String((queuedTasks[0] as { id: unknown }).id) : undefined,
              firstTaskLabel: queuedTasks.length > 0 ? '尖帽子的魔法工房 / 話 089-095 / SOURCE_ZIP' : undefined,
              checks: queuedTasks.length > 0
                ? [
                    { id: 'download-dir', label: '下载目录', status: 'pass', detail: '目录可用。' },
                    { id: 'queued-task', label: '等待任务', status: 'pass', detail: '有等待任务。' }
                  ]
                : [
                    { id: 'queued-task', label: '等待任务', status: 'fail', detail: '没有等待下载的任务。' }
                  ]
            }
          }
          if (cmd === 'enqueue_download_tasks') {
            const tasks = Array.isArray(args?.tasks) ? args.tasks : []
            for (const task of tasks) {
              const id = typeof task === 'object' && task && 'id' in task ? String((task as { id: unknown }).id) : ''
              if (id && !state.downloadTasks.some((item) => typeof item === 'object' && item && 'id' in item && String((item as { id: unknown }).id) === id)) {
                state.downloadTasks.push(task)
              }
            }
            return tasks
          }
          if (cmd === 'prioritize_download_task') {
            const id = String(args?.id ?? '')
            const index = state.downloadTasks.findIndex((task) => typeof task === 'object' && task && 'id' in task && String((task as { id: unknown }).id) === id)
            if (index < 0) throw new Error('missing queued task')
            const task = state.downloadTasks[index]
            if (typeof task !== 'object' || !task) throw new Error('invalid queued task')
            const record = {
              ...(task as Record<string, unknown>),
              status: 'queued',
              createdAt: '2026-05-23T23:59:59.000Z',
              updatedAt: nowIso()
            }
            state.downloadTasks[index] = record
            return record
          }
          if (cmd === 'start_download_queue') {
            state.downloadTasks = state.downloadTasks.map((task) => {
              if (typeof task !== 'object' || !task) return task
              const record = task as Record<string, unknown>
              if (record.status !== 'queued') return task
              const completed = {
                ...record,
                status: 'completed',
                progress: 100,
                downloadedBytes: Number(record.totalBytes ?? 2048),
                localPath: downloadedFileFromTask(record).localPath,
                updatedAt: nowIso()
              }
              const file = downloadedFileFromTask(completed)
              if (!state.downloadedFiles.some((item) => typeof item === 'object' && item && 'id' in item && String((item as { id: unknown }).id) === file.id)) {
                state.downloadedFiles.push(file)
              }
              return completed
            })
            return undefined
          }
          if (cmd === 'prepare_reader_chapter_cache') {
            const input = (args?.input ?? {}) as {
              comicId?: string
              comicTitle?: string
              volumeId?: string
              volumeTitle?: string
              sourceTaskId?: string
              policy?: string
            }
            const chapter = makePreparedChapter({
              comicId: String(input.comicId ?? '53339'),
              comicTitle: String(input.comicTitle ?? '尖帽子的魔法工房'),
              volumeId: String(input.volumeId ?? '3089'),
              volumeTitle: String(input.volumeTitle ?? '話 089-095'),
              sourceTaskId: input.sourceTaskId,
              policy: input.policy
            })
            const pages = makePreparedPages(chapter)
            state.chapters = [...state.chapters.filter((item) => item.id !== chapter.id), chapter]
            state.pagesByChapter[chapter.id] = pages
            state.imagesByChapter[chapter.id] = makePreparedImages(pages)
            return { chapter, pages, manifest: makeManifest(chapter) }
          }
          if (cmd === 'repair_reader_chapter_cache') {
            const chapterCacheId = String(args?.chapterCacheId)
            const chapter = state.chapters.find((item) => item.id === chapterCacheId)
            if (!chapter) throw new Error('missing chapter')
            const pages = makePreparedPages(chapter)
            state.pagesByChapter[chapter.id] = pages
            state.imagesByChapter[chapter.id] = makePreparedImages(pages)
            return { chapter, pages, manifest: makeManifest(chapter) }
          }
          if (cmd === 'get_cache_stats') return { totalBytes: 0, permanentDownloadBytes: 0, readingCacheBytes: 0, metadataCacheBytes: 0, chapterCount: state.chapters.length, pageCount: Object.values(state.pagesByChapter).reduce((total, pages) => total + pages.length, 0) }
          throw new Error(`unexpected native command ${cmd}`)
        },
        metadata: {
          currentWebview: { label: 'main' },
          currentWindow: { label: 'main' }
        },
        runCallback: () => undefined,
        transformCallback: () => 0,
        unregisterCallback: () => undefined
      }
    })
  }, { chapters, pagesByChapter, imagesByChapter, downloadedFiles, readingProgress, imageDataUrl, fixtureDetailHtml, fixtureBookData, fixtureProfileHtml })
}

export function makeNativeReaderChapter(id: string, volumeId: string, volumeTitle: string, pageCount: number) {
  return {
    id,
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volumeId,
    volumeTitle,
    format: 'source_zip' as const,
    cacheKind: 'reading_cache' as const,
    sourceTaskId: `task-53339-${volumeId}`,
    cacheDir: `/tmp/Kmoe/ReadingCache/53339/${volumeId}/source_zip`,
    sizeBytes: pageCount,
    pageCount,
    status: 'ready' as const,
    policy: 'balanced' as const,
    lastAccessedAt: '2026-05-24T00:00:00.000Z',
    createdAt: '2026-05-24T00:00:00.000Z',
    updatedAt: '2026-05-24T00:00:00.000Z'
  }
}

export function makeNativeReaderDownloadedFile(volumeId = '3089', volumeTitle = '話 089-095') {
  return {
    id: `file-53339-${volumeId}-source_zip`,
    taskId: `task-53339-${volumeId}`,
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volId: volumeId,
    volumeTitle,
    format: 'source_zip' as const,
    localPath: `/Users/example/Downloads/Kmoe/尖帽子的魔法工房/${volumeTitle}.zip`,
    sizeBytes: 2048,
    downloadedAt: '2026-05-24T00:00:00.000Z'
  }
}

export function makeNativeReadingProgress(volumeId = '3089', volumeTitle = '話 089-095') {
  return {
    id: `53339:${volumeId}`,
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volumeId,
    volumeTitle,
    pageIndex: 1,
    pageCount: 6,
    progressPercent: 33.33,
    lastReadAt: '2026-05-24T00:00:00.000Z',
    finished: false,
    readingMode: 'paged',
    readingDirection: 'rtl',
    pageLayout: 'single',
    zoom: 1,
    rotation: 0,
    updatedAt: '2026-05-24T00:00:00.000Z'
  }
}

function makePages(chapter: ReturnType<typeof makeNativeReaderChapter>) {
  return Array.from({ length: chapter.pageCount }, (_, pageIndex) => ({
    id: `${chapter.id}:page-${pageIndex}`,
    chapterCacheId: chapter.id,
    comicId: chapter.comicId,
    volumeId: chapter.volumeId,
    pageIndex,
    filePath: `${chapter.cacheDir}/${String(pageIndex + 1).padStart(5, '0')}.jpg`,
    sizeBytes: 1024 * (pageIndex + 1),
    createdAt: chapter.createdAt,
    lastAccessedAt: chapter.lastAccessedAt
  }))
}

function makeImagesByChapter(pagesByChapter: Record<string, ReturnType<typeof makePages>>) {
  return Object.fromEntries(Object.entries(pagesByChapter).map(([chapterId, pages]) => [
    chapterId,
    Object.fromEntries(pages.map((cachedPage) => [
      cachedPage.pageIndex,
      {
        chapterCacheId: cachedPage.chapterCacheId,
        comicId: cachedPage.comicId,
        volumeId: cachedPage.volumeId,
        pageIndex: cachedPage.pageIndex,
        fileName: `${String(cachedPage.pageIndex + 1).padStart(5, '0')}.jpg`,
        mimeType: 'image/png',
        sizeBytes: cachedPage.sizeBytes,
        dataUrl: imageDataUrl
      }
    ]))
  ]))
}

export async function getNativeReaderCalls(page: Page): Promise<NativeCall[]> {
  return page.evaluate(() => {
    return ((window as unknown as { __KMOE_E2E_NATIVE_CALLS__?: NativeCall[] })
      .__KMOE_E2E_NATIVE_CALLS__ ?? [])
  })
}
