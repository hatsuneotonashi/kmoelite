import { describe, expect, it } from 'vitest'
import { parseVolInfo, parseVolInfoLine } from '../parsers/volInfo'
import { liveLikeBookDataSample } from './fixtures/liveSamples'

describe('parseVolInfo', () => {
  it('parses postMessage volinfo rows', () => {
    const rows = `<script>parent.postMessage( "volinfo=3001,0,0,話,1,話 001-006,232,232,0.0,51.9,43.0,51.0,,,2025-08-23 960x1280,2026-04-21 960x1280,2026-04-21 860x1146", "*" );</script>`
    const options = parseVolInfo(rows, '53339')
    expect(options).toHaveLength(1)
    expect(options[0]).toMatchObject({
      comicId: '53339',
      volId: '3001',
      kind: 'chapter_group',
      displayTitle: '話 001-006',
      pageCount: 232,
      docPageCount: 232,
      availableFormats: ['mobi', 'epub', 'source_zip']
    })
    expect(options[0].sizes.mobi).toBeGreaterThan(50 * 1024 * 1024)
  })

  it('parses single volume rows and missing sizes', () => {
    const option = parseVolInfoLine('1001,0,1,單行本,1,卷 01,190,188,0,0,0,0', '14140')
    expect(option?.kind).toBe('volume')
    expect(option?.restrictions).toContain('文檔製作中或暫不可下載')
  })

  it('parses multiple live-like book_data rows without requiring authorization URLs', () => {
    const options = parseVolInfo(liveLikeBookDataSample, '53339')

    expect(options).toHaveLength(2)
    expect(options.map((option) => option.volId)).toEqual(['3001', '3007'])
    expect(options.every((option) => option.availableFormats.includes('mobi'))).toBe(true)
    expect(options.every((option) => option.availableFormats.includes('epub'))).toBe(true)
    expect(options.every((option) => option.availableFormats.includes('source_zip'))).toBe(true)
  })

  it('parses single-quoted postMessage rows without swallowing script suffixes', () => {
    const rows = `<script>parent.postMessage('volinfo=3089,0,0,話,89,話 089-095,94,94,0.0,22.4,21.9,21.7', '*');</script>`
    const options = parseVolInfo(rows, '53339')

    expect(options).toHaveLength(1)
    expect(options[0]).toMatchObject({
      volId: '3089',
      displayTitle: '話 089-095',
      availableFormats: ['mobi', 'epub']
    })
  })

  it('treats source-image metadata as reader-capable even when the size field is zero', () => {
    const option = parseVolInfoLine(
      '9001,0,0,話,1,圣洁少女的秘密情事,24,24,0,0,0,0,,,2026-06-01 1440x2048',
      '99999'
    )

    expect(option).toMatchObject({
      volId: '9001',
      displayTitle: '圣洁少女的秘密情事',
      availableFormats: ['source_zip'],
      restrictions: []
    })
  })

  it('does not fabricate options from HTML or maintenance pages without volinfo rows', () => {
    expect(parseVolInfo('<html><body>請先登入，目前不可下載。</body></html>', '53339')).toEqual([])
    expect(parseVolInfo('maintenance message without row data', '53339')).toEqual([])
    expect(parseVolInfo(`postMessage("linkinfo=10180,GRAND BLUE", "*")`, '53339')).toEqual([])
  })

  it('drops malformed volinfo rows before they reach the UI', () => {
    expect(parseVolInfo(`postMessage("volinfo=<html,not,a,row", "*")`, '53339')).toEqual([])
    expect(parseVolInfoLine('../bad,0,0,話,1,話 001,1,1,0,1', '53339')).toBeUndefined()
  })
})
