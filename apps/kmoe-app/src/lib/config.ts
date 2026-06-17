import type { AppSettings } from '../types/domain'

export const DEFAULT_SETTINGS: AppSettings = {
  concurrency: 1,
  preferredFormat: 'epub',
  downloadDirectory: '~/Downloads/Kmoe',
  colorizeDetailPage: true,
  readerPageTurnAnimation: 'slide',
  showReaderStatusBar: false
}

export const KMOE_BASE_URL = 'https://kxo.moe'
export const QUEUE_CONCURRENCY = 1
export const MAX_CONCURRENCY = 1

export function normalizeConcurrency(value: unknown): number {
  const num = Number(value)
  if (Number.isNaN(num) || num < 1) return QUEUE_CONCURRENCY
  return Math.min(num, MAX_CONCURRENCY)
}
