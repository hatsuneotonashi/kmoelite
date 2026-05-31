import { describe, expect, it } from 'vitest'
import { buildDownloadAuthorizeUrl, buildDownloadAuthorizeUrlFallbacks, classifyDownloadScope } from '../parsers/downloadUrl'

describe('buildDownloadAuthorizeUrl', () => {
  it('builds mobi and epub single-item authorize URLs', () => {
    expect(buildDownloadAuthorizeUrl({ bookId: '53339', volId: '3089', format: 'mobi', line: 0 })).toBe('/getdownurl.php?b=53339&v=3089&mobi=1&vip=0&json=1')
    expect(buildDownloadAuthorizeUrl({ bookId: '53339', volId: '3089', format: 'epub', line: 1 })).toBe('/getdownurl.php?b=53339&v=3089&mobi=2&vip=1&json=1')
    expect(buildDownloadAuthorizeUrl({ bookId: '53339', volId: '3089', format: 'source_zip', line: 0 })).toContain('mobi=0')
  })

  it('classifies site-returned package and batch-like scopes without allowing the builder to create them', () => {
    expect(classifyDownloadScope('/getdownurl.php?b=53339&v=1&mobi=1&vip=9&json=1')).toBe('whole_comic')
    expect(classifyDownloadScope('/getdownurl.php?b=53339&v=1&mobi=1&vip=0&batch=1,2')).toBe('batch')
    expect(() => buildDownloadAuthorizeUrl({ bookId: '53339', volId: '3089', format: 'mobi', line: 9 })).toThrow(/Invalid download line/)
    expect(() => buildDownloadAuthorizeUrl({ bookId: '53339', volId: '3089,3090', format: 'mobi', line: 0 })).toThrow(/Invalid vol/)
  })

  it('builds single-item fallback authorize URLs without falling into package lines', () => {
    expect(buildDownloadAuthorizeUrlFallbacks({ bookId: '53339', volId: '3089', format: 'mobi' })).toEqual([
      '/getdownurl.php?b=53339&v=3089&mobi=1&vip=0&json=1',
      '/getdownurl.php?b=53339&v=3089&mobi=1&vip=1&json=1'
    ])
    expect(buildDownloadAuthorizeUrlFallbacks({ bookId: '53339', volId: '3089', format: 'epub', line: 1 })).toEqual([
      '/getdownurl.php?b=53339&v=3089&mobi=2&vip=1&json=1',
      '/getdownurl.php?b=53339&v=3089&mobi=2&vip=0&json=1'
    ])
    expect(() => buildDownloadAuthorizeUrlFallbacks({ bookId: '53339', volId: '3089', format: 'mobi', line: 9 })).toThrow(/Invalid download line/)
  })

  it('still rejects malformed local authorize input', () => {
    expect(() => buildDownloadAuthorizeUrl({ bookId: '../53339', volId: '3089', format: 'mobi', line: 0 })).toThrow(/Invalid book/)
    expect(() => buildDownloadAuthorizeUrl({ bookId: '53339', volId: '../3089', format: 'mobi', line: 0 })).toThrow(/Invalid vol/)
    expect(() => buildDownloadAuthorizeUrl({ bookId: '53339', volId: '3089', format: 'mobi', line: 2 })).toThrow(/Invalid download line/)
  })
})
