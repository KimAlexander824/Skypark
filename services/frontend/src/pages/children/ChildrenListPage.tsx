import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Baby, ChevronRight, Phone, Plus, ScanFace, Search, SearchX } from 'lucide-react'
import type { ChildListItem } from '@/api/children'
import { Button } from '@/components/ui/Button'
import { Avatar, Badge, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui/Display'
import { Input } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Overlay'
import { useChildren } from '@/features/children/queries'
import { cn, formatAge, formatPhone, formatShortDate, fullName, plural } from '@/lib/format'
import { DatePicker, toIso } from '@/components/ui/DatePicker'
import { TelegramLogo } from '@/components/brand/TelegramLogo'
import { t } from '@/i18n'

type Filter = 'all' | 'active' | 'no_visits'

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function ChildrenListPage() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [filter, setFilter] = useState<Filter>((params.get('f') as Filter) || 'all')
  const [visitDate, setVisitDate] = useState(params.get('date') ?? '')
  const debounced = useDebounced(search)

  useEffect(() => setSearch(params.get('q') ?? ''), [params])

  const { data, isLoading } = useChildren({ search: debounced, status: filter, visitDate: visitDate || undefined })
  const { data: all } = useChildren({ search: debounced, visitDate: visitDate || undefined })

  const updateFilter = (f: Filter) => {
    setFilter(f)
    const next = new URLSearchParams(params)
    if (f === 'all') next.delete('f')
    else next.set('f', f)
    setParams(next, { replace: true })
  }

  return (
    <div className="animate-slide-up">
      <PageHeader
        title={t('Дети')}
        description={
          all ? t('{0} {1} в базе', all.length, plural(all.length, [t('карточка'), t('карточки'), t('карточек')])) : t('Карточки детей и родителей')
        }
        actions={
          <>
            <Link to="/reception">
              <Button variant="secondary" leftIcon={<ScanFace />}>
                
                {t('Распознать')}
              </Button>
            </Link>
            <Link to="/children/new">
              <Button leftIcon={<Plus />}>{t('Новый ребёнок')}</Button>
            </Link>
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-cream-200 p-4 md:flex-row md:items-center">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Поиск по имени ребёнка, родителя или телефону')}
            leftIcon={<Search />}
            containerClassName="flex-1 md:max-w-md"
          />
          <DatePicker
            value={visitDate}
            onChange={setVisitDate}
            max={toIso(new Date())}
            placeholder={t('Дата посещения')}
            aria-label={t('Дата посещения')}
            clearable
            containerClassName="md:ml-auto md:w-52"
          />
          <Segmented
            value={filter}
            onChange={updateFilter}
            options={[
              { value: 'all', label: t('Все') },
              { value: 'active', label: t('Сейчас в парке') },
              { value: 'no_visits', label: t('Без посещений') },
            ]}
          />
        </div>

        {isLoading ? (
          <ListSkeleton />
        ) : !data?.length ? (
          search ? (
            <EmptyState
              icon={<SearchX />}
              title={t('Ничего не найдено')}
              description={t('По запросу «{0}» нет карточек. Проверьте номер или зарегистрируйте нового ребёнка.', search)}
              action={
                <Link to="/children/new">
                  <Button leftIcon={<Plus />}>{t('Зарегистрировать')}</Button>
                </Link>
              }
            />
          ) : (
            <EmptyState icon={<Baby />} title={t('Здесь пока пусто')} description={t('В этой категории нет детей.')} />
          )
        ) : (
          <ChildrenTable items={data} />
        )}
      </Card>
    </div>
  )
}

function ChildrenTable({ items }: { items: ChildListItem[] }) {
  const navigate = useNavigate()
  return (
    <>
      <table className="hidden w-full text-left md:table">
        <thead>
          <tr className="text-xs font-semibold text-ink-500">
            <th className="py-3 pr-3 pl-5 font-semibold">{t('Ребёнок')}</th>
            <th className="px-3 py-3 font-semibold">{t('Родитель')}</th>
            <th className="px-3 py-3 font-semibold">{t('Посещений')}</th>
            <th className="px-3 py-3 font-semibold">{t('Последний визит')}</th>
            <th className="px-3 py-3 font-semibold">{t('Статус')}</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr
              key={c.id}
              onClick={() => navigate(`/children/${c.id}`)}
              className="group cursor-pointer border-t border-cream-200 transition hover:bg-cream-100"
            >
              <td className="py-3 pr-3 pl-5">
                <div className="flex items-center gap-3">
                  <Avatar src={c.photoUrl} firstName={c.firstName} lastName={c.lastName} seed={c.id} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-ink-900">{fullName(c)}</div>
                    <div className="text-[13px] text-ink-500">
                      {formatAge(c.birthDate)} · {c.gender === 'female' ? t('девочка') : t('мальчик')}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-3 py-3">
                <div className="text-sm font-semibold text-ink-800">{fullName(c.parent)}</div>
                <div className="tabular flex items-center gap-1.5 text-[13px] text-ink-500">
                  {formatPhone(c.parent.phone)}
                  {c.parent.telegram?.linked && <TelegramLogo className="size-3.5" title={t('Telegram привязан')} />}
                </div>
              </td>
              <td className="tabular px-3 py-3 text-sm font-semibold text-ink-800">{c.visitsCount}</td>
              <td className="tabular px-3 py-3 text-sm text-ink-600">{c.lastVisitAt ? formatShortDate(c.lastVisitAt) : '—'}</td>
              <td className="px-3 py-3">
                <ChildStatusBadge item={c} />
              </td>
              <td className="pr-4">
                <ChevronRight className="size-5 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-ink-600" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-cream-200 md:hidden">
        {items.map((c) => (
          <li key={c.id}>
            <Link to={`/children/${c.id}`} className="flex items-center gap-3 px-4 py-3.5 active:bg-cream-100">
              <Avatar src={c.photoUrl} firstName={c.firstName} lastName={c.lastName} seed={c.id} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold text-ink-900">{fullName(c)}</span>
                  {c.activeVisit && <span className="size-2 shrink-0 rounded-full bg-success-500" />}
                </div>
                <div className="tabular flex items-center gap-1 truncate text-[13px] text-ink-500">
                  <Phone className="size-3" />
                  {formatPhone(c.parent.phone)}
                </div>
              </div>
              <ChevronRight className="size-5 text-ink-300" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

function ChildStatusBadge({ item }: { item: ChildListItem }) {
  if (item.activeVisit)
    return (
      <Badge tone="success" dot pulse>
        
        {t('В парке')}
      </Badge>
    )
  if (item.visitsCount === 0) return <Badge tone="sun">{t('Новый')}</Badge>
  return <Badge tone="neutral">{t('Не в парке')}</Badge>
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-cream-200">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className={cn('flex items-center gap-3 px-5 py-3.5')}>
          <Skeleton className="size-11 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="hidden h-3.5 w-32 md:block" />
          <Skeleton className="hidden h-6 w-20 rounded-full md:block" />
        </div>
      ))}
    </div>
  )
}
