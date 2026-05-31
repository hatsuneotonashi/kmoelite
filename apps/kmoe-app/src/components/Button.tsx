import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'border border-transparent bg-[var(--app-fg)] text-[var(--app-bg)] shadow-[0_8px_20px_rgb(21_21_22_/_0.14)] hover:shadow-[0_12px_26px_rgb(21_21_22_/_0.18)] disabled:bg-[var(--app-muted)]',
  secondary: 'border border-[var(--app-border)] bg-[var(--app-glass-strong)] text-[var(--app-fg)] shadow-[0_1px_0_rgb(255_255_255_/_0.55)_inset] hover:bg-[var(--app-card-strong)] disabled:text-[var(--app-muted)]',
  ghost: 'text-[var(--app-fg)] hover:bg-[var(--app-accent-soft)] disabled:text-[var(--app-muted)]',
  danger: 'border border-transparent bg-[var(--app-danger)] text-white shadow-[0_12px_28px_rgb(157_63_83_/_0.14)] hover:brightness-105 disabled:bg-[var(--app-muted)]'
}

export function Button({
  children,
  variant = 'secondary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button
      className={clsx(
        'liquid-button pressable inline-flex min-w-0 items-center justify-center gap-2 px-3.5 text-sm font-semibold focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 phone-touch-target',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
