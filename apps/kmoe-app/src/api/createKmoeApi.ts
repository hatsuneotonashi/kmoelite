import type { AppSettings } from '../types/domain'
import type { KmoeApi } from './KmoeApi'
import { WebKmoeApi } from './WebKmoeApi'

export function createKmoeApi(settings: AppSettings): KmoeApi {
  void settings
  return new WebKmoeApi()
}
