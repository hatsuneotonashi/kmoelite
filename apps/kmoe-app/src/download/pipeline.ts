import type { AppSettings, DownloadTask } from '../types/domain'
import { buildDownloadAuthorizeUrl } from '../parsers/downloadUrl'
import { planDownloadPath, type DownloadPathPlan, type PlatformTarget } from './pathPlanner'

export interface DownloadPipelinePlan {
  taskId: string
  scope: 'single-item'
  authorizationPathPreview: string
  path: DownloadPathPlan
  steps: Array<{
    id: string
    label: string
    detail: string
  }>
}

export function createDownloadPipelinePlan(task: DownloadTask, settings: AppSettings, platform?: PlatformTarget): DownloadPipelinePlan {
  const line: 0 | 1 = 0
  const authorizationPathPreview = buildDownloadAuthorizeUrl({
    bookId: task.comicId,
    volId: task.volId,
    format: task.format,
    line
  })
  const path = planDownloadPath(task, settings, platform)

  return {
    taskId: task.id,
    scope: 'single-item',
    authorizationPathPreview,
    path,
    steps: [
      {
        id: 'select',
        label: '选择卷/话',
        detail: '可以一次勾选多个卷/话，生成下载任务。'
      },
      {
        id: 'queue',
        label: '加入队列',
        detail: '避免重复添加相同内容，进入下载队列。'
      },
      {
        id: 'authorize',
        label: '准备下载',
        detail: '开始前会确认账号状态和下载权限。'
      },
      {
        id: 'download',
        label: '下载文件',
        detail: '保存到设备后检查文件是否完整。'
      },
      {
        id: 'library',
        label: '加入资料库',
        detail: '记录作品、卷话、格式、大小和完成时间。'
      }
    ]
  }
}
