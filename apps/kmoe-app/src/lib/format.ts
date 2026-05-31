import type { DownloadFormat, DownloadTaskStatus } from '../types/domain'

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

export function mbToBytes(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return Math.round(parsed * 1024 * 1024)
}

export function formatDownloadFormat(format: DownloadFormat): string {
  switch (format) {
    case 'mobi':
      return 'MOBI'
    case 'epub':
      return 'EPUB'
    case 'source_zip':
      return '源图 ZIP'
  }
}

export function statusLabel(status: DownloadTaskStatus): string {
  const labels: Record<DownloadTaskStatus, string> = {
    queued: '排队中',
    authorizing: '准备下载',
    downloading: '下载中',
    paused: '已暂停',
    verifying: '检查文件',
    completed: '已完成',
    failed: '下载失败',
    cancelled: '已取消'
  }
  return labels[status]
}

export function readableAppMessage(input: unknown, fallback = '操作暂时无法完成，请稍后重试。'): string {
  const message = input instanceof Error ? input.message : typeof input === 'string' ? input : ''
  const normalized = message.trim()
  if (!normalized) return fallback

  if (/已绑定.*文件/.test(normalized) && /资料库/.test(normalized)) return normalized.replace(/已绑定.*文件/, '已绑定文件')
  if (/Documents\/Kmoe/.test(normalized)) return '文件已保存，可在“文件”App 的 Kmoe 文件夹中查看。'
  if (/目录可用[:：]/.test(normalized)) return '保存位置可用。'
  if (/保存位置可用/.test(normalized)) return '保存位置可用，下载任务可以开始。'
  if (/请确认已经登录.*下载开始/.test(normalized)) return '请确认已经登录；开始下载前会再次检查账号状态。'

  const unavailable = normalized.match(/^当前.*环境暂不支持(.+?)。?$/)
  if (unavailable) return unavailableMessage(unavailable[1], fallback)

  if (/path is outside/i.test(normalized)) return '出于安全保护，只能打开资料库中的已完成文件。请重新绑定文件或重新下载。'
  if (/无法打开.*资料库|sqlite|rusqlite|database/i.test(normalized)) return '暂时无法读取资料库，请重新打开应用后重试。'
  if (/无法读取.*队列|无法读取首个 queued 任务|queued task/i.test(normalized)) return '暂时无法读取下载队列，请刷新后重试。'
  if (/failed to resolve|No such file|not found|找不到|不存在/i.test(normalized)) return '找不到这个文件，请确认文件没有被移动或删除。'
  if (/permission|denied|权限|拒绝/i.test(normalized)) return '没有访问权限，请检查保存位置权限后重试。'
  if (/network|timeout|timed out|fetch|连接|超时/i.test(normalized)) return '网络连接异常，请检查网络后重试。'
  if (/未登录|登录已过期|not authenticated|forbidden|401|403/i.test(normalized)) return '登录状态已失效，请重新登录。'
  if (/Mac|Tauri|Rust|IPC|native|command|dry[_ -]?run|preflight|download directory|download records|authorization|authorize/i.test(normalized)) {
    return fallback
  }
  if (containsSensitiveDetail(normalized)) return fallback
  if (!/[\u3400-\u9fff]/.test(normalized) && /[A-Za-z]/.test(normalized)) return fallback

  return normalized
}

export function readableDownloadIssue(input?: string): string {
  const message = input?.trim()
  if (!message) return ''
  if (/重新启动|重新确认/.test(message)) return '应用重启后需要重新确认，请重新启动队列。'
  if (/VIP only|insufficient quota|权限不足|额度不足/i.test(message)) return '当前账号暂不能下载此内容，请检查账号状态或额度。'
  if (/需要通過真實驗證|验证|驗證/.test(message)) return '需要完成站点验证后才能下载。'
  if (/制作中|製作中|不可下载|不可下載|限制/.test(message)) return '此内容暂时不能下载，请查看限制提示。'
  if (/user cancelled/i.test(message)) return '任务已取消。'
  return readableAppMessage(message, '任务暂时无法继续，请重试。')
}

function unavailableMessage(action: string, fallback: string): string {
  if (/读取应用设置/.test(action)) return '暂时无法读取应用设置，请重新打开应用后重试。'
  if (/读取保存位置/.test(action)) return '暂时无法读取保存位置，请稍后重试。'
  if (/更改保存位置/.test(action)) return '暂时无法更改保存位置，请检查文件访问权限后重试。'
  if (/打开文件/.test(action)) return '暂时无法打开文件，请确认文件仍在保存位置。'
  if (/导出文件/.test(action)) return '暂时无法导出文件，请稍后重试。'
  if (/打开文件夹|查看文件位置/.test(action)) return '暂时无法显示文件位置，请确认文件仍在保存位置。'
  if (/加入下载队列/.test(action)) return '暂时无法加入下载队列，请重新打开应用后重试。'
  if (/启动下载队列/.test(action)) return '暂时无法启动下载，请稍后重试。'
  if (/检查下载队列/.test(action)) return '暂时无法检查下载队列，请稍后重试。'
  if (/读取下载队列/.test(action)) return '暂时无法同步下载队列，请稍后重试。'
  if (/读取资料库/.test(action)) return '暂时无法同步资料库，请稍后重试。'
  if (/绑定.*文件/.test(action)) return '暂时无法绑定文件，请确认选择的是对应格式的文件。'
  if (/管理下载任务/.test(action)) return '暂时无法管理该任务，请稍后重试。'
  if (/清理下载队列/.test(action)) return '暂时无法清理未完成任务，请稍后重试。'
  if (/登录/.test(action)) return '暂时无法登录，请重新打开应用后重试。'
  if (/退出登录/.test(action)) return '暂时无法退出登录，请稍后重试。'
  if (/读取目录|读取详情|读取下载选项|读取账号信息/.test(action)) return '暂时无法连接 Kmoe，请检查网络后重试。'
  return fallback
}

function containsSensitiveDetail(message: string): boolean {
  return /https?:\/\//i.test(message) || /(^|[\s(（:：])(?:\/Users\/|\/var\/|\/tmp\/|~\/|[A-Za-z]:\\|%USERPROFILE%\\)/.test(message)
}

export function nowIso(): string {
  return new Date().toISOString()
}
