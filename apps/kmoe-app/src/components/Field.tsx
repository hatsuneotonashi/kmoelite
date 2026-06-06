import { clsx } from 'clsx'
import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react'
import { ImeAwareInput } from './ImeAwareInput'

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  label: string
  value?: string
  onValueChange?: (value: string) => void
  onChange?: InputHTMLAttributes<HTMLInputElement>['onChange']
}

export function TextField({ label, className, onValueChange, value, ...props }: TextFieldProps) {
  const inputClassName = clsx('liquid-input h-11 rounded-2xl px-4 outline-none phone-touch-target', className)
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-semibold text-[var(--app-muted)]">{label}</span>
      {onValueChange ? (
        <ImeAwareInput className={inputClassName} value={value ?? ''} onValueChange={onValueChange} {...props} />
      ) : (
        <input className={inputClassName} value={value} {...props} />
      )}
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
