import { describe, expect, it } from 'vitest'
import { compareDownloadQueueOrder, createDedupedTasks, DEFAULT_CONCURRENCY, makeDownloadTask, makeOrderedDownloadTasks, MAX_RETRY_COUNT, transitionTask, canRetry, recoverTaskAfterRestart } from '../download/stateMachine'
import { sampleDetails } from './fixtures/domainSamples'

describe('download state machine', () => {
  it('defaults concurrency to one and creates deduped local tasks', () => {
    expect(DEFAULT_CONCURRENCY).toBe(1)
    const task = makeDownloadTask({ comic: sampleDetails[0], volId: '3089', format: 'mobi' })!
    const deduped = createDedupedTasks([task], [task])
    expect(deduped).toHaveLength(0)
  })

  it('creates batch-selected tasks as stable single-item queue entries', () => {
    const tasks = makeOrderedDownloadTasks({
      comic: sampleDetails[0],
      selectedVolIds: ['3001', '3081', '3089'],
      format: 'epub'
    })

    expect(tasks.map((task) => task.volId)).toEqual(['3001', '3081', '3089'])
    expect(tasks.every((task) => task.status === 'queued')).toBe(true)
    expect(tasks[0].createdAt < tasks[1].createdAt).toBe(true)
    expect([...tasks].sort(compareDownloadQueueOrder).map((task) => task.volId)).toEqual(['3001', '3081', '3089'])
  })

  it('transitions through real download states', () => {
    const task = makeDownloadTask({ comic: sampleDetails[0], volId: '3089', format: 'mobi' })!
    const authorizing = transitionTask(task, 'start')
    const downloading = transitionTask(authorizing, 'authorize')
    const verifying = transitionTask(downloading, 'complete', { progress: 100 })
    const done = transitionTask(verifying, 'complete')
    expect(done.status).toBe('completed')
    expect(done.progress).toBe(100)
  })

  it('keeps browser fallback pause and cancel parity with the native queue', () => {
    const task = makeDownloadTask({ comic: sampleDetails[0], volId: '3089', format: 'mobi' })!
    const authorizing = transitionTask(task, 'start')
    expect(transitionTask(authorizing, 'pause').status).toBe('paused')

    const downloading = transitionTask(authorizing, 'authorize')
    const verifying = transitionTask(downloading, 'complete')
    expect(verifying.status).toBe('verifying')
    expect(transitionTask(verifying, 'cancel').status).toBe('cancelled')
  })

  it('does not apply patches for invalid state transitions', () => {
    const task = makeDownloadTask({ comic: sampleDetails[0], volId: '3089', format: 'mobi' })!
    const invalidProgress = transitionTask(task, 'progress', {
      progress: 99,
      downloadedBytes: 4096,
      localPath: '/tmp/should-not-apply.mobi'
    })

    expect(invalidProgress).toBe(task)
    expect(invalidProgress).toMatchObject({
      status: 'queued',
      progress: 0,
      downloadedBytes: 0
    })
    expect(invalidProgress.localPath).toBeUndefined()
  })

  it('caps retry for policy errors', () => {
    const task = makeDownloadTask({ comic: sampleDetails[0], volId: '3089', format: 'mobi' })!
    expect(MAX_RETRY_COUNT).toBe(3)
    expect(canRetry({ ...task, status: 'queued', retryCount: 0, errorMessage: 'network timeout' })).toBe(false)
    expect(canRetry({ ...task, status: 'completed', retryCount: 0, errorMessage: 'network timeout' })).toBe(false)
    expect(canRetry({ ...task, status: 'failed', retryCount: 0, errorMessage: 'network timeout' })).toBe(true)
    expect(canRetry({ ...task, status: 'cancelled', retryCount: 0, errorMessage: 'user cancelled' })).toBe(true)
    expect(canRetry({ ...task, status: 'failed', retryCount: 0, errorMessage: '需要通過真實驗證後才可下載' })).toBe(false)
    expect(canRetry({ ...task, status: 'failed', retryCount: 0, errorMessage: '权限不足' })).toBe(false)
    expect(canRetry({ ...task, status: 'failed', retryCount: 0, errorMessage: 'insufficient quota' })).toBe(false)
    expect(canRetry({ ...task, status: 'failed', retryCount: 0, errorMessage: '制作中，暫不可下載' })).toBe(false)
    expect(canRetry({ ...task, status: 'failed', retryCount: 3, errorMessage: 'network timeout' })).toBe(false)
  })

  it('does not create queue tasks for restricted volume options', () => {
    expect(makeDownloadTask({ comic: sampleDetails[1], volId: '1001', format: 'mobi' })).toBeDefined()
    expect(makeDownloadTask({ comic: sampleDetails[1], volId: '1011', format: 'mobi' })).toBeUndefined()
    expect(makeDownloadTask({ comic: sampleDetails[1], volId: '3156', format: 'mobi' })).toBeUndefined()
    expect(makeDownloadTask({ comic: sampleDetails[2], volId: '1022', format: 'epub' })).toBeUndefined()
  })

  it('recovers only interrupted active tasks after restart', () => {
    const task = makeDownloadTask({ comic: sampleDetails[0], volId: '3089', format: 'mobi' })!
    const recovered = recoverTaskAfterRestart({
      ...task,
      status: 'downloading',
      progress: 44,
      downloadedBytes: 1024,
      localPath: '/tmp/stale.part'
    })

    expect(recovered).toMatchObject({
      status: 'queued',
      progress: 0,
      downloadedBytes: 0,
      errorMessage: '应用重新启动，需要重新确认下载。'
    })
    expect(recovered.localPath).toBeUndefined()

    const failed = { ...task, status: 'failed' as const, progress: 55, errorMessage: 'network timeout' }
    expect(recoverTaskAfterRestart(failed)).toEqual(failed)

    const paused = { ...task, status: 'paused' as const, progress: 55 }
    expect(recoverTaskAfterRestart(paused)).toEqual(paused)
  })
})
