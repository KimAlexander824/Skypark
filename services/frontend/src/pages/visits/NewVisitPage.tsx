import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Baby,
  Check,
  Clock3,
  HeartHandshake,
  Play,
  RefreshCw,
  Search,
  Timer,
  UsersRound,
} from 'lucide-react'
import { toast } from 'sonner'
import type { ChildListItem } from '@/api/children'
import { errorMessage } from '@/api/errors'
import { checkWorkHours, priceFor, type NannyWithLoad } from '@/api/visits'
import { Button } from '@/components/ui/Button'
import { Avatar, Badge, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui/Display'
import { Input } from '@/components/ui/Field'
import { useCurrentUser } from '@/features/auth/AuthProvider'
import { useChildren } from '@/features/children/queries'
import { useCreateVisit, useNannies, useVisitSettings } from '@/features/visits/queries'
import { cn, formatAge, formatDuration, formatMoney, formatPhone, formatTime, fullName, plural } from '@/lib/format'
import { nannyStatus } from '@/lib/statuses'
import { addMinutes, useNow } from '@/lib/time'
import { TelegramLogo } from '@/components/brand/TelegramLogo'

export function NewVisitPage() {
  const user = useCurrentUser()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const childId = params.get('childId')
  const [nannyId, setNannyId] = useState<string>()
  const [duration, setDuration] = useState<number>()

  const { data: children } = useChildren({})
  const { data: nannies, isLoading: nanniesLoading, refetch: refetchNannies, isFetching: nanniesFetching } = useNannies()
  const { data: settings } = useVisitSettings()
  const create = useCreateVisit()
  const now = useNow(15_000)

  const child = children?.find((c) => c.id === childId)
  const nanny = nannies?.find((n) => n.id === nannyId)

  // если выбранная няня стала недоступна — сбрасываем выбор
  useEffect(() => {
    if (nanny && !nanny.available) setNannyId(undefined)
  }, [nanny])

  const hoursError = settings && duration ? checkWorkHours(new Date(now), duration, settings) : null
  const parkClosed = settings ? checkWorkHours(new Date(now), 0, settings) : null
  const childBusy = Boolean(child?.activeVisit)
  const ready = child && nanny?.available && duration && !hoursError && !childBusy

  const submit = async () => {
    if (!ready) return
    try {
      await create.mutateAsync({ childId: child.id, nannyId: nanny.id, durationMin: duration, createdBy: user.id })
      toast.success('Посещение началось', { description: `${fullName(child)} · ${fullName(nanny)} · ${formatDuration(duration)}` })
      // ТЗ §15 п.1, §44 — уведомление родителю
      if (child.parent.telegram?.linked) toast.info('Родителю отправлено уведомление в Telegram', { icon: <TelegramLogo className="size-8" /> })
      else toast.warning('Telegram родителя не привязан — уведомление не отправлено')
      navigate('/visits', { replace: true })
    } catch (e) {
      toast.error(errorMessage(e))
      refetchNannies()
    }
  }

  return (
    <div className="animate-slide-up">
      <PageHeader
        back={
          <Link to="/visits" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900">
            <ArrowLeft className="size-4" /> К посещениям
          </Link>
        }
        title="Новое посещение"
        description="Выберите ребёнка, свободную няню и продолжительность — таймер запустится сразу"
      />

      {parkClosed && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl bg-danger-50 p-4 text-sm font-medium text-danger-700 ring-1 ring-danger-100">
          <AlertTriangle className="size-5 shrink-0" />
          {parkClosed}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-5">
          {/* 1. Ребёнок */}
          <Section n={1} icon={<Baby />} title="Ребёнок" done={Boolean(child) && !childBusy}>
            {child ? (
              <SelectedChild
                child={child}
                onChange={() => {
                  params.delete('childId')
                  setParams(params, { replace: true })
                }}
              />
            ) : (
              <ChildPicker
                items={children}
                onPick={(id) => {
                  params.set('childId', id)
                  setParams(params, { replace: true })
                }}
              />
            )}
          </Section>

          {/* 2. Няня */}
          <Section
            n={2}
            icon={<HeartHandshake />}
            title="Няня"
            done={Boolean(nanny)}
            action={
              <Button variant="ghost" size="sm" onClick={() => refetchNannies()} leftIcon={<RefreshCw className={cn(nanniesFetching && 'animate-spin')} />}>
                Обновить
              </Button>
            }
          >
            {nanniesLoading ? (
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-[148px] rounded-2xl" />
                ))}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {nannies?.map((n) => (
                  <NannyOption key={n.id} nanny={n} selected={n.id === nannyId} onSelect={() => setNannyId(n.id)} />
                ))}
              </div>
            )}
          </Section>

          {/* 3. Продолжительность */}
          <Section n={3} icon={<Clock3 />} title="Продолжительность" done={Boolean(duration) && !hoursError}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {settings?.durations.map((d) => {
                const blocked = checkWorkHours(new Date(now), d, settings)
                const active = d === duration
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={Boolean(blocked)}
                    onClick={() => setDuration(d)}
                    title={blocked ?? undefined}
                    className={cn(
                      'relative flex flex-col items-start rounded-2xl p-4 text-left ring-1 transition',
                      active ? 'glass-accent ring-accent-500' : 'bg-white/60 ring-white hover:bg-white/90',
                      blocked && 'cursor-not-allowed opacity-45 hover:ring-cream-300',
                    )}
                  >
                    <span className={cn('text-xl font-extrabold', active ? 'text-snow' : 'text-ink-900')}>{formatDuration(d)}</span>
                    <span className={cn('tabular mt-1 text-[13px] font-semibold', active ? 'text-snow/80' : 'text-ink-500')}>
                      {formatMoney(priceFor(d, settings))}
                    </span>
                    <span className={cn('tabular mt-3 text-xs font-medium', active ? 'text-snow/70' : 'text-ink-400')}>
                      до {formatTime(addMinutes(now, d).toISOString())}
                    </span>
                    {active && (
                      <span className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-white text-ink-900">
                        <Check className="size-3.5" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {hoursError && (
              <p className="mt-3 flex items-center gap-2 text-sm font-medium text-danger-600">
                <AlertTriangle className="size-4" /> {hoursError}
              </p>
            )}
          </Section>
        </div>

        <Summary
          child={child}
          nanny={nanny}
          duration={duration}
          price={settings && duration ? priceFor(duration, settings) : undefined}
          now={now}
          ready={Boolean(ready)}
          loading={create.isPending}
          onSubmit={submit}
        />
      </div>
    </div>
  )
}

function Section({
  n,
  icon,
  title,
  done,
  action,
  children,
}: {
  n: number
  icon: ReactNode
  title: string
  done: boolean
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-3">
        <span
          className={cn(
            'tabular flex size-7 items-center justify-center rounded-full text-[13px] font-bold transition',
            done ? 'bg-mint-500 text-snow' : 'bg-accent-50 text-accent-700',
          )}
        >
          {done ? <Check className="size-4" strokeWidth={3} /> : n}
        </span>
        <span className="text-ink-400 [&_svg]:size-[18px]">{icon}</span>
        <h2 className="text-base font-bold text-ink-900">{title}</h2>
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </Card>
  )
}

function SelectedChild({ child, onChange }: { child: ChildListItem; onChange: () => void }) {
  return (
    <div>
      <div className="flex items-center gap-3.5 rounded-2xl bg-cream-100 p-3 ring-1 ring-cream-200">
        <Avatar src={child.photoUrl} firstName={child.firstName} lastName={child.lastName} seed={child.id} size="lg" />
        <div className="min-w-0 flex-1">
          <Link to={`/children/${child.id}`} className="truncate text-base font-extrabold text-ink-900 hover:text-ink-600">
            {fullName(child)}
          </Link>
          <div className="text-sm text-ink-500">{formatAge(child.birthDate)}</div>
          <div className="tabular mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-500">
            <UsersRound className="size-3.5" />
            {fullName(child.parent)} · {formatPhone(child.parent.phone)}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onChange}>
          Изменить
        </Button>
      </div>
      {child.activeVisit && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-butter-200 px-3.5 py-2.5 text-sm font-medium text-warning-700 ring-1 ring-butter-300">
          <AlertTriangle className="size-4 shrink-0" />
          Ребёнок уже находится на посещении до {formatTime(child.activeVisit.endAt)}
        </p>
      )}
    </div>
  )
}

function ChildPicker({ items, onPick }: { items?: ChildListItem[]; onPick: (id: string) => void }) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    const digits = s.replace(/\D/g, '')
    if (!s) return items?.slice(0, 6)
    return items
      ?.filter(
        (c) =>
          `${c.firstName} ${c.lastName} ${c.parent.firstName}`.toLowerCase().includes(s) ||
          (digits.length >= 3 && c.parent.phone.includes(digits)),
      )
      .slice(0, 8)
  }, [items, q])

  return (
    <div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} leftIcon={<Search />} placeholder="Имя ребёнка или телефон родителя" autoFocus />
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {filtered?.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              disabled={Boolean(c.activeVisit)}
              onClick={() => onPick(c.id)}
              className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left ring-1 ring-cream-200 transition hover:bg-cream-100 hover:ring-ink-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:ring-cream-200"
            >
              <Avatar src={c.photoUrl} firstName={c.firstName} lastName={c.lastName} seed={c.id} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-ink-900">{fullName(c)}</div>
                <div className="tabular truncate text-xs text-ink-500">{formatPhone(c.parent.phone)}</div>
              </div>
              {c.activeVisit && <Badge tone="success">В парке</Badge>}
            </button>
          </li>
        ))}
      </ul>
      {filtered?.length === 0 && (
        <EmptyState
          className="py-8"
          icon={<Search />}
          title="Ребёнок не найден"
          action={
            <Link to="/children/new">
              <Button size="sm">Зарегистрировать</Button>
            </Link>
          }
        />
      )}
    </div>
  )
}

function NannyOption({ nanny, selected, onSelect }: { nanny: NannyWithLoad; selected: boolean; onSelect: () => void }) {
  const st = nannyStatus[nanny.status]
  const pct = (nanny.activeChildren / nanny.maxChildren) * 100
  return (
    <button
      type="button"
      disabled={!nanny.available}
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'group relative flex flex-col rounded-2xl p-4 text-left ring-1 transition',
        selected ? 'bg-accent-50 ring-2 ring-accent-500' : 'bg-white/60 ring-white hover:-translate-y-0.5 hover:bg-white/90',
        !nanny.available && 'cursor-not-allowed bg-cream-100 hover:translate-y-0 hover:shadow-none hover:ring-cream-300',
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar
          src={nanny.photoUrl}
          firstName={nanny.firstName}
          lastName={nanny.lastName}
          seed={nanny.id}
          className={cn(!nanny.available && 'grayscale opacity-60')}
        />
        <div className="min-w-0 flex-1">
          <div className={cn('truncate text-sm font-bold', nanny.available ? 'text-ink-900' : 'text-ink-500')}>{fullName(nanny)}</div>
          <div className="text-xs whitespace-nowrap text-ink-500">
            Опыт {nanny.experienceYears} {plural(nanny.experienceYears, ['год', 'года', 'лет'])}
          </div>
          <Badge tone={st.tone} dot className="mt-1.5">
            {st.label}
          </Badge>
        </div>
        {selected && (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-500 text-snow">
            <Check className="size-4" strokeWidth={3} />
          </span>
        )}
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="font-medium text-ink-500">Загрузка</span>
          <span className="tabular font-bold text-ink-800">
            {nanny.activeChildren} из {nanny.maxChildren} {plural(nanny.maxChildren, ['ребёнка', 'детей', 'детей'])}
          </span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: nanny.maxChildren }).map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 flex-1 rounded-full',
                i < nanny.activeChildren ? (pct >= 100 ? 'bg-warning-500' : 'bg-brand-500') : 'bg-cream-200',
              )}
            />
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-ink-500">
        <Clock3 className="size-3.5" />
        <span className="tabular">{nanny.workHours}</span>
        {!nanny.available && <span className="ml-auto font-semibold text-ink-600">{nanny.unavailableReason}</span>}
      </div>
    </button>
  )
}

function Summary({
  child,
  nanny,
  duration,
  price,
  now,
  ready,
  loading,
  onSubmit,
}: {
  child?: ChildListItem
  nanny?: NannyWithLoad
  duration?: number
  price?: number
  now: number
  ready: boolean
  loading: boolean
  onSubmit: () => void
}) {
  const end = duration ? addMinutes(now, duration).toISOString() : undefined
  return (
    <aside>
      <Card className="sticky top-24 overflow-hidden">
        <div className="glass-accent relative px-5 pt-5 pb-6">
          <div className="text-[13px] font-semibold text-snow/70">Итого к посещению</div>
          <div className="tabular mt-1 text-[32px] leading-none font-extrabold">{price !== undefined ? formatMoney(price) : '—'}</div>
          <div className="mt-4 flex items-center gap-4 text-sm">
            <div>
              <div className="text-xs text-snow/60">Начало</div>
              <div className="tabular font-bold">{formatTime(new Date(now).toISOString())}</div>
            </div>
            <span className="h-px flex-1 bg-white/30" />
            <Timer className="size-4 text-snow/70" />
            <span className="h-px flex-1 bg-white/30" />
            <div className="text-right">
              <div className="text-xs text-snow/60">Окончание</div>
              <div className="tabular font-bold">{end ? formatTime(end) : '—'}</div>
            </div>
          </div>
        </div>
        <dl className="divide-y divide-cream-200 px-5 text-sm">
          <Row label="Ребёнок" value={child ? fullName(child) : undefined} />
          <Row label="Няня" value={nanny ? fullName(nanny) : undefined} />
          <Row label="Продолжительность" value={duration ? formatDuration(duration) : undefined} />
          <Row
            label="Уведомление"
            value={
              child ? (
                child.parent.telegram?.linked ? (
                  <span className="flex items-center gap-1.5 text-ink-900">
                    <TelegramLogo /> Telegram
                  </span>
                ) : (
                  <span className="text-warning-700">Не привязан</span>
                )
              ) : undefined
            }
          />
        </dl>
        <div className="p-5 pt-3">
          <Button size="lg" className="w-full" disabled={!ready} loading={loading} onClick={onSubmit} leftIcon={<Play />}>
            Начать посещение
          </Button>
          {!ready && (
            <p className="mt-2.5 text-center text-xs text-ink-500">Выберите ребёнка, няню и продолжительность</p>
          )}
        </div>
      </Card>
    </aside>
  )
}

function Row({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className={cn('truncate text-right font-semibold', value ? 'text-ink-900' : 'text-ink-300')}>{value ?? 'не выбрано'}</dd>
    </div>
  )
}
