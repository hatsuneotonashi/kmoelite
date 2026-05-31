import type { ReactNode } from 'react'

export function PageTransition({ children }: { children: ReactNode }) {
  return <div className="page-stack">{children}</div>
}
