import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlarmClock, Baby, CircleCheckBig, Clock3, LayoutGrid, NotebookPen, Rows3, TimerReset } from 'lucide-react'
import { toast } from 'sonner'
import type { VisitListItem } from '@/api/visits'
import { PastelStat } from '@/components/admin/AdminKit'
import { Skeleton } from '@/components/ui/Display'
import { Segmented } from '@/components/ui/Overlay'
import { EndTimeline, toneSoft, visitTone } from '@/components/visits/EndTimeline'
import { useCurrentUser } from '@/features/auth/AuthProvider'
import { useNannyWorkspace, visitKeys } from '@/features/visits/queries'
import { cn, formatAge, formatDuration, formatTime, fullName, plural } from '@/lib/format'
import { nannyStatus } from '@/lib/statuses'
import { formatCountdown, useNow, visitTiming } from '@/lib/time'

type View = 'cards' | 'table'

const paidExtMinutes = (v: VisitListItem) => v.extensions.filter((e) => e.paymentStatus === 'paid').reduce((s, e) => s + e.minutes, 0)

/** ТЗ §13 — информация о продлении для няни. */
function extensionInfo(v: VisitListItem): { text: string; tone: 'peri' | 'blush' | 'muted' } {
  const ext = paidExtMinutes(v)
  if (v.extensions.some((e) => e.paymentStatus === 'pending')) return { text: 'Продление ждёт оплаты', tone: 'blush' }
  if (v.status === 'awaiting_extension') return { text: 'Ждём решения родителя', tone: 'blush' }
  if (v.extensionDeclined?.endAt === v.endAt) return { text: ext > 0 ? `Продлено +${formatDuration(ext)}, дальше без продления` : 'Родитель не продлевает', tone: 'muted' }
  if (ext > 0) return { text: `Продлено +${formatDuration(ext)}`, tone: 'peri' }
  return { text: 'Без продления', tone: 'muted' }
}

export function NannyPage() {
  const user = useCurrentUser()
  const { data, isLoading } = useNannyWorkspace(user.id)
  const [view, setView] = useState<View>('cards')
  const now = useNow(1000)
  const qc = useQueryClient()
  const notified = useRef(new Set<string>())
  const expired = useRef(new Set<string>())

  const current = data?.current ?? []

  // ТЗ §16 — за 15 минут до конца предупреждаем няню; по окончании — обновляем список
  useEffect(() => {
    for (const v of current) {
      const t = visitTiming(v, now)
      if (t.endingSoon && !notified.current.has(v.id)) {
        notified.current.add(v.id)
        toast.warning(`${v.child.firstName}: осталось ${formatDuration(t.leftMin)}`, { description: 'Родитель получил предложение продлить' })
      }
      if (t.over && !expired.current.has(v.id)) {
        expired.current.add(v.id)
        qc.invalidateQueries({ queryKey: visitKeys.all })
        toast.info(`Время посещения закончилось: ${fullName(v.child)}`)
      }
    }
  }, [current, now, qc])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер'
  const next = current[0]
  const extended = current.filter((v) => paidExtMinutes(v) > 0).length

  return (
    <div className="animate-slide-up">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {/* Заголовок */}
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-[28px] leading-tight font-extrabold tracking-tight text-ink-900 sm:text-[32px]">
                {greeting}, {user.firstName}
              </h1>
              <p className="mt-1.5 text-sm text-ink-600">
                {data ? (
                  <>
                    Сейчас с вами <b className="text-ink-900">{current.length}</b> {plural(current.length, ['ребёнок', 'ребёнка', 'детей'])} из{' '}
                    {data.nanny.maxChildren} мест · рабочие часы <span className="tabular">{data.nanny.workHours}</span>
                  </>
                ) : (
                  'Загружаем ваших детей…'
                )}
              </p>
            </div>
            {data && (
              <span className="glass inline-flex items-center gap-2 self-start rounded-full px-3.5 py-1.5 text-[13px] font-bold text-ink-900 sm:self-auto">
                <span
                  className={cn(
                    'size-2 rounded-full',
                    data.nanny.status === 'free' && 'bg-olive-300',
                    data.nanny.status === 'busy' && 'bg-butter-300',
                    data.nanny.status === 'break' && 'bg-peri-300',
                    data.nanny.status === 'off' && 'bg-ink-400',
                  )}
                />
                {nannyStatus[data.nanny.status].label}
              </span>
            )}
          </div>

          {/* Показатели */}
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <PastelStat
              tone="butter"
              icon={<Baby />}
              label="Детей сейчас"
              value={
                data ? (
                  <>
                    {current.length}
                    <span className="text-lg text-mist-400"> / {data.nanny.maxChildren}</span>
                  </>
                ) : undefined
              }
            />
            <PastelStat
              tone="blush"
              icon={<AlarmClock />}
              label={next ? `Ближайшее: ${next.child.firstName}` : 'Ближайшее окончание'}
              value={data ? (next ? formatCountdown(visitTiming(next, now).leftMs) : '—') : undefined}
            />
            <PastelStat tone="peri" icon={<TimerReset />} label="Продлено" value={data ? extended : undefined} />
            <PastelStat tone="olive" icon={<CircleCheckBig />} label="Завершено сегодня" value={data ? data.completedToday.length : undefined} />
          </div>

          {/* Мои дети */}
          <section className="glass rounded-3xl p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-[19px] font-extrabold text-ink-900">Мои дети</h2>
              <Segmented
                value={view}
                onChange={setView}
                size="sm"
                className="bg-cream-200/70"
                options={[
                  { value: 'cards', label: 'Карточки', icon: <LayoutGrid /> },
                  { value: 'table', label: 'Таблица', icon: <Rows3 /> },
                ]}
              />
            </div>

            {isLoading ? (
              <div className="grid gap-3 md:grid-cols-2">
                <Skeleton className="h-[230px] rounded-3xl bg-cream-200" />
                <Skeleton className="h-[230px] rounded-3xl bg-cream-200" />
              </div>
            ) : current.length === 0 ? (
              <EmptyKids />
            ) : view === 'cards' ? (
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {current.map((v) => (
                  <ChildCard key={v.id} visit={v} now={now} />
                ))}
              </div>
            ) : (
              <KidsTable visits={current} now={now} />
            )}
          </section>
        </div>

        {/* Правая колонка */}
        <aside className="flex flex-col gap-5">
          <EndTimeline current={data?.current} completed={data?.completedToday} now={now} linkToChild={false} showAllLink={false} title="Мои окончания" />
          <CompletedToday visits={data?.completedToday} />
        </aside>
      </div>
    </div>
  )
}

/* ---------- Компоненты ---------- */


const cardTint = {
  butter: { avatar: 'bg-accent-100 text-accent-700', bar: 'bg-accent-500', chip: 'bg-accent-50 text-accent-700 ring-accent-100' },
  blush: { avatar: 'bg-rose-100 text-rose-500', bar: 'bg-rose-500', chip: 'bg-rose-50 text-rose-500 ring-rose-100' },
  peri: { avatar: 'bg-mint-100 text-mint-600', bar: 'bg-mint-500', chip: 'bg-mint-50 text-mint-600 ring-mint-100' },
} as const

function ChildCard({ visit, now }: { visit: VisitListItem; now: number }) {
  const t = visitTiming(visit, now)
  const tint = cardTint[visitTone(visit, now)]
  const ext = extensionInfo(visit)
  const { child } = visit
  return (
    <article className="flex flex-col rounded-3xl bg-white/70 p-4 ring-1 ring-white transition duration-300 hover:-translate-y-0.5 hover:bg-white/90">
      <div className="flex items-center gap-3">
        {child.photoUrl ? (
          <img src={child.photoUrl} alt="" className="size-14 rounded-full object-cover ring-2 ring-white" />
        ) : (
          <span className={cn('flex size-14 items-center justify-center rounded-full text-lg font-extrabold', tint.avatar)}>
            {child.firstName[0]}
            {child.lastName[0]}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-bold text-ink-900">{fullName(child)}</div>
          <div className="text-[13px] font-medium text-mist-500">
            {formatAge(child.birthDate)} · {child.gender === 'female' ? 'девочка' : 'мальчик'}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-[11.5px] font-semibold text-mist-500">осталось</div>
          <div className="tabular text-[30px] leading-none font-extrabold tracking-tight text-ink-900">{formatCountdown(t.leftMs)}</div>
        </div>
        <div className="shrink-0 text-right text-[12px] font-semibold whitespace-nowrap text-mist-600">
          <div className="flex items-center justify-end gap-1">
            <Clock3 className="size-3.5" />
            <span className="tabular">
              {formatTime(visit.startAt)} — {formatTime(visit.endAt)}
            </span>
          </div>
          <div className="mt-0.5">прошло {formatDuration(t.elapsedMin)}</div>
        </div>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-mist-200">
        <div className={cn('h-full rounded-full transition-all', tint.bar)} style={{ width: `${t.progress}%` }} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold ring-1',
            ext.tone === 'muted' ? 'bg-mist-100 text-mist-500 ring-mist-200' : tint.chip,
          )}
        >
          <TimerReset className="size-3.5" />
          {ext.text}
        </span>
      </div>

      {child.note && (
        <p className="mt-3 flex items-start gap-1.5 rounded-2xl bg-accent-50 p-2.5 text-[12.5px] leading-snug font-semibold text-accent-700 ring-1 ring-accent-100">
          <NotebookPen className="mt-0.5 size-3.5 shrink-0" />
          {child.note}
        </p>
      )}
    </article>
  )
}

/** Табличный вид — как в примере ТЗ §13. */
function KidsTable({ visits, now }: { visits: VisitListItem[]; now: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="text-xs text-ink-500">
            <th className="pb-2 pl-2 font-semibold">Ребёнок</th>
            <th className="pb-2 text-right font-semibold">Начало</th>
            <th className="pb-2 text-right font-semibold">Окончание</th>
            <th className="pb-2 text-right font-semibold">Осталось</th>
            <th className="pb-2 pl-4 font-semibold">Продление</th>
          </tr>
        </thead>
        <tbody>
          {visits.map((v) => {
            const tone = visitTone(v, now)
            const t = visitTiming(v, now)
            const ext = extensionInfo(v)
            return (
              <tr key={v.id} className="border-t border-cream-200">
                <td className="py-2.5 pl-2">
                  <div className="flex items-center gap-2.5">
                    <span className={cn('flex size-9 items-center justify-center rounded-full text-xs font-extrabold', cardTint[tone].avatar)}>
                      {v.child.firstName[0]}
                      {v.child.lastName[0]}
                    </span>
                    <span className="font-bold text-ink-900">{fullName(v.child)}</span>
                  </div>
                </td>
                <td className="tabular py-2.5 text-right font-semibold text-ink-700">{formatTime(v.startAt)}</td>
                <td className="tabular py-2.5 text-right font-semibold text-ink-700">{formatTime(v.endAt)}</td>
                <td className="py-2.5 text-right">
                  <span className={cn('tabular rounded-full px-2.5 py-1 text-xs font-extrabold text-ink-900', toneSoft[tone])}>
                    {formatDuration(t.leftMin)}
                  </span>
                </td>
                <td className={cn('py-2.5 pl-4 text-[13px] font-semibold', ext.tone === 'muted' ? 'text-ink-400' : 'text-ink-900')}>{ext.text}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CompletedToday({ visits }: { visits?: VisitListItem[] }) {
  return (
    <section className="rounded-3xl bg-cream-50 p-4 ring-1 ring-cream-200">
      <h2 className="mb-3 text-[17px] font-extrabold text-ink-900">Сегодня завершены</h2>
      {!visits ? (
        <Skeleton className="h-14 rounded-2xl bg-cream-200" />
      ) : visits.length === 0 ? (
        <p className="rounded-2xl bg-cream-100 p-4 text-center text-sm text-ink-500">Пока никого</p>
      ) : (
        <ul className="space-y-1.5">
          {visits.map((v) => (
            <li key={v.id} className="flex items-center gap-2.5 rounded-2xl bg-cream-100 p-2">
              <span className="flex size-8 items-center justify-center rounded-xl bg-olive-300 text-[11px] font-extrabold text-ink-900">
                {v.child.firstName[0]}
                {v.child.lastName[0]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold text-ink-900">{fullName(v.child)}</div>
                <div className="tabular text-[11px] text-ink-500">
                  {formatTime(v.startAt)} — {formatTime(v.endedAt ?? v.endAt)}
                </div>
              </div>
              <CircleCheckBig className="size-4 text-olive-500" />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function EmptyKids() {
  return (
    <div className="relative isolate flex flex-col items-center overflow-hidden rounded-3xl bg-butter-200 px-6 py-14 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-white/60 text-ink-900">
        <Baby className="size-7" />
      </span>
      <h3 className="mt-4 text-lg font-extrabold text-ink-900">Сейчас у вас нет детей</h3>
      <p className="mt-1 max-w-xs text-sm text-ink-700">Как только сотрудник назначит вам ребёнка, он появится здесь с таймером.</p>
    </div>
  )
}
