import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LogIn, LogOut, RefreshCcw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/layout/PageHeader'
import { useKmoeApi } from '../hooks/useKmoeApi'
import { formatBytes, readableAppMessage } from '../lib/format'

export function AccountPage() {
  const api = useKmoeApi()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const profile = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.getUserProfile()
  })
  const logout = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['session'] }),
        queryClient.invalidateQueries({ queryKey: ['profile'] })
      ])
      navigate('/login')
    }
  })

  if (profile.isLoading) {
    return (
      <div className="content-grid">
        <PageHeader eyebrow="账号" title="我的账号" description="登录后查看等级、VIP 与额度信息。" />
        <EmptyState title="账户加载中" />
      </div>
    )
  }
  if (profile.isError) {
    return (
      <div className="content-grid">
        <PageHeader eyebrow="账号" title="我的账号" description="登录后查看等级、VIP 与额度信息。" />
        <EmptyState title="需要登录">
          <div className="grid gap-3">
            <p>{readableAccountError(profile.error)}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => navigate('/login')}>
                <LogIn className="h-4 w-4" />
                去登录
              </Button>
              <Button onClick={() => void profile.refetch()}>
                <RefreshCcw className="h-4 w-4" />
                重新加载
              </Button>
            </div>
          </div>
        </EmptyState>
      </div>
    )
  }
  if (!profile.data) {
    return (
      <div className="content-grid">
        <PageHeader eyebrow="账号" title="我的账号" description="登录后查看等级、VIP 与额度信息。" />
        <EmptyState title="没有账户信息">
          <Button variant="primary" onClick={() => navigate('/login')}>
            <LogIn className="h-4 w-4" />
            去登录
          </Button>
        </EmptyState>
      </div>
    )
  }

  const user = profile.data
  return (
    <div className="content-grid">
      <PageHeader
        eyebrow="账号"
        title="我的账号"
        description="查看等级、VIP 与额度信息，并同步当前登录状态。"
        actions={(
        <Button onClick={() => logout.mutate()} disabled={logout.isPending}>
          <LogOut className="h-4 w-4" />
          退出登录
        </Button>
        )}
      />
      {logout.isError ? <div className="feedback-danger">{readableAppMessage(logout.error, '暂时无法退出登录，请稍后重试。')}</div> : null}
      <section className="account-profile-card glass-panel grid gap-4 rounded-[var(--radius-panel)] p-4 md:grid-cols-[220px_1fr] md:p-5">
        <div className="account-avatar-panel grid place-items-center p-5 text-center">
          <div className="account-avatar-mark grid h-24 w-24 place-items-center rounded-[32px] bg-[var(--app-fg)] text-3xl font-black text-[var(--app-bg)] shadow-[var(--app-glow)]">
            {(user.nickname ?? 'K').slice(0, 1).toUpperCase()}
          </div>
          <div className="mt-3 max-w-full break-words font-bold">{user.nickname ?? '-'}</div>
          <div className="mt-1 text-sm text-[var(--app-muted)]">{user.level ?? '等级未知'}</div>
        </div>
        <div className="account-metrics-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Metric label="昵称" value={user.nickname ?? '-'} />
        <Metric label="等级" value={user.level ?? '-'} />
        <Metric label="VIP" value={user.vipStatus ?? (user.isVip ? 'VIP' : '未开通')} />
        <Metric label="当前额度" value={formatBytes((user.quotaNow ?? 0) * 1024 * 1024)} />
        <Metric label="已用额度" value={formatBytes((user.quotaUsed ?? 0) * 1024 * 1024)} />
        <Metric label="免费额度" value={formatBytes((user.freeQuota ?? 0) * 1024 * 1024)} />
        <Metric label="VIP 额度" value={formatBytes((user.vipQuota ?? 0) * 1024 * 1024)} />
        </div>
      </section>
      <section className="account-note-panel p-4">
        <h2 className="text-lg font-semibold">下载说明</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {user.warnings.map((warning) => (
            <Badge key={warning} tone="warning">{warning}</Badge>
          ))}
          <Badge tone="success">账号状态以站点返回结果为准</Badge>
          <Badge tone="success">额度与等级会在下载时自动校验</Badge>
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-tile p-3">
      <div className="text-xs font-semibold text-[var(--app-muted)]">{label}</div>
      <div className="mt-1 break-words text-lg font-semibold">{value}</div>
    </div>
  )
}

function readableAccountError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/未登录|登录|forbidden|拒绝|not authenticated|过期/i.test(message)) {
    return '当前登录状态不可用，请重新登录。'
  }
  return readableAppMessage(message, '账号信息暂时无法加载，请检查网络后重试。')
}
