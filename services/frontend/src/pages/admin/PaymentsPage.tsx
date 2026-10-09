import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Banknote, CircleCheckBig, CircleX, Search, TimerReset, Undo2 } from 'lucide-react'
import { paymentsApi, type PaymentRow } from '@/api/admin'
import { AdminHeader, DataTable, EmptyBlock, Panel, PastelStat, Pill, StatsRow, type Column, type PastelTone } from '@/components/admin/AdminKit'
import { Input } from '@/components/ui/Field'
import { OptionDot, Select } from '@/components/ui/Select'
import { Segmented } from '@/components/ui/Overlay'
import { formatDuration, formatMoney, formatShortDate, formatTime, fullName } from '@/lib/format'
import { paymentStatus } from '@/lib/statuses'
import type { PaymentStatus } from '@/types'

// ТЗ §19 / §32
const statusTone: Record<PaymentStatus, PastelTone | 'muted' | 'danger' | 'dark'> = {
  unpaid: 'muted',
  pending: 'butter',
  paid: 'olive',
  failed: 'danger',
  cancelled: 'muted',
  refunded: 'peri',
}

const statusDot: Record<PaymentStatus, string> = {
  unpaid: 'bg-cream-300',
  pending: 'bg-butter-500',
  paid: 'bg-olive-500',
  failed: 'bg-danger-500',
  cancelled: 'bg-ink-300',
  refunded: 'bg-peri-500',
}

type Kind = 'all' | 'visit' | 'extension'
type Period = '7' | '30' | '90' | 'all'

export function PaymentsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'payments'], queryFn: paymentsApi.list })
  const [kind, setKind] = useState<Kind>('all')
  const [status, setStatus] = useState<PaymentStatus | 'all'>('all')
  const [period, setPeriod] = useState<Period>('30')
  const [q, setQ] = useState('')

  const inPeriod = useMemo(() => {
    if (period === 'all') return data
    const from = Date.now() - Number(period) * 86_400_000
    return data?.filter((p) => new Date(p.at).getTime() >= from)
  }, [data, period])

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    const digits = s.replace(/\D/g, '')
    return inPeriod
      ?.filter((p) => kind === 'all' || p.kind === kind)
      .filter((p) => status === 'all' || p.status === status)
      .filter(
        (p) =>
          !s ||
          `${p.child ? fullName(p.child) : ''} ${p.parent ? fullName(p.parent) : ''}`.toLowerCase().includes(s) ||
          (digits.length >= 3 && p.parent?.phone.includes(digits)),
      )
      .slice(0, 300)
  }, [inPeriod, kind, status, q])

  const sum = (f: (p: PaymentRow) => boolean) => inPeriod?.filter(f).reduce((s, p) => s + p.amount, 0)
  const cnt = (f: (p: PaymentRow) => boolean) => inPeriod?.filter(f).length

  const columns: Column<PaymentRow>[] = [
    {
      key: 'date',
      header: 'Дата',
      cell: (p) => (
        <div className="tabular">
          <div className="font-bold text-ink-900">{formatShortDate(p.at)}</div>
          <div className="text-xs text-ink-500">{formatTime(p.at)}</div>
        </div>
      ),
    },
    {
      key: 'child',
      header: 'Ребёнок / родитель',
      cell: (p) => (
        <div className="min-w-0">
          {p.child ? (
            <Link to={`/children/${p.child.id}`} className="font-bold text-ink-900 hover:underline">
              {fullName(p.child)}
            </Link>
          ) : (
            '—'
          )}
          <div className="truncate text-xs text-ink-500">{p.parent ? fullName(p.parent) : ''}</div>
        </div>
      ),
    },
    {
      key: 'kind',
      header: 'Назначение',
      cell: (p) =>
        p.kind === 'visit' ? (
          <span className="font-semibold text-ink-800">Посещение · {formatDuration(p.minutes)}</span>
        ) : (
          <span className="inline-flex items-center gap-1 font-semibold text-ink-800">
            <TimerReset className="size-3.5" /> Продление · +{formatDuration(p.minutes)}
          </span>
        ),
    },
    { key: 'amount', header: 'Сумма', align: 'right', cell: (p) => <span className="tabular font-extrabold text-ink-900">{formatMoney(p.amount)}</span> },
    { key: 'status', header: 'Статус', align: 'right', cell: (p) => <Pill tone={statusTone[p.status]}>{paymentStatus[p.status].label}</Pill> },
  ]

  return (
    <div className="animate-slide-up">
      <AdminHeader title="Оплаты" description="Платежи за посещения и продления" />

      <StatsRow>
        <PastelStat tone="butter" icon={<Banknote />} label="Оплачено" value={sum((p) => p.status === 'paid') !== undefined ? formatMoney(sum((p) => p.status === 'paid')!) : undefined} />
        <PastelStat tone="olive" icon={<CircleCheckBig />} label="Успешных платежей" value={cnt((p) => p.status === 'paid')} />
        <PastelStat tone="blush" icon={<CircleX />} label="Ошибок оплаты" value={cnt((p) => p.status === 'failed')} />
        <PastelStat tone="peri" icon={<Undo2 />} label="Возвращено" value={sum((p) => p.status === 'refunded') !== undefined ? formatMoney(sum((p) => p.status === 'refunded')!) : undefined} />
      </StatsRow>

      <Panel
        toolbar={
          <>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ребёнок, родитель или телефон" leftIcon={<Search />} containerClassName="flex-1 md:max-w-xs" />
            <Segmented
              value={kind}
              onChange={setKind}
              size="sm"
              className="bg-cream-200/70"
              options={[
                { value: 'all', label: 'Все' },
                { value: 'visit', label: 'Посещения' },
                { value: 'extension', label: 'Продления' },
              ]}
            />
            <div className="flex gap-2 md:ml-auto">
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as PaymentStatus | 'all')}
                options={[
                  { value: 'all', label: 'Любой статус', icon: <OptionDot className="bg-cream-300" /> },
                  ...Object.entries(paymentStatus).map(([v, m]) => ({ value: v, label: m.label, icon: <OptionDot className={statusDot[v as PaymentStatus]} /> })),
                ]}
                size="sm"
                containerClassName="w-44"
              />
              <Select
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
                options={[
                  { value: '7', label: '7 дней' },
                  { value: '30', label: '30 дней' },
                  { value: '90', label: '90 дней' },
                  { value: 'all', label: 'Всё время' },
                ]}
                size="sm"
                containerClassName="w-36"
              />
            </div>
          </>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          loading={isLoading}
          rowKey={(p) => p.id}
          empty={<EmptyBlock icon={<Banknote />} title="Платежей нет" text="Измените фильтры или период." />}
        />
        {rows && rows.length === 300 && <p className="mt-3 text-center text-xs text-ink-500">Показаны первые 300 платежей — уточните фильтры</p>}
      </Panel>
    </div>
  )
}
