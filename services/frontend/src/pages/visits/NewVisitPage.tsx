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
  Tag,
  X,
  Timer,
  UsersRound,
} from 'lucide-react'
import { toast } from 'sonner'
import type { ChildListItem } from '@/api/children'
import { errorMessage } from '@/api/errors'
import { checkWorkHours, discountAmount, priceFor, pricingApi, type NannyWithLoad } from '@/api/visits'
import { Button } from '@/components/ui/Button'
import { Avatar, Badge, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui/Display'
import { Input } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { useCurrentUser } from '@/features/auth/AuthProvider'
import { useChildren } from '@/features/children/queries'
import { useActiveDiscounts, useCreateVisit, useNannies, useVisitSettings } from '@/features/visits/queries'
import { cn, formatAge, formatDuration, formatMoney, formatPhone, formatTime, fullName, plural } from '@/lib/format'
import { nannyStatus } from '@/lib/statuses'
import { addMinutes, useNow } from '@/lib/time'
import { TelegramLogo } from '@/components/brand/TelegramLogo'
import type { Discount, PromoCode } from '@/types'
import { t } from '@/i18n'

type Adjustment = { source: 'discount'; item: Discount } | { source: 'promo'; item: PromoCode }

export function NewVisitPage() {
  const user = useCurrentUser()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const childId = params.get('childId')
  const [nannyId, setNannyId] = useState<string>()
  const [duration, setDuration] = useState<number>()
  const [adjustment, setAdjustment] = useState<Adjustment>()

  const { data: children } = useChildren({})
  const { data: nannies, isLoading: nanniesLoading, refetch: refetchNannies, isFetching: nanniesFetching } = useNannies()
  const { data: settings } = useVisitSettings()
  const create = useCreateVisit()
  const now = useNow(15_000)

  const child = children?.find((c) => c.id === childId)
  const nanny = nannies?.find((n) => n.id === nannyId)

  useEffect(() => {
    if (nanny && !nanny.available) setNannyId(undefined)
  }, [nanny])

  const hoursError = settings && duration ? checkWorkHours(new Date(now), duration, settings) : null
  const parkClosed = settings ? checkWorkHours(new Date(now), 0, settings) : null
  const childBusy = Boolean(child?.activeVisit)
  const ready = child && nanny?.available && duration && !hoursError && !childBusy

  useEffect(() => {
    setAdjustment((a) => (a?.source === 'promo' ? undefined : a))
  }, [childId])

  const basePrice = settings && duration ? priceFor(duration, settings) : undefined
  const discount = adjustment && basePrice !== undefined ? discountAmount(adjustment.item.kind, adjustment.item.value, basePrice) : 0

  const submit = async () => {
    if (!ready) return
    try {
      await create.mutateAsync({
        childId: child.id,
        nannyId: nanny.id,
        durationMin: duration,
        createdBy: user.id,
        discountId: adjustment?.source === 'discount' ? adjustment.item.id : undefined,
        promoCode: adjustment?.source === 'promo' ? adjustment.item.code : undefined,
      })
      toast.success(t('Посещение началось'), { description: `${fullName(child)} · ${fullName(nanny)} · ${formatDuration(duration)}` })
      if (child.parent.telegram?.linked) toast.info(t('Родителю отправлено уведомление в Telegram'), { icon: <TelegramLogo className="size-8" /> })
      else toast.warning(t('Telegram родителя не привязан — уведомление не отправлено'))
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
            <ArrowLeft className="size-4" />  {t(' К посещениям')}
          </Link>
        }
        title={t('Новое посещение')}
        description={t('Выберите ребёнка, свободную няню и продолжительность — таймер запустится сразу')}
      />

      {parkClosed && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl bg-danger-50 p-4 text-sm font-medium text-danger-700 ring-1 ring-danger-100">
          <AlertTriangle className="size-5 shrink-0" />
          {parkClosed}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-5">
          <Section n={1} icon={<Baby />} title={t('Ребёнок')} done={Boolean(child) && !childBusy}>
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

          <Section
            n={2}
            icon={<HeartHandshake />}
            title={t('Няня')}
            done={Boolean(nanny)}
            action={
              <Button variant="ghost" size="sm" onClick={() => refetchNannies()} leftIcon={<RefreshCw className={cn(nanniesFetching && 'animate-spin')} />}>
                
                {t('Обновить')}
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

          <Section n={3} icon={<Clock3 />} title={t('Продолжительность')} done={Boolean(duration) && !hoursError}>
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
                      
                      {t('до ')} {formatTime(addMinutes(now, d).toISOString())}
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
          basePrice={basePrice}
          discount={discount}
          discountSlot={<DiscountPicker parentId={child?.parentId} value={adjustment} onChange={setAdjustment} amount={basePrice !== undefined ? discount : undefined} />}
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
          
          {t('Изменить')}
        </Button>
      </div>
      {child.activeVisit && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-butter-200 px-3.5 py-2.5 text-sm font-medium text-warning-700 ring-1 ring-butter-300">
          <AlertTriangle className="size-4 shrink-0" />
          
          {t('Ребёнок уже находится на посещении до ')} {formatTime(child.activeVisit.endAt)}
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
      <Input value={q} onChange={(e) => setQ(e.target.value)} leftIcon={<Search />} placeholder={t('Имя ребёнка или телефон родителя')} autoFocus />
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
              {c.activeVisit && <Badge tone="success">{t('В парке')}</Badge>}
            </button>
          </li>
        ))}
      </ul>
      {filtered?.length === 0 && (
        <EmptyState
          className="py-8"
          icon={<Search />}
          title={t('Ребёнок не найден')}
          action={
            <Link to="/children/new">
              <Button size="sm">{t('Зарегистрировать')}</Button>
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
            
            {t('Опыт ')} {nanny.experienceYears} {plural(nanny.experienceYears, [t('год'), t('года'), t('лет')])}
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
          <span className="font-medium text-ink-500">{t('Загрузка')}</span>
          <span className="tabular font-bold text-ink-800">
            {nanny.activeChildren}  {t(' из ')} {nanny.maxChildren} {plural(nanny.maxChildren, [t('ребёнка'), t('детей'), t('детей')])}
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
  basePrice,
  discount,
  discountSlot,
  now,
  ready,
  loading,
  onSubmit,
}: {
  child?: ChildListItem
  nanny?: NannyWithLoad
  duration?: number
  basePrice?: number
  discount: number
  discountSlot: ReactNode
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
          <div className="text-[13px] font-semibold text-snow/70">{t('Итого к посещению')}</div>
          <div className="mt-1 flex items-baseline gap-2.5">
            <span className="tabular text-[32px] leading-none font-extrabold">{basePrice !== undefined ? formatMoney(basePrice - discount) : '—'}</span>
            {basePrice !== undefined && discount > 0 && <s className="tabular text-sm font-semibold text-snow/60">{formatMoney(basePrice)}</s>}
          </div>
          <div className="mt-4 flex items-center gap-4 text-sm">
            <div>
              <div className="text-xs text-snow/60">{t('Начало')}</div>
              <div className="tabular font-bold">{formatTime(new Date(now).toISOString())}</div>
            </div>
            <span className="h-px flex-1 bg-white/30" />
            <Timer className="size-4 text-snow/70" />
            <span className="h-px flex-1 bg-white/30" />
            <div className="text-right">
              <div className="text-xs text-snow/60">{t('Окончание')}</div>
              <div className="tabular font-bold">{end ? formatTime(end) : '—'}</div>
            </div>
          </div>
        </div>
        <dl className="divide-y divide-cream-200 px-5 text-sm">
          <Row label={t('Ребёнок')} value={child ? fullName(child) : undefined} />
          <Row label={t('Няня')} value={nanny ? fullName(nanny) : undefined} />
          <Row label={t('Продолжительность')} value={duration ? formatDuration(duration) : undefined} />
          <Row
            label={t('Уведомление')}
            value={
              child ? (
                child.parent.telegram?.linked ? (
                  <span className="flex items-center gap-1.5 text-ink-900">
                    <TelegramLogo /> Telegram
                  </span>
                ) : (
                  <span className="text-warning-700">{t('Не привязан')}</span>
                )
              ) : undefined
            }
          />
        </dl>
        {discountSlot}
        <div className="p-5 pt-3">
          <Button size="lg" className="w-full" disabled={!ready} loading={loading} onClick={onSubmit} leftIcon={<Play />}>
            
            {t('Начать посещение')}
          </Button>
          {!ready && (
            <p className="mt-2.5 text-center text-xs text-ink-500">{t('Выберите ребёнка, няню и продолжительность')}</p>
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
      <dd className={cn('truncate text-right font-semibold', value ? 'text-ink-900' : 'text-ink-300')}>{value ?? t('не выбрано')}</dd>
    </div>
  )
}

function DiscountPicker({
  parentId,
  value,
  onChange,
  amount,
}: {
  parentId?: string
  value?: Adjustment
  onChange: (a?: Adjustment) => void
  amount?: number
}) {
  const { data: discounts } = useActiveDiscounts()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()
  const [checking, setChecking] = useState(false)

  const applyPromo = async () => {
    if (!parentId || !code.trim()) return
    setChecking(true)
    try {
      const res = await pricingApi.checkPromo(code, parentId)
      if (res.valid) {
        onChange({ source: 'promo', item: res.promo })
        setCode('')
        setError(undefined)
      } else setError(res.reason)
    } finally {
      setChecking(false)
    }
  }

  if (value) {
    const label = value.source === 'promo' ? t('Промокод {0}', value.item.code) : value.item.name
    const size = value.item.kind === 'percent' ? `${value.item.value}%` : formatMoney(value.item.value)
    return (
      <div className="border-t border-cream-200 px-5 py-4">
        <div className="flex items-center gap-3 rounded-2xl bg-mint-50 px-3.5 py-2.5 ring-1 ring-mint-100">
          <Tag className="size-4 shrink-0 text-mint-600" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-ink-900">{label}</div>
            <div className="tabular text-xs font-semibold text-mint-600">
              {size}
              {amount ? ` · −${formatMoney(amount)}` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange(undefined)}
            aria-label={t('Убрать скидку')}
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-mist-500 transition hover:bg-white hover:text-ink-900"
          >
            <X className="size-4" />
          </button>
        </div>
        {value.source === 'discount' && value.item.conditions && (
          <p className="mt-2 text-xs leading-snug font-medium text-ink-500">{t('Условие: ')} {value.item.conditions}</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5 border-t border-cream-200 px-5 py-4">
      <div className="text-xs font-semibold text-ink-500">{t('Скидка или промокод')}</div>
      <Select
        size="sm"
        value=""
        placeholder={discounts?.length === 0 ? t('Нет действующих скидок') : t('Выбрать скидку')}
        disabled={!discounts?.length}
        onChange={(e) => {
          const d = discounts?.find((x) => x.id === e.target.value)
          if (d) onChange({ source: 'discount', item: d })
        }}
        options={(discounts ?? []).map((d) => ({
          value: d.id,
          label: d.name,
          hint: d.kind === 'percent' ? `${d.value}%` : formatMoney(d.value),
        }))}
      />
      <div className="flex items-start gap-2">
        <Input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase())
            setError(undefined)
          }}
          onKeyDown={(e) => e.key === 'Enter' && applyPromo()}
          placeholder={t('Промокод')}
          disabled={!parentId}
          containerClassName="flex-1"
          className="uppercase placeholder:normal-case"
          error={error}
        />
        <Button variant="secondary" onClick={applyPromo} loading={checking} disabled={!parentId || !code.trim()}>
          
          {t('Применить')}
        </Button>
      </div>
    </div>
  )
}
