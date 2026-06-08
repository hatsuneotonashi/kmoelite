import type { AppSettings, DownloadFormat, DownloadTask } from '../types/domain'
import { buildLocalFilename, containsPathTraversal, sanitizeFilename } from '../lib/sanitize'

export type PlatformTarget = 'macos' | 'windows' | 'ipados' | 'ios' | 'linux' | 'unknown'

export interface PlatformDetectionInput {
  userAgent?: string
  maxTouchPoints?: number
  platform?: string
}

export interface DownloadPathPlan {
  directory: string
  relativeDirectory: string
  filename: string
  finalPath: string
  partPath: string
  exportRequired: boolean
  platform: PlatformTarget
}

export function detectPlatformTarget(input?: string | PlatformDetectionInput): PlatformTarget {
  const runtimeNavigator = typeof navigator === 'undefined' ? undefined : navigator
  const userAgent =
    typeof input === 'string'
      ? input
      : input?.userAgent ?? runtimeNavigator?.userAgent ?? ''
  const maxTouchPoints =
    typeof input === 'string'
      ? runtimeNavigator?.maxTouchPoints ?? 0
      : input?.maxTouchPoints ?? runtimeNavigator?.maxTouchPoints ?? 0
  const platform =
    typeof input === 'string'
      ? runtimeNavigator?.platform ?? ''
      : input?.platform ?? runtimeNavigator?.platform ?? ''
  const ua = userAgent.toLowerCase()
  const platformName = platform.toLowerCase()
  if (/iphone|ipod/.test(ua)) return 'ios'
  if (
    /ipad/.test(ua) ||
    ((/macintosh|mac os x/.test(ua) || /mac/.test(platformName)) && maxTouchPoints > 1)
  ) {
    return 'ipados'
  }
  if (/mac os x|macintosh/.test(ua)) return 'macos'
  if (/windows/.test(ua)) return 'windows'
  if (/linux/.test(ua)) return 'linux'
  return 'unknown'
}

export function defaultDownloadDirectory(platform: PlatformTarget): string {
  switch (platform) {
    case 'windows':
      return '%USERPROFILE%\\Downloads\\Kmoe'
    case 'ipados':
    case 'ios':
      return 'App Internal/Kmoe'
    case 'linux':
      return '~/Downloads/Kmoe'
    case 'macos':
    case 'unknown':
      return '~/Downloads/Kmoe'
  }
}

export function planDownloadPath(task: Pick<DownloadTask, 'comicTitle' | 'volumeTitle' | 'format'>, settings: Pick<AppSettings, 'downloadDirectory'>, platform: PlatformTarget = detectPlatformTarget()): DownloadPathPlan {
  const directory = safeDownloadDirectory(settings.downloadDirectory, platform)
  const relativeDirectory = sanitizeFilename(task.comicTitle)
  const filename = buildLocalFilename({
    comicTitle: task.comicTitle,
    volumeTitle: task.volumeTitle,
    format: extensionForFormat(task.format)
  })
  const separator = directory.includes('\\') ? '\\' : '/'
  const finalPath = [directory.replace(/[\\/]+$/g, ''), relativeDirectory, filename].join(separator)
  return {
    directory,
    relativeDirectory,
    filename,
    finalPath,
    partPath: `${finalPath}.part`,
    exportRequired: platform === 'ios' || platform === 'ipados',
    platform
  }
}

function safeDownloadDirectory(input: string | undefined, platform: PlatformTarget): string {
  const fallback = defaultDownloadDirectory(platform)
  const directory = input?.trim() || fallback
  if (containsPathTraversal(directory)) return fallback
  return directory.replace(/[\u0000-\u001f]/g, '').trim() || fallback
}

export function extensionForFormat(format: DownloadFormat): string {
  switch (format) {
    case 'mobi':
      return 'mobi'
    case 'epub':
      return 'epub'
    case 'source_zip':
      return 'zip'
  }
}
