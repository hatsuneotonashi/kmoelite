import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DownloadedFile, DownloadTask } from '../types/domain'
import { createDedupedTasks, recoverTaskAfterRestart } from '../download/stateMachine'
import { sanitizeDownloadedFiles, sanitizeDownloadTasks } from '../download/productRecords'
import { isTauriRuntime } from '../platform/tauri'

interface DownloadSnapshot {
  tasks: DownloadTask[]
  library: DownloadedFile[]
}

interface DownloadState {
  tasks: DownloadTask[]
  library: DownloadedFile[]
  addTasks: (tasks: DownloadTask[]) => DownloadTask[]
  replaceWithNativeSnapshot: (snapshot: DownloadSnapshot, options?: { recoverInterrupted?: boolean }) => DownloadSnapshot
  replaceLibrary: (library: DownloadedFile[]) => DownloadedFile[]
}

export const useDownloadStore = create<DownloadState>()(
  persist(
    (set, get) => ({
      tasks: [],
      library: [],
      addTasks: (incoming) => {
        const created = createDedupedTasks(get().tasks, sanitizeDownloadTasks(incoming))
        if (created.length) {
          set((state) => ({ tasks: [...state.tasks, ...created] }))
        }
        return created
      },
      replaceWithNativeSnapshot: (snapshot, options) => {
        const productTasks = sanitizeDownloadTasks(snapshot.tasks)
        const productLibrary = sanitizeDownloadedFiles(snapshot.library)
        const tasks = options?.recoverInterrupted === false ? productTasks : productTasks.map(recoverTaskAfterRestart)
        set({
          tasks,
          library: productLibrary
        })
        return { tasks, library: productLibrary }
      },
      replaceLibrary: (library) => {
        const productLibrary = sanitizeDownloadedFiles(library)
        set({ library: productLibrary })
        return productLibrary
      }
    }),
    {
      name: 'kmoe-client-downloads',
      partialize: (state) => isTauriRuntime()
        ? ({ tasks: [], library: [] })
        : ({
            tasks: sanitizeDownloadTasks(state.tasks),
            library: sanitizeDownloadedFiles(state.library)
          }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(isTauriRuntime() ? { tasks: [], library: [] } : sanitizePersistedState(persistedState))
      })
    }
  )
)

function sanitizePersistedState(persistedState: unknown): Pick<DownloadState, 'tasks' | 'library'> {
  if (!isRecord(persistedState)) return { tasks: [], library: [] }
  return {
    tasks: sanitizeDownloadTasks(readArray<DownloadTask>(persistedState.tasks)),
    library: sanitizeDownloadedFiles(readArray<DownloadedFile>(persistedState.library))
  }
}

function readArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
