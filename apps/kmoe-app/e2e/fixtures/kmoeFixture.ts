import type { Page } from '@playwright/test'

const corsHeaders = {
  'access-control-allow-origin': 'http://127.0.0.1:4173',
  vary: 'Origin',
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type',
  'content-type': 'text/html; charset=utf-8'
}

const catalogItems = [
  {
    status: '連載',
    lang: '繁體',
    url_book: '/c/53339.htm',
    url_cover: '/covers/witch-hat.png',
    newvol: '話 089-095',
    name: '尖帽子的魔法工房',
    author: '白浜鴎',
    score: '9.4',
    lastupdate: '前天'
  },
  {
    status: '連載',
    lang: '繁體',
    url_book: '/c/14140.htm',
    url_cover: '/covers/under-ninja.png',
    newvol: '卷 01',
    name: '地下忍者',
    author: '花澤健吾',
    score: '8.8',
    lastupdate: '前天'
  },
  {
    status: '連載',
    lang: '繁體',
    url_book: '/c/10180.htm',
    url_cover: '/covers/grand-blue.png',
    newvol: '卷 01',
    name: 'GRAND BLUE 碧藍之海',
    author: '井上堅二, 吉岡公威',
    score: '9.3',
    lastupdate: '05-12'
  }
]

const catalog = {
  uin: 'fixture',
  total: 3,
  totalpage: 1,
  nowcount: 3,
  nowpage: 1,
  data: catalogItems
}

const detailHtml = `
<!doctype html>
<html>
  <head>
    <title>尖帽子的魔法工房</title>
    <meta name="og:image" content="/covers/witch-hat.png" />
  </head>
  <body>
    <input name="bookid" value="53339" />
    <div class="text_bglight_big">尖帽子的魔法工房</div>
    <div class="text_bglight">Atelier Of Witch Hat, 魔法帽的工作室</div>
    <a href="/list.php?s=%E7%99%BD%E6%B5%9C%E9%B7%97">白浜鴎</a>
    <div>狀態 : 連載 地區 : 日本 語言 : 繁體 最後出版 : 2026-04-21 熱度 : 22176 分類：</div>
    <font color="#000000">魔幻</font>
    <span class="hd_logo">[魔法]</span>
    <p>簡介：一位向往魔法的少女偶然发现魔法师的秘密，进入工房后开始学习与规则、责任和创造相关的魔法。</p>
    <iframe src="/book_data.php?h=fixture53339"></iframe>
  </body>
</html>
`

const bookData = `
<script>
parent.postMessage("volinfo=3001,0,0,話,1,話 001-006,232,232,60.0,51.9,43.0,51.0,,,2025-08-23 960x1280,2026-04-21 960x1280,2026-04-21 860x1146", "*");
parent.postMessage("volinfo=3089,0,0,話,89,話 089-095,94,94,26.0,22.4,21.1,21.7,,,2025-08-23 960x1280,2026-04-21 960x1280,2026-04-21 860x1146", "*");
parent.postMessage("linkinfo=14140,地下忍者,10180,GRAND BLUE 碧藍之海", "*");
parent.postMessage("volcount=2", "*");
</script>
`

const profileHtml = `
<html>
  <body>
    <div>登錄郵箱 : reader@example.invalid ( KMOE ID : 123456 )</div>
    <div>昵稱 : reader-safe 修改昵稱</div>
    <div>你是本站 Lv1 用戶，且不是本站 VIP 。</div>
    <div>Lv1 每月額度 : 2048.0 M , 剩餘 : 1920.0 M</div>
    <div>今日已用 : 0.0 M , 本月已用免費額度 : 128.0 M</div>
  </body>
</html>
`

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
)

export async function installKmoeFixtureRoutes(page: Page): Promise<void> {
  await page.route('https://kxo.moe/data_list.php**', async (route) => {
    const url = new URL(route.request().url())
    const search = url.searchParams.get('s')?.trim().toLowerCase()
    const data = search
      ? catalogItems.filter((item) => `${item.name} ${item.author} ${item.newvol}`.toLowerCase().includes(search))
      : catalogItems
    await route.fulfill({
      status: 200,
      headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        ...catalog,
        total: data.length,
        nowcount: data.length,
        data
      })
    })
  })

  await page.route('https://kxo.moe/c/*.htm', async (route) => {
    await route.fulfill({ status: 200, headers: corsHeaders, body: detailHtml })
  })

  await page.route('https://kxo.moe/book_data.php**', async (route) => {
    await route.fulfill({ status: 200, headers: corsHeaders, body: bookData })
  })

  await page.route('https://kxo.moe/my.php**', async (route) => {
    await route.fulfill({ status: 200, headers: corsHeaders, body: profileHtml })
  })

  await page.route('https://kxo.moe/login_do.php**', async (route) => {
    await route.fulfill({ status: 200, headers: corsHeaders, body: '<script>location.href="/my.php"</script>' })
  })

  await page.route('https://kxo.moe/covers/**', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { ...corsHeaders, 'content-type': 'image/png' },
      body: transparentPng
    })
  })
}
