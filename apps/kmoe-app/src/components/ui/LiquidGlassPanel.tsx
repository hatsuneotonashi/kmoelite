import { clsx } from 'clsx'
import type { HTMLAttributes, ReactNode } from 'react'

export function LiquidGlassPanel({
  children,
  className,
  as: Component = 'section',
  ...props
}: HTMLAttributes<HTMLElement> & { children: ReactNode; as?: 'div' | 'section' | 'article' | 'aside' | 'form' }) {
  return (
    <Component className={clsx('glass-panel rounded-[var(--radius-panel)] p-4 md:p-5', className)} {...props}>
      {children}
    </Component>
  )
}
