import { clsx } from 'clsx'

export function FilterChips({
  items,
  value,
  onChange,
  allLabel = '全部',
  className
}: {
  items: string[]
  value: string
  onChange: (value: string) => void
  allLabel?: string
  className?: string
}) {
  const allItems = ['', ...items]
  return (
    <div className={clsx('app-scrollbar flex gap-2 overflow-x-auto pb-1', className)} role="group" aria-label="筛选条件">
      {allItems.map((item) => {
        const label = item || allLabel
        const selected = value === item
        return (
          <button
            key={label}
            type="button"
            className="liquid-chip pressable shrink-0"
            data-selected={selected}
            aria-pressed={selected}
            onClick={() => onChange(item)}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
