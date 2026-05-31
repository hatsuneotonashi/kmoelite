import { FormEvent, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LogIn } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { TextField } from '../components/Field'
import { Button } from '../components/Button'
import { LiquidGlassPanel } from '../components/ui/LiquidGlassPanel'
import { useKmoeApi } from '../hooks/useKmoeApi'
import { readableAppMessage } from '../lib/format'

export function LoginPage() {
  const api = useKmoeApi()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const mutation = useMutation({
    mutationFn: () => api.login({ email, password, remember }),
    onSuccess: async (result) => {
      setPassword('')
      if (result.ok) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['session'] }),
          queryClient.invalidateQueries({ queryKey: ['profile'] })
        ])
        navigate('/')
      }
    },
    onError: () => setPassword('')
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    mutation.mutate()
  }

  const feedbackMessage = mutation.data
    ? mutation.data.ok
      ? '登录成功。'
      : readableAppMessage(mutation.data.message, '登录失败，请检查账号和密码后重试。')
    : ''

  return (
    <div className="mx-auto grid min-h-[calc(100vh-9rem)] w-full max-w-5xl items-center gap-6 lg:grid-cols-[.9fr_1fr]">
      <div className="hero-blur-bg glass-panel rounded-[var(--radius-panel)] p-6 md:p-8">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--app-accent)]">账号登录</div>
        <h1 className="page-title mt-4">登录</h1>
        <p className="page-subtitle mt-4">
          密码只保留在当前提交请求中；提交后清空，不写入源码、文档、进度文件或本地持久化设置。
        </p>
        <div className="mt-6 grid gap-3 text-sm text-[var(--app-muted)]">
          <div className="metric-tile p-4">登录使用 Kmoe 现有网页登录状态，不保存明文密码。</div>
          <div className="metric-tile p-4">登录后可读取账号额度、收藏和可下载内容。</div>
        </div>
      </div>
      <LiquidGlassPanel as="form" onSubmit={submit} className="grid gap-4 p-5 md:p-6">
        <TextField label="邮箱" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} />
        <TextField label="密码" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          记住登录状态（只保存会话，不保存密码）
        </label>
        <Button type="submit" variant="primary" disabled={mutation.isPending}>
          <LogIn className="h-4 w-4" />
          登录 Kmoe
        </Button>
        {mutation.data ? (
          <div className={mutation.data.ok ? 'feedback-success' : 'feedback-danger'}>{feedbackMessage}</div>
        ) : null}
        {mutation.isError ? <div className="feedback-danger">{readableAppMessage(mutation.error, '登录失败，请检查账号和密码后重试。')}</div> : null}
      </LiquidGlassPanel>
    </div>
  )
}
