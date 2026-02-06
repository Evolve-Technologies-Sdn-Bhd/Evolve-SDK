import React from 'react'
import ReactDOM from 'react-dom/client'
import MainLayout from './components/layouts/MainLayout'
import Dashboard from './components/Dashboard/Dashboard'
import './index.css' // Ensure Tailwind CSS is imported
import { LogsProvider } from './contexts/LogsContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LogsProvider>
      <MainLayout>
        <Dashboard />
      </MainLayout>
    </LogsProvider>
  </React.StrictMode>,
)