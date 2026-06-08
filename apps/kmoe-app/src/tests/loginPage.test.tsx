import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KmoeApi } from '../api/KmoeApi'
import { LoginPage } from '../pages/LoginPage'

const api = vi.hoisted(() => ({
  login: vi.fn()
}))

vi.mock('../hooks/useKmoeApi', () => ({
  useKmoeApi: () => api as unknown as KmoeApi
}))

describe('LoginPage', () => {
  beforeEach(() => {
    api.login.mockReset()
  })

  it('uses site-compatible input behavior on iPad and does not submit empty credentials', () => {
    renderLoginPage()

    const email = screen.getByLabelText('邮箱')
    const password = screen.getByLabelText('密码')

    expect(email).toHaveAttribute('autocomplete', 'username')
    expect(email).toHaveAttribute('autocapitalize', 'none')
    expect(email).toHaveAttribute('autocorrect', 'off')
    expect(email).toHaveAttribute('maxlength', '50')
    expect(password).toHaveAttribute('autocomplete', 'off')
    expect(password).toHaveAttribute('autocapitalize', 'none')
    expect(password).toHaveAttribute('autocorrect', 'off')
    expect(password).toHaveAttribute('maxlength', '50')

    fireEvent.click(screen.getByRole('button', { name: /登录 Kmoe/ }))

    expect(screen.getByText('请输入邮箱和密码。')).toBeInTheDocument()
    expect(api.login).not.toHaveBeenCalled()
  })

  it('trims email before submitting while preserving the password exactly', async () => {
    api.login.mockResolvedValue({ ok: false, message: '登录失败：站点没有接受这组邮箱和密码，请确认输入后重试。' })
    renderLoginPage()

    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: ' user@example.invalid ' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: ' secret ' } })
    fireEvent.click(screen.getByRole('button', { name: /登录 Kmoe/ }))

    await waitFor(() => {
      expect(api.login).toHaveBeenCalledWith({
        email: 'user@example.invalid',
        password: ' secret ',
        remember: false
      })
    })
  })
})

function renderLoginPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}
