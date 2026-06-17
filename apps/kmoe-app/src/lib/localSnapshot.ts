import { createDedupedTasks, recoverTaskAfterRestart } from '../download/stateMachine'
import { nowIso } from './format'
import { sanitizeFilename } from './sanitize'
import { normalizeConcurrency } from './config'
import type { AppSettings, DownloadFormat, DownloadTask, DownloadTaskStatus, DownloadedFile } from '../types/domain'

export interface LocalStateSnapshot {
  version: 1
  exportedAt: string
  safety: {
    runtimeSettings: 'not_exported'
    authorizationUrls: 'omitted'
    localPaths: 'redacted'
  }
  settings: {
    concurrency: number
    preferredFormat: DownloadFormat
  }
  tasks: Array<Omit<DownloadTask, 'localPath'>>
  library: Array<Omit<DownloadedFile, 'localPath'>>
}

const FORMATS: DownloadFormat[] = ['mobi', 'epub', 'source_zip']
const PREFERRED_FORMATS: DownloadFormat[] = ['epub', 'source_zip', 'mobi']
const STATUSES: DownloadTaskStatus[] = [
  'queued',
  'authorizing',
  'downloading',
  'paused',
  'verifying',
  'completed',
  'failed',
  'cancelled'
]

const FORBIDDEN_SNAPSHOT_PATTERN = new RegExp(
  [
    'getdownurl\\.php',
    `Set-${'Cookie'}:`,
    `Authorization:\\s*${'Bearer'}`,
    `cookies?\\.${'txt'}`,
    "[\"']?(session|token|password)[\"']?\\s*[=:]"
  ].join('|'),
  'i'
)

export function createLocalStateSnapshot(input: {
  settings: AppSettings
  tasks: DownloadTask[]
  library: DownloadedFile[]
  exportedAt?: string
}): LocalStateSnapshot {
  return {
    version: 1,
    exportedAt: input.exportedAt ?? nowIso(),
    safety: {
      runtimeSettings: 'not_exported',
      authorizationUrls: 'omitted',
      localPaths: 'redacted'
    },
    settings: {
      concurrency: normalizeConcurrency(input.settings.concurrency),
      preferredFormat: PREFERRED_FORMATS.includes(input.settings.preferredFormat) ? input.settings.preferredFormat : 'epub'
    },
    tasks: input.tasks.map((task) => {
      const { localPath: _localPath, ...rest } = recoverTaskAfterRestart(task)
      return rest
    }),
    library: input.library.map((file) => {
      const { localPath: _localPath, ...rest } = file
      return rest
    })
  }
}

export function serializeLocalStateSnapshot(snapshot: LocalStateSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`
}

export function snapshotFileName(exportedAt = nowIso()): string {
  return `kmoe-client-snapshot-${sanitizeFilename(exportedAt, 'snapshot')}.json`
}

export function parseLocalStateSnapshot(raw: string): {
  settings: Pick<AppSettings, 'concurrency' | 'preferredFormat'>
  tasks: DownloadTask[]
  library: DownloadedFile[]
} {
  if (FORBIDDEN_SNAPSHOT_PATTERN.test(raw)) {
    throw new Error('Snapshot contains sensitive or temporary authorization data.')
  }

  const parsed = JSON.parse(raw) as Partial<LocalStateSnapshot>
  if (parsed.version !== 1) throw new Error('Unsupported snapshot version.')
  validateSnapshotSafety(parsed)

  const settings = {
    concurrency: normalizeConcurrency(parsed.settings?.concurrency),
    preferredFormat: PREFERRED_FORMATS.includes(parsed.settings?.preferredFormat as DownloadFormat)
      ? (parsed.settings?.preferredFormat as DownloadFormat)
      : 'epub'
  }

  const tasks = createDedupedTasks([], (Array.isArray(parsed.tasks) ? parsed.tasks : []).map(readTask)).map(recoverTaskAfterRestart)
  const library = (Array.isArray(parsed.library) ? parsed.library : []).map(readLibraryFile)

  return { settings, tasks, library }
}

function readTask(input: Partial<DownloadTask>): DownloadTask {
  const format = readFormat(input.format)
  const rawStatus = STATUSES.includes(input.status as DownloadTaskStatus) ? (input.status as DownloadTaskStatus) : 'queued'
  const status: DownloadTaskStatus = ['completed', 'cancelled'].includes(rawStatus) ? rawStatus : 'queued'
  const isCompleted = status === 'completed'
  return {
    id: readString(input.id, `task-${readString(input.comicId, 'unknown')}-${readString(input.volId, 'unknown')}-${format}`),
    comicId: readString(input.comicId, 'unknown'),
    comicTitle: readString(input.comicTitle, 'Unknown Comic'),
    volId: readString(input.volId, 'unknown'),
    volumeTitle: readString(input.volumeTitle, 'Unknown Volume'),
    format,
    status,
    progress: isCompleted ? 100 : 0,
    downloadedBytes: isCompleted ? Math.max(0, Number(input.downloadedBytes) || 0) : 0,
    totalBytes: input.totalBytes === undefined ? undefined : Math.max(0, Number(input.totalBytes) || 0),
    retryCount: Math.max(0, Math.min(3, Math.trunc(Number(input.retryCount) || 0))),
    errorMessage: status === 'queued' ? 'Imported from migration snapshot; task needs authorization.' : typeof input.errorMessage === 'string' ? input.errorMessage : undefined,
    createdAt: readString(input.createdAt, nowIso()),
    updatedAt: readString(input.updatedAt, nowIso())
  }
}

function readLibraryFile(input: Partial<DownloadedFile>): DownloadedFile {
  const format = readFormat(input.format)
  const comicTitle = readString(input.comicTitle, 'Unknown Comic')
  const volumeTitle = readString(input.volumeTitle, 'Unknown Volume')
  return {
    id: readString(input.id, `imported-${readString(input.comicId, 'unknown')}-${readString(input.volId, 'unknown')}-${format}`),
    taskId: typeof input.taskId === 'string' ? input.taskId : undefined,
    comicId: readString(input.comicId, 'unknown'),
    comicTitle,
    volId: readString(input.volId, 'unknown'),
    volumeTitle,
    format,
    localPath: `Imported metadata only/${sanitizeFilename(comicTitle)} - ${sanitizeFilename(volumeTitle)}.${extensionForFormat(format)}`,
    sizeBytes: input.sizeBytes === undefined ? undefined : Math.max(0, Number(input.sizeBytes) || 0),
    downloadedAt: readString(input.downloadedAt, nowIso())
  }
}

function readFormat(value: unknown): DownloadFormat {
  return FORMATS.includes(value as DownloadFormat) ? (value as DownloadFormat) : 'mobi'
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function extensionForFormat(format: DownloadFormat): string {
  return format === 'source_zip' ? 'zip' : format
}

function validateSnapshotSafety(snapshot: Partial<LocalStateSnapshot>): void {
  const safety = snapshot.safety
  if (
    !isValidSnapshotSafetyMetadata(safety)
  ) {
    throw new Error('Snapshot safety metadata is missing or not redacted.')
  }

  if (containsForbiddenSnapshotKey(snapshot)) {
    throw new Error('Snapshot contains local path or credential fields.')
  }
}

function isValidSnapshotSafetyMetadata(safety: Partial<LocalStateSnapshot>['safety']): boolean {
  if (!safety) return false
  return safety.runtimeSettings === 'not_exported' &&
    safety.authorizationUrls === 'omitted' &&
    safety.localPaths === 'redacted'
}

const FORBIDDEN_SNAPSHOT_KEYS = new Set([
  'localpath',
  'localpaths',
  'authorizationurl',
  'authorizationurls',
  'downloadurl',
  'downloadurls',
  'session',
  'sessions',
  'token',
  'tokens',
  'password',
  'passwords',
  'cookie',
  'cookies',
  'setcookie'
])

function containsForbiddenSnapshotKey(value: unknown, path: string[] = []): boolean {
  if (Array.isArray(value)) return value.some((child) => containsForbiddenSnapshotKey(child, path))
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, child]) => {
    const normalized = normalizeSnapshotKey(key)
    const allowedSafetyMetadata =
      path.length === 1 &&
      path[0] === 'safety' &&
      ((normalized === 'localpaths' && child === 'redacted') ||
        (normalized === 'authorizationurls' && child === 'omitted'))
    return (
      (!allowedSafetyMetadata && FORBIDDEN_SNAPSHOT_KEYS.has(normalized)) ||
      containsForbiddenSnapshotKey(child, [...path, normalized])
    )
  })
}

function normalizeSnapshotKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}
