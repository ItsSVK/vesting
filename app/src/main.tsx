import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { WalletContextProvider } from './components/WalletContextProvider'
import { TooltipProvider } from './components/ui/tooltip'
import { Toaster } from './components/ui/sonner'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <WalletContextProvider>
        <TooltipProvider>
          <App />
          <Toaster />
        </TooltipProvider>
      </WalletContextProvider>
    </QueryClientProvider>
  </StrictMode>,
)
