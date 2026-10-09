import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Baby, Banknote, Search, UsersRound } from 'lucide-react'
import { parentsAdminApi, type ParentAdminItem } from '@/api/admin'
import { AdminHeader, DataTable, EmptyBlock, Panel, PastelStat, Pill, StatsRow, type Column } from '@/components/admin/AdminKit'
import { Avatar } from '@/components/ui/Display'
import { Input } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Overlay'
import { formatMoney, formatPhone, formatShortDate, fullName } from '@/lib/format'
import { TelegramLogo } from '@/components/brand/TelegramLogo'
import { t } from '@/i18n'

type Filter = 'all' | 'telegram' | 'no_telegram'

export function ParentsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'parents'], queryFn: parentsAdminApi.list })
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    const digits = s.replace(/\D/g, '')
    return data
      ?.filter((p) => (filter === 'all' ? true : filter === 'telegram' ? p.telegram?.linked : !p.telegram?.linked))
      .filter(
        (p) =>
          !s ||
          `${fullName(p)} ${p.children.map((c) => c.firstName).join(' ')}`.toLowerCase().includes(s) ||
          (digits.length >= 3 && p.phone.includes(digits)),
      )
  }, [data, q, filter])

  const linked = data?.filter((p) => p.telegram?.linked).length

  const columns: Column<ParentAdminItem>[] = [
    {
      key: 'name',
      header: t('Родитель'),
      cell: (p) => (
        <div className="flex items-center gap-3">
          <Avatar firstName={p.firstName} lastName={p.lastName} seed={p.id} size="sm" />
          <div className="min-w-0">
            <div className="truncate font-bold text-ink-900">{fullName(p)}</div>
            <div className="tabular text-xs text-ink-500">{formatPhone(p.phone)}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'telegram',
      header: 'Telegram',
      cell: (p) =>
        p.telegram?.linked ? (
          <Pill tone="peri">
            <TelegramLogo />
            {p.telegram.username ? `@${p.telegram.username}` : t('привязан')}
          </Pill>
        ) : (
          <Pill>{t('не привязан')}</Pill>
        ),
    },
    {
      key: 'children',
      header: t('Дети'),
      cell: (p) => (
        <div className="flex flex-wrap gap-1">
          {p.children.map((c) => (
            <Link
              key={c.id}
              to={`/children/${c.id}`}
              onClick={(e) => e.stopPropagation()}
              className="rounded-full bg-accent-50 px-2.5 py-0.5 text-xs font-bold text-accent-700 ring-1 ring-accent-100 transition hover:bg-accent-500 hover:text-snow"
            >
              {c.firstName}
            </Link>
          ))}
        </div>
      ),
    },
    { key: 'visits', header: t('Посещений'), align: 'right', cell: (p) => <span className="tabular font-bold text-ink-900">{p.visitsCount}</span> },
    { key: 'paid', header: t('Оплачено'), align: 'right', cell: (p) => <span className="tabular font-semibold text-ink-800">{formatMoney(p.paidTotal)}</span> },
    { key: 'last', header: t('Последний визит'), align: 'right', cell: (p) => <span className="tabular text-ink-600">{p.lastVisitAt ? formatShortDate(p.lastVisitAt) : '—'}</span> },
  ]

  return (
    <div className="animate-slide-up">
      <AdminHeader title={t('Родители')} description={t('Контакты, привязка Telegram и дети каждого родителя')} />

      <StatsRow>
        <PastelStat tone="butter" icon={<UsersRound />} label={t('Всего родителей')} value={data?.length} />
        <PastelStat tone="peri" icon={<TelegramLogo className="size-[18px]" />} label={t('Telegram привязан')} value={data ? t('{0} из {1}', linked, data.length) : undefined} />
        <PastelStat tone="olive" icon={<Baby />} label={t('Детей в базе')} value={data?.reduce((s, p) => s + p.children.length, 0)} />
        <PastelStat tone="blush" icon={<Banknote />} label={t('Оплачено всего')} value={data ? formatMoney(data.reduce((s, p) => s + p.paidTotal, 0)) : undefined} />
      </StatsRow>

      <Panel
        toolbar={
          <>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Имя, телефон или имя ребёнка')} leftIcon={<Search />} containerClassName="flex-1 md:max-w-sm" />
            <Segmented
              value={filter}
              onChange={setFilter}
              size="sm"
              className="bg-cream-200/70 md:ml-auto"
              options={[
                { value: 'all', label: t('Все') },
                { value: 'telegram', label: t('С Telegram') },
                { value: 'no_telegram', label: t('Без Telegram') },
              ]}
            />
          </>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          loading={isLoading}
          rowKey={(p) => p.id}
          empty={<EmptyBlock icon={<Search />} title={t('Родители не найдены')} text={t('Проверьте номер или имя.')} />}
        />
      </Panel>
    </div>
  )
}
