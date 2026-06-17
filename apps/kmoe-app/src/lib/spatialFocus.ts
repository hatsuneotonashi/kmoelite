const spatialKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])
const backNavigationKeys = new Set(['Escape', 'Backspace', 'BrowserBack', 'Back', 'GoBack'])
const primaryActionKeys = new Set(['Enter', 'Accept', 'Select'])
const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

export function moveSpatialFocus(event: KeyboardEvent, root: ParentNode = document): boolean {
  if (!spatialKeys.has(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false
  if (isTextEntryTarget(event.target)) return false

  const candidates = Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter(isVisibleFocusable)
  if (candidates.length === 0) return false

  const active = document.activeElement instanceof HTMLElement && candidates.includes(document.activeElement)
    ? document.activeElement
    : null
  const next = active ? findNextElement(active, candidates, event.key) : candidates[0]
  if (!next || next === active) return false

  event.preventDefault()
  next.focus()
  return true
}

export function isBackNavigationKey(event: KeyboardEvent): boolean {
  return backNavigationKeys.has(event.key) || event.keyCode === 4
}

export function isPrimaryActionKey(event: KeyboardEvent): boolean {
  return primaryActionKeys.has(event.key)
}

function findNextElement(current: HTMLElement, candidates: HTMLElement[], key: string): HTMLElement | null {
  const currentRect = current.getBoundingClientRect()
  const currentCenter = center(currentRect)
  let winner: { element: HTMLElement; score: number } | null = null

  for (const candidate of candidates) {
    if (candidate === current) continue
    const rect = candidate.getBoundingClientRect()
    const candidateCenter = center(rect)
    const primary = primaryDistance(key, currentCenter, candidateCenter)
    if (primary <= 4) continue

    const secondary = key === 'ArrowLeft' || key === 'ArrowRight'
      ? Math.abs(candidateCenter.y - currentCenter.y)
      : Math.abs(candidateCenter.x - currentCenter.x)
    const score = primary + secondary * 2
    if (!winner || score < winner.score) winner = { element: candidate, score }
  }

  return winner?.element ?? null
}

function primaryDistance(key: string, from: { x: number; y: number }, to: { x: number; y: number }): number {
  if (key === 'ArrowRight') return to.x - from.x
  if (key === 'ArrowLeft') return from.x - to.x
  if (key === 'ArrowDown') return to.y - from.y
  return from.y - to.y
}

function center(rect: DOMRect): { x: number; y: number } {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  }
}

function isVisibleFocusable(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect()
  const style = getComputedStyle(element)
  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
}

export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)
}
