import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Clock3 } from 'lucide-react'
import type { VisitListItem } from '@/api/visits'
import { cn, formatDuration, formatTime, fullName, plural } from '@/lib/format'
import { visitTiming } from '@/lib/time'
import { t, LOCALE } from '@/i18n'

/** Цвет посещения по срочности: продлено — peri, ≤15 мин — blush, остальное — butter. */
export const visitTone = (v: VisitListItem, now: number) =>
  v.status === 'extended' ? 'peri' : visitTiming(v, now).endingSoon || v.status === 'awaiting_extension' ? 'blush' : 'butter'

export const toneBg = { butter: 'bg-butter-300', blush: 'bg-blush-300', peri: 'bg-peri-300' } as const
export const toneSoft = { butter: 'bg-butter-200', blush: 'bg-blush-200', peri: 'bg-peri-200' } as const

/* ---------- Timeline окончаний ---------- */

interface TimelineEntry {
  id: string
  at: number
  visit: VisitListItem
  done: boolean
}

export function EndTimeline({
  current,
  completed,
  now,
  linkToChild = true,
  showAllLink = true,
  title = t('Окончание посещений'),
}: {
  current?: VisitListItem[]
  completed?: VisitListItem[]
  now: number
  /** Ссылки на карточку ребёнка — только для ролей с доступом к карточкам. */
  linkToChild?: boolean
  showAllLink?: boolean
  title?: string
}) {
  const nowHour = new Date(now).getHours()
  const hours = Array.from({ length: 5 }, (_, i) => nowHour - 1 + i).filter((h) => h >= 0 && h < 24)
  const todayStr = new Date(now).toDateString()

  const entries = useMemo<TimelineEntry[]>(() => {
    const list: TimelineEntry[] = [
      ...(current ?? []).map((v) => ({ id: v.id, at: new Date(v.endAt).getTime(), visit: v, done: false })),
      ...(completed ?? [])
        .filter((v) => v.status === 'completed' && v.endedAt && new Date(v.endedAt).toDateString() === todayStr)
        .map((v) => ({ id: v.id, at: new Date(v.endedAt!).getTime(), visit: v, done: true })),
    ]
    return list.sort((a, b) => a.at - b.at)
  }, [current, completed, todayStr])

  const later = entries.filter(
    (e) => new Date(e.at).getHours() > hours[hours.length - 1] && new Date(e.at).toDateString() === todayStr,
  ).length

  return (
    <section className="flex flex-col rounded-3xl bg-cream-50 p-4 ring-1 ring-cream-200">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-[17px] font-extrabold text-ink-900">{title}</h2>
          <p className="text-xs text-ink-500">{t('Сегодня, ')} {new Date(now).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' })}</p>
        </div>
        <Clock3 className="size-5 text-ink-400" />
      </div>

      <div className="grid grid-cols-[44px_1fr] text-[11px] font-semibold text-ink-400">
        <span>{t('Время')}</span>
        <span>{t('Кто заканчивает')}</span>
      </div>

      <ol className="mt-2">
        {hours.map((h) => {
          const inHour = entries.filter((e) => new Date(e.at).getHours() === h && new Date(e.at).toDateString() === todayStr)
          const isNowHour = h === nowHour
          const before = isNowHour ? inHour.filter((e) => e.at <= now) : inHour
          const after = isNowHour ? inHour.filter((e) => e.at > now) : []
          return (
            <li key={h} className="grid grid-cols-[44px_1fr] border-t border-dashed border-cream-300">
              <span className="tabular pt-2 text-[11.5px] font-bold text-ink-500">{String(h).padStart(2, '0')}:00</span>
              <div className="min-h-11 space-y-1.5 py-2">
                {before.map((e) => (
                  <TimelineItem key={e.id} entry={e} now={now} link={linkToChild} />
                ))}
                {isNowHour && <NowMarker now={now} />}
                {after.map((e) => (
                  <TimelineItem key={e.id} entry={e} now={now} link={linkToChild} />
                ))}
              </div>
            </li>
          )
        })}
      </ol>

      {later > 0 && (
        <p className="mt-1 text-center text-xs font-semibold text-ink-500">
          
          {t('Ещё ')} {later} {plural(later, [t('окончание'), t('окончания'), t('окончаний')])}  {t(' позже')}
        </p>
      )}

      {showAllLink && (
        <Link
          to="/visits"
          className="glass-accent mt-3 flex h-10 items-center justify-center gap-2 rounded-full text-[13px] font-bold transition hover:brightness-105"
        >
          
          {t('Все посещения ')} <ArrowRight className="size-4" />
        </Link>
      )}
    </section>
  )
}

function NowMarker({ now }: { now: number }) {
  return (
    <div className="relative flex items-center gap-2 py-0.5">
      <span className="tabular -ml-[52px] rounded-full bg-blush-500 px-1.5 py-0.5 text-[10.5px] font-extrabold text-snow">
        {formatTime(new Date(now).toISOString())}
      </span>
      <span className="h-px flex-1 border-t-2 border-dashed border-blush-500" />
    </div>
  )
}

function TimelineItem({ entry, now, link }: { entry: TimelineEntry; now: number; link: boolean }) {
  const v = entry.visit
  const tone = entry.done ? null : visitTone(v, now)
  const left = entry.at - now
  const className = cn(
    'flex items-center gap-2.5 rounded-2xl p-2 transition',
    link && 'hover:brightness-[0.97]',
    tone ? toneSoft[tone] : 'bg-cream-100 opacity-60 hover:opacity-100',
  )
  const body = (
    <>
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-xl text-[11px] font-extrabold text-ink-900',
          tone ? toneBg[tone] : 'bg-cream-200',
        )}
      >
        {v.child.firstName[0]}
        {v.child.lastName[0]}
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn('truncate text-[13px] font-bold', entry.done ? 'text-ink-500 line-through decoration-ink-300' : 'text-ink-900')}>
          {fullName(v.child)}
        </div>
        <div className="truncate text-[11px] text-ink-500">
          {entry.done ? t('Завершено') : t('через {0}', formatDuration(left / 60_000))} · {v.nanny?.firstName ?? '—'}
        </div>
      </div>
      <span className="tabular text-[12px] font-extrabold text-ink-900">{formatTime(new Date(entry.at).toISOString())}</span>
    </>
  )
  return link ? (
    <Link to={`/children/${v.child.id}`} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}
