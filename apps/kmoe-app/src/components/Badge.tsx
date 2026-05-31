import { clsx } from 'clsx'
import type { ReactNode } from 'react'

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

const tones: Record<Tone, { color: string; backgroundColor: string; borderColor: string }> = {
  neutral: {
    color: 'var(--app-fg)',
    backgroundColor: 'var(--app-card)',
    borderColor: 'var(--app-border)'
  },
  success: {
    color: 'var(--app-success)',
    backgroundColor: 'var(--app-success-soft)',
    borderColor: 'rgb(84 100 95 / 0.18)'
  },
  warning: {
    color: 'var(--app-warning)',
    backgroundColor: 'var(--app-warning-soft)',
    borderColor: 'rgb(117 97 63 / 0.18)'
  },
  danger: {
    color: 'var(--app-danger)',
    backgroundColor: 'var(--app-danger-soft)',
    borderColor: 'rgb(157 63 83 / 0.18)'
  },
  info: {
    color: 'var(--app-accent)',
    backgroundColor: 'var(--app-accent-soft)',
    borderColor: 'rgb(11 111 203 / 0.16)'
  }
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={clsx('badge inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold backdrop-blur', className)} style={tones[tone]}>
      {children}
    </span>
  )
}
