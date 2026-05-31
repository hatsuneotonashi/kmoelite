export function ProgressBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full subtle-fill shadow-[0_1px_0_rgb(255_255_255_/_0.45)_inset]" role="progressbar" aria-label={`进度 ${clamped}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped}>
      <div className="smooth-progress h-full rounded-full" style={{ width: `${clamped}%` }} />
    </div>
  )
}
