import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from '../components/AppErrorBoundary'

let shouldThrow = true

function RenderCrash() {
  if (shouldThrow) throw new Error('render path failed')
  return <h1>恢复后的界面</h1>
}

describe('AppErrorBoundary', () => {
  beforeEach(() => {
    shouldThrow = true
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders a local recovery screen instead of leaving a blank app', async () => {
    render(
      <AppErrorBoundary>
        <RenderCrash />
      </AppErrorBoundary>
    )

    expect(await screen.findByRole('heading', { name: '请刷新后重试' })).toBeInTheDocument()
    expect(screen.queryByText('render path failed')).not.toBeInTheDocument()
    expect(screen.getByText(/下载队列和资料库会保留/)).toBeInTheDocument()
  })

  it('can retry the current view without clearing local state', async () => {
    render(
      <AppErrorBoundary>
        <RenderCrash />
      </AppErrorBoundary>
    )

    shouldThrow = false
    fireEvent.click(await screen.findByRole('button', { name: '重试当前界面' }))

    expect(await screen.findByRole('heading', { name: '恢复后的界面' })).toBeInTheDocument()
  })
})
