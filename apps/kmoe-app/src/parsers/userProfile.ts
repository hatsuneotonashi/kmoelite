import type { UserProfile } from '../types/domain'

export function parseUserProfileHtml(html: string): UserProfile {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#64;|&commat;/g, '@')
    .replace(/&equiv;/g, '=')
    .replace(/\s+/g, ' ')
    .trim()

  if (isLoginPageText(text)) {
    throw new Error('当前会话未登录或已过期。')
  }

  const quotaNow = readSize(text, [
    /目前可用額度\s*[:：]\s*([0-9.]+)\s*([MG])/i,
    /目前可用额度\s*[:：]\s*([0-9.]+)\s*([MG])/i,
    /剩餘\s*[:：]\s*([0-9.]+)\s*([MG])/i,
    /剩余\s*[:：]\s*([0-9.]+)\s*([MG])/i
  ])
  const quotaUsed = readSize(text, [
    /本月已用免費額度\s*[:：]\s*([0-9.]+)\s*([MG])/i,
    /本月已用免费额度\s*[:：]\s*([0-9.]+)\s*([MG])/i,
    /本月已經用VIP額度\s*[:：]\s*([0-9.]+)\s*([MG])/i,
    /本月已经用VIP额度\s*[:：]\s*([0-9.]+)\s*([MG])/i,
    /今日已用\s*[:：]\s*([0-9.]+)\s*([MG])/i,
    /(?:已用|使用|已使用)[^0-9]{0,8}([0-9.]+)\s*([MG])/i
  ])
  const freeQuota = readSize(text, [
    /Lv\s*\d+\s*額度[^。]*?每月額度為\s*([0-9.]+)\s*([MG])/i,
    /Lv\s*\d+\s*额度[^。]*?每月额度为\s*([0-9.]+)\s*([MG])/i,
    /Lv\s*\d+\s*每月額度\s*[:：]\s*([0-9.]+)\s*([MG])/i,
    /Lv\s*\d+\s*每月额度\s*[:：]\s*([0-9.]+)\s*([MG])/i,
    /免費[^0-9]{0,12}([0-9.]+)\s*([MG])/i,
    /免费[^0-9]{0,12}([0-9.]+)\s*([MG])/i
  ])
  const vipQuota = readSize(text, [
    /VIP\s*額度[^。]*?每月額度為\s*([0-9.]+)\s*([MG])/i,
    /VIP\s*额度[^。]*?每月额度为\s*([0-9.]+)\s*([MG])/i,
    /VIP\s*每月額度\s*[:：]\s*([0-9.]+)\s*([MG])/i,
    /VIP\s*每月额度\s*[:：]\s*([0-9.]+)\s*([MG])/i
  ])

  return {
    id: text.match(/(?:KMOE\s*ID|UID|用戶ID|用户ID)\s*[:：]?\s*([0-9]+)/i)?.[1],
    nickname: readFirst(text, [
      /暱稱\s*[:：]\s*([^ ]+)/,
      /昵稱\s*[:：]\s*([^ ]+)/,
      /昵称\s*[:：]\s*([^ ]+)/,
      /用戶\s*[:：]\s*([^ ]+)/,
      /用户\s*[:：]\s*([^ ]+)/
    ]),
    level: text.match(/Lv\s*\d+/i)?.[0]?.replace(/\s+/g, ''),
    isVip: /VIP/i.test(text) && !/非VIP|未開通VIP|未开通VIP|VIP未/i.test(text),
    vipStatus: readFirst(text, [/VIP\s*期限至\s*([0-9-]+)/i, /(VIP[^。]{0,40})/i]),
    quotaNow,
    quotaUsed,
    freeQuota,
    vipQuota,
    warnings: collectWarnings(text)
  }
}

function readFirst(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const value = text.match(pattern)?.[1]?.trim()
    if (value) return value
  }
  return undefined
}

function readSize(text: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    const value = readMegabytes(match?.[1], normalizeUnit(match?.[2]))
    if (value !== undefined) return value
  }
  return undefined
}

function normalizeUnit(unit: string | undefined): 'M' | 'G' {
  return unit?.toUpperCase() === 'G' ? 'G' : 'M'
}

function readMegabytes(value: string | undefined, unit: 'M' | 'G' = 'M'): number | undefined {
  const parsed = Number.parseFloat(value ?? '')
  if (!Number.isFinite(parsed)) return undefined
  return unit === 'G' ? parsed * 1024 : parsed
}

function collectWarnings(text: string): string[] {
  const warnings = ['账号信息来自当前站点会话，请以实际下载时的站点返回为准。']
  if (/真實驗證|真实验证/.test(text)) warnings.push('账号可能需要完成真实验证后才能使用部分下载权限。')
  if (/VIP/.test(text)) warnings.push('VIP 权益和有效期由站点规则决定。')
  if (/額度|额度/.test(text)) warnings.push('额度仅用于展示，下载时仍以站点实时扣减和限制为准。')
  return warnings
}

function isLoginPageText(text: string): boolean {
  return /請先登錄|请先登录|登錄 郵箱帳號|登录 邮箱账号|帳號密碼|账号密码|馬上登錄|马上登录/.test(text)
}
