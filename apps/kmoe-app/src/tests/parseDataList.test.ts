import { describe, expect, it } from 'vitest'
import { parseDataList } from '../parsers/dataList'

describe('parseDataList', () => {
  it('parses normal JSON list', () => {
    const page = parseDataList({
      total: 1,
      totalpage: 1,
      nowpage: 1,
      data: [
        {
          status: '連載',
          lang: '繁體',
          url_book: 'https://kxo.moe/c/53339.htm',
          url_cover: 'https://example.test/cover.jpg',
          newvol: '話 089-095',
          name: '尖帽子的魔法工房',
          author: '白浜鴎',
          score: '9.4',
          lastupdate: '前天'
        }
      ]
    })
    expect(page.items[0]).toMatchObject({
      id: '53339',
      title: '尖帽子的魔法工房',
      language: '繁體',
      latestVolume: '話 089-095',
      coverUrl: 'https://example.test/cover.jpg'
    })
    expect(page.source).toBe('data_list')
  })

  it('normalizes relative book and cover URLs', () => {
    const page = parseDataList({
      data: [
        {
          url_book: '/c/14140.htm',
          url_cover: '/cover/14140.jpg',
          name: '地下忍者'
        }
      ]
    })

    expect(page.items[0]).toMatchObject({
      id: '14140',
      url: 'https://kxo.moe/c/14140.htm',
      coverUrl: 'https://kxo.moe/cover/14140.jpg'
    })
  })

  it('removes site search highlight markup from visible fields', () => {
    const page = parseDataList({
      data: [
        {
          status: '完結',
          lang: '繁體',
          url_book: '/c/10100.htm',
          name: '<b>鬼滅</b>之刃',
          author: '吾峠&nbsp;呼世晴',
          newvol: '<b>卷</b> 23'
        }
      ]
    })

    expect(page.items[0]).toMatchObject({
      title: '鬼滅之刃',
      author: '吾峠 呼世晴',
      latestVolume: '卷 23'
    })
    expect(page.items[0].tags).toEqual(['完結', '繁體', '卷 23'])
  })

  it('handles empty and missing fields', () => {
    const page = parseDataList({ nowpage: 2, data: [{}] })
    expect(page.items).toHaveLength(1)
    expect(page.items[0].title).toBeTruthy()
    expect(parseDataList({ data: [] }).items).toEqual([])
  })
})
