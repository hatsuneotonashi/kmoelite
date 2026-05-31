import type { ReactNode } from 'react'

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="glass-panel flex min-h-56 flex-col items-center justify-center rounded-[var(--radius-panel)] p-8 text-center">
      <div className="mb-4 grid h-16 w-16 place-items-center rounded-[24px] border border-[var(--app-border)] subtle-fill shadow-[var(--app-glow)]">
        <div className="h-8 w-8 rounded-full border border-[var(--app-border)] bg-[var(--app-card-strong)]" />
      </div>
      <div className="text-lg font-bold">{title}</div>
      {children ? <div className="mt-2 max-w-lg text-sm leading-6 text-[var(--app-muted)]">{children}</div> : null}
    </div>
  )
}
