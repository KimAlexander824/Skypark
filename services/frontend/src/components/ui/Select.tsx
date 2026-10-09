import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/format'
import { FieldShell } from './Field'
import { t } from '@/i18n'

export interface SelectOption {
  value: string
  label: string
  icon?: ReactNode
  hint?: string
}

export interface SelectProps {
  value: string
  onChange: (e: { target: { value: string } }) => void
  options: SelectOption[]
  label?: string
  hint?: string
  error?: string
  required?: boolean
  placeholder?: string
  disabled?: boolean
  size?: 'md' | 'sm'
  className?: string
  containerClassName?: string
  id?: string
  leading?: ReactNode
}

interface MenuPos {
  left: number
  top: number
  width: number
  placement: 'bottom' | 'top'
}

const MENU_MAX_H = 280

export function Select({
  value,
  onChange,
  options,
  label,
  hint,
  error,
  required,
  placeholder = t('Выберите'),
  disabled,
  size = 'md',
  className,
  containerClassName,
  id,
  leading,
}: SelectProps) {
  const autoId = useId()
  const triggerId = id ?? autoId
  const listId = `${triggerId}-list`
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<MenuPos>()

  const selectedIndex = options.findIndex((o) => o.value === value)
  const selected = options[selectedIndex]

  const place = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return
    const panelHeight = Math.min(MENU_MAX_H, options.length * 40 + 12)
    const vh = window.innerHeight
    const below = vh - r.bottom
    const placement = below < panelHeight + 16 && r.top > below ? 'top' : 'bottom'
    const rawTop = placement === 'bottom' ? r.bottom + 6 : r.top - 6 - panelHeight
    const top = Math.max(8, Math.min(rawTop, vh - panelHeight - 8))
    const width = Math.max(r.width, 180)
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), width, top, placement })
  }, [options.length])

  useLayoutEffect(() => {
    if (!open) return
    place()
    const update = () => place()
    const onScroll = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('resize', update)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!triggerRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const openMenu = () => {
    if (disabled) return
    setActive(selectedIndex >= 0 ? selectedIndex : 0)
    setOpen(true)
  }

  const choose = (i: number) => {
    const o = options[i]
    if (!o) return
    onChange({ target: { value: o.value } })
    setOpen(false)
    triggerRef.current?.focus()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        openMenu()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(options.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      choose(active)
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <FieldShell label={label} hint={hint} error={error} required={required} htmlFor={triggerId} className={containerClassName}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={cn(
          'group flex w-full items-center gap-2 bg-white/75 text-left font-semibold text-ink-900 ring-1 ring-mist-200 ring-inset backdrop-blur-xl transition',
          'hover:ring-mist-300 focus:ring-2 focus:ring-accent-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60',
          size === 'md' ? 'h-11 rounded-2xl pr-3 pl-3.5 text-[15px]' : 'h-9 rounded-full pr-2.5 pl-3.5 text-[13px]',
          open && 'ring-2 ring-accent-400',
          error && 'ring-danger-500/70',
          className,
        )}
      >
        {leading && (
          <span
            className={cn(
              '-ml-1 flex shrink-0 items-center justify-center rounded-full bg-accent-50 text-accent-600 transition',
              size === 'md' ? 'size-7' : 'size-6',
              open && 'bg-accent-100',
            )}
          >
            {leading}
          </span>
        )}
        {selected?.icon && <span className="flex shrink-0 [&_svg]:size-4">{selected.icon}</span>}
        <span className={cn('min-w-0 flex-1 truncate', !selected && 'font-normal text-ink-400')}>{selected?.label ?? placeholder}</span>
        <span
          className={cn(
            'flex shrink-0 items-center justify-center rounded-full bg-mist-100 text-mist-600 transition group-hover:bg-accent-50 group-hover:text-accent-600',
            size === 'md' ? 'size-6' : 'size-5',
            open && 'bg-accent-50 text-accent-600',
          )}
        >
          <ChevronDown className={cn('size-3.5 transition-transform duration-200', open && 'rotate-180')} />
        </span>
      </button>

      {open &&
        pos &&
        createPortal(
          <ul
            ref={menuRef}
            id={listId}
            role="listbox"
            aria-labelledby={triggerId}
            className={cn(
              'glass-strong fixed z-[60] animate-pop-in overflow-y-auto rounded-3xl p-1.5',
            )}
            style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: MENU_MAX_H }}
          >
            {options.map((o, i) => {
              const isSelected = o.value === value
              return (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={isSelected}
                  data-index={i}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(i)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors [&_svg]:size-4',
                    isSelected ? 'bg-accent-500 text-snow' : i === active ? 'bg-accent-50 text-ink-900' : 'text-ink-700',
                  )}
                >
                  {o.icon && <span className="flex shrink-0">{o.icon}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.label}</span>
                    {o.hint && <span className={cn('block truncate text-xs font-medium', isSelected ? 'text-snow/60' : 'text-ink-500')}>{o.hint}</span>}
                  </span>
                  {isSelected && <Check className="shrink-0" strokeWidth={3} />}
                </li>
              )
            })}
          </ul>,
          document.body,
        )}
    </FieldShell>
  )
}

export function OptionDot({ className }: { className: string }) {
  return <span className={cn('size-2.5 rounded-full ring-2 ring-white/60', className)} />
}
