import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { WalletContextProvider } from './components/WalletContextProvider'
import { TooltipProvider } from './components/ui/tooltip'
import { Toaster } from './components/ui/sonner'
import { ThemeProvider } from './components/theme-provider'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <WalletContextProvider>
          <TooltipProvider>
            <App />
            <Toaster richColors />
          </TooltipProvider>
        </WalletContextProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
