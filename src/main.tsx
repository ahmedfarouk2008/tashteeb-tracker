import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { StoreProvider } from './store'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('لم يتم العثور على عنصر الجذر #root')

createRoot(container).render(
  <React.StrictMode>
    <ErrorBoundary>
      <StoreProvider>
        <App />
      </StoreProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
