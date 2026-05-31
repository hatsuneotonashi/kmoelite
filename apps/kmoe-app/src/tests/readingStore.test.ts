import { beforeEach, describe, expect, it } from 'vitest'
import { continueReadingLabel, readingProgressId, useReadingStore } from '../store/readingStore'

describe('readingStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useReadingStore.setState({ progressById: {}, history: [] })
  })

  it('saves precise reading progress separate from downloads', () => {
    const progress = useReadingStore.getState().upsertProgress({
      comicId: '53339',
      comicTitle: '尖帽子的魔法工房',
      volumeId: '3089',
      volumeTitle: '話 089-095',
      pageIndex: 11,
      pageCount: 180,
      readingMode: 'paged',
      readingDirection: 'rtl',
      pageLayout: 'single',
      zoom: 1.4,
      crop: { mode: 'auto' },
      rotation: 90,
      spreadOverrides: { 0: 'force_double' },
      readAt: '2026-05-24T10:00:00.000Z'
    })

    expect(progress).toMatchObject({
      id: '53339:3089',
      pageIndex: 11,
      pageCount: 180,
      progressPercent: 6.67,
      finished: false,
      readingMode: 'paged',
      readingDirection: 'rtl',
      pageLayout: 'single',
      zoom: 1.4,
      crop: { mode: 'auto' },
      rotation: 90,
      spreadOverrides: { 0: 'force_double' }
    })
    expect(useReadingStore.getState().history).toHaveLength(1)
    expect(useReadingStore.getState().history[0]).toMatchObject({
      comicId: '53339',
      volumeId: '3089',
      event: 'page_change'
    })
  })

  it('returns continue reading labels ordered by last read time', () => {
    useReadingStore.getState().upsertProgress(sampleProgress('53339', '3089', '話 089-095', 4, '2026-05-24T10:00:00.000Z'))
    useReadingStore.getState().upsertProgress(sampleProgress('14140', '3156', '卷 01', 8, '2026-05-24T11:00:00.000Z'))

    const items = useReadingStore.getState().continueReading()

    expect(items.map((item) => item.progress.comicId)).toEqual(['14140', '53339'])
    expect(items[0].label).toBe('继续读 卷 01 · 第 9 / 20 页')
    expect(continueReadingLabel(items[1].progress)).toBe('继续读 話 089-095 · 第 5 / 20 页')
  })

  it('inherits latest per-comic reader preferences for a new volume without inheriting page position', () => {
    useReadingStore.getState().upsertProgress({
      ...sampleProgress('53339', '3089', '話 089-095', 12, '2026-05-24T10:00:00.000Z'),
      readingMode: 'webtoon',
      readingDirection: 'ltr',
      pageLayout: 'auto_double',
      zoom: 1.7,
      crop: { mode: 'manual', inset: 4 },
      rotation: 90,
      spreadOverrides: { 0: 'force_double' }
    })

    const nextVolume = useReadingStore.getState().upsertProgress({
      comicId: '53339',
      comicTitle: '尖帽子的魔法工房',
      volumeId: '3090',
      volumeTitle: '話 096-100',
      pageCount: 24,
      readAt: '2026-05-24T11:00:00.000Z'
    }, 'open')

    expect(nextVolume).toMatchObject({
      pageIndex: 0,
      progressPercent: 4.17,
      readingMode: 'webtoon',
      readingDirection: 'ltr',
      pageLayout: 'auto_double',
      zoom: 1.7,
      crop: { mode: 'manual', inset: 4 },
      rotation: 90,
      spreadOverrides: undefined
    })
    expect(useReadingStore.getState().getComicReaderPreferences('53339')).toMatchObject({
      readingMode: 'webtoon',
      readingDirection: 'ltr',
      pageLayout: 'auto_double',
      zoom: 1.7,
      crop: { mode: 'manual', inset: 4 },
      rotation: 90
    })
  })

  it('supports mark read, mark unread, and restart without deleting history', () => {
    useReadingStore.getState().upsertProgress(sampleProgress('53339', '3089', '話 089-095', 9, '2026-05-24T10:00:00.000Z'))

    const read = useReadingStore.getState().markRead('53339', '3089')
    expect(read).toMatchObject({ pageIndex: 19, progressPercent: 100, finished: true })

    const unread = useReadingStore.getState().markUnread('53339', '3089')
    expect(unread).toMatchObject({ progressPercent: 99, finished: false })

    const restarted = useReadingStore.getState().restartVolume('53339', '3089')
    expect(restarted).toMatchObject({ pageIndex: 0, progressPercent: 0, finished: false, zoom: 1 })
    expect(useReadingStore.getState().history.map((entry) => entry.event)).toEqual(['restart', 'mark_unread', 'mark_read', 'page_change'])
  })

  it('merges native progress snapshots without adding history or overwriting newer local reads', () => {
    const local = useReadingStore.getState().upsertProgress({
      ...sampleProgress('53339', '3089', '話 089-095', 8, '2026-05-24T11:00:00.000Z'),
      rotation: 90
    })
    const imported = {
      ...local,
      id: '14140:3156',
      comicId: '14140',
      comicTitle: '地下忍者',
      volumeId: '3156',
      volumeTitle: '卷 01',
      pageIndex: 4,
      progressPercent: 25,
      lastReadAt: '2026-05-24T12:00:00.000Z'
    }
    const stale = {
      ...local,
      pageIndex: 1,
      progressPercent: 10,
      lastReadAt: '2026-05-24T10:00:00.000Z',
      rotation: 180 as const
    }

    const changed = useReadingStore.getState().mergeProgressSnapshot([stale, imported])

    expect(changed).toBe(1)
    expect(useReadingStore.getState().getProgress('53339', '3089')?.pageIndex).toBe(8)
    expect(useReadingStore.getState().getProgress('53339', '3089')?.rotation).toBe(90)
    expect(useReadingStore.getState().getProgress('14140', '3156')).toMatchObject({ pageIndex: 4, progressPercent: 25 })
    expect(useReadingStore.getState().history).toHaveLength(1)
  })

  it('sanitizes persisted reading records during hydration', async () => {
    window.localStorage.setItem(
      'kmoe-client-reading',
      JSON.stringify({
        state: {
          progressById: {
            [readingProgressId('53339', '3089')]: {
              ...sampleProgress('53339', '3089', '話 089-095', 3, '2026-05-24T10:00:00.000Z'),
              id: readingProgressId('53339', '3089'),
              lastReadAt: '2026-05-24T10:00:00.000Z',
              progressPercent: 20,
              finished: false,
              readingMode: 'paged',
              readingDirection: 'rtl',
              pageLayout: 'single'
            },
            broken: { comicId: 'missing fields' }
          },
          history: [{ id: 'bad' }]
        },
        version: 0
      })
    )

    await useReadingStore.persist.rehydrate()

    expect(Object.keys(useReadingStore.getState().progressById)).toEqual(['53339:3089'])
    expect(useReadingStore.getState().history).toEqual([])
  })
})

function sampleProgress(comicId: string, volumeId: string, volumeTitle: string, pageIndex: number, readAt: string) {
  return {
    comicId,
    comicTitle: comicId === '53339' ? '尖帽子的魔法工房' : '地下忍者',
    volumeId,
    volumeTitle,
    pageIndex,
    pageCount: 20,
    readAt
  }
}
