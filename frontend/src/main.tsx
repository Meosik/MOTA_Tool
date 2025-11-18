import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import Studio from './pages/Studio'
import { ModeProvider } from './context/ModeContext'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ModeProvider>
        <Studio />
      </ModeProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
