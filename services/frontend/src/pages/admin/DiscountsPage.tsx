import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BadgePercent, CalendarRange, Pencil, Percent, Plus, Trash2, Wallet } from 'lucide-react'
import { discountsApi, type DiscountInput } from '@/api/admin'
import { AdminHeader, EmptyBlock, IconAction, Panel, PastelStat, Pill, StatsRow, useAdminMutation } from '@/components/admin/AdminKit'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Display'
import { Input, Textarea } from '@/components/ui/Field'
import { ConfirmModal, Modal, Segmented, Switch } from '@/components/ui/Overlay'
import { useCurrentUser } from '@/features/auth/AuthProvider'
import { cn, formatMoney, formatShortDate } from '@/lib/format'
import { toIsoDate } from '@/lib/schedule'
import type { Discount, DiscountKind } from '@/types'
import { DatePicker } from '@/components/ui/DatePicker'

const KEY = ['admin', 'discounts']

export const discountValue = (kind: DiscountKind, value: number) => (kind === 'percent' ? `${value}%` : formatMoney(value))

const isCurrent = (d: { dateFrom: string; dateTo: string }) => {
  const t = toIsoDate(new Date())
  return d.dateFrom <= t && t <= d.dateTo
}

export function DiscountsPage() {
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: discountsApi.list })
  const [editing, setEditing] = useState<Discount | 'new'>()
  const [removing, setRemoving] = useState<Discount>()

  const toggle = useAdminMutation((d: Discount) => discountsApi.setStatus(d.id, d.status === 'active' ? 'inactive' : 'active'), { invalidate: [KEY] })
  const remove = useAdminMutation((d: Discount) => discountsApi.remove(d.id), { invalidate: [KEY], success: 'Скидка удалена' })

  return (
    <div className="animate-slide-up">
      <AdminHeader
        title="Скидки"
        description="Скидки в процентах или фиксированной суммой с периодом действия"
        actions={
          <Button leftIcon={<Plus />} onClick={() => setEditing('new')}>
            Новая скидка
          </Button>
        }
      />

      <StatsRow>
        <PastelStat tone="butter" icon={<BadgePercent />} label="Всего скидок" value={data?.length} />
        <PastelStat tone="olive" icon={<BadgePercent />} label="Активных" value={data?.filter((d) => d.status === 'active').length} />
        <PastelStat tone="blush" icon={<Percent />} label="Процентных" value={data?.filter((d) => d.kind === 'percent').length} />
        <PastelStat tone="peri" icon={<Wallet />} label="Фиксированных" value={data?.filter((d) => d.kind === 'fixed').length} />
      </StatsRow>

      <Panel>
        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[210px] rounded-3xl bg-cream-200" />
            ))}
          </div>
        ) : !data?.length ? (
          <EmptyBlock icon={<BadgePercent />} title="Скидок пока нет" action={<Button onClick={() => setEditing('new')}>Создать скидку</Button>} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {data.map((d) => {
              const active = d.status === 'active'
              const valueTone = !active ? 'text-mist-400' : d.kind === 'percent' ? 'text-accent-600' : 'text-rose-500'
              return (
                <article key={d.id} className={cn('glass flex flex-col rounded-3xl p-5 transition duration-300 hover:-translate-y-0.5', !active && 'opacity-75')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className={cn('tabular text-[36px] leading-none font-extrabold tracking-tight', valueTone)}>{discountValue(d.kind, d.value)}</div>
                    <div className="flex gap-0.5">
                      <IconAction label="Редактировать" onClick={() => setEditing(d)}>
                        <Pencil />
                      </IconAction>
                      <IconAction label="Удалить" onClick={() => setRemoving(d)} danger>
                        <Trash2 />
                      </IconAction>
                    </div>
                  </div>
                  <h3 className="mt-3 text-[17px] font-extrabold text-ink-900">{d.name}</h3>
                  <p className="mt-1 text-[13px] leading-snug text-ink-900/70">{d.conditions || 'Без дополнительных условий'}</p>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                    <Pill tone={active ? 'dark' : 'muted'}>
                      <CalendarRange />
                      {formatShortDate(d.dateFrom)} — {formatShortDate(d.dateTo)}
                    </Pill>
                    <div className="flex items-center gap-2">
                      {active && !isCurrent(d) && <span className="text-[11px] font-bold text-ink-900/60">вне периода</span>}
                      <Switch checked={active} onChange={() => toggle.mutate(d)} />
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </Panel>

      {editing && <DiscountForm discount={editing === 'new' ? undefined : editing} onClose={() => setEditing(undefined)} />}
      <ConfirmModal
        open={Boolean(removing)}
        onClose={() => setRemoving(undefined)}
        title="Удалить скидку?"
        description={removing && `«${removing.name}» будет удалена без возможности восстановления.`}
        confirmLabel="Удалить"
        danger
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing, { onSuccess: () => setRemoving(undefined) })}
      />
    </div>
  )
}

/** Общие поля для скидок и промокодов: тип, размер, период. */
export function DiscountFields<T extends { kind: DiscountKind; value: number; dateFrom: string; dateTo: string }>({
  form,
  set,
}: {
  form: T
  set: <K extends keyof T>(k: K, v: T[K]) => void
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink-700">Тип скидки</span>
        <Segmented<DiscountKind>
          value={form.kind}
          onChange={(k) => set('kind', k as T['kind'])}
          className="h-11 w-full [&>button]:h-9"
          options={[
            { value: 'percent', label: 'Процент' },
            { value: 'fixed', label: 'Сумма' },
          ]}
        />
      </div>
      <Input
        label={form.kind === 'percent' ? 'Размер, %' : 'Размер, сум'}
        required
        type="number"
        min={1}
        max={form.kind === 'percent' ? 100 : undefined}
        step={form.kind === 'percent' ? 1 : 1000}
        value={form.value || ''}
        onChange={(e) => set('value', Number(e.target.value) as T['value'])}
      />
      <DatePicker label="Действует с" required value={form.dateFrom} onChange={(v) => set('dateFrom', v as T['dateFrom'])} />
      <DatePicker label="Действует по" required min={form.dateFrom} value={form.dateTo} onChange={(v) => set('dateTo', v as T['dateTo'])} />
    </>
  )
}

function DiscountForm({ discount, onClose }: { discount?: Discount; onClose: () => void }) {
  const user = useCurrentUser()
  const today = toIsoDate(new Date())
  const [form, setForm] = useState<DiscountInput>(
    discount
      ? { name: discount.name, kind: discount.kind, value: discount.value, dateFrom: discount.dateFrom, dateTo: discount.dateTo, conditions: discount.conditions, status: discount.status }
      : { name: '', kind: 'percent', value: 10, dateFrom: today, dateTo: today, conditions: '', status: 'active' },
  )
  const set = <K extends keyof DiscountInput>(k: K, v: DiscountInput[K]) => setForm((f) => ({ ...f, [k]: v }))
  const save = useAdminMutation((f: DiscountInput) => discountsApi.save(f, user.id, discount?.id), {
    invalidate: [KEY],
    success: discount ? 'Скидка сохранена' : 'Скидка создана',
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={discount ? 'Редактировать скидку' : 'Новая скидка'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate(form, { onSuccess: onClose })}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Название" required value={form.name} onChange={(e) => set('name', e.target.value)} containerClassName="sm:col-span-2" autoFocus />
        <DiscountFields form={form} set={set} />
        <Textarea
          label="Условия применения"
          containerClassName="sm:col-span-2"
          value={form.conditions}
          onChange={(e) => set('conditions', e.target.value)}
          placeholder="Например: будние дни, начало посещения до 14:00"
        />
        <Switch checked={form.status === 'active'} onChange={(v) => set('status', v ? 'active' : 'inactive')} label="Скидка активна" />
      </div>
    </Modal>
  )
}
