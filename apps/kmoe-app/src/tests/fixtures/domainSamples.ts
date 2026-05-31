import type { ComicDetail, ComicListItem, DownloadedFile, DownloadTask, UserProfile, VolumeDownloadOption } from '../../types/domain'

export const sampleUser: UserProfile = {
  id: 'fixture-user',
  nickname: 'Kmoe Fixture User',
  level: 'Lv2',
  isVip: false,
  vipStatus: '未开通',
  quotaNow: 640,
  quotaUsed: 1280,
  freeQuota: 2048,
  vipQuota: 0,
  warnings: ['fixture account state']
}

const covers = {
  witch: '/covers/witch-hat.png',
  ninja: '/covers/under-ninja.png',
  grandBlue: '/covers/grand-blue.png'
}

export const sampleCatalog: ComicListItem[] = [
  {
    id: '53339',
    title: '尖帽子的魔法工房',
    url: 'https://kzo.moe/c/53339.htm',
    coverUrl: covers.witch,
    author: '白浜鴎',
    status: '連載',
    language: '繁體',
    region: '日本',
    score: '9.4',
    latestVolume: '話 089-095',
    lastUpdate: '前天',
    tags: ['魔幻', '魔法', '連載']
  },
  {
    id: '14140',
    title: '地下忍者',
    url: 'https://kzo.moe/c/14140.htm',
    coverUrl: covers.ninja,
    author: '花澤健吾',
    status: '連載',
    language: '繁體',
    region: '日本',
    score: '8.8',
    latestVolume: '話 156-160',
    lastUpdate: '前天',
    tags: ['冒險', '青年', '連載']
  },
  {
    id: '10180',
    title: 'GRAND BLUE 碧藍之海',
    url: 'https://kzo.moe/c/10180.htm',
    coverUrl: covers.grandBlue,
    author: '井上堅二, 吉岡公威',
    status: '連載',
    language: '繁體',
    region: '日本',
    score: '9.3',
    latestVolume: '話 101-105',
    lastUpdate: '05-12',
    tags: ['幽默', '校园', '青年']
  }
]

const MB = 1024 * 1024

function option(comicId: string, volId: string, title: string, kind: VolumeDownloadOption['kind'], mobiMb: number, epubMb: number, pages: number, restrictions: string[] = []): VolumeDownloadOption {
  return {
    id: `${comicId}-${volId}`,
    comicId,
    volId,
    title,
    displayTitle: title,
    kind,
    pageCount: pages,
    docPageCount: pages,
    sizes: {
      mobi: Math.round(mobiMb * MB),
      epub: Math.round(epubMb * MB)
    },
    availableFormats: ['mobi', 'epub'],
    restrictions
  }
}

export const sampleDetails: ComicDetail[] = [
  {
    id: '53339',
    url: 'https://kzo.moe/c/53339.htm',
    title: '尖帽子的魔法工房',
    aliases: ['Atelier Of Witch Hat', '魔法帽的工作室', 'とんがり帽子のアトリエ'],
    coverUrl: covers.witch,
    authors: ['白浜鴎'],
    status: '連載',
    region: '日本',
    language: '繁體',
    categories: ['魔幻', '魔法'],
    tags: ['月刊Morning Two', '不良漢化組'],
    rating: '9.4',
    heat: '22176',
    description: 'A fixture detail used only by automated tests.',
    quotaHint: '640 M',
    downloadOptions: [
      option('53339', '3001', '話 001-006', 'chapter_group', 51.9, 51.0, 232),
      option('53339', '3081', '話 081-085', 'chapter_group', 39.4, 38.7, 108),
      option('53339', '3089', '話 089-095', 'chapter_group', 22.4, 21.7, 94)
    ],
    relatedComics: [sampleCatalog[1], sampleCatalog[2]]
  },
  {
    id: '14140',
    url: 'https://kzo.moe/c/14140.htm',
    title: '地下忍者',
    aliases: ['Under Ninja'],
    coverUrl: covers.ninja,
    authors: ['花澤健吾'],
    status: '連載',
    region: '日本',
    language: '繁體',
    categories: ['冒險', '青年'],
    tags: ['fixture restrictions'],
    rating: '8.8',
    heat: '9739',
    description: 'A fixture detail used only by automated tests.',
    quotaHint: '640 M',
    downloadOptions: [
      option('14140', '1001', '卷 01', 'volume', 64.2, 60.1, 196),
      option('14140', '1011', '卷 11', 'volume', 82.1, 79.5, 214, ['Lv2 required']),
      option('14140', '3156', '話 156-160', 'chapter_group', 28.4, 27.2, 88, ['true verification required'])
    ],
    relatedComics: [sampleCatalog[0], sampleCatalog[2]]
  },
  {
    id: '10180',
    url: 'https://kzo.moe/c/10180.htm',
    title: 'GRAND BLUE 碧藍之海',
    aliases: ['Grand Blue Dreaming', '碧蓝之海'],
    coverUrl: covers.grandBlue,
    authors: ['井上堅二', '吉岡公威'],
    status: '連載',
    region: '日本',
    language: '繁體',
    categories: ['幽默', '校园', '青年'],
    tags: ['fixture'],
    rating: '9.3',
    heat: '69712',
    description: 'A fixture detail used only by automated tests.',
    quotaHint: '640 M',
    downloadOptions: [
      option('10180', '1001', '卷 01', 'volume', 58.8, 55.4, 190),
      option('10180', '1022', '卷 22', 'volume', 91.3, 88.9, 222, ['VIP only']),
      option('10180', '3101', '話 101-105', 'chapter_group', 33.1, 31.8, 102, ['insufficient quota'])
    ],
    relatedComics: [sampleCatalog[0], sampleCatalog[1]]
  }
]

export const sampleDownloadTasks: DownloadTask[] = []
export const sampleDownloadedFiles: DownloadedFile[] = []
