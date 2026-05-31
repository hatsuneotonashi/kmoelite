import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className
}: {
  title: string
  eyebrow?: string
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={clsx('page-header px-0 py-2', className)}>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          {eyebrow ? <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--app-muted)]">{eyebrow}</div> : null}
          <h1 className="page-title">{title}</h1>
          {description ? <div className="page-subtitle mt-1.5 max-w-3xl">{description}</div> : null}
        </div>
        {actions ? <div className="glass-toolbar flex shrink-0 flex-wrap gap-2 px-3 py-2">{actions}</div> : null}
      </div>
    </header>
  )
}
