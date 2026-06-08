import { describe, expect, it } from 'vitest'
import { readableAppMessage, readableDownloadIssue } from '../lib/format'

describe('download-facing message formatting', () => {
  it('does not confuse site authorization failures with local file permissions', () => {
    expect(readableDownloadIssue('站点拒绝了本次下载，请确认登录状态、权限和剩余额度。')).toBe(
      '站点没有返回可下载文件，请重新登录并检查账号额度或下载权限。'
    )
    expect(readableAppMessage('未能取得可用的下载地址，请确认登录状态和下载权限。')).toBe(
      '站点没有返回可下载文件，请重新登录并检查账号额度或下载权限。'
    )
  })

  it('keeps local write failures separate from account permission failures', () => {
    expect(readableDownloadIssue('无法写入下载文件，请检查保存位置权限。')).toBe(
      '无法写入保存位置，请检查设备剩余空间后重试。'
    )
    expect(readableAppMessage('Permission denied')).toBe('没有访问权限，请检查保存位置权限后重试。')
  })
})
