import { describe, expect, it } from 'vitest'
import { parseLinkInfo } from '../parsers/linkInfo'
import { liveLikeBookDataSample } from './fixtures/liveSamples'

describe('parseLinkInfo', () => {
  it('extracts related comics from book_data linkinfo messages', () => {
    const input = '<script>parent.postMessage("linkinfo=14140,地下忍者,/c/14140.htm,https://img.example/cover.jpg!cover_l,花澤健吾,連載,繁體,日本,8.8", "*");</script>'

    const items = parseLinkInfo(input)

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: '14140',
      title: '地下忍者',
      url: 'https://kxo.moe/c/14140.htm',
      coverUrl: 'https://img.example/cover.jpg!cover_l',
      score: '8.8'
    })
    expect(items[0].tags).toEqual(['連載', '繁體', '日本'])
  })

  it('parses live pair-style linkinfo payloads into multiple related comics', () => {
    const items = parseLinkInfo(liveLikeBookDataSample)

    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      id: '20698e',
      title: 'Witch Hat Atelier',
      url: 'https://kxo.moe/c/20698e.htm'
    })
    expect(items[1]).toMatchObject({
      id: '25833',
      title: 'とんがり帽子のアトリエ',
      url: 'https://kxo.moe/c/25833.htm'
    })
  })

  it('parses single-quoted linkinfo postMessage rows', () => {
    const input = "<script>parent.postMessage('linkinfo=14140,地下忍者,/c/14140.htm,https://img.example/cover.jpg,8.8', '*');</script>"
    const items = parseLinkInfo(input)

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: '14140',
      title: '地下忍者',
      url: 'https://kxo.moe/c/14140.htm'
    })
  })

  it('ignores missing linkinfo safely', () => {
    expect(parseLinkInfo('volcount=0')).toEqual([])
  })
})
