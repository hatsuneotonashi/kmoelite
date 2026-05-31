import { invoke } from '@tauri-apps/api/core'

export type NativeInvokeResult<T> =
  | { available: false }
  | { available: true; ok: true; value: T }
  | { available: true; ok: false; error: string }

export interface NativeInvokeOptions {
  timeoutMs?: number
  timeoutMessage?: string
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function invokeNative<T>(
  command: string,
  args?: Record<string, unknown>,
  options: NativeInvokeOptions = {}
): Promise<NativeInvokeResult<T>> {
  if (!isTauriRuntime()) return { available: false }
  try {
    const value = await withOptionalTimeout(invoke<T>(command, args), command, options)
    return { available: true, ok: true, value }
  } catch (error) {
    return { available: true, ok: false, error: stringifyNativeError(error) }
  }
}

export async function invokeOptional<T>(command: string, args?: Record<string, unknown>): Promise<T | undefined> {
  const result = await invokeNative<T>(command, args)
  return result.available && result.ok ? result.value : undefined
}

function stringifyNativeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function withOptionalTimeout<T>(
  promise: Promise<T>,
  command: string,
  options: NativeInvokeOptions
): Promise<T> {
  if (!options.timeoutMs || options.timeoutMs <= 0) return promise

  return new Promise((resolve, reject) => {
    let settled = false
    const timer = window.setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error(options.timeoutMessage ?? '操作超时，请稍后重试。'))
    }, options.timeoutMs)

    promise.then(
      (value) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        reject(error)
      }
    )
  })
}
