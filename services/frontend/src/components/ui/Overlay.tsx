import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/format'

const EXIT_MS = 240

/**
 * Модальное окно в духе iOS: на десктопе — «алерт» с пружинным появлением,
 * на телефоне — шторка снизу. Закрытие тоже анимировано.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  bare,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Без шапки, отступов и подвала — содержимое оформляется само. */
  bare?: boolean
}) {
  // держим окно смонтированным, пока идёт анимация закрытия
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      setClosing(false)
      return
    }
    if (!mounted) return
    setClosing(true)
    const t = setTimeout(() => {
      setMounted(false)
      setClosing(false)
    }, EXIT_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div
        className={cn('absolute inset-0 bg-ink-900/25 backdrop-blur-md', closing ? 'animate-backdrop-out' : 'animate-backdrop-in')}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'glass-strong relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-4xl sm:rounded-4xl',
          closing ? 'animate-sheet-out sm:animate-alert-out' : 'animate-sheet-in sm:animate-alert-in',
          size === 'xs' && 'sm:max-w-sm',
          size === 'sm' && 'sm:max-w-md',
          size === 'md' && 'sm:max-w-xl',
          size === 'lg' && 'sm:max-w-3xl',
        )}
      >
        {/* «ручка» шторки на телефоне */}
        <span className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-mist-300 sm:hidden" aria-hidden />

        {bare ? (
          <div className="overflow-y-auto">{children}</div>
        ) : (
          <>
            {(title || description) && (
              <div className="flex items-start gap-4 px-6 pt-5 pb-2 sm:pt-6">
                <div className="min-w-0 flex-1">
                  {title && <h2 className="text-lg font-extrabold tracking-tight text-ink-900">{title}</h2>}
                  {description && <p className="mt-1 text-sm font-medium text-mist-500">{description}</p>}
                </div>
                <button
                  onClick={onClose}
                  className="-mt-1 -mr-2 flex size-8 items-center justify-center rounded-full bg-mist-100 text-mist-500 transition hover:bg-mist-200 hover:text-ink-900"
                  aria-label="Закрыть"
                >
                  <X className="size-4" strokeWidth={2.5} />
                </button>
              </div>
            )}
            <div className="overflow-y-auto px-6 py-4">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-white/80 px-6 py-4">{footer}</div>}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

/* ---------- SegmentedControl ---------- */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; icon?: ReactNode }[]
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div className={cn('glass inline-flex rounded-full p-1', className)} role="tablist">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1.5 rounded-full font-bold whitespace-nowrap transition-all [&_svg]:size-4',
              size === 'md' ? 'h-9 px-3.5 text-sm' : 'h-7 px-2.5 text-[13px]',
              active ? 'bg-white text-ink-900 shadow-[0_1px_2px_rgb(0_0_0/0.06),0_4px_12px_-4px_rgb(0_0_0/0.12)]' : 'text-mist-600 hover:text-ink-900',
            )}
          >
            {o.icon}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ---------- Switch ---------- */

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: ReactNode
  disabled?: boolean
}) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2.5 select-none', disabled && 'cursor-not-allowed opacity-50')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative h-[26px] w-11 shrink-0 rounded-full transition duration-300', checked ? 'bg-mint-500' : 'bg-mist-300')}
      >
        <span className={cn('absolute top-[2px] left-[2px] size-[22px] rounded-full bg-snow shadow-[0_2px_6px_rgb(0_0_0/0.18)] transition-transform duration-300 ease-[var(--ease-spring)]', checked && 'translate-x-[18px]')} />
      </button>
      {label && <span className="text-sm font-semibold text-ink-800">{label}</span>}
    </label>
  )
}

/* ---------- Confirm ---------- */

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Подтвердить',
  danger,
  loading,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  danger?: boolean
  loading?: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      description={description}
      footer={
        <>
          <button onClick={onClose} className="h-11 rounded-full px-5 text-sm font-bold text-mist-600 hover:bg-white">
            Отмена
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              'h-11 rounded-full px-5 text-sm font-bold text-snow transition disabled:opacity-60',
              danger ? 'bg-danger-500 hover:bg-danger-600' : 'glass-accent hover:brightness-105',
            )}
          >
            {loading ? 'Подождите…' : confirmLabel}
          </button>
        </>
      }
    >
      <span />
    </Modal>
  )
}
