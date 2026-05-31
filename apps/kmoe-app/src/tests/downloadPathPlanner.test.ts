import { describe, expect, it } from 'vitest'
import { createDownloadPipelinePlan } from '../download/pipeline'
import { defaultDownloadDirectory, detectPlatformTarget, planDownloadPath } from '../download/pathPlanner'
import type { AppSettings, DownloadTask } from '../types/domain'

const task: DownloadTask = {
  id: '53339-3089-mobi',
  comicId: '53339',
  comicTitle: '尖帽子/魔法',
  volId: '3089',
  volumeTitle: '話 089-095',
  format: 'mobi',
  status: 'queued',
  progress: 0,
  downloadedBytes: 0,
  totalBytes: 1024,
  retryCount: 0,
  createdAt: '2026-05-21T00:00:00.000Z',
  updatedAt: '2026-05-21T00:00:00.000Z'
}

const settings: AppSettings = {
  concurrency: 1,
  preferredFormat: 'mobi',
  downloadDirectory: '~/Downloads/Kmoe',
  colorizeDetailPage: true,
  readerPageTurnAnimation: 'slide'
}

describe('download path planner', () => {
  it('plans final and part paths with sanitized comic folder', () => {
    const plan = planDownloadPath(task, settings, 'macos')
    expect(plan.relativeDirectory).toBe('尖帽子_魔法')
    expect(plan.filename).toBe('尖帽子_魔法 - 話 089-095.mobi')
    expect(plan.finalPath).toContain('~/Downloads/Kmoe/尖帽子_魔法/')
    expect(plan.partPath).toBe(`${plan.finalPath}.part`)
  })

  it('falls back to the platform default when browser path planning sees traversal', () => {
    const plan = planDownloadPath(task, { ...settings, downloadDirectory: '../private/Kmoe' }, 'macos')
    expect(plan.directory).toBe(defaultDownloadDirectory('macos'))
    expect(plan.finalPath).toContain('~/Downloads/Kmoe/尖帽子_魔法/')

    const windowsPlan = planDownloadPath(task, { ...settings, downloadDirectory: '%USERPROFILE%\\..\\Secret' }, 'windows')
    expect(windowsPlan.directory).toBe(defaultDownloadDirectory('windows'))
    expect(windowsPlan.finalPath).toContain('%USERPROFILE%\\Downloads\\Kmoe\\尖帽子_魔法\\')
  })

  it('uses platform defaults and detects known browser UA strings', () => {
    expect(defaultDownloadDirectory('windows')).toContain('Downloads')
    expect(defaultDownloadDirectory('ios')).toContain('Sandbox')
    expect(detectPlatformTarget('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows')
    expect(detectPlatformTarget('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('ios')
    expect(detectPlatformTarget('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')).toBe('macos')
    expect(
      detectPlatformTarget({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
        maxTouchPoints: 5,
        platform: 'MacIntel'
      })
    ).toBe('ipados')
    expect(detectPlatformTarget({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', maxTouchPoints: 0 })).toBe('linux')
    expect(detectPlatformTarget({ userAgent: '', maxTouchPoints: 0, platform: '' })).toBe('unknown')
  })

  it('creates a safe pipeline plan without persisted authorization URL semantics', () => {
    const plan = createDownloadPipelinePlan(task, settings, 'macos')
    expect(plan.scope).toBe('single-item')
    expect(plan.authorizationPathPreview).toBe('/getdownurl.php?b=53339&v=3089&mobi=1&vip=0&json=1')
    expect(plan.steps.find((step) => step.id === 'authorize')?.detail).toContain('账号状态')
  })

  it('documents real download verification in the GUI plan', () => {
    const plan = createDownloadPipelinePlan(task, settings, 'macos')
    expect(plan.steps.find((step) => step.id === 'download')?.detail).toContain('设备')
    expect(plan.steps.find((step) => step.id === 'library')?.detail).toContain('大小')
  })

  it('keeps the real download plan enabled without a runtime mode switch', () => {
    const plan = createDownloadPipelinePlan(task, settings, 'macos')

    expect(plan.steps.find((step) => step.id === 'authorize')?.detail).toContain('下载权限')
    expect(plan.steps.find((step) => step.id === 'download')?.label).toBe('下载文件')
    expect(plan.steps.find((step) => step.id === 'download')?.detail).toContain('完整')
  })
})
