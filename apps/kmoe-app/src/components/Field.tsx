import { clsx } from 'clsx'
import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react'

export function TextField({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-semibold text-[var(--app-muted)]">{label}</span>
      <input className={clsx('liquid-input h-11 rounded-2xl px-4 outline-none phone-touch-target', className)} {...props} />
    </label>
  )
}

export function SelectField({ label, className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-semibold text-[var(--app-muted)]">{label}</span>
      <select className={clsx('liquid-input h-11 rounded-2xl px-4 outline-none phone-touch-target', className)} {...props}>
        {children}
      </select>
    </label>
  )
}
