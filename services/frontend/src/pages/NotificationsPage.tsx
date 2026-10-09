import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AlarmClock, BellOff, CircleCheckBig, CircleX, Play, Square, TimerReset, XCircle } from 'lucide-react'
import { notificationsApi, type NotificationItem } from '@/api/notifications'
import { TelegramLogo } from '@/components/brand/TelegramLogo'
import { Card, EmptyState, PageHeader, Skeleton } from '@/components/ui/Display'
import { Segmented } from '@/components/ui/Overlay'
import { notificationKeys, useNotifications } from '@/features/notifications/queries'
import { cn, formatShortDate, formatTime } from '@/lib/format'
import { notificationEventLabel } from '@/lib/statuses'
import type { NotificationEvent } from '@/types'
import { t } from '@/i18n'

// ТЗ §15, §30 — уведомления сотрудникам и родителям

type Tab = 'staff' | 'parent'

const eventIcon: Record<NotificationEvent, { icon: ReactNode; tint: string }> = {
  visit_started: { icon: <Play />, tint: 'bg-accent-100 text-accent-700' },
  ending_soon: { icon: <AlarmClock />, tint: 'bg-rose-100 text-rose-500' },
  extended: { icon: <TimerReset />, tint: 'bg-mint-100 text-mint-600' },
  extension_declined: { icon: <XCircle />, tint: 'bg-rose-100 text-rose-500' },
  payment_paid: { icon: <CircleCheckBig />, tint: 'bg-mint-100 text-mint-600' },
  payment_failed: { icon: <CircleX />, tint: 'bg-danger-50 text-danger-700' },
  visit_finished: { icon: <Square />, tint: 'bg-mist-100 text-mist-600' },
}

export function NotificationsPage() {
  const [tab, setTab] = useState<Tab>('staff')
  const { data, isLoading } = useNotifications()
  const qc = useQueryClient()

  // Открыли страницу — уведомления сотрудникам прочитаны. Точки «новое» остаются,
  // пока страница открыта: помним, что было непрочитанным в момент открытия.
  const unreadOnOpen = useRef<Set<string>>(undefined)
  useEffect(() => {
    if (!data) return
    const unread = data.filter((n) => n.recipient === 'staff' && !n.read)
    if (!unreadOnOpen.current) unreadOnOpen.current = new Set(unread.map((n) => n.id))
    else unread.forEach((n) => unreadOnOpen.current!.add(n.id))
    if (unread.length) notificationsApi.markAllRead().then(() => qc.invalidateQueries({ queryKey: notificationKeys.unread }))
  }, [data, qc])

  const items = data?.filter((n) => n.recipient === tab)
  const notLinked = data?.filter((n) => n.recipient === 'parent' && n.delivery === 'not_linked').length ?? 0

  return (
    <div className="animate-slide-up">
      <PageHeader title={t('Уведомления')} description={t('События посещений: продления, отказы, завершения и сообщения родителям в Telegram')} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'staff', label: t('Сотрудникам') },
            { value: 'parent', label: t('Родителям') },
          ]}
        />
        {tab === 'parent' && notLinked > 0 && (
          <span className="text-xs font-semibold text-warning-700">{t('Не доставлено (Telegram не привязан): ')} {notLinked}</span>
        )}
      </div>

      {isLoading ? (
        <Card className="space-y-3 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </Card>
      ) : !items?.length ? (
        <Card>
          <EmptyState
            icon={<BellOff />}
            title={t('Уведомлений пока нет')}
            description={tab === 'staff' ? t('Здесь появятся продления, отказы от продления и завершённые посещения.') : t('Здесь появятся сообщения, отправленные родителям.')}
          />
        </Card>
      ) : (
        <Card className="divide-y divide-cream-200 overflow-hidden">
          {items.slice(0, 200).map((n) => (
            <Row key={n.id} n={n} fresh={Boolean(unreadOnOpen.current?.has(n.id))} />
          ))}
        </Card>
      )}
    </div>
  )
}

function Row({ n, fresh }: { n: NotificationItem; fresh: boolean }) {
  const meta = eventIcon[n.event]
  return (
    <div className={cn('flex items-center gap-3.5 px-5 py-3.5', fresh && 'bg-accent-50/60')}>
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-2xl [&_svg]:size-[18px]', meta.tint)}>{meta.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-bold text-ink-900">{notificationEventLabel[n.event]}</span>
          {fresh && <span className="size-2 shrink-0 rounded-full bg-accent-500" aria-label={t('Новое')} />}
        </div>
        <div className="truncate text-[13px] text-ink-600">
          <Link to={`/children/${n.childId}`} className="font-semibold text-ink-800 hover:underline">
            {n.childName}
          </Link>
          {' · '}
          {n.text.replace(`${n.childName}: `, '')}
        </div>
      </div>
      {n.recipient === 'parent' && (
        <span
          className={cn(
            'hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold sm:inline-flex',
            n.delivery === 'sent' ? 'bg-sky-50 text-sky-500' : 'bg-butter-200 text-warning-700',
          )}
        >
          <TelegramLogo className={cn('size-3.5', n.delivery !== 'sent' && 'opacity-50 grayscale')} />
          {n.delivery === 'sent' ? t('Отправлено') : t('Не привязан')}
        </span>
      )}
      <div className="tabular shrink-0 text-right text-xs text-ink-500">
        <div className="font-semibold text-ink-700">{formatTime(n.at)}</div>
        <div>{formatShortDate(n.at)}</div>
      </div>
    </div>
  )
}
