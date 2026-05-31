import { useEffect, useState } from 'react'
import { detectPlatformTarget, type PlatformTarget } from '../download/pathPlanner'

export type LayoutMode = 'phone' | 'tabletCompact' | 'tablet' | 'desktop'
export type DeviceClass = 'phone' | 'tablet' | 'desktop' | 'unknown'
export type WindowClass = 'compact' | 'medium' | 'expanded' | 'wide'
export type InputClass = 'touch' | 'pointer' | 'hybrid'
export type RuntimeClass = PlatformTarget
export type LayoutContract = 'phone' | 'tabletCompact' | 'tablet' | 'desktop' | 'macDesktop' | 'windowsDesktop'

export interface LayoutDetectionInput {
  width: number
  platform?: PlatformTarget
  maxTouchPoints?: number
  coarsePointer?: boolean
}

export interface PlatformLayoutModel {
  layoutMode: LayoutMode
  layoutContract: LayoutContract
  deviceClass: DeviceClass
  windowClass: WindowClass
  inputClass: InputClass
  runtimeClass: RuntimeClass
}

export function getWindowClass(width: number): WindowClass {
  if (width < 768) return 'compact'
  if (width < 1024) return 'medium'
  if (width < 1366) return 'expanded'
  return 'wide'
}

export function getPlatformLayoutModel(input: LayoutDetectionInput): PlatformLayoutModel {
  const width = Number.isFinite(input.width) ? input.width : 1440
  const runtimeClass = input.platform ?? detectPlatformTarget()
  const windowClass = getWindowClass(width)
  const touchPoints = input.maxTouchPoints ?? 0
  const coarsePointer = input.coarsePointer ?? false
  const inputClass = runtimeClass === 'ios'
    ? 'touch'
    : touchPoints > 0 && !coarsePointer
      ? 'hybrid'
      : touchPoints > 0 || coarsePointer
        ? 'touch'
        : 'pointer'

  if (runtimeClass === 'ios') {
    return {
      layoutMode: 'phone',
      layoutContract: 'phone',
      deviceClass: 'phone',
      windowClass,
      inputClass: 'touch',
      runtimeClass
    }
  }

  if (runtimeClass === 'ipados') {
    const compact = width < 768
    return {
      layoutMode: compact ? 'tabletCompact' : 'tablet',
      layoutContract: compact ? 'tabletCompact' : 'tablet',
      deviceClass: 'tablet',
      windowClass,
      inputClass,
      runtimeClass
    }
  }

  if (runtimeClass === 'macos' || runtimeClass === 'windows' || runtimeClass === 'linux') {
    const layoutContract = runtimeClass === 'macos'
      ? 'macDesktop'
      : runtimeClass === 'windows'
        ? 'windowsDesktop'
        : 'desktop'
    return {
      layoutMode: 'desktop',
      layoutContract,
      deviceClass: 'desktop',
      windowClass,
      inputClass,
      runtimeClass
    }
  }

  if (width < 768) {
    return {
      layoutMode: 'phone',
      layoutContract: 'phone',
      deviceClass: 'phone',
      windowClass,
      inputClass,
      runtimeClass
    }
  }

  if (width < 1180 || inputClass !== 'pointer') {
    return {
      layoutMode: width < 768 ? 'tabletCompact' : 'tablet',
      layoutContract: width < 768 ? 'tabletCompact' : 'tablet',
      deviceClass: 'tablet',
      windowClass,
      inputClass,
      runtimeClass
    }
  }

  return {
    layoutMode: 'desktop',
    layoutContract: 'desktop',
    deviceClass: 'desktop',
    windowClass,
    inputClass,
    runtimeClass
  }
}

export function getLayoutMode(width: number, platform = detectPlatformTarget()): LayoutMode {
  return getPlatformLayoutModel({ width, platform }).layoutMode
}

function readLayoutDetectionInput(width: number): LayoutDetectionInput {
  const runtimeNavigator = typeof navigator === 'undefined' ? undefined : navigator
  const coarsePointer = typeof window === 'undefined'
    ? false
    : window.matchMedia?.('(pointer: coarse)')?.matches ?? false
  return {
    width,
    platform: detectPlatformTarget(),
    maxTouchPoints: runtimeNavigator?.maxTouchPoints ?? 0,
    coarsePointer
  }
}

export function useLayoutMode(): LayoutMode {
  return usePlatformLayoutModel().layoutMode
}

export function usePlatformLayoutModel(): PlatformLayoutModel {
  const [model, setModel] = useState<PlatformLayoutModel>(() => getPlatformLayoutModel(readLayoutDetectionInput(typeof window === 'undefined' ? 1440 : window.innerWidth)))

  useEffect(() => {
    const update = () => setModel(getPlatformLayoutModel(readLayoutDetectionInput(window.innerWidth)))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return model
}
