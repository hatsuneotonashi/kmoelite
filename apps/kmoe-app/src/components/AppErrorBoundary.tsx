import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from './Button'
import { readableAppMessage } from '../lib/format'

interface AppErrorBoundaryState {
  error?: Error
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {}

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    // Keep recovery local; no crash report leaves the device from this boundary.
  }

  private retry = () => {
    this.setState({ error: undefined })
  }

  private goHome = () => {
    window.location.replace(new URL('/', window.location.href).toString())
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-10 text-[var(--app-fg)]">
        <section className="glass-panel w-full max-w-xl rounded-[var(--radius-panel)] p-6">
          <p className="text-xs font-semibold text-[var(--app-danger)]">页面暂时不可用</p>
          <h1 className="mt-2 text-2xl font-semibold">请刷新后重试</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
            当前界面暂时无法显示。下载队列和资料库会保留在设备上。
          </p>
          <div className="metric-tile mt-4 p-3 text-sm text-[var(--app-muted)]">
            <div className="font-medium">处理建议</div>
            <div className="mt-1 break-words">{readableAppMessage(this.state.error, '请重试当前界面；如果仍然失败，请返回首页后再进入。')}</div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="primary" onClick={this.retry}>
              重试当前界面
            </Button>
            <Button onClick={this.goHome}>返回首页</Button>
          </div>
        </section>
      </main>
    )
  }
}
