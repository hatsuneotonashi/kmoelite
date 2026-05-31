import type { DownloadedFile } from '../types/domain'
import { isNativeUnavailable, listNativeDownloadedFiles } from '../platform/nativeCommands'

export type NativeLibrarySyncOutcome =
  | { status: 'synced'; count: number; library: DownloadedFile[]; message: string }
  | { status: 'unavailable'; message: string }
  | { status: 'error'; message: string }

export async function syncNativeLibraryRecords(
  replaceLibrary: (library: DownloadedFile[]) => DownloadedFile[]
): Promise<NativeLibrarySyncOutcome> {
  const result = await listNativeDownloadedFiles()
  if (result.ok && result.value !== undefined) {
    const library = replaceLibrary(result.value)
    return {
      status: 'synced',
      count: library.length,
      library,
      message: `已同步 ${library.length} 个资料库项目。`
    }
  }
  if (isNativeUnavailable(result)) {
    return { status: 'unavailable', message: result.message }
  }
  return { status: 'error', message: result.message }
}
