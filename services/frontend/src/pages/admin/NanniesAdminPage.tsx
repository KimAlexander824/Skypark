import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Baby, Clock3, HeartHandshake, History, Pencil, Plus, Power, Timer, UsersRound } from 'lucide-react'
import { nanniesAdminApi, type NannyAdminItem, type NannyInput } from '@/api/admin'
import { AdminHeader, EmptyBlock, IconAction, Panel, PastelStat, Pill, StatsRow, useAdminMutation, type PastelTone } from '@/components/admin/AdminKit'
import { ImagePicker } from '@/components/admin/ImagePicker'
import { Button } from '@/components/ui/Button'
import { Avatar, Skeleton } from '@/components/ui/Display'
import { Input, PhoneInput, NumberInput } from '@/components/ui/Field'
import { ConfirmModal, Modal, Segmented } from '@/components/ui/Overlay'
import { cn, formatDate, formatDuration, formatPhone, formatShortDate, formatTime, fullName, phoneLocalPart, plural } from '@/lib/format'
import { nannyStatus, visitStatus } from '@/lib/statuses'
import { visitTotalMinutes } from '@/lib/time'
import type { NannyStatus } from '@/types'
import { TimePicker } from '@/components/ui/DatePicker'

const KEY = ['admin', 'nannies']
const statusTone: Record<NannyStatus, PastelTone | 'muted'> = { free: 'olive', busy: 'butter', break: 'peri', off: 'muted' }
type Filter = 'all' | 'working' | 'off'

export function NanniesAdminPage() {
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: nanniesAdminApi.list, refetchInterval: 30_000 })
  const [filter, setFilter] = useState<Filter>('all')
  const [editing, setEditing] = useState<NannyAdminItem | 'new'>()
  const [toggling, setToggling] = useState<NannyAdminItem>()
  const [historyOf, setHistoryOf] = useState<NannyAdminItem>()

  const toggle = useAdminMutation((n: NannyAdminItem) => nanniesAdminApi.setEnabled(n.id, n.status === 'off'), {
    invalidate: [KEY, ['nannies']],
    success: (n) => (n.status === 'off' ? 'Няня снова доступна' : 'Няня отключена'),
  })

  const rows = data?.filter((n) => (filter === 'all' ? true : filter === 'off' ? n.status === 'off' : n.status !== 'off'))
  const totalHours = data?.reduce((s, n) => s + n.hoursWorked, 0)

  return (
    <div className="animate-slide-up">
      <AdminHeader
        title="Няни"
        description="Профили, загрузка и история работы нянь"
        actions={
          <Button leftIcon={<Plus />} onClick={() => setEditing('new')}>
            Добавить няню
          </Button>
        }
      />

      <StatsRow>
        <PastelStat tone="butter" icon={<HeartHandshake />} label="Всего нянь" value={data?.length} />
        <PastelStat tone="olive" icon={<UsersRound />} label="Сейчас работают" value={data?.filter((n) => n.status !== 'off').length} />
        <PastelStat tone="blush" icon={<Baby />} label="Детей на посещении" value={data?.reduce((s, n) => s + n.activeNow, 0)} />
        <PastelStat tone="peri" icon={<Clock3 />} label="Отработано всего" value={totalHours !== undefined ? formatDuration(totalHours * 60) : undefined} />
      </StatsRow>

      <Panel
        toolbar={
          <Segmented
            value={filter}
            onChange={setFilter}
            size="sm"
            className="bg-cream-200/70"
            options={[
              { value: 'all', label: 'Все' },
              { value: 'working', label: 'Работают' },
              { value: 'off', label: 'Отключены' },
            ]}
          />
        }
      >
        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[236px] rounded-3xl bg-cream-200" />
            ))}
          </div>
        ) : !rows?.length ? (
          <EmptyBlock icon={<HeartHandshake />} title="Нянь в этой категории нет" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {rows.map((n) => (
              <NannyCard key={n.id} nanny={n} onEdit={() => setEditing(n)} onHistory={() => setHistoryOf(n)} onToggle={() => setToggling(n)} />
            ))}
          </div>
        )}
      </Panel>

      {editing && <NannyForm nanny={editing === 'new' ? undefined : editing} onClose={() => setEditing(undefined)} />}
      <NannyHistory nanny={historyOf} onClose={() => setHistoryOf(undefined)} />
      <ConfirmModal
        open={Boolean(toggling)}
        onClose={() => setToggling(undefined)}
        title={toggling?.status === 'off' ? 'Включить няню?' : 'Отключить няню?'}
        description={
          toggling?.status === 'off'
            ? 'Няня снова появится в списке при оформлении посещения.'
            : 'Няня перестанет отображаться при выборе. Детей на посещении сначала нужно завершить.'
        }
        confirmLabel={toggling?.status === 'off' ? 'Включить' : 'Отключить'}
        danger={toggling?.status !== 'off'}
        loading={toggle.isPending}
        onConfirm={() => toggling && toggle.mutate(toggling, { onSettled: () => setToggling(undefined) })}
      />
    </div>
  )
}

function NannyCard({ nanny, onEdit, onHistory, onToggle }: { nanny: NannyAdminItem; onEdit: () => void; onHistory: () => void; onToggle: () => void }) {
  const st = nannyStatus[nanny.status]
  const off = nanny.status === 'off'
  return (
    <article className={cn('flex flex-col rounded-3xl bg-white/60 p-4 ring-1 ring-white transition duration-300 hover:-translate-y-0.5 hover:bg-white/80', off && 'opacity-70')}>
      <div className="flex items-start gap-3">
        <Avatar src={nanny.photoUrl} firstName={nanny.firstName} lastName={nanny.lastName} seed={nanny.id} size="lg" className={cn(off && 'grayscale')} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-extrabold text-ink-900">{fullName(nanny)}</div>
          <div className="tabular text-xs text-ink-500">{formatPhone(nanny.phone)}</div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Pill tone={statusTone[nanny.status]}>{st.label}</Pill>
            {nanny.employeeStatus === 'blocked' && <Pill tone="danger">Заблокирована</Pill>}
          </div>
        </div>
        <div className="flex gap-0.5">
          <IconAction label="История посещений" onClick={onHistory}>
            <History />
          </IconAction>
          <IconAction label="Редактировать" onClick={onEdit}>
            <Pencil />
          </IconAction>
          <IconAction label={off ? 'Включить' : 'Отключить'} onClick={onToggle} danger={!off}>
            <Power />
          </IconAction>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        {[
          ['Детей', nanny.servedChildren],
          ['Посещений', nanny.visitsCount],
          ['Отработано', `${Math.round(nanny.hoursWorked)} ч`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-mist-100/80 p-2.5">
            <dt className="text-[11px] font-semibold text-ink-500">{k}</dt>
            <dd className="tabular truncate text-[15px] font-extrabold text-ink-900">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="font-semibold text-ink-500">Загрузка сейчас</span>
          <span className="tabular font-bold text-ink-900">
            {nanny.activeNow} из {nanny.maxChildren}
          </span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: nanny.maxChildren }).map((_, i) => (
            <span key={i} className={cn('h-1.5 flex-1 rounded-full', i < nanny.activeNow ? 'bg-accent-500' : 'bg-mist-200')} />
          ))}
        </div>
        <div className="flex justify-between pt-1 text-ink-500">
          <span className="flex items-center gap-1">
            <Timer className="size-3.5" />
            <span className="tabular">{nanny.workHours}</span>
          </span>
          <span>
            Опыт {nanny.experienceYears} {plural(nanny.experienceYears, ['год', 'года', 'лет'])} · с {formatShortDate(nanny.startedAt)}
          </span>
        </div>
      </div>
    </article>
  )
}

function NannyForm({ nanny, onClose }: { nanny?: NannyAdminItem; onClose: () => void }) {
  const [form, setForm] = useState<NannyInput>(
    nanny
      ? {
          firstName: nanny.firstName,
          lastName: nanny.lastName,
          phone: phoneLocalPart(nanny.phone),
          experienceYears: nanny.experienceYears,
          workHours: nanny.workHours,
          maxChildren: nanny.maxChildren,
          photoUrl: nanny.photoUrl,
        }
      : { firstName: '', lastName: '', phone: '', experienceYears: 0, workHours: '10:00 — 18:00', maxChildren: 4 },
  )
  const [from, to] = form.workHours.split(' — ')
  const save = useAdminMutation(async (f: NannyInput) => { if (nanny) await nanniesAdminApi.update(nanny.id, f); else await nanniesAdminApi.create(f) }, {
    invalidate: [KEY, ['nannies'], ['admin', 'employees']],
    success: nanny ? 'Изменения сохранены' : 'Няня добавлена',
  })
  const set = <K extends keyof NannyInput>(k: K, v: NannyInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <Modal
      open
      onClose={onClose}
      title={nanny ? 'Редактировать няню' : 'Новая няня'}
      description={nanny ? `Работает с ${formatDate(nanny.startedAt)}` : 'Будет создана учётная запись с ролью «Няня» (пароль 123456)'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate(form, { onSuccess: onClose })}>
            {nanny ? 'Сохранить' : 'Добавить'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        <ImagePicker label="Фото" shape="square" value={form.photoUrl} onChange={(v) => set('photoUrl', v)} maxSide={480} />
        <div className="grid flex-1 gap-4 sm:grid-cols-2">
          <Input label="Имя" required value={form.firstName} onChange={(e) => set('firstName', e.target.value)} autoFocus />
          <Input label="Фамилия" required value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
          <PhoneInput label="Телефон" required value={form.phone} onChange={(v) => set('phone', v)} containerClassName="sm:col-span-2" />
        </div>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <NumberInput label="Опыт, лет" min={0} value={form.experienceYears} onValueChange={(v) => set('experienceYears', v)} />
        <NumberInput label="Макс. детей" min={1} max={10} value={form.maxChildren} onValueChange={(v) => set('maxChildren', v)} />
        <TimePicker label="Начало смены" value={from} onChange={(v) => set('workHours', `${v} — ${to}`)} />
        <TimePicker label="Конец смены" value={to} onChange={(v) => set('workHours', `${from} — ${v}`)} />
      </div>
    </Modal>
  )
}

function NannyHistory({ nanny, onClose }: { nanny?: NannyAdminItem; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'nanny-visits', nanny?.id], queryFn: () => nanniesAdminApi.visits(nanny!.id), enabled: Boolean(nanny) })
  return (
    <Modal open={Boolean(nanny)} onClose={onClose} size="lg" title="История посещений" description={nanny && `${fullName(nanny)} · последние 40 посещений`}>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-11 rounded-xl" />
          ))}
        </div>
      ) : !data?.length ? (
        <p className="rounded-2xl bg-cream-100 p-6 text-center text-sm text-ink-500">Посещений ещё не было</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-ink-500">
              <th className="pb-2 text-left font-semibold">Ребёнок</th>
              <th className="pb-2 text-left font-semibold">Дата</th>
              <th className="pb-2 text-left font-semibold">Время</th>
              <th className="pb-2 text-right font-semibold">Длительность</th>
              <th className="pb-2 text-right font-semibold">Статус</th>
            </tr>
          </thead>
          <tbody>
            {data.map((v) => (
              <tr key={v.id} className="border-t border-cream-200">
                <td className="py-2 font-bold text-ink-900">{v.child ? fullName(v.child) : '—'}</td>
                <td className="tabular py-2 text-ink-700">{formatShortDate(v.startAt)}</td>
                <td className="tabular py-2 text-ink-600">
                  {formatTime(v.startAt)} — {formatTime(v.endedAt ?? v.endAt)}
                </td>
                <td className="py-2 text-right font-semibold text-ink-800">{formatDuration(visitTotalMinutes(v))}</td>
                <td className="py-2 text-right">
                  <span className="text-xs font-bold text-ink-600">{visitStatus[v.status].label}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  )
}
