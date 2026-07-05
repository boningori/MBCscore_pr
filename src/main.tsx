import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/common-components.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { installGlobalErrorHandlers } from './utils/errorLog'

installGlobalErrorHandlers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
