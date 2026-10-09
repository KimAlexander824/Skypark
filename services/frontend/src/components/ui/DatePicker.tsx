import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, CalendarDays, Clock3, X } from 'lucide-react'
import { cn } from '@/lib/format'
import { FieldShell } from './Field'
import { Select } from './Select'
import { usePopover } from './usePopover'
import { t, localized } from '@/i18n'

const WEEKDAYS = localized(() => ([t('Пн'), t('Вт'), t('Ср'), t('Чт'), t('Пт'), t('Сб'), t('Вс')]))
const MONTHS = localized(() => ([t('Январь'), t('Февраль'), t('Март'), t('Апрель'), t('Май'), t('Июнь'), t('Июль'), t('Август'), t('Сентябрь'), t('Октябрь'), t('Ноябрь'), t('Декабрь')]))
const MONTHS_SHORT = localized(() => ([t('янв'), t('фев'), t('мар'), t('апр'), t('май'), t('июн'), t('июл'), t('авг'), t('сен'), t('окт'), t('ноя'), t('дек')]))

const pad = (n: number) => String(n).padStart(2, '0')
export const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fromIso = (s?: string) => {
  if (!s) return undefined
  const [y, m, d] = s.split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d) : undefined
}
const display = (s?: string) => {
  const d = fromIso(s)
  return d ? `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}` : ''
}

type View = 'days' | 'months' | 'years'

export interface DatePickerProps {
  /** YYYY-MM-DD или пустая строка */
  value: string
  onChange: (value: string) => void
  label?: string
  hint?: string
  error?: string
  required?: boolean
  placeholder?: string
  min?: string
  max?: string
  clearable?: boolean
  size?: 'md' | 'sm'
  className?: string
  containerClassName?: string
  'aria-label'?: string
}

/** Календарь Skypark: кремовая панель, выбранный день — графитовый, быстрый выбор месяца и года. */
export function DatePicker({
  value,
  onChange,
  label,
  hint,
  error,
  required,
  placeholder = t('Выберите дату'),
  min,
  max,
  clearable,
  size = 'md',
  className,
  containerClassName,
  'aria-label': ariaLabel,
}: DatePickerProps) {
  const id = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const { open, setOpen, pos } = usePopover(triggerRef, panelRef, { panelHeight: 372, panelWidth: 304 })
  const selected = fromIso(value)
  const [view, setView] = useState<View>('days')
  const [cursor, setCursor] = useState(() => selected ?? fromIso(max) ?? new Date())

  const minD = fromIso(min)
  const maxD = fromIso(max)
  const isDisabled = (d: Date) => (minD && d < minD) || (maxD && d > maxD)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const toggle = () => {
    if (open) return setOpen(false)
    setCursor(selected ?? (maxD && maxD < today ? maxD : today))
    setView('days')
    setOpen(true)
  }

  const pick = (d: Date) => {
    if (isDisabled(d)) return
    onChange(toIso(d))
    setOpen(false)
    triggerRef.current?.focus()
  }

  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const offset = (first.getDay() + 6) % 7
    return Array.from({ length: 42 }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i - offset + 1))
  }, [cursor])

  const decadeStart = Math.floor(cursor.getFullYear() / 12) * 12

  const shift = (dir: 1 | -1) => {
    if (view === 'days') setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1))
    if (view === 'months') setCursor(new Date(cursor.getFullYear() + dir, cursor.getMonth(), 1))
    if (view === 'years') setCursor(new Date(cursor.getFullYear() + dir * 12, cursor.getMonth(), 1))
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      e.stopPropagation()
      setOpen(false)
    }
    if ((e.key === 'ArrowDown' || e.key === 'Enter') && !open) {
      e.preventDefault()
      toggle()
    }
  }

  const title =
    view === 'days' ? `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}` : view === 'months' ? String(cursor.getFullYear()) : `${decadeStart} — ${decadeStart + 11}`

  return (
    <FieldShell label={label} hint={hint} error={error} required={required} htmlFor={id} className={containerClassName}>
      <div className="relative">
        <button
          ref={triggerRef}
          id={id}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={ariaLabel}
          onClick={toggle}
          onKeyDown={onKeyDown}
          className={cn(
            'group flex w-full items-center gap-2.5 bg-white/75 text-left font-semibold text-ink-900 ring-1 ring-mist-200 ring-inset backdrop-blur-xl transition',
            'hover:ring-mist-300 focus:ring-2 focus:ring-accent-400 focus:outline-none',
            size === 'md' ? 'h-11 rounded-2xl pr-3 pl-3 text-[15px]' : 'h-9 rounded-full pr-2.5 pl-2 text-[13px]',
            open && 'ring-2 ring-accent-400',
            error && 'ring-danger-500/70',
            clearable && value && 'pr-9',
            className,
          )}
        >
          <span
            className={cn(
              'flex shrink-0 items-center justify-center rounded-full bg-accent-50 text-accent-600 transition group-hover:bg-accent-100',
              size === 'md' ? 'size-7' : 'size-6',
              open && 'bg-accent-100',
            )}
          >
            <CalendarDays className="size-3.5" />
          </span>
          <span className={cn('tabular min-w-0 flex-1 truncate', !value && 'font-normal text-ink-400')}>{value ? display(value) : placeholder}</span>
        </button>
        {clearable && value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-mist-400 transition hover:bg-mist-100 hover:text-ink-900"
            aria-label={t('Очистить дату')}
          >
            <X className="size-3.5" />
          </button>
        )}                 
      </div>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={t('Выбор даты')}
            onKeyDown={onKeyDown}
            className="glass-strong fixed z-[60] animate-pop-in rounded-3xl p-3"
            style={{ left: pos.left, top: pos.top, width: pos.width }}
          >
            <div className="mb-2 flex items-center justify-between">
              <NavButton label={t('Назад')} onClick={() => shift(-1)}>
                <ArrowLeft className="size-4" />
              </NavButton>
              <button
                type="button"
                onClick={() => setView(view === 'days' ? 'months' : view === 'months' ? 'years' : 'days')}
                className="rounded-full bg-accent-50 px-3.5 py-1 text-[13px] font-extrabold text-accent-700 ring-1 ring-accent-100 transition hover:bg-accent-100"
              >
                {title}
              </button>
              <NavButton label={t('Вперёд')} onClick={() => shift(1)}>
                <ArrowRight className="size-4" />
              </NavButton>
            </div>

            {view === 'days' && (
              <div className="grid grid-cols-7 gap-y-1 text-center">
                {WEEKDAYS.map((w, i) => (
                  <div key={w} className={cn('pb-1 text-[11px] font-bold', i >= 5 ? 'text-accent-500' : 'text-mist-400')}>
                    {w}
                  </div>
                ))}
                {days.map((d) => {
                  const out = d.getMonth() !== cursor.getMonth()
                  const sel = selected && d.toDateString() === selected.toDateString()
                  const isToday = d.toDateString() === today.toDateString()
                  const disabled = isDisabled(d)
                  return (
                    <button
                      key={d.toISOString()}
                      type="button"
                      disabled={disabled}
                      onClick={() => pick(d)}
                      className={cn(
                        'tabular mx-auto flex size-9 items-center justify-center rounded-full text-[13px] font-semibold transition',
                        // цвет текста — строго один класс, чтобы состояния не перебивали друг друга
                        sel ? 'glass-accent' : disabled ? 'cursor-not-allowed text-mist-300 line-through decoration-mist-300' : out ? 'text-mist-400' : 'text-ink-800',
                        !sel && !disabled && 'hover:bg-accent-50',
                        isToday && !sel && 'ring-1 ring-accent-400',
                      )}
                    >
                      {d.getDate()}
                    </button>
                  )
                })}
              </div>
            )}

            {view === 'months' && (
              <div className="grid grid-cols-3 gap-1.5 py-1">
                {MONTHS.map((m, i) => {
                  const active = selected && selected.getFullYear() === cursor.getFullYear() && selected.getMonth() === i
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setCursor(new Date(cursor.getFullYear(), i, 1))
                        setView('days')
                      }}
                      className={cn(
                        'h-11 rounded-2xl text-[13px] font-bold transition',
                        active ? 'glass-accent' : 'bg-white/60 text-ink-800 hover:bg-accent-50',
                      )}
                    >
                      {m}
                    </button>
                  )
                })}
              </div>
            )}

            {view === 'years' && (
              <div className="grid grid-cols-3 gap-1.5 py-1">
                {Array.from({ length: 12 }, (_, i) => decadeStart + i).map((y) => {
                  const active = selected?.getFullYear() === y
                  const blocked = (minD && y < minD.getFullYear()) || (maxD && y > maxD.getFullYear())
                  return (
                    <button
                      key={y}
                      type="button"
                      disabled={blocked}
                      onClick={() => {
                        setCursor(new Date(y, cursor.getMonth(), 1))
                        setView('months')
                      }}
                      className={cn(
                        'tabular h-11 rounded-2xl text-[13px] font-bold transition disabled:cursor-not-allowed disabled:opacity-35',
                        active ? 'glass-accent' : 'bg-white/60 text-ink-800 hover:bg-accent-50',
                      )}
                    >
                      {y}
                    </button>
                  )
                })}
              </div>
            )}

            <div className="mt-2 flex items-center justify-between border-t border-white/80 pt-2.5">
              <button
                type="button"
                disabled={isDisabled(today)}
                onClick={() => pick(today)}
                className="glass-accent rounded-full px-3.5 py-1.5 text-xs font-bold transition hover:brightness-105 disabled:opacity-40"
              >
                
                {t('Сегодня')}
              </button>
              {value && (
                <button
                  type="button"
                  onClick={() => {
                    onChange('')
                    setOpen(false)
                  }}
                  className="rounded-full px-3 py-1.5 text-xs font-bold text-mist-500 transition hover:bg-white hover:text-ink-900"
                >
                  
                  {t('Очистить')}
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </FieldShell>
  )
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-full text-ink-700 transition hover:bg-white"
    >
      {children}
    </button>
  )
}

/* ---------- Время ---------- */

const timeOptions = (step: number, extra?: string) => {
  const list = Array.from({ length: (24 * 60) / step }, (_, i) => `${pad(Math.floor((i * step) / 60))}:${pad((i * step) % 60)}`)
  if (extra && !list.includes(extra)) list.push(extra)
  return list.sort()
}

/** Выбор времени в том же стиле — список с шагом 15 минут. */
export function TimePicker({
  value,
  onChange,
  label,
  size = 'md',
  step = 15,
  containerClassName,
  className,
}: {
  value: string
  onChange: (v: string) => void
  label?: string
  size?: 'md' | 'sm'
  step?: number
  containerClassName?: string
  className?: string
}) {
  const options = useMemo(() => timeOptions(step, value).map((t) => ({ value: t, label: t })), [step, value])
  return (
    <Select
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={options}
      size={size}
      containerClassName={containerClassName}
      className={cn('tabular', className)}
      leading={<Clock3 className="size-3.5" />}
    />
  )
}

/** Дата + время (ISO-строка в UTC). */
export function DateTimePicker({ value, onChange, label }: { value: string; onChange: (iso: string) => void; label?: string }) {
  const d = new Date(value)
  const date = toIso(d)
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const combine = (dateStr: string, timeStr: string) => {
    const base = fromIso(dateStr) ?? new Date()
    const [h, m] = timeStr.split(':').map(Number)
    base.setHours(h, m, 0, 0)
    onChange(base.toISOString())
  }
  return (
    <FieldShell label={label}>
      <div className="flex gap-2">
        <DatePicker value={date} onChange={(v) => v && combine(v, time)} containerClassName="flex-1" />
        <TimePicker value={time} onChange={(t) => combine(date, t)} containerClassName="w-32" />
      </div>
    </FieldShell>
  )
}
