import type {
  CatalogPage,
  CatalogQuery,
  ComicDetail,
  DownloadFormat,
  DownloadTask,
  LoginInput,
  LoginResult,
  SessionState,
  UserProfile,
  VolumeDownloadOption
} from '../types/domain'

export interface KmoeApi {
  login(input: LoginInput): Promise<LoginResult>
  logout(): Promise<void>
  getSession(): Promise<SessionState>
  getCatalog(input: CatalogQuery): Promise<CatalogPage>
  search(input: CatalogQuery): Promise<CatalogPage>
  getComicDetail(comicId: string): Promise<ComicDetail>
  getDownloadOptions(comicId: string): Promise<VolumeDownloadOption[]>
  getUserProfile(): Promise<UserProfile>
  createDownloadTasks(input: {
    comic: ComicDetail
    selectedVolIds: string[]
    format: DownloadFormat
  }): Promise<DownloadTask[]>
}
