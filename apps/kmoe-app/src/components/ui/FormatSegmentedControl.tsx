import type { DownloadFormat } from '../../types/domain'
import { formatDownloadFormat } from '../../lib/format'

export function FormatSegmentedControl({
  value,
  onChange
}: {
  value: DownloadFormat
  onChange: (value: DownloadFormat) => void
}) {
  return (
    <div className="grid gap-2">
      <div className="segmented-shell" role="group" aria-label="下载格式">
        {(['epub', 'source_zip', 'mobi'] as DownloadFormat[]).map((format) => {
          return (
            <button
              key={format}
              type="button"
              className="segmented-option pressable"
              data-selected={value === format}
              aria-pressed={value === format}
              onClick={() => onChange(format)}
            >
              {formatDownloadFormat(format)}
            </button>
          )
        })}
      </div>
      <p className="text-xs leading-5 text-[var(--app-muted)]">选择本次下载使用的文件格式。</p>
    </div>
  )
}
