import React from 'react'
import ReactDOM from 'react-dom/client'
import MainLayout from './components/layouts/MainLayout'
import Dashboard from './components/Dashboard/Dashboard'
import './index.css' // Ensure Tailwind CSS is imported
import { LogsProvider } from './contexts/LogsContext'
import { Tag } from 'lucide-react'
import { TagProvider } from './contexts/TagContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LogsProvider>
      <TagProvider>
        <MainLayout>
          <Dashboard />
        </MainLayout>
      </TagProvider>
    </LogsProvider>
  </React.StrictMode>,
)