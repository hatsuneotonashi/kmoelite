import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import './styles/design-tokens.css'
import './styles/index.css'
import './styles/detail.css'
import './styles/liquid-glass.css'
import './styles/reader-panels.css'
import './styles/reader.css'
import './styles/motion.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
)
