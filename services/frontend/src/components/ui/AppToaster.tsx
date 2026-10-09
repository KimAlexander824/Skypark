import type { ReactNode } from 'react'
import { Toaster } from 'sonner'
import { AlertTriangle, Check, Info, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/format'

function ToastIcon({ tone, children }: { tone: 'success' | 'error' | 'warning' | 'info'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'flex size-8 items-center justify-center rounded-full [&_svg]:size-4',
        tone === 'success' && 'bg-mint-500 text-snow',
        tone === 'error' && 'bg-danger-500 text-snow',
        tone === 'warning' && 'bg-accent-500 text-snow',
        tone === 'info' && 'bg-ink-900 text-mist-50',
      )}
    >
      {children}
    </span>
  )
}

/** Уведомления интерфейса: тёмная карточка, иконка-маркер типа, описание второй строкой. */
export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      gap={10}
      offset={20}
      visibleToasts={4}
      closeButton
      icons={{
        success: (
          <ToastIcon tone="success">
            <Check strokeWidth={3} />
          </ToastIcon>
        ),
        error: (
          <ToastIcon tone="error">
            <X strokeWidth={3} />
          </ToastIcon>
        ),
        warning: (
          <ToastIcon tone="warning">
            <AlertTriangle strokeWidth={2.5} />
          </ToastIcon>
        ),
        info: (
          <ToastIcon tone="info">
            <Info strokeWidth={2.5} />
          </ToastIcon>
        ),
        loading: (
          <ToastIcon tone="info">
            <Loader2 className="animate-spin" />
          </ToastIcon>
        ),
        close: <X className="size-3.5" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'glass-strong group relative flex w-full items-center gap-3 rounded-3xl py-3 pr-10 pl-3 font-sans text-ink-900 sm:w-[360px]',
          icon: 'flex shrink-0',
          content: 'flex min-w-0 flex-1 flex-col gap-0.5',
          title: 'text-sm leading-5 font-bold',
          description: 'text-[13px] leading-[18px] text-mist-500',
          closeButton:
            'absolute top-1/2 right-2.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-mist-400 transition hover:bg-mist-100 hover:text-ink-900',
          actionButton: 'ml-2 h-8 shrink-0 rounded-lg bg-white px-3 text-[13px] font-bold text-ink-900 hover:bg-ink-100',
          cancelButton: 'ml-2 h-8 shrink-0 rounded-lg bg-white/10 px-3 text-[13px] font-semibold text-snow hover:bg-white/15',
        },
      }}
    />
  )
}
