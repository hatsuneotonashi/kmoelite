import { afterEach, describe, expect, it, vi } from 'vitest'
import { moveSpatialFocus } from '../lib/spatialFocus'

describe('moveSpatialFocus', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('moves focus to the nearest button in the arrow direction', () => {
    const root = document.createElement('div')
    const left = buttonAt(0, 0)
    const right = buttonAt(100, 0)
    const lower = buttonAt(20, 80)
    root.append(left, right, lower)
    document.body.append(root)
    left.focus()

    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true })

    expect(moveSpatialFocus(event, root)).toBe(true)
    expect(document.activeElement).toBe(right)
    expect(event.defaultPrevented).toBe(true)
  })

  it('does not hijack text entry arrow keys', () => {
    const root = document.createElement('div')
    const input = document.createElement('input')
    const right = buttonAt(100, 0)
    setRect(input, 0, 0)
    root.append(input, right)
    document.body.append(root)
    input.focus()

    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true })
    Object.defineProperty(event, 'target', { value: input })

    expect(moveSpatialFocus(event, root)).toBe(false)
    expect(document.activeElement).toBe(input)
    expect(event.defaultPrevented).toBe(false)
  })
})

function buttonAt(left: number, top: number): HTMLButtonElement {
  const button = document.createElement('button')
  setRect(button, left, top)
  return button
}

function setRect(element: HTMLElement, left: number, top: number) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: left,
    y: top,
    left,
    top,
    right: left + 40,
    bottom: top + 40,
    width: 40,
    height: 40,
    toJSON: () => ({})
  } as DOMRect)
}
