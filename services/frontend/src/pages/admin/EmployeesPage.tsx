import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Ban, History, Pencil, Plus, Search, ShieldCheck, UserCheck, UserCog, UsersRound } from 'lucide-react'
import { employeesApi, type EmployeeInput } from '@/api/admin'
import { AdminHeader, DataTable, EmptyBlock, IconAction, Panel, PastelStat, Pill, StatsRow, useAdminMutation, type Column } from '@/components/admin/AdminKit'
import { Button } from '@/components/ui/Button'
import { Avatar, Skeleton } from '@/components/ui/Display'
import { Input, PhoneInput, NumberInput } from '@/components/ui/Field'
import { OptionDot, Select } from '@/components/ui/Select'
import { ConfirmModal, Modal, Segmented } from '@/components/ui/Overlay'
import { cn, formatDate, formatPhone, formatShortDate, formatTime, fullName, phoneLocalPart, plural } from '@/lib/format'
import { roleLabel } from '@/lib/statuses'
import type { Employee, Role } from '@/types'
import { t } from '@/i18n'

const KEY = ['admin', 'employees']
type Filter = 'all' | Role | 'blocked'

const emptyForm: EmployeeInput = { firstName: '', lastName: '', phone: '', position: '', role: 'staff', experienceYears: 0 }
const roleTone = { admin: 'peri', staff: 'butter', nanny: 'blush' } as const
const roleDot: Record<Role, string> = { admin: 'bg-grape-500', staff: 'bg-accent-500', nanny: 'bg-rose-500' }

export function EmployeesPage() {
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: employeesApi.list })
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Employee | 'new'>()
  const [blocking, setBlocking] = useState<Employee>()
  const [historyOf, setHistoryOf] = useState<Employee>()

  const setStatus = useAdminMutation((e: Employee) => employeesApi.setStatus(e.id, e.status === 'active' ? 'blocked' : 'active'), {
    invalidate: [KEY, ['admin', 'nannies']],
    success: (e) => (e.status === 'active' ? t('Сотрудник заблокирован') : t('Сотрудник разблокирован')),
  })

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    const digits = s.replace(/\D/g, '')
    return data
      ?.filter((e) => (filter === 'all' ? true : filter === 'blocked' ? e.status === 'blocked' : e.role === filter))
      .filter((e) => !s || `${e.firstName} ${e.lastName} ${e.position}`.toLowerCase().includes(s) || (digits.length >= 3 && e.phone.includes(digits)))
  }, [data, filter, q])

  const count = (f: Filter) => data?.filter((e) => (f === 'all' ? true : f === 'blocked' ? e.status === 'blocked' : e.role === f)).length

  const columns: Column<Employee>[] = [
    {
      key: 'name',
      header: t('Сотрудник'),
      cell: (e) => (
        <div className="flex items-center gap-3">
          <Avatar src={e.photoUrl} firstName={e.firstName} lastName={e.lastName} seed={e.id} size="sm" />
          <div className="min-w-0">
            <div className={cn('truncate font-bold', e.status === 'blocked' ? 'text-ink-400 line-through' : 'text-ink-900')}>{fullName(e)}</div>
            <div className="truncate text-xs text-ink-500">{e.position}</div>
          </div>
        </div>
      ),
    },
    { key: 'phone', header: t('Телефон'), cell: (e) => <span className="tabular text-ink-700">{formatPhone(e.phone)}</span> },
    { key: 'role', header: t('Роль'), cell: (e) => <Pill tone={roleTone[e.role]}>{roleLabel[e.role]}</Pill> },
    {
      key: 'exp',
      header: t('Опыт'),
      cell: (e) => (
        <span className="tabular font-semibold text-ink-800">
          {e.experienceYears} {plural(e.experienceYears, [t('год'), t('года'), t('лет')])}
        </span>
      ),
    },
    { key: 'created', header: t('Создан'), cell: (e) => <span className="tabular text-ink-600">{formatShortDate(e.createdAt)}</span> },
    {
      key: 'status',
      header: t('Статус'),
      cell: (e) => (e.status === 'active' ? <Pill tone="olive">{t('Активен')}</Pill> : <Pill tone="danger">{t('Заблокирован')}</Pill>),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (e) => (
        <div className="flex justify-end gap-0.5">
          <IconAction label={t('История работы')} onClick={() => setHistoryOf(e)}>
            <History />
          </IconAction>
          <IconAction label={t('Редактировать')} onClick={() => setEditing(e)}>
            <Pencil />
          </IconAction>
          <IconAction label={e.status === 'active' ? t('Заблокировать') : t('Разблокировать')} onClick={() => setBlocking(e)} danger={e.status === 'active'}>
            {e.status === 'active' ? <Ban /> : <UserCheck />}
          </IconAction>
        </div>
      ),
    },
  ]

  return (
    <div className="animate-slide-up">
      <AdminHeader
        title={t('Сотрудники')}
        description={t('Учётные записи, роли и история работы')}
        actions={
          <Button leftIcon={<Plus />} onClick={() => setEditing('new')}>
            
            {t('Новый сотрудник')}
          </Button>
        }
      />

      <StatsRow>
        <PastelStat tone="butter" icon={<UsersRound />} label={t('Всего сотрудников')} value={count('all')} />
        <PastelStat tone="olive" icon={<UserCog />} label={t('Сотрудников ресепшн')} value={count('staff')} />
        <PastelStat tone="blush" icon={<UsersRound />} label={t('Нянь в команде')} value={count('nanny')} />
        <PastelStat tone="peri" icon={<ShieldCheck />} label={t('Администраторов')} value={count('admin')} />
      </StatsRow>

      <Panel
        toolbar={
          <>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Имя, должность или телефон')} leftIcon={<Search />} containerClassName="flex-1 md:max-w-sm" />
            <Segmented
              value={filter}
              onChange={setFilter}
              size="sm"
              className="bg-cream-200/70 md:ml-auto"
              options={[
                { value: 'all', label: t('Все') },
                { value: 'staff', label: t('Ресепшн') },
                { value: 'nanny', label: t('Няни') },
                { value: 'admin', label: t('Админы') },
                { value: 'blocked', label: t('Заблок.') },
              ]}
            />
          </>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          loading={isLoading}
          rowKey={(e) => e.id}
          onRowClick={(e) => setEditing(e)}
          empty={<EmptyBlock icon={<Search />} title={t('Никого не найдено')} text={t('Измените фильтр или строку поиска.')} />}
        />
      </Panel>

      {editing && <EmployeeForm employee={editing === 'new' ? undefined : editing} onClose={() => setEditing(undefined)} />}

      <ConfirmModal
        open={Boolean(blocking)}
        onClose={() => setBlocking(undefined)}
        title={blocking?.status === 'active' ? t('Заблокировать сотрудника?') : t('Разблокировать сотрудника?')}
        description={
          blocking?.status === 'active'
            ? t('{0} не сможет войти в систему.{1}', blocking && fullName(blocking), blocking?.role === 'nanny' ? t(' Няня станет недоступна для назначения.') : '')
            : t('{0} снова сможет войти в систему.', blocking && fullName(blocking))
        }
        confirmLabel={blocking?.status === 'active' ? t('Заблокировать') : t('Разблокировать')}
        danger={blocking?.status === 'active'}
        loading={setStatus.isPending}
        onConfirm={() => blocking && setStatus.mutate(blocking, { onSuccess: () => setBlocking(undefined) })}
      />

      <HistoryModal employee={historyOf} onClose={() => setHistoryOf(undefined)} />
    </div>
  )
}

function EmployeeForm({ employee, onClose }: { employee?: Employee; onClose: () => void }) {
  const [form, setForm] = useState<EmployeeInput>(
    employee
      ? { firstName: employee.firstName, lastName: employee.lastName, phone: phoneLocalPart(employee.phone), position: employee.position, role: employee.role, experienceYears: employee.experienceYears }
      : emptyForm,
  )
  const save = useAdminMutation((f: EmployeeInput) => (employee ? employeesApi.update(employee.id, f) : employeesApi.create(f)), {
    invalidate: [KEY, ['admin', 'nannies'], ['nannies']],
    success: employee ? t('Изменения сохранены') : t('Сотрудник создан'),
  })
  const set = <K extends keyof EmployeeInput>(k: K, v: EmployeeInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <Modal
      open
      onClose={onClose}
      title={employee ? t('Редактировать сотрудника') : t('Новый сотрудник')}
      description={employee ? t('Создан {0}', formatDate(employee.createdAt)) : t('Временный пароль для входа: 123456')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            
            {t('Отмена')}
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate(form, { onSuccess: onClose })}>
            {employee ? t('Сохранить') : t('Создать')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={t('Имя')} required value={form.firstName} onChange={(e) => set('firstName', e.target.value)} autoFocus />
        <Input label={t('Фамилия')} required value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
        <PhoneInput label={t('Телефон')} required value={form.phone} onChange={(v) => set('phone', v)} />
        <Input label={t('Должность')} value={form.position} onChange={(e) => set('position', e.target.value)} placeholder={t('Например, администратор ресепшн')} />
        <Select
          label={t('Роль')}
          value={form.role}
          onChange={(e) => set('role', e.target.value as Role)}
          options={(['staff', 'nanny', 'admin'] as Role[]).map((r) => ({ value: r, label: roleLabel[r], icon: <OptionDot className={roleDot[r]} /> }))}
          hint={form.role === 'nanny' ? t('Профиль няни создастся автоматически') : undefined}
        />
        <NumberInput label={t('Опыт работы, лет')} min={0} max={60} value={form.experienceYears} onValueChange={(v) => set('experienceYears', v)} />
      </div>
    </Modal>
  )
}

function HistoryModal({ employee, onClose }: { employee?: Employee; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'employee-history', employee?.id],
    queryFn: () => employeesApi.history(employee!.id),
    enabled: Boolean(employee),
  })
  return (
    <Modal open={Boolean(employee)} onClose={onClose} title={t('История работы')} description={employee && `${fullName(employee)} · ${roleLabel[employee.role]}`}>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-11 rounded-xl" />
          ))}
        </div>
      ) : !data?.length ? (
        <p className="rounded-2xl bg-cream-100 p-6 text-center text-sm text-ink-500">{t('Действий пока нет')}</p>
      ) : (
        <ol className="relative space-y-1 border-l border-cream-300 pl-4">
          {data.map((h) => (
            <li key={h.id} className="relative py-1.5">
              <span className="absolute top-3.5 -left-[21px] size-2.5 rounded-full bg-accent-500 ring-4 ring-white" />
              <div className="text-sm">
                <span className="font-bold text-ink-900">{h.action}</span> <span className="text-ink-600">· {h.subject}</span>
              </div>
              <div className="tabular text-xs text-ink-400">
                {formatShortDate(h.at)}  {t(' в ')} {formatTime(h.at)}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  )
}
