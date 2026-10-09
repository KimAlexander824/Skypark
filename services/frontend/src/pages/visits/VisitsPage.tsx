import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlarmClock,
  CircleCheckBig,
  ClipboardList,
  HeartHandshake,
  Hourglass,
  Play,
  Plus,
  Square,
  TimerReset,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { errorMessage } from '@/api/errors'
import type { VisitListItem, VisitsScope } from '@/api/visits'
import { Button } from '@/components/ui/Button'
import { PastelStat } from '@/components/admin/AdminKit'
import { GlassCard } from '@/components/glass/Glass'
import { TelegramLogo } from '@/components/brand/TelegramLogo'
import { TelegramExtensionDemo } from '@/components/visits/TelegramExtensionDemo'
import { Avatar, Badge, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui/Display'
import { Modal, Segmented } from '@/components/ui/Overlay'
import { useCurrentUser } from '@/features/auth/AuthProvider'
import { useFinishVisit, useNannies, useVisits, visitKeys } from '@/features/visits/queries'
import { cn, formatDuration, formatMoney, formatPhone, formatShortDate, formatTime, fullName } from '@/lib/format'
import { paymentStatus, visitStatus } from '@/lib/statuses'
import { formatCountdown, useNow, visitTiming, visitTotalMinutes, visitTotalPrice } from '@/lib/time'
import { t as tr } from '@/i18n'

const isToday = (iso?: string) => Boolean(iso) && new Date(iso!).toDateString() === new Date().toDateString()

export function VisitsPage() {
  const [params, setParams] = useSearchParams()
  const scope = (params.get('tab') as VisitsScope) || 'current'
  const [finishing, setFinishing] = useState<VisitListItem>()
  const [extendingId, setExtendingId] = useState<string>()

  const current = useVisits('current')
  const history = useVisits(scope === 'current' ? 'completed' : scope)
  const { data: nannies } = useNannies()
  const now = useNow(1000)

  const active = current.data ?? []
  const soon = active.filter((v) => visitTiming(v, now).endingSoon).length
  const completedToday = (history.data ?? []).filter((v) => v.status === 'completed' && isToday(v.endedAt)).length
  const freeNannies = nannies?.filter((n) => n.available).length

  const setScope = (s: VisitsScope) => {
    if (s === 'current') params.delete('tab')
    else params.set('tab', s)
    setParams(params, { replace: true })
  }

  return (
    <div className="animate-slide-up">
      <PageHeader
        title={tr('Посещения')}
        description={tr('Текущие посещения, таймеры и история')}
        actions={
          <Link to="/visits/new">
            <Button leftIcon={<Plus />}>{tr('Новое посещение')}</Button>
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <PastelStat icon={<Users />} tone="butter" label={tr('Сейчас в парке')} value={current.data ? active.length : undefined} />
        <PastelStat icon={<AlarmClock />} tone="blush" label={tr('Заканчиваются (≤15 мин)')} value={current.data ? soon : undefined} />
        <PastelStat icon={<CircleCheckBig />} tone="olive" label={tr('Завершено сегодня')} value={history.data ? completedToday : undefined} />
        <PastelStat icon={<HeartHandshake />} tone="peri" label={tr('Свободных нянь')} value={freeNannies} />
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { value: 'current', label: tr('Текущие') },
            { value: 'completed', label: tr('Завершённые') },
            { value: 'all', label: tr('Все') },
          ]}
        />
      </div>

      {scope === 'current' ? (
        current.isLoading ? (
          <BoardSkeleton />
        ) : active.length === 0 ? (
          <Card>
            <EmptyState
              icon={<ClipboardList />}
              title={tr('Сейчас нет активных посещений')}
              description={tr('Оформите посещение — таймер запустится автоматически.')}
              action={
                <Link to="/visits/new">
                  <Button leftIcon={<Play />}>{tr('Начать посещение')}</Button>
                </Link>
              }
            />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {active.map((v) => (
              <VisitCard key={v.id} visit={v} now={now} onFinish={() => setFinishing(v)} onParentReply={() => setExtendingId(v.id)} />
            ))}
          </div>
        )
      ) : (
        <HistoryTable items={history.data} loading={history.isLoading} />
      )}

      <FinishModal visit={finishing} now={now} onClose={() => setFinishing(undefined)} />
      <TelegramExtensionDemo visit={active.find((v) => v.id === extendingId)} onClose={() => setExtendingId(undefined)} />
    </div>
  )
}


/* ---------- Карточка текущего посещения ---------- */

type CardTone = 'accent' | 'rose' | 'mint'

const ringColor: Record<CardTone, string> = { accent: '#ff6b2c', rose: '#ff4f8b', mint: '#22c55e' }
const avatarTint: Record<CardTone, string> = {
  accent: 'bg-accent-100 text-accent-700',
  rose: 'bg-rose-100 text-rose-500',
  mint: 'bg-mint-100 text-mint-600',
}
const statusTint: Record<CardTone, string> = {
  accent: 'bg-accent-50 text-accent-700 ring-accent-100',
  rose: 'bg-rose-50 text-rose-500 ring-rose-100',
  mint: 'bg-mint-50 text-mint-600 ring-mint-100',
}

function ProgressRing({ value, tone, children }: { value: number; tone: CardTone; children: ReactNode }) {
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <div className="relative size-[128px] shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={r} className="fill-none stroke-mist-200" strokeWidth="9" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={ringColor[tone]}
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

function VisitCard({ visit, now, onFinish, onParentReply }: { visit: VisitListItem; now: number; onFinish: () => void; onParentReply: () => void }) {
  const qc = useQueryClient()
  const t = visitTiming(visit, now)
  const st = visitStatus[visit.status]
  const extMin = visit.extensions.filter((e) => e.paymentStatus === 'paid').reduce((s, e) => s + e.minutes, 0)
  const pendingExt = visit.extensions.find((e) => e.paymentStatus === 'pending')
  const declined = visit.extensionDeclined?.endAt === visit.endAt
  const expiredRef = useRef(false)
  const tone: CardTone = visit.status === 'extended' ? 'mint' : t.endingSoon || visit.status === 'awaiting_extension' ? 'rose' : 'accent'

  // ТЗ §12 — по окончании времени посещение завершается автоматически
  useEffect(() => {
    if (t.over && !expiredRef.current) {
      expiredRef.current = true
      qc.invalidateQueries({ queryKey: visitKeys.all })
      toast.info(tr('Время посещения закончилось: {0}', fullName(visit.child)))
    }
  }, [t.over, qc, visit.child])

  return (
    <GlassCard className={cn('flex flex-col overflow-hidden transition duration-300 hover:-translate-y-0.5', tone === 'rose' && 'ring-2 ring-rose-100')}>
      <div className="flex items-center gap-3 px-5 pt-5">
        {visit.child.photoUrl ? (
          <Avatar src={visit.child.photoUrl} size="md" />
        ) : (
          <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-extrabold', avatarTint[tone])}>
            {visit.child.firstName[0]}
            {visit.child.lastName[0]}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <Link to={`/children/${visit.child.id}`} className="block truncate text-[15px] font-bold text-ink-900 hover:text-accent-600">
            {fullName(visit.child)}
          </Link>
          <div className="tabular truncate text-xs font-medium text-mist-500">{formatPhone(visit.parent.phone)}</div>
        </div>
        <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap ring-1', statusTint[tone])}>{st.label}</span>
      </div>

      <div className="flex items-center gap-5 px-5 py-5">
        <ProgressRing value={t.progress} tone={tone}>
          <span className="text-[11px] font-semibold text-mist-500">{tr('осталось')}</span>
          <span className="tabular text-[22px] leading-tight font-extrabold tracking-tight text-ink-900">{formatCountdown(t.leftMs)}</span>
        </ProgressRing>
        <dl className="grid flex-1 grid-cols-1 gap-2.5 text-sm">
          <Info label={tr('Время')} value={`${formatTime(visit.startAt)} — ${formatTime(visit.endAt)}`} />
          <Info label={tr('Прошло')} value={formatDuration(t.elapsedMin)} />
          <Info
            label={tr('Продление')}
            value={
              pendingExt ? (
                <span className="text-sun-600">{tr('ждёт оплаты')}</span>
              ) : declined ? (
                <span className="text-rose-500">{extMin > 0 ? tr('+{0}, дальше отказ', formatDuration(extMin)) : tr('отказ')}</span>
              ) : extMin > 0 ? (
                <span className="inline-flex items-center gap-1 text-mint-600">
                  <TimerReset className="size-3.5" />+{formatDuration(extMin)}
                </span>
              ) : (
                <span className="text-mist-400">{tr('нет')}</span>
              )
            }
          />
        </dl>
      </div>

      {visit.status === 'awaiting_extension' && (
        <div className="mx-5 mb-4 flex items-center gap-3 rounded-2xl bg-rose-50 px-3.5 py-2.5 ring-1 ring-rose-100">
          <TelegramLogo className={cn('size-7', !visit.parent.telegram?.linked && 'opacity-40 grayscale')} />
          <div className="min-w-0 flex-1 text-[12.5px] leading-snug font-semibold text-ink-800">
            {visit.parent.telegram?.linked ? tr('Родителю предложено продление') : tr('Telegram не привязан — спросите родителя лично')}
          </div>
          {visit.parent.telegram?.linked && (
            <button type="button" onClick={onParentReply} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[12px] font-bold text-sky-500 transition hover:bg-white/70">
              
              {tr('Ответ родителя')}
            </button>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center gap-3 border-t border-white/80 bg-white/40 px-5 py-3">
        {visit.nanny && (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-grape-100 text-[10px] font-extrabold text-grape-500">
              {visit.nanny.firstName[0]}
              {visit.nanny.lastName[0]}
            </span>
            <span className="truncate text-[13px] font-semibold text-ink-700">{fullName(visit.nanny)}</span>
          </div>
        )}
        <Button size="sm" variant="secondary" onClick={onFinish} leftIcon={<Square className="fill-current" />}>
          
          {tr('Завершить')}
        </Button>
      </div>
    </GlassCard>
  )
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="font-medium text-mist-500">{label}</dt>
      <dd className="tabular font-bold text-ink-900">{value}</dd>
    </div>
  )
}

/* ---------- Досрочное завершение ---------- */

/** Подтверждение в стиле iOS-алерта: таймер-кольцо, ребёнок и няня, две кнопки во всю ширину. */
function FinishModal({ visit, now, onClose }: { visit?: VisitListItem; now: number; onClose: () => void }) {
  const user = useCurrentUser()
  const finish = useFinishVisit()
  // помним последнее посещение, чтобы содержимое не пропадало во время анимации закрытия
  const last = useRef<VisitListItem | undefined>(visit)
  if (visit) last.current = visit
  const v = visit ?? last.current
  const t = v ? visitTiming(v, now) : undefined

  const confirm = async () => {
    if (!visit) return
    try {
      await finish.mutateAsync({ id: visit.id, by: user.id })
      toast.success(tr('Посещение завершено'), { description: fullName(visit.child) })
      if (visit.parent.telegram?.linked) toast.info(tr('Родителю отправлено уведомление о завершении'), { icon: <TelegramLogo className="size-8" /> })
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <Modal open={Boolean(visit)} onClose={onClose} size="xs" bare>
      {v && t && (
        <div className="px-6 pt-5 pb-6 text-center sm:pt-7">
          <div className="relative mx-auto size-[104px]">
            <svg viewBox="0 0 120 120" className="size-full -rotate-90">
              <circle cx="60" cy="60" r="52" className="fill-none stroke-mist-200" strokeWidth="8" />
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="var(--color-danger-500)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 52}
                strokeDashoffset={2 * Math.PI * 52 * (1 - t.progress / 100)}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] font-semibold text-mist-500">{tr('осталось')}</span>
              <span className="tabular text-[17px] font-extrabold text-ink-900">{formatCountdown(t.leftMs)}</span>
            </div>
          </div>

          <h2 className="mt-4 text-[19px] font-extrabold tracking-tight text-ink-900">{tr('Завершить посещение?')}</h2>
          <p className="mx-auto mt-1.5 max-w-[280px] text-[13.5px] leading-snug font-medium text-mist-500">
            
            {tr('Время ещё не вышло. Няня освободится, посещение сохранится в истории')}
            {v.parent.telegram?.linked ? tr(', родитель получит уведомление.') : '.'}
          </p>

          <div className="mt-5 flex items-center gap-3 rounded-2xl bg-white/70 p-3 text-left ring-1 ring-white">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-100 text-[13px] font-extrabold text-accent-700">
              {v.child.firstName[0]}
              {v.child.lastName[0]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-ink-900">{fullName(v.child)}</div>
              <div className="truncate text-xs font-medium text-mist-500">
                {formatTime(v.startAt)} — {formatTime(v.endAt)} · {v.nanny ? fullName(v.nanny) : '—'}
              </div>
            </div>
            {v.parent.telegram?.linked && <TelegramLogo className="size-6" />}
          </div>

          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={finish.isPending}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-danger-500 text-[15px] font-bold text-snow shadow-[0_8px_20px_-8px_rgb(229_72_77/0.6)] transition hover:bg-danger-600 active:scale-[0.98] disabled:opacity-60"
            >
              {finish.isPending ? tr('Завершаем…') : tr('Завершить сейчас')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-12 rounded-2xl bg-mist-100 text-[15px] font-bold text-ink-900 transition hover:bg-mist-200 active:scale-[0.98]"
            >
              
              {tr('Отмена')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ---------- История ---------- */

function HistoryTable({ items, loading }: { items?: VisitListItem[]; loading: boolean }) {
  if (loading)
    return (
      <Card className="space-y-3 p-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </Card>
    )
  if (!items?.length)
    return (
      <Card>
        <EmptyState icon={<Hourglass />} title={tr('Записей нет')} description={tr('Завершённые посещения появятся здесь.')} />
      </Card>
    )
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-cream-200 bg-cream-100 text-xs text-ink-500">
              <th className="py-3 pr-3 pl-5 font-semibold">{tr('Ребёнок')}</th>
              <th className="px-3 py-3 font-semibold">{tr('Дата')}</th>
              <th className="px-3 py-3 font-semibold">{tr('Время')}</th>
              <th className="px-3 py-3 font-semibold">{tr('Няня')}</th>
              <th className="px-3 py-3 font-semibold">{tr('Длительность')}</th>
              <th className="px-3 py-3 text-right font-semibold">{tr('Стоимость')}</th>
              <th className="px-3 py-3 font-semibold">{tr('Завершил')}</th>
              <th className="py-3 pr-5 pl-3 font-semibold">{tr('Статус')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-200">
            {items.map((v) => {
              const st = visitStatus[v.status]
              const pay = paymentStatus[v.paymentStatus]
              const ext = v.extensions.filter((e) => e.paymentStatus === 'paid').reduce((s, e) => s + e.minutes, 0)
              const early = v.endedAt && new Date(v.endedAt) < new Date(v.endAt)
              return (
                <tr key={v.id} className="transition hover:bg-cream-100">
                  <td className="py-3 pr-3 pl-5">
                    <Link to={`/children/${v.child.id}`} className="flex items-center gap-2.5">
                      <Avatar src={v.child.photoUrl} firstName={v.child.firstName} lastName={v.child.lastName} seed={v.child.id} size="sm" />
                      <span className="font-bold text-ink-900 hover:text-ink-600">{fullName(v.child)}</span>
                    </Link>
                  </td>
                  <td className="tabular px-3 py-3 font-semibold text-ink-800">{formatShortDate(v.startAt)}</td>
                  <td className="tabular px-3 py-3 text-ink-600">
                    {formatTime(v.startAt)} — {formatTime(v.endedAt ?? v.endAt)}
                    {early && <span className="ml-1.5 text-xs font-semibold text-warning-700">{tr('досрочно')}</span>}
                  </td>
                  <td className="px-3 py-3 text-ink-700">{v.nanny ? fullName(v.nanny) : '—'}</td>
                  <td className="px-3 py-3 font-semibold text-ink-800">
                    {formatDuration(visitTotalMinutes(v))}
                    {ext > 0 && (
                      <span className="ml-2 rounded-md bg-peri-200 px-1.5 py-0.5 text-[11px] font-bold text-ink-900">+{formatDuration(ext)}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="tabular font-semibold text-ink-900">{formatMoney(visitTotalPrice(v))}</div>
                    {v.discount && (
                      <div className="truncate text-xs font-medium text-mint-600" title={v.discount.label}>
                        −{formatMoney(v.discount.amount)} · {v.discount.label}
                      </div>
                    )}
                    <div className={cn('text-xs font-medium', pay.tone === 'success' ? 'text-success-600' : 'text-ink-500')}>{pay.label}</div>
                  </td>
                  <td className="px-3 py-3 text-ink-600">{v.status === 'cancelled' ? '—' : (v.endedByName ?? tr('Автоматически'))}</td>
                  <td className="py-3 pr-5 pl-3">
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function BoardSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-[290px] rounded-2xl" />
      ))}
    </div>
  )
}
