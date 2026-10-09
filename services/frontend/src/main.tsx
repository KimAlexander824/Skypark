import { StrictMode, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useLang } from './i18n'
import App from './App'
import { AuthProvider } from './features/auth/AuthProvider'
import { AppToaster } from './components/ui/AppToaster'
import './styles/index.css'
import './lib/theme'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 },
  },
})

function LangRoot() {
  const lang = useLang()
  const prev = useRef(lang)
  useEffect(() => {
    if (prev.current === lang) return
    prev.current = lang
    queryClient.invalidateQueries()
  }, [lang])
  return (
    <>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
      <AppToaster />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LangRoot />
    </QueryClientProvider>
  </StrictMode>,
)
