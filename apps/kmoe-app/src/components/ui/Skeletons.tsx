export function CatalogSkeleton() {
  return (
    <div className="catalog-grid">
      {Array.from({ length: 10 }).map((_, index) => (
        <div key={index} className="liquid-card grid grid-cols-[92px_1fr] gap-3 p-3 sm:block">
          <div className="skeleton aspect-[7/10] w-[92px] rounded-[var(--radius-cover)] sm:w-full" />
          <div className="grid gap-2 pt-2 sm:pt-3">
            <div className="skeleton h-4 rounded-full" />
            <div className="skeleton h-3 w-2/3 rounded-full" />
            <div className="flex gap-2">
              <div className="skeleton h-6 w-14 rounded-full" />
              <div className="skeleton h-6 w-12 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div className="detail-shell">
      <div className="glass-panel rounded-[var(--radius-panel)] p-5">
        <div className="skeleton aspect-[7/10] rounded-[var(--radius-cover)]" />
      </div>
      <div className="grid gap-4">
        <div className="glass-panel rounded-[var(--radius-panel)] p-5">
          <div className="skeleton h-10 w-2/3 rounded-full" />
          <div className="mt-4 grid gap-2">
            <div className="skeleton h-4 rounded-full" />
            <div className="skeleton h-4 w-5/6 rounded-full" />
          </div>
        </div>
        <div className="glass-panel rounded-[var(--radius-panel)] p-5">
          <div className="skeleton h-24 rounded-3xl" />
        </div>
      </div>
    </div>
  )
}
