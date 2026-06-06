import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ImeAwareInput } from '../components/ImeAwareInput'

describe('ImeAwareInput', () => {
  it('does not commit intermediate pinyin while composing Chinese input', () => {
    const onValueChange = vi.fn()

    render(<ImeAwareInput aria-label="关键词" value="" onValueChange={onValueChange} />)

    const input = screen.getByRole('textbox', { name: '关键词' })
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: 'z' } })
    fireEvent.change(input, { target: { value: 'zhong' } })
    fireEvent.change(input, { target: { value: '中' } })

    expect(onValueChange).not.toHaveBeenCalled()

    fireEvent.compositionEnd(input)

    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange).toHaveBeenCalledWith('中')
  })

  it('keeps normal latin typing immediate', () => {
    const onValueChange = vi.fn()

    render(<ImeAwareInput aria-label="关键词" value="" onValueChange={onValueChange} />)

    fireEvent.change(screen.getByRole('textbox', { name: '关键词' }), { target: { value: 'abc' } })

    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange).toHaveBeenCalledWith('abc')
  })
})
