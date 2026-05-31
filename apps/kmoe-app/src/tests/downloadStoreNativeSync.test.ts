import { beforeEach, describe, expect, it } from 'vitest'
import { useDownloadStore } from '../store/downloadStore'
import type { DownloadedFile, DownloadTask } from '../types/domain'

describe('downloadStore native synchronization', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useDownloadStore.setState({ tasks: [], library: [] })
  })

  it('replaces browser state with recovered native SQLite snapshots', () => {
    const task: DownloadTask = {
      id: 'native-task',
      comicId: '53339',
      comicTitle: '尖帽子的魔法工房',
      volId: '3089',
      volumeTitle: '話 089-095',
      format: 'mobi',
      status: 'downloading',
      progress: 44,
      downloadedBytes: 1024,
      totalBytes: 2048,
      retryCount: 0,
      createdAt: '100',
      updatedAt: '101'
    }
    const file: DownloadedFile = {
      id: 'native-file',
      taskId: 'native-task',
      comicId: '53339',
      comicTitle: '尖帽子的魔法工房',
      volId: '3089',
      volumeTitle: '話 089-095',
      format: 'mobi',
      localPath: '/tmp/Kmoe/witch-hat.mobi',
      downloadedAt: '102'
    }

    useDownloadStore.getState().replaceWithNativeSnapshot({ tasks: [task], library: [file] })

    expect(useDownloadStore.getState().tasks).toHaveLength(1)
    expect(useDownloadStore.getState().tasks[0]).toMatchObject({
      id: 'native-task',
      status: 'queued',
      progress: 0,
      downloadedBytes: 0,
      errorMessage: '应用重新启动，需要重新确认下载。'
    })
    expect(useDownloadStore.getState().tasks[0].localPath).toBeUndefined()
    expect(useDownloadStore.getState().library).toEqual([file])
  })

  it('does not auto-retry failed native snapshots during browser fallback recovery', () => {
    const task: DownloadTask = {
      id: 'failed-native-task',
      comicId: '14140',
      comicTitle: '地下忍者',
      volId: '3156',
      volumeTitle: '卷 01',
      format: 'epub',
      status: 'failed',
      progress: 31,
      downloadedBytes: 4096,
      totalBytes: 8192,
      retryCount: 1,
      errorMessage: 'network timeout',
      createdAt: '100',
      updatedAt: '101'
    }

    useDownloadStore.getState().replaceWithNativeSnapshot({ tasks: [task], library: [] })

    expect(useDownloadStore.getState().tasks[0]).toEqual(task)
  })

  it('replaces only the library when a native library refresh succeeds', () => {
    const file: DownloadedFile = {
      id: 'library-only',
      comicId: '10180',
      comicTitle: 'GRAND BLUE 碧藍之海',
      volId: '1001',
      volumeTitle: '卷 01',
      format: 'epub',
      localPath: '/tmp/Kmoe/grand-blue.epub',
      downloadedAt: '200'
    }

    useDownloadStore.getState().replaceLibrary([file])

    expect(useDownloadStore.getState().library).toEqual([file])
  })

  it('does not surface legacy dry-run marker records as product downloads', () => {
    const task: DownloadTask = {
      id: 'legacy-fixture-task',
      comicId: '53339',
      comicTitle: '尖帽子的魔法工房',
      volId: '3089',
      volumeTitle: '話 089-095',
      format: 'mobi',
      status: 'dry_run_completed' as unknown as DownloadTask['status'],
      progress: 100,
      downloadedBytes: 2048,
      totalBytes: 2048,
      retryCount: 0,
      localPath: '/tmp/Kmoe/witch-hat.mobi.dry-run.txt',
      createdAt: '100',
      updatedAt: '101'
    }
    const file: DownloadedFile = {
      id: 'legacy-fixture-file',
      taskId: 'legacy-fixture-task',
      comicId: '53339',
      comicTitle: '尖帽子的魔法工房',
      volId: '3089',
      volumeTitle: '話 089-095',
      format: 'mobi',
      localPath: '/tmp/Kmoe/witch-hat.mobi.dry-run.txt',
      downloadedAt: '102'
    }

    const snapshot = useDownloadStore.getState().replaceWithNativeSnapshot({ tasks: [task], library: [file] })

    expect(snapshot).toEqual({ tasks: [], library: [] })
    expect(useDownloadStore.getState().tasks).toEqual([])
    expect(useDownloadStore.getState().library).toEqual([])
  })

  it('cleans stale marker paths before reporting synchronized product counts', () => {
    const task = {
      ...sampleTask('real-completed-task', '3089', '100'),
      status: 'completed' as const,
      progress: 100,
      downloadedBytes: 2048,
      totalBytes: 2048,
      localPath: '/tmp/Kmoe/witch-hat.mobi'
    }
    const staleTask = {
      ...sampleTask('stale-marker-task', '3001', '101'),
      status: 'completed' as const,
      progress: 100,
      downloadedBytes: 2048,
      totalBytes: 2048,
      localPath: '/tmp/Kmoe/witch-hat.mobi.dry-run.txt'
    }
    const file = sampleDownloadedFile('real-completed-file', 'real-completed-task', '/tmp/Kmoe/witch-hat.mobi')
    const staleFile = sampleDownloadedFile('stale-marker-file', 'stale-marker-task', '/tmp/Kmoe/witch-hat.mobi.dry-run.txt')

    const snapshot = useDownloadStore.getState().replaceWithNativeSnapshot(
      { tasks: [task, staleTask], library: [file, staleFile] },
      { recoverInterrupted: false }
    )

    expect(snapshot.tasks.map((item) => item.id)).toEqual(['real-completed-task'])
    expect(snapshot.library.map((item) => item.id)).toEqual(['real-completed-file'])
    expect(useDownloadStore.getState().tasks.map((item) => item.id)).toEqual(['real-completed-task'])
    expect(useDownloadStore.getState().library.map((item) => item.id)).toEqual(['real-completed-file'])
  })

  it('cleans stale persisted records during browser fallback hydration', async () => {
    const task = sampleTask('persisted-task', '3089', '100')
    const staleTask = {
      ...sampleTask('persisted-stale-marker-task', '3001', '101'),
      status: 'completed' as const,
      progress: 100,
      localPath: '/tmp/Kmoe/witch-hat.mobi.dry-run.txt'
    }
    const file = sampleDownloadedFile('persisted-file', 'persisted-task', 'Imported metadata only/尖帽子的魔法工房 - 話 089-095.mobi')
    const staleFile = sampleDownloadedFile('persisted-stale-marker-file', 'persisted-stale-marker-task', '/tmp/Kmoe/witch-hat.mobi.dry-run.txt')

    window.localStorage.setItem(
      'kmoe-client-downloads',
      JSON.stringify({
        state: { tasks: [task, staleTask], library: [file, staleFile] },
        version: 0
      })
    )

    await useDownloadStore.persist.rehydrate()

    expect(useDownloadStore.getState().tasks.map((item) => item.id)).toEqual(['persisted-task'])
    expect(useDownloadStore.getState().library.map((item) => item.id)).toEqual(['persisted-file'])
  })

  it('can preserve native active states for an in-flight queue snapshot', () => {
    const task: DownloadTask = {
      id: 'active-native-task',
      comicId: '53339',
      comicTitle: '尖帽子的魔法工房',
      volId: '3089',
      volumeTitle: '話 089-095',
      format: 'mobi',
      status: 'downloading',
      progress: 44,
      downloadedBytes: 1024,
      totalBytes: 2048,
      retryCount: 0,
      createdAt: '100',
      updatedAt: '101'
    }

    useDownloadStore.getState().replaceWithNativeSnapshot({ tasks: [task], library: [] }, { recoverInterrupted: false })

    expect(useDownloadStore.getState().tasks[0]).toMatchObject({
      id: 'active-native-task',
      status: 'downloading',
      progress: 44
    })
    expect(useDownloadStore.getState().tasks[0].errorMessage).toBeUndefined()
  })

  it('keeps queued tasks inert until a native snapshot arrives', () => {
    const task: DownloadTask = {
      id: 'browser-runtime-required',
      comicId: '53339',
      comicTitle: '尖帽子的魔法工房',
      volId: '3089',
      volumeTitle: '話 089-095',
      format: 'mobi',
      status: 'queued',
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 2048,
      retryCount: 0,
      createdAt: '100',
      updatedAt: '100'
    }
    useDownloadStore.setState({ tasks: [task], library: [] })

    expect(useDownloadStore.getState().tasks[0]).toEqual(task)
    expect(useDownloadStore.getState().library).toEqual([])
    expect(Object.prototype.hasOwnProperty.call(useDownloadStore.getState(), 'startQueue')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(useDownloadStore.getState(), 'pauseTask')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(useDownloadStore.getState(), 'clearQueue')).toBe(false)
  })

  it('appends new local tasks without executing a browser fallback queue', () => {
    const older = sampleTask('older-task', '3001', '100')
    const newer = sampleTask('newer-task', '3089', '101')
    useDownloadStore.setState({ tasks: [older], library: [] })

    const created = useDownloadStore.getState().addTasks([newer])

    expect(created.map((task) => task.id)).toEqual(['newer-task'])
    expect(useDownloadStore.getState().tasks.map((task) => task.id)).toEqual(['older-task', 'newer-task'])
    expect(useDownloadStore.getState().tasks.map((task) => task.status)).toEqual(['queued', 'queued'])
  })
})

function sampleTask(id: string, volId: string, createdAt: string): DownloadTask {
  return {
    id,
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volId,
    volumeTitle: `話 ${volId}`,
    format: 'mobi',
    status: 'queued',
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 2048,
    retryCount: 0,
    createdAt,
    updatedAt: createdAt
  }
}

function sampleDownloadedFile(id: string, taskId: string, localPath: string): DownloadedFile {
  return {
    id,
    taskId,
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volId: '3089',
    volumeTitle: '話 089-095',
    format: 'mobi',
    localPath,
    downloadedAt: '102'
  }
}
