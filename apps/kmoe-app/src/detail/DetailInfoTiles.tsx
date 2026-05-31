export function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div className="detail-info-tile rounded-[var(--radius-card)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3 py-2" data-label={label}>
      <dt className="text-xs font-semibold text-[var(--app-muted)]">{label}</dt>
      <dd className="mt-0.5 break-words font-medium">{value || '-'}</dd>
    </div>
  )
}

export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="mini-stat metric-tile p-2">
      <div className="mini-stat-label truncate text-[11px] font-semibold text-[var(--app-muted)]">{label}</div>
      <div className="mini-stat-value mt-1 truncate text-sm font-bold">{value}</div>
    </div>
  )
}
