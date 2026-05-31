import type { DownloadFormat, VolumeDownloadOption } from '../types/domain'

const blockingRestrictionPattern = /VIP|Lv2|Lv3|level|quota|額度|额度|permission|權限|权限|真實驗證|真实验证|true verification|insufficient|暫不可下載|暂不可下载|製作中|制作中/i

export function getBlockingDownloadRestrictions(option: Pick<VolumeDownloadOption, 'restrictions'>): string[] {
  return option.restrictions.filter((restriction) => blockingRestrictionPattern.test(restriction))
}

export function canQueueDownloadOption(option: VolumeDownloadOption, format: DownloadFormat): boolean {
  return option.availableFormats.includes(format) && getBlockingDownloadRestrictions(option).length === 0
}
