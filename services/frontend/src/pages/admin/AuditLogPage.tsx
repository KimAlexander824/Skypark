import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { employeesApi } from '@/api/admin'
import { auditApi, type AuditItem } from '@/api/notifications'
import { AdminHeader, DataTable, EmptyBlock, Panel, Pill, type Column, type PastelTone } from '@/components/admin/AdminKit'
import { DatePicker } from '@/components/ui/DatePicker'
import { Select } from '@/components/ui/Select'
import { formatShortDate, formatTime } from '@/lib/format'
import { auditActionLabel } from '@/lib/statuses'
import type { AuditAction } from '@/types'
import { t } from '@/i18n'

// ТЗ §41 — история ключевых действий для контроля сотрудников

const actionTone: Record<AuditAction, PastelTone | 'muted' | 'dark'> = {
  child_registered: 'peri',
  visit_created: 'butter',
  visit_finished: 'muted',
  visit_extended: 'olive',
  extension_declined: 'blush',
  discount_applied: 'olive',
  discount_saved: 'dark',
  promo_saved: 'dark',
}

/** Подпись действия: для скидок и промокодов — что именно сделали («Создана скидка»). */
const actionText = (a: AuditItem) => (a.action.endsWith('_saved') && a.details ? a.details : auditActionLabel[a.action])

export function AuditLogPage() {
  const [actorId, setActorId] = useState('')
  const [action, setAction] = useState<AuditAction | ''>('')
  const [date, setDate] = useState('')

  const { data: employees } = useQuery({ queryKey: ['admin', 'employees'], queryFn: employeesApi.list })
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audit', actorId, action, date],
    queryFn: () => auditApi.list({ actorId: actorId || undefined, action: action || undefined, date: date || undefined }),
    placeholderData: (p) => p,
  })

  const rows = data?.slice(0, 300)

  const columns: Column<AuditItem>[] = [
    {
      key: 'at',
      header: t('Когда'),
      cell: (a) => (
        <div className="tabular">
          <div className="font-bold text-ink-900">{formatShortDate(a.at)}</div>
          <div className="text-xs text-ink-500">{formatTime(a.at)}</div>
        </div>
      ),
    },
    { key: 'actor', header: t('Кто'), cell: (a) => <span className={a.actorId ? 'font-semibold text-ink-900' : 'text-ink-500'}>{a.actorName}</span> },
    { key: 'action', header: t('Действие'), cell: (a) => <Pill tone={actionTone[a.action]}>{actionText(a)}</Pill> },
    {
      key: 'subject',
      header: t('Объект'),
      cell: (a) => (
        <div className="min-w-0">
          {a.link ? (
            <Link to={a.link} className="font-bold text-ink-900 hover:underline">
              {a.subject}
            </Link>
          ) : (
            <span className="font-bold text-ink-900">{a.subject}</span>
          )}
          {a.details && !a.action.endsWith('_saved') && <div className="truncate text-xs text-ink-500">{a.details}</div>}
        </div>
      ),
    },
  ]

  return (
    <div className="animate-slide-up">
      <AdminHeader title={t('Журнал действий')} description={t('Кто и когда регистрировал детей, оформлял и завершал посещения, менял время и применял скидки')} />

      <Panel
        toolbar={
          <>
            <Select
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
              options={[{ value: '', label: t('Все сотрудники') }, ...(employees ?? []).map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` }))]}
              size="sm"
              containerClassName="w-full md:w-56"
            />
            <Select
              value={action}
              onChange={(e) => setAction(e.target.value as AuditAction | '')}
              options={[{ value: '', label: t('Все действия') }, ...Object.entries(auditActionLabel).map(([value, label]) => ({ value, label }))]}
              size="sm"
              containerClassName="w-full md:w-64"
            />
            <DatePicker value={date} onChange={setDate} placeholder={t('Любая дата')} clearable size="sm" containerClassName="w-full md:ml-auto md:w-48" />
          </>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          loading={isLoading}
          rowKey={(a) => a.id}
          empty={<EmptyBlock icon={<History />} title={t('Записей нет')} text={t('Измените фильтры.')} />}
        />
        {data && data.length > 300 && <p className="mt-3 text-center text-xs text-ink-500">{t('Показаны последние 300 записей — уточните фильтры')}</p>}
      </Panel>
    </div>
  )
}
