import { describe, expect, it } from 'vitest'
import { createLocalStateSnapshot, parseLocalStateSnapshot, serializeLocalStateSnapshot, snapshotFileName } from '../lib/localSnapshot'
import type { AppSettings, DownloadTask, DownloadedFile } from '../types/domain'

const settings: AppSettings = {
  concurrency: 1,
  preferredFormat: 'epub',
  downloadDirectory: '/Users/example/Downloads/Kmoe',
  colorizeDetailPage: true,
  readerPageTurnAnimation: 'slide'
}

const task: DownloadTask = {
  id: 'task-1',
  comicId: '53339',
  comicTitle: '尖帽子的魔法工房',
  volId: '3089',
  volumeTitle: '話 089-095',
  format: 'epub',
  status: 'downloading',
  progress: 64,
  downloadedBytes: 640,
  totalBytes: 1000,
  retryCount: 1,
  localPath: '/Users/example/Downloads/Kmoe/private.epub',
  createdAt: '100',
  updatedAt: '101'
}

const file: DownloadedFile = {
  id: 'file-1',
  taskId: 'task-1',
  comicId: '53339',
  comicTitle: '尖帽子的魔法工房',
  volId: '3089',
  volumeTitle: '話 089-095',
  format: 'epub',
  localPath: '/Users/example/Downloads/Kmoe/private.epub',
  sizeBytes: 1000,
  downloadedAt: '102'
}

describe('local state snapshots', () => {
  it('exports a redacted safe migration snapshot', () => {
    const snapshot = createLocalStateSnapshot({ settings, tasks: [task], library: [file], exportedAt: 'now' })
    const json = serializeLocalStateSnapshot(snapshot)

    expect(snapshot.safety).toMatchObject({
      runtimeSettings: 'not_exported',
      authorizationUrls: 'omitted',
      localPaths: 'redacted'
    })
    expect(snapshot.settings).toEqual({ concurrency: 1, preferredFormat: 'epub' })
    expect(json).not.toContain('/Users/example')
    expect(json).not.toContain('getdownurl.php')
    expect(snapshot.tasks[0]).toMatchObject({ status: 'queued', progress: 0 })
  })

  it('imports tasks and library metadata without restoring absolute paths', () => {
    const snapshot = createLocalStateSnapshot({ settings, tasks: [task], library: [file], exportedAt: 'now' })
    const imported = parseLocalStateSnapshot(serializeLocalStateSnapshot(snapshot))

    expect(imported.settings).toEqual({ concurrency: 1, preferredFormat: 'epub' })
    expect(imported.tasks).toHaveLength(1)
    expect(imported.tasks[0]).toMatchObject({
      id: 'task-1',
      status: 'queued',
      progress: 0,
      downloadedBytes: 0,
      errorMessage: 'Imported from migration snapshot; task needs authorization.'
    })
    expect(imported.tasks[0]).not.toHaveProperty('localPath')
    expect(imported.library[0].localPath).toContain('Imported metadata only')
    expect(imported.library[0].localPath).not.toContain('/Users/example')
  })

  it('rejects snapshots containing temporary authorization or credential data', () => {
    expect(() => parseLocalStateSnapshot('{"version":1,"url":"/getdownurl.php?b=1&v=2&json=1"}')).toThrow(
      'Snapshot contains sensitive or temporary authorization data.'
    )
    expect(() => parseLocalStateSnapshot('{"version":1,"password":"secret"}')).toThrow(
      'Snapshot contains sensitive or temporary authorization data.'
    )
  })

  it('requires redacted safety metadata before importing in browser fallback mode', () => {
    expect(() => parseLocalStateSnapshot('{"version":1,"settings":{"concurrency":1},"tasks":[],"library":[]}')).toThrow(
      'Snapshot safety metadata is missing or not redacted.'
    )

    const snapshot = createLocalStateSnapshot({ settings, tasks: [], library: [], exportedAt: 'now' })
    expect(() =>
      parseLocalStateSnapshot(
        JSON.stringify({
          ...snapshot,
          safety: { ...snapshot.safety, runtimeSettings: 'exported' }
        })
      )
    ).toThrow('Snapshot safety metadata is missing or not redacted.')
  })

  it('rejects local path or credential-like keys even when the value would be ignored', () => {
    const snapshot = createLocalStateSnapshot({ settings, tasks: [], library: [], exportedAt: 'now' })
    expect(() =>
      parseLocalStateSnapshot(
        JSON.stringify({
          ...snapshot,
          library: [{ ...file, localPath: '/Users/example/Downloads/Kmoe/private.epub' }]
        })
      )
    ).toThrow('Snapshot contains local path or credential fields.')

    expect(() =>
      parseLocalStateSnapshot(
        JSON.stringify({
          ...snapshot,
          tasks: [{ ...task, local_path: '/Users/example/Downloads/Kmoe/private.epub' }]
        })
      )
    ).toThrow('Snapshot contains local path or credential fields.')

    expect(() =>
      parseLocalStateSnapshot(
        JSON.stringify({
          ...snapshot,
          support: { download_urls: ['/get-file-later'] }
        })
      )
    ).toThrow('Snapshot contains local path or credential fields.')
  })

  it('creates filesystem-safe snapshot filenames', () => {
    expect(snapshotFileName('2026-05-21T04:30:00/Asia:Shanghai')).toBe('kmoe-client-snapshot-2026-05-21T04_30_00_Asia_Shanghai.json')
  })

  it('restores source zip as an explicit single-item preferred format', () => {
    const snapshot = createLocalStateSnapshot({
      settings: { ...settings, preferredFormat: 'source_zip' },
      tasks: [],
      library: [],
      exportedAt: 'now'
    })

    expect(snapshot.settings.preferredFormat).toBe('source_zip')
    expect(parseLocalStateSnapshot(serializeLocalStateSnapshot(snapshot)).settings.preferredFormat).toBe('source_zip')
  })

  it('imports source zip library metadata with a .zip link path', () => {
    const snapshot = createLocalStateSnapshot({
      settings,
      tasks: [],
      library: [{ ...file, id: 'source-file', format: 'source_zip' }],
      exportedAt: 'now'
    })

    expect(parseLocalStateSnapshot(serializeLocalStateSnapshot(snapshot)).library[0].localPath).toBe(
      'Imported metadata only/尖帽子的魔法工房 - 話 089-095.zip'
    )
  })

  it('keeps completed imported tasks completed but requeues non-final statuses', () => {
    const completed = { ...task, status: 'completed' as const, progress: 27, downloadedBytes: 500 }
    const failed = { ...task, id: 'failed-task', volId: '3090', status: 'failed' as const, progress: 27, downloadedBytes: 500, errorMessage: 'network error' }
    const snapshot = createLocalStateSnapshot({
      settings,
      tasks: [completed, failed],
      library: [],
      exportedAt: 'now'
    })
    const imported = parseLocalStateSnapshot(serializeLocalStateSnapshot(snapshot))

    expect(imported.tasks.find((item) => item.id === 'task-1')).toMatchObject({ status: 'completed', progress: 100, downloadedBytes: 500 })
    expect(imported.tasks.find((item) => item.id === 'failed-task')).toMatchObject({
      status: 'queued',
      progress: 0,
      downloadedBytes: 0,
      errorMessage: 'Imported from migration snapshot; task needs authorization.'
    })
  })
})
