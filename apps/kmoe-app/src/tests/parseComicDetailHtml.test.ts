import { describe, expect, it } from 'vitest'
import { extractBookDataPath, parseComicDetailHtml, parseDescription } from '../parsers/detailHtml'

const fixture = `
<html><head>
<meta name="og:image" content="https://img.example/cover.jpg" />
<title>尖帽子的魔法工房 : 白浜鴎 [Kindle漫畫|epub漫畫] [kxo.moe]</title>
</head><body>
<font class="text_bglight_big">尖帽子的魔法工房</font>
<font class="text_bglight">(Atelier Of Witch Hat)　魔法帽的工作室, とんがり帽子のアトリエ</font>
作者：<font><a href="https://kxo.moe/list.php?s=%E7%99%BD">白浜鴎</a></font>
狀態：連載 　地區：日本 　語言：繁體
訂閱：740　收藏：2237　讀過：55　熱度：22176
分類：<font color="#000000">魔幻<font class="filesize"> (10)</font></font>
<input type="hidden" name="bookid" value="53339">
<script>window.iframe_action2.location.href = "/book_data.php?h=abc123";</script>
</body></html>`

describe('parseComicDetailHtml', () => {
  it('parses public detail metadata', () => {
    const detail = parseComicDetailHtml(fixture, 'https://kxo.moe/c/53339.htm')
    expect(detail).toMatchObject({
      id: '53339',
      title: '尖帽子的魔法工房',
      coverUrl: 'https://img.example/cover.jpg',
      status: '連載',
      region: '日本',
      language: '繁體',
      heat: '22176'
    })
    expect(detail.authors).toContain('白浜鴎')
    expect(detail.categories).toContain('魔幻')
    expect(extractBookDataPath(fixture)).toBe('/book_data.php?h=abc123')
  })

  it('extracts the real detail-page description from the scripted div assignment only', () => {
    const html = `
      <html><body>
        <font class="text_bglight_big">尖帽子的魔法工房</font>
        作者：<font><a href="https://kxo.moe/list.php?s=%E7%99%BD">白浜鴎</a></font>
        狀態：連載 　地區：日本 　語言：繁體
        訂閱：740　收藏：2237　讀過：55　熱度：22197
        分類：<font color="#000000">魔幻<font class="filesize"> (10)</font></font>
        <div class="book_desc">
          <div id="desc_text">
            <div id="div_desc_content">請訪問 https://kxo.moe/ 瀏覽</div>
          </div>
        </div>
        <script>
          document.getElementById("div_desc_content").innerHTML = "　　生活在小村莊的少女·可可從小開始就一直憧憬成為一名魔法使。<br />　　這是一部，降臨於少女身上的，絕望與希望交織的魔法物語。<br /><br />12-68";
        </script>
      </body></html>
    `

    const detail = parseComicDetailHtml(html, 'https://kxo.moe/c/53339.htm')

    expect(detail.description).toBe('生活在小村莊的少女·可可從小開始就一直憧憬成為一名魔法使。\n這是一部，降臨於少女身上的，絕望與希望交織的魔法物語。')
    expect(detail.description).not.toContain('分類')
    expect(detail.description).not.toContain('熱度')
    expect(detail.description).not.toContain('請訪問')
    expect(detail.description).not.toContain('12-68')
  })

  it('removes trailing site range notes from concise real detail descriptions', () => {
    const html = `
      <script>
        document.getElementById("div_desc_content").innerHTML = "地下忍者漫畫&nbsp;，現代忍者故事，隱匿於日本社會中。<br /><br />【2卷至18話】11-99";
      </script>
    `

    expect(parseDescription(html)).toBe('地下忍者漫畫 ，現代忍者故事，隱匿於日本社會中。')
  })

  it('extracts book id and book_data path when attributes are reordered or embedded as iframe URLs', () => {
    const html = `
      <html><body>
      <font class="text_bglight_big">地下忍者</font>
      <input value="14140" type="hidden" name="bookid">
      <iframe src="/book_data.php?h=hash_14140-abc&amp;lang=tc"></iframe>
      </body></html>
    `

    const detail = parseComicDetailHtml(html)

    expect(detail.id).toBe('14140')
    expect(detail.url).toBe('https://kxo.moe/c/14140.htm')
    expect(extractBookDataPath(html)).toBe('/book_data.php?h=hash_14140-abc&lang=tc')
  })

  it('keeps live detail page chrome out of product fields', () => {
    const html = `
      <html><body>
        <table class="book_list text_bglight text_herf_notline">
          <tr>
            <td class="author">
              <font class="text_bglight_big">GRAND BLUE 碧藍之海</font>
              <font>
                <font class="hd_logo" id="logo_watermark" style="display:none">[水印]</font>
              </font><br />
              <font class="text_bglight">(Grand Blue)　ぐらんぶる</font><br />
              <font class="text_bglight">
                作者：<font style="display:"><a href="/list.php?s=Inoue">井上堅二</a></font>
                <font style="display:">　<a href="/list.php?s=Yoshioka">吉岡公威</a></font>
                <font style="display:none">　<a href="/list.php?s=hidden">隱藏作者</a></font>
              </font><br />
              <font class="text_bglight">
                狀態：連載　地區：日本　語言：繁體　最後出版：2026　更新：
              </font><br />
              <font class="text_bglight">
                版本：東立　掃者：aaa874160　維護者：<a href="/u/10000003/">小吉</a>
              </font><br />
              <font class="text_bglight">
                訂閱：3067　收藏：6815　讀過：203　熱度：70188
              </font><br />
              <font class="text_bglight">
                分類：<font color="#000000">幽默<font class="filesize"> (34)</font></font>
                <font color="#000000">　愛情<font class="filesize"> (28)</font></font>
                <font color="#000000">　校園<font class="filesize"> (24)</font></font>
                <font class="status">　治癒<font class="filesize"> (1)</font></font>
              </font>
              <a href="javascript:void(0);" title="分類投票" id="bt_voteya">VOTE</a>
              <div id="div_tag_cate" style="display:none">
                <form name="form_tag_cate">
                  <input type="hidden" name="bookid" value="10180">
                  分類：
                  <select name="tag_cate_1">
                    <option value="">= 無 =</option>
                    <option value="恐怖">恐怖</option>
                    <option value="冒險">冒險</option>
                  </select>
                </form>
              </div>
            </td>
            <td>
              <table class="book_score">
                <tr>
                  <td><font style="font-size:30px;">9.7</font><font class="scorestar">分</font></td>
                  <td><font class="text_bglight font_size_s">615人評價</font></td>
                </tr>
                <tr><td colspan="2">我的評價 : ☆ ☆ ☆ ☆ ☆</td></tr>
              </table>
            </td>
          </tr>
        </table>
        <div id="div_desc_content">請訪問 https://kxo.moe/ 瀏覽</div>
        <script>
          document.getElementById("div_desc_content").innerHTML = "以上大學為契機，北原伊織開始在沿海城鎮居住。<br /><br />【卷23至話94】";
        </script>
      </body></html>
    `

    const detail = parseComicDetailHtml(html, 'https://kxo.moe/c/10180.htm')

    expect(detail.aliases).toEqual(['Grand Blue', 'ぐらんぶる'])
    expect(detail.authors).toEqual(['井上堅二', '吉岡公威'])
    expect(detail.status).toBe('連載')
    expect(detail.region).toBe('日本')
    expect(detail.language).toBe('繁體')
    expect(detail.heat).toBe('70188')
    expect(detail.rating).toBe('9.7')
    expect(detail.categories).toEqual(['幽默', '愛情', '校園', '治癒'])
    expect(detail.description).toBe('以上大學為契機，北原伊織開始在沿海城鎮居住。')
    for (const value of [
      detail.aliases.join(','),
      detail.language,
      detail.heat,
      detail.rating,
      detail.description,
      detail.authors.join(','),
      detail.categories.join(',')
    ]) {
      expect(value).not.toMatch(/訂閱|收藏|讀過|VOTE|分類投票|恐怖|冒險|維護者|掃者|水印|請訪問|615人評價|我的評價|卷23/)
    }
  })
})
