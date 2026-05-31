import { describe, expect, it } from 'vitest'
import { parseUserProfileHtml } from '../parsers/userProfile'
import { sanitizedMyPageSample } from './fixtures/liveSamples'

describe('parseUserProfileHtml', () => {
  it('extracts profile and quota hints from account HTML', () => {
    const profile = parseUserProfileHtml(`
      <html><body>
        <div>用戶：tester</div>
        <div>等級 Lv2</div>
        <div>VIP 未開通VIP</div>
        <div>目前可用額度 : 640 M</div>
        <div>已使用 128 M</div>
        <a href="/myphone.php">真實驗證</a>
      </body></html>
    `)

    expect(profile.nickname).toBe('tester')
    expect(profile.level).toBe('Lv2')
    expect(profile.isVip).toBe(false)
    expect(profile.quotaNow).toBe(640)
    expect(profile.quotaUsed).toBe(128)
    expect(profile.warnings.join(' ')).toContain('真实验证')
  })

  it('rejects login pages instead of parsing them as account data', () => {
    expect(() => parseUserProfileHtml('<html><body>請先登錄 郵箱帳號 帳號密碼 馬上登錄</body></html>')).toThrow('未登录')
  })

  it('handles missing non-login fields without throwing', () => {
    const profile = parseUserProfileHtml('<html><body>帳戶資料暫時不可用</body></html>')
    expect(profile.warnings.length).toBeGreaterThan(0)
    expect(profile.nickname).toBeUndefined()
  })

  it('extracts live account layout fields from sanitized /my.php HTML', () => {
    const profile = parseUserProfileHtml(sanitizedMyPageSample)

    expect(profile.id).toBe('123456')
    expect(profile.nickname).toBe('reader-safe')
    expect(profile.level).toBe('Lv1')
    expect(profile.isVip).toBe(true)
    expect(profile.vipStatus).toContain('2027-02-02')
    expect(profile.quotaNow).toBe(1920)
    expect(profile.quotaUsed).toBe(128)
    expect(profile.freeQuota).toBe(2048)
    expect(profile.vipQuota).toBe(40 * 1024)
    expect(profile.warnings.join(' ')).toContain('额度')
  })
})
