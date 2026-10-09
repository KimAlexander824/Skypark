import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  Clock3,
  History,
  NotebookPen,
  Phone,
  Play,
  ScanFace,
  Timer,
  TimerReset,
  UserRoundPlus,
  UsersRound,
} from 'lucide-react'
import type { ChildDetail, VisitWithNanny } from '@/api/children'
import { faceApi } from '@/api/face'
import { Button } from '@/components/ui/Button'
import { PastelStat } from '@/components/admin/AdminKit'
import { Avatar, Badge, Card, CardHeader, EmptyState, IconTile, Skeleton } from '@/components/ui/Display'
import { useChild } from '@/features/children/queries'
import {
  cn,
  formatAge,
  formatDate,
  formatDuration,
  formatMoney,
  formatPhone,
  formatShortDate,
  formatTime,
  fullName,
} from '@/lib/format'
import { paymentStatus, visitStatus } from '@/lib/statuses'
import { isOngoing, useNow, visitTiming, visitTotalMinutes as totalMinutes, visitTotalPrice as totalPrice } from '@/lib/time'
import { TelegramLogo } from '@/components/brand/TelegramLogo'

export function ChildDetailPage() {
  const { id = '' } = useParams()
  const { data, isLoading, isError, error } = useChild(id)

  if (isLoading) return <DetailSkeleton />
  if (isError || !data)
    return (
      <Card>
        <EmptyState
          icon={<ScanFace />}
          title="Карточка не найдена"
          description={(error as Error)?.message}
          action={
            <Link to="/children">
              <Button variant="secondary" leftIcon={<ArrowLeft />}>
                К списку детей
              </Button>
            </Link>
          }
        />
      </Card>
    )

  return <ChildDetailView data={data} />
}

function ChildDetailView({ data }: { data: ChildDetail }) {
  const { child, parent, siblings, visits } = data
  const active = visits.find(isOngoing)
  const done = visits.filter((v) => v.status === 'completed')
  const stats = {
    visits: visits.filter((v) => v.status !== 'cancelled').length,
    minutes: done.reduce((s, v) => s + totalMinutes(v), 0),
    extensions: visits.reduce((s, v) => s + v.extensions.length, 0),
    paid: visits.filter((v) => v.paymentStatus === 'paid').reduce((s, v) => s + totalPrice(v), 0),
  }

  return (
    <div className="animate-slide-up">
      <Link to="/children" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900">
        <ArrowLeft className="size-4" /> К списку детей
      </Link>

      {/* Hero */}
      <Card className="relative overflow-hidden">
        <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:px-7 sm:py-6">
          <Avatar
            src={child.photoUrl}
            firstName={child.firstName}
            lastName={child.lastName}
            seed={child.id}
            size="xl"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-[28px]">{fullName(child)}</h1>
              {active ? (
                <Badge tone="success" dot pulse>
                  Сейчас в парке
                </Badge>
              ) : stats.visits === 0 ? (
                <Badge tone="sun">Новый</Badge>
              ) : null}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
              <span>
                {formatAge(child.birthDate)} · {child.gender === 'female' ? 'девочка' : 'мальчик'}
              </span>
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-4" />
                {formatDate(child.birthDate)}
              </span>
              <span className={cn('flex items-center gap-1.5', child.hasFaceProfile ? 'text-success-600' : 'text-warning-700')}>
                {child.hasFaceProfile && <FaceThumb childId={child.id} />}
                <ScanFace className="size-4" />
                {child.hasFaceProfile ? 'Профиль лица сохранён' : 'Нет фото для распознавания'}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to={`/visits/new?childId=${child.id}`} aria-disabled={Boolean(active)} className={cn(active && 'pointer-events-none')}>
              <Button size="lg" leftIcon={<Play />} disabled={Boolean(active)}>
                Начать посещение
              </Button>
            </Link>
          </div>
        </div>
        {active && <ActiveVisitBanner visit={active} />}
      </Card>

      {/* Stats */}
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <PastelStat tone="butter" icon={<History />} label="Посещений" value={stats.visits} />
        <PastelStat tone="peri" icon={<Clock3 />} label="Время в парке" value={formatDuration(stats.minutes)} />
        <PastelStat tone="blush" icon={<TimerReset />} label="Продлений" value={stats.extensions} />
        <PastelStat tone="olive" icon={<Banknote />} label="Оплачено" value={formatMoney(stats.paid)} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader
            icon={<History />}
            title="История посещений"
            description={visits.length ? `Всего записей: ${visits.length}` : undefined}
          />
          {visits.length ? <VisitsTable visits={visits} /> : (
            <EmptyState
              className="pt-4"
              icon={<CalendarDays />}
              title="Посещений ещё не было"
              description="Оформите первое посещение — оно появится здесь."
            />
          )}
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader icon={<UsersRound />} title="Родитель" />
            <div className="px-5 pb-5">
              <div className="flex items-center gap-3">
                <Avatar firstName={parent.firstName} lastName={parent.lastName} seed={parent.id} />
                <div className="min-w-0">
                  <div className="truncate font-bold text-ink-900">{fullName(parent)}</div>
                  <a href={`tel:+${parent.phone}`} className="tabular flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-600">
                    <Phone className="size-3.5" />
                    {formatPhone(parent.phone)}
                  </a>
                </div>
              </div>

              <div
                className={cn(
                  'mt-4 flex items-center gap-3 rounded-2xl p-3',
                  parent.telegram?.linked ? 'bg-sky-50 ring-1 ring-sky-100' : 'bg-mist-100',
                )}
              >
                <TelegramLogo className={cn('size-9', !parent.telegram?.linked && 'opacity-40 grayscale')} />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-bold text-ink-900">{parent.telegram?.linked ? 'Telegram привязан' : 'Telegram не привязан'}</div>
                  <div className="truncate font-medium text-mist-500">
                    {parent.telegram?.linked
                      ? parent.telegram.username
                        ? `@${parent.telegram.username}`
                        : 'Уведомления включены'
                      : 'Родитель не получит уведомления'}
                  </div>
                </div>
              </div>

              {parent.note && <p className="mt-3 text-sm text-ink-600">{parent.note}</p>}
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={<UsersRound />}
              title="Дети родителя"
              action={
                <Link to={`/children/new?phone=${parent.phone}`}>
                  <Button size="icon-sm" variant="soft" aria-label="Добавить ребёнка" title="Добавить ребёнка">
                    <UserRoundPlus />
                  </Button>
                </Link>
              }
            />
            <ul className="px-3 pb-3">
              <li className="flex items-center gap-3 rounded-xl bg-butter-200 p-2">
                <Avatar src={child.photoUrl} firstName={child.firstName} lastName={child.lastName} seed={child.id} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-ink-900">{child.firstName}</div>
                  <div className="text-xs text-ink-500">{formatAge(child.birthDate)}</div>
                </div>
                <Badge tone="brand">Открыт</Badge>
              </li>
              {siblings.map((s) => (
                <li key={s.id}>
                  <Link to={`/children/${s.id}`} className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-cream-100">
                    <Avatar src={s.photoUrl} firstName={s.firstName} lastName={s.lastName} seed={s.id} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-ink-900">{s.firstName}</div>
                      <div className="text-xs text-ink-500">{formatAge(s.birthDate)}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          {child.note && (
            <Card>
              <CardHeader icon={<NotebookPen />} title="Заметка" />
              <p className="px-5 pb-5 text-sm leading-relaxed text-ink-700">{child.note}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function ActiveVisitBanner({ visit }: { visit: VisitWithNanny }) {
  const now = useNow(15_000)
  const { leftMin: left, progress, endingSoon: soon } = visitTiming(visit, now)
  const meta = visitStatus[visit.status]

  return (
    <div className="border-t border-cream-200 bg-cream-100 px-5 py-4 sm:px-7">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <IconTile tone={soon ? 'sun' : 'success'} size="sm">
            <Timer />
          </IconTile>
          <div>
            <div className="text-xs font-semibold text-ink-500">Осталось</div>
            <div className={cn('tabular text-lg font-extrabold', soon ? 'text-ink-900' : 'text-ink-900')}>{formatDuration(left)}</div>
          </div>
        </div>
        <InfoPair label="Время" value={`${formatTime(visit.startAt)} — ${formatTime(visit.endAt)}`} />
        {visit.nanny && <InfoPair label="Няня" value={fullName(visit.nanny)} />}
        <Badge tone={meta.tone} className="ml-auto">
          {meta.label}
        </Badge>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-cream-200">
        <div
          className={cn('h-full rounded-full transition-all', soon ? 'bg-rose-500' : 'bg-accent-500')}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

function InfoPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold text-ink-500">{label}</div>
      <div className="tabular text-sm font-bold text-ink-900">{value}</div>
    </div>
  )
}


function VisitsTable({ visits }: { visits: VisitWithNanny[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-y border-cream-200 bg-cream-100 text-xs text-ink-500">
            <th className="py-2.5 pr-3 pl-5 font-semibold">Дата</th>
            <th className="px-3 py-2.5 font-semibold">Время</th>
            <th className="px-3 py-2.5 font-semibold">Няня</th>
            <th className="px-3 py-2.5 font-semibold">Длительность</th>
            <th className="px-3 py-2.5 text-right font-semibold">Стоимость</th>
            <th className="py-2.5 pr-5 pl-3 font-semibold">Статус</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cream-200">
          {visits.map((v) => {
            const ext = v.extensions.reduce((s, e) => s + e.minutes, 0)
            const st = visitStatus[v.status]
            const pay = paymentStatus[v.paymentStatus]
            return (
              <tr key={v.id} className="transition hover:bg-cream-100">
                <td className="tabular py-3 pr-3 pl-5 font-semibold text-ink-900">{formatShortDate(v.startAt)}</td>
                <td className="tabular px-3 py-3 text-ink-600">
                  {formatTime(v.startAt)} — {formatTime(v.endedAt ?? v.endAt)}
                </td>
                <td className="px-3 py-3 text-ink-700">{v.nanny ? fullName(v.nanny) : '—'}</td>
                <td className="px-3 py-3">
                  <span className="font-semibold text-ink-800">{formatDuration(totalMinutes(v))}</span>
                  {ext > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-blush-200 px-1.5 py-0.5 text-[11px] font-bold text-ink-900">
                      +{formatDuration(ext)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="tabular font-semibold text-ink-900">{formatMoney(totalPrice(v))}</div>
                  <div className={cn('text-xs font-medium', pay.tone === 'success' ? 'text-success-600' : 'text-ink-500')}>{pay.label}</div>
                </td>
                <td className="py-3 pr-5 pl-3">
                  <Badge tone={st.tone} dot={isOngoing(v)} pulse={isOngoing(v)}>
                    {st.label}
                  </Badge>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div>
      <Skeleton className="mb-4 h-5 w-32" />
      <Card className="overflow-hidden">
        <div className="flex items-center gap-5 px-7 py-6">
          <Skeleton className="size-28 rounded-3xl" />
          <div className="flex-1 space-y-2.5">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-80" />
          </div>
        </div>
      </Card>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[76px] rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

/** Вырезка лица, которое запомнил сервис распознавания, — для сверки сотрудником. В демо-режиме не показывается. */
function FaceThumb({ childId }: { childId: string }) {
  const [failed, setFailed] = useState(false)
  const src = useMemo(() => faceApi.thumbnailUrl(childId), [childId])
  if (!src || failed) return null
  return (
    <img
      src={src}
      alt="Сохранённое лицо"
      title="Это лицо сохранено для распознавания"
      onError={() => setFailed(true)}
      className="size-7 rounded-lg object-cover ring-1 ring-success-500/40"
    />
  )
}
