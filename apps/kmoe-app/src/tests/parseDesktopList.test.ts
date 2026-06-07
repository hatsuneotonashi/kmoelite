import { describe, expect, it } from 'vitest'
import { parseDesktopListHtml } from '../parsers/desktopList'

describe('parseDesktopListHtml', () => {
  it('parses desktop disp_divinfo calls with escaped strings and relative assets', () => {
    const html = `
      <script>
        disp_divinfo('unused','/c/53339.htm','/cover/53339.jpg','','','日本','繁體','魔幻','9.4','尖帽子\\'s 魔法,工房','白浜\\u9dd7','連載','2026-05-01');
        disp_divinfo("unused","https://kxo.moe/c/14140.htm","https://img.example/14140.jpg","","","日本","繁體","青年","8.8","地下忍者","花澤健吾","連載","昨天");
      </script>
    `

    const items = parseDesktopListHtml(html)

    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      id: '53339',
      url: 'https://kxo.moe/c/53339.htm',
      coverUrl: 'https://kxo.moe/cover/53339.jpg',
      title: "尖帽子's 魔法,工房",
      author: '白浜鷗',
      region: '日本',
      language: '繁體',
      status: '連載',
      lastUpdate: '2026-05-01'
    })
    expect(items[0].tags).toEqual(['日本', '繁體', '魔幻', '連載'])
    expect(items[1].id).toBe('14140')
  })

  it('ignores malformed calls instead of producing partial catalog rows', () => {
    expect(parseDesktopListHtml(`disp_divinfo('too-short');`)).toEqual([])
  })
})
