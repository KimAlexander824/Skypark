import { useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { DateRange } from '@/api/analytics'
import { cn } from '@/lib/format'
import { t, LOCALE, localized } from '@/i18n'

const WEEKDAYS = localized(() => ([t('Пн'), t('Вт'), t('Ср'), t('Чт'), t('Пт'), t('Сб'), t('Вс')]))
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export function MiniCalendar({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [month, setMonth] = useState(() => new Date(value.to.getFullYear(), value.to.getMonth(), 1))
  const [anchor, setAnchor] = useState<Date | null>(null)
  const today = startOfDay(new Date())

  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7
  const days = Array.from({ length: 42 }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i - offset + 1))
  const from = startOfDay(value.from)
  const to = startOfDay(value.to)

  const pick = (d: Date) => {
    if (d > today) return
    if (!anchor) {
      setAnchor(d)
      onChange({ from: d, to: d })
    } else {
      onChange(d < anchor ? { from: d, to: anchor } : { from: anchor, to: d })
      setAnchor(null)
    }
  }

  const title = `${month.toLocaleDateString(LOCALE, { month: 'long' })} ${month.getFullYear()}`

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          className="flex size-8 items-center justify-center rounded-full text-ink-700 transition hover:bg-white"
          aria-label={t('Предыдущий месяц')}
        >
          <ArrowLeft className="size-4" />
        </button>
        <span className="rounded-full bg-accent-50 px-3.5 py-1 text-[13px] font-bold text-accent-700 capitalize ring-1 ring-accent-100">{title}</span>
        <button
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          disabled={month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth()}
          className="flex size-8 items-center justify-center rounded-full text-ink-700 transition hover:bg-white disabled:opacity-30"
          aria-label={t('Следующий месяц')}
        >
          <ArrowRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-[11px] font-semibold text-mist-400">
            {w}
          </div>
        ))}
        {days.map((d) => {
          const out = d.getMonth() !== month.getMonth()
          const future = d > today
          const isFrom = sameDay(d, from)
          const isTo = sameDay(d, to)
          const inside = d > from && d < to
          const edge = isFrom || isTo
          return (
            <div
              key={d.toISOString()}
              className={cn(
                'flex h-8 items-center justify-center',
                inside && 'bg-accent-100/70',
                isFrom && !isTo && 'rounded-l-full bg-linear-to-r from-transparent from-50% to-accent-100/70 to-50%',
                isTo && !isFrom && 'rounded-r-full bg-linear-to-l from-transparent from-50% to-accent-100/70 to-50%',
              )}
            >
              <button
                onClick={() => pick(d)}
                disabled={future}
                className={cn(
                  'tabular flex size-8 items-center justify-center rounded-full text-[12.5px] font-semibold transition',
                  edge ? 'glass-accent' : future ? 'cursor-not-allowed text-mist-300' : out ? 'text-mist-400' : 'text-ink-800',
                  !edge && !future && 'hover:bg-white',
                  sameDay(d, today) && !edge && 'ring-1 ring-accent-400',
                )}
              >
                {d.getDate()}
              </button>
            </div>
          )
        })}
      </div>
      <p className="mt-2 min-h-4 text-center text-[11.5px] font-medium text-mist-500">{anchor ? t('Выберите вторую дату периода') : ' '}</p>
    </div>
  )
}
