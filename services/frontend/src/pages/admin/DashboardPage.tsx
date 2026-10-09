import { useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Baby, CalendarDays, ClipboardList, Plus, TimerReset, Users, Wallet } from 'lucide-react'
import { analyticsApi, type DashboardStats, type DateRange } from '@/api/analytics'
import type { NannyWithLoad, VisitListItem } from '@/api/visits'
import { MiniCalendar } from '@/components/dashboard/MiniCalendar'
import { Delta, GlassButton, GlassCard, GlassHeader, GlassSegmented, StatTile, toneChip, type GlassTone } from '@/components/glass/Glass'
import { ComparisonBarChart, Donut, GlassAreaChart } from '@/components/glass/GlassCharts'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { usePopover } from '@/components/ui/usePopover'
import { useCurrentUser } from '@/features/auth/AuthProvider'
import { useNannies, useVisits } from '@/features/visits/queries'
import { cn, formatDuration, formatMoney, formatTime, fullName, plural } from '@/lib/format'
import { nannyStatus } from '@/lib/statuses'
import { formatCountdown, useNow, visitTiming } from '@/lib/time'

/* ---------- Период (ТЗ §24) ---------- */

type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'custom'

const day = (offset = 0) => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset)
}

const presetRange = (p: Exclude<Preset, 'custom'>): DateRange =>
  ({
    today: { from: day(), to: day() },
    yesterday: { from: day(-1), to: day(-1) },
    week: { from: day(-6), to: day() },
    month: { from: day(-29), to: day() },
  })[p]

const shortDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
const rangeText = (r: DateRange) =>
  r.from.toDateString() === r.to.toDateString() ? shortDate.format(r.from) : `${shortDate.format(r.from)} — ${shortDate.format(r.to)}`

const compactMoney = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1).replace('.', ',')} млн` : v >= 1000 ? `${Math.round(v / 1000)} тыс` : String(v)


/* ---------- Страница ---------- */

export function DashboardPage() {
  const user = useCurrentUser()
  const navigate = useNavigate()
  const [preset, setPreset] = useState<Preset>('today')
  const [range, setRange] = useState<DateRange>(() => presetRange('today'))

  const { data } = useQuery({
    queryKey: ['analytics', range.from.toDateString(), range.to.toDateString()],
    queryFn: () => analyticsApi.dashboard(range),
    placeholderData: (p) => p,
    refetchInterval: 60_000,
  })
  const current = useVisits('current')
  const { data: nannies } = useNannies()
  const now = useNow(1000)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер'

  return (
    <div className="animate-slide-up">
      {/* Заголовок */}
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-[30px] leading-tight font-extrabold tracking-tight text-ink-900">
            {greeting}, {user.firstName}
          </h1>
          <p className="mt-1 text-sm font-medium text-mist-500">
            Посещения, оплаты и работа нянь · {rangeText(range)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <GlassSegmented
            value={preset === 'custom' ? ('' as Preset) : preset}
            onChange={(p) => {
              setPreset(p)
              setRange(presetRange(p as Exclude<Preset, 'custom'>))
            }}
            options={[
              { value: 'today', label: 'Сегодня' },
              { value: 'yesterday', label: 'Вчера' },
              { value: 'week', label: 'Неделя' },
              { value: 'month', label: 'Месяц' },
            ]}
          />
          <RangePicker
            active={preset === 'custom'}
            value={range}
            onChange={(r) => {
              setPreset('custom')
              setRange(r)
            }}
          />
          <GlassButton variant="accent" onClick={() => navigate('/visits/new')}>
            <Plus /> Новое посещение
          </GlassButton>
          <ThemeToggle />
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile
          label="Посещения"
          tone="accent"
          icon={<ClipboardList />}
          value={data?.visits.total}
          delta={data && <Delta current={data.visits.total} previous={data.previous.visits} />}
          footnote={data && `активно ${data.visits.active} · завершено ${data.visits.completed}`}
        />
        <StatTile
          label="Сумма оплат"
          tone="rose"
          icon={<Wallet />}
          value={data && compactMoney(data.payments.amount)}
          delta={data && <Delta current={data.payments.amount} previous={data.previous.payments} />}
          footnote="сум"
        />
        <StatTile
          label="Новые дети"
          tone="grape"
          icon={<Baby />}
          value={data?.children.new}
          delta={data && <Delta current={data.children.new} previous={data.previous.newChildren} />}
          footnote={data && `всего в базе ${data.children.registered}`}
        />
        <StatTile
          label="Продления"
          tone="mint"
          icon={<TimerReset />}
          value={data?.extensions.count}
          delta={data && <Delta current={data.extensions.count} previous={data.previous.extensions} />}
          footnote={data && `${Math.round(data.extensions.percent)}% посещений`}
        />
      </div>

      {/* Графики */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
        <GlassCard className="p-5">
          <GlassHeader
            title="Динамика посещений"
            subtitle={data ? (data.granularity === 'hour' ? 'По часам' : 'По дням') + ` · в среднем ${formatDuration(data.visits.avgMinutes)}` : ' '}
            action={<Pill tone="accent">{data ? `${data.visits.active} сейчас в парке` : '…'}</Pill>}
          />
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold">
            <Legend color="bg-accent-500" label="Этот период" value={data ? String(data.visits.total) : undefined} />
            <span className="inline-flex items-center gap-1.5 text-mist-600">
              <span className="size-2 rounded-full bg-mist-300" />
              Прошлый период
              {data && <b className="tabular font-bold text-ink-900">{data.previous.visits}</b>}
            </span>
          </div>
          <div className="mt-3">
            {data ? (
              <ComparisonBarChart
                current={data.visitsSeries}
                previous={data.previousVisitsSeries}
                ariaLabel="Посещения: текущий и прошлый период"
                format={(v) => `${v} ${plural(v, ['посещение', 'посещения', 'посещений'])}`}
              />
            ) : (
              <ChartSkeleton h={220} />
            )}
          </div>
        </GlassCard>

        <GlassCard className="flex flex-col p-5">
          <GlassHeader title="Выручка" subtitle="Посещения и продления" />
          {data ? (
            <>
              <div className="mt-3 flex items-end gap-2">
                <span className="tabular text-[26px] leading-8 font-extrabold tracking-tight text-ink-900">{formatMoney(data.payments.amount)}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
                <Legend color="bg-accent-500" label="Посещения" value={formatMoney(data.payments.amount - data.payments.extensionsAmount)} />
                <Legend color="bg-mint-500" label="Продления" value={formatMoney(data.payments.extensionsAmount)} />
              </div>
              <div className="mt-auto pt-4">
                <GlassAreaChart data={data.revenueSeries} height={150} ariaLabel="Сумма оплат" format={formatMoney} />
              </div>
              <div className="mt-3 flex gap-2 text-xs font-semibold">
                <span className="rounded-full bg-mint-50 px-2.5 py-1 text-mint-600">Успешных: {data.payments.success}</span>
                <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-500">Ошибок: {data.payments.failed}</span>
              </div>
            </>
          ) : (
            <ChartSkeleton h={240} />
          )}
        </GlassCard>

        <GlassCard className="flex flex-col p-5">
          <GlassHeader title="Повторные визиты" subtitle="Доля детей, пришедших снова" />
          {data ? <RepeatDonut data={data} /> : <ChartSkeleton h={240} />}
        </GlassCard>
      </div>

      {/* Няни и окончания */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <GlassCard className="p-5">
          <GlassHeader
            title="Работа нянь"
            subtitle={data ? `Отработано ${formatDuration(data.nannies.hours * 60)} · средняя загрузка ${data.nannies.avgLoad.toFixed(1).replace('.', ',')}` : ' '}
            action={
              <Link to="/admin/nannies" className="glass flex size-8 items-center justify-center rounded-full text-ink-900 transition hover:bg-white" aria-label="Все няни">
                <ArrowUpRight className="size-4" />
              </Link>
            }
          />
          <NanniesTable stats={data} nannies={nannies} />
        </GlassCard>

        <EndingSoon visits={current.data} now={now} />
      </div>
    </div>
  )
}

/* ---------- Компоненты ---------- */

function Pill({ tone, children }: { tone: GlassTone; children: ReactNode }) {
  return <span className={cn('inline-flex h-7 shrink-0 items-center rounded-full px-3 text-xs font-bold ring-1', toneChip[tone])}>{children}</span>
}

function Legend({ color, label, value }: { color: string; label: string; value?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-mist-600">
      <span className={cn('size-2 rounded-full', color)} />
      {label}
      {value && <b className="tabular font-bold text-ink-900">{value}</b>}
    </span>
  )
}

function ChartSkeleton({ h }: { h: number }) {
  return <div className="mt-4 animate-pulse rounded-2xl bg-mist-200/70" style={{ height: h }} />
}

/** Первые и повторные посещения (ТЗ §25 «Дети»). */
function RepeatDonut({ data }: { data: DashboardStats }) {
  const repeat = data.children.repeatVisits
  const first = Math.max(0, data.visits.total - repeat)
  const pct = data.visits.total ? Math.round((repeat / data.visits.total) * 100) : 0
  return (
    <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-5">
      <Donut
        segments={[
          { key: 'repeat', value: repeat, color: '#ff6b2c' },
          { key: 'first', value: first, color: '#8b5cf6' },
        ]}
        center={
          <>
            <span className="tabular text-[28px] leading-none font-extrabold text-ink-900">{pct}%</span>
            <span className="mt-1 text-[11px] font-semibold text-mist-500">повторных</span>
          </>
        }
      />
      <div className="w-full space-y-2 text-[13px] font-semibold">
        <LegendRow color="bg-accent-500" label="Повторные" value={repeat} />
        <LegendRow color="bg-grape-500" label="Первое посещение" value={first} />
      </div>
    </div>
  )
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white/60 px-3 py-2">
      <span className="flex items-center gap-2 text-mist-600">
        <span className={cn('size-2.5 rounded-full', color)} />
        {label}
      </span>
      <span className="tabular font-extrabold text-ink-900">{value}</span>
    </div>
  )
}

const statusTone: Record<string, string> = {
  free: 'bg-mint-50 text-mint-600',
  busy: 'bg-accent-50 text-accent-600',
  break: 'bg-sky-50 text-sky-500',
  off: 'bg-mist-100 text-mist-500',
}
const avatarTones = ['bg-accent-100 text-accent-700', 'bg-rose-100 text-rose-500', 'bg-grape-100 text-grape-500', 'bg-mint-100 text-mint-600', 'bg-sky-100 text-sky-500']

function NanniesTable({ stats, nannies }: { stats?: DashboardStats; nannies?: NannyWithLoad[] }) {
  const rows = useMemo(() => {
    if (!stats || !nannies) return undefined
    return nannies.map((n, i) => {
      const s = stats.nannies.top.find((t) => t.id === n.id)
      return { n, hours: s?.hours ?? 0, children: s?.children ?? 0, tone: avatarTones[i % avatarTones.length] }
    }).sort((a, b) => b.hours - a.hours)
  }, [stats, nannies])

  if (!rows) return <ChartSkeleton h={220} />
  const maxHours = Math.max(1, ...rows.map((r) => r.hours))
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="text-left text-[11.5px] font-semibold text-mist-500">
            <th className="pb-2 pl-1 font-semibold">Няня</th>
            <th className="pb-2 font-semibold">Отработано</th>
            <th className="pb-2 text-right font-semibold">Детей</th>
            <th className="pb-2 pl-6 font-semibold">Сейчас</th>
            <th className="pb-2 text-right font-semibold">Статус</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ n, hours, children, tone }) => (
            <tr key={n.id} className="border-t border-white/80">
              <td className="py-2.5 pl-1">
                <div className="flex items-center gap-2.5">
                  <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold', tone)}>
                    {n.firstName[0]}
                    {n.lastName[0]}
                  </span>
                  <span className="truncate font-bold text-ink-900">{fullName(n)}</span>
                </div>
              </td>
              <td className="py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="h-1.5 w-24 overflow-hidden rounded-full bg-mist-200">
                    <span className="block h-full rounded-full bg-accent-500" style={{ width: `${(hours / maxHours) * 100}%` }} />
                  </span>
                  <span className="tabular text-xs font-bold text-ink-900">{formatDuration(hours * 60)}</span>
                </div>
              </td>
              <td className="tabular py-2.5 text-right font-bold text-ink-900">{children}</td>
              <td className="py-2.5 pl-6">
                <div className="flex gap-1">
                  {Array.from({ length: n.maxChildren }).map((_, i) => (
                    <span key={i} className={cn('h-1.5 w-3.5 rounded-full', i < n.activeChildren ? 'bg-ink-900' : 'bg-mist-200')} />
                  ))}
                </div>
              </td>
              <td className="py-2.5 text-right">
                <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-bold', statusTone[n.status])}>{nannyStatus[n.status].label}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Ближайшие окончания посещений с живым таймером. */
function EndingSoon({ visits, now }: { visits?: VisitListItem[]; now: number }) {
  return (
    <GlassCard className="flex flex-col p-5">
      <GlassHeader
        title="Скоро заканчиваются"
        subtitle={visits ? `${visits.length} ${plural(visits.length, ['ребёнок', 'ребёнка', 'детей'])} в парке` : ' '}
        action={
          <Link to="/visits" className="glass flex size-8 items-center justify-center rounded-full text-ink-900 transition hover:bg-white" aria-label="Все посещения">
            <ArrowUpRight className="size-4" />
          </Link>
        }
      />
      {!visits ? (
        <ChartSkeleton h={220} />
      ) : visits.length === 0 ? (
        <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-2xl bg-white/50 py-10 text-center">
          <Users className="size-6 text-mist-400" />
          <p className="mt-2 text-sm font-semibold text-mist-500">Детей в парке нет</p>
        </div>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {visits.slice(0, 5).map((v) => {
            const t = visitTiming(v, now)
            const soon = t.endingSoon || v.status === 'awaiting_extension'
            return (
              <li key={v.id}>
                <Link to={`/children/${v.child.id}`} className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-white/70">
                  <span
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold',
                      soon ? 'bg-rose-100 text-rose-500' : v.status === 'extended' ? 'bg-mint-100 text-mint-600' : 'bg-accent-100 text-accent-700',
                    )}
                  >
                    {v.child.firstName[0]}
                    {v.child.lastName[0]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-bold text-ink-900">{fullName(v.child)}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-mist-200">
                        <span className={cn('block h-full rounded-full', soon ? 'bg-rose-500' : 'bg-accent-500')} style={{ width: `${t.progress}%` }} />
                      </span>
                      <span className="tabular text-[11px] font-semibold text-mist-500">до {formatTime(v.endAt)}</span>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'tabular rounded-full px-2.5 py-1 text-xs font-extrabold',
                      soon ? 'bg-rose-500 text-snow' : 'bg-white text-ink-900 ring-1 ring-mist-200',
                    )}
                  >
                    {formatCountdown(t.leftMs)}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </GlassCard>
  )
}

/** Кнопка-календарь для произвольного периода. */
function RangePicker({ value, onChange, active }: { value: DateRange; onChange: (r: DateRange) => void; active: boolean }) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const { open, setOpen, pos } = usePopover(triggerRef, panelRef, { panelHeight: 360, panelWidth: 312, align: 'right' })
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-full px-3.5 text-[13px] font-bold transition active:scale-[0.97]',
          active ? 'glass-accent' : 'glass text-ink-900 hover:bg-white',
        )}
        aria-label="Выбрать период"
      >
        <CalendarDays className="size-4" />
        {active ? rangeText(value) : 'Период'}
      </button>
      {open &&
        pos &&
        createPortal(
          <div ref={panelRef} className="glass-strong fixed z-[60] animate-pop-in rounded-3xl p-4" style={{ left: pos.left, top: pos.top, width: pos.width }}>
            <MiniCalendar value={value} onChange={onChange} />
          </div>,
          document.body,
        )}
    </>
  )
}
