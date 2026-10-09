import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CircleCheckBig, CircleX, Copy, Dices, Pencil, Plus, ScanSearch, TicketPercent, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { promoCodesApi, type PromoCheck, type PromoInput } from '@/api/admin'
import { AdminHeader, DataTable, EmptyBlock, IconAction, Panel, PastelStat, Pill, StatsRow, useAdminMutation, type Column } from '@/components/admin/AdminKit'
import { Button } from '@/components/ui/Button'
import { Input, NumberInput } from '@/components/ui/Field'
import { ConfirmModal, Modal, Switch } from '@/components/ui/Overlay'
import { useCurrentUser } from '@/features/auth/AuthProvider'
import { cn, formatShortDate } from '@/lib/format'
import { toIsoDate } from '@/lib/schedule'
import type { PromoCode } from '@/types'
import { DiscountFields, discountValue } from './DiscountsPage'
import { t } from '@/i18n'

const KEY = ['admin', 'promocodes']

const randomCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return 'SKY' + Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
}

export function PromoCodesPage() {
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: promoCodesApi.list })
  const [editing, setEditing] = useState<PromoCode | 'new'>()
  const [removing, setRemoving] = useState<PromoCode>()

  const toggle = useAdminMutation((p: PromoCode) => promoCodesApi.setStatus(p.id, p.status === 'active' ? 'inactive' : 'active'), { invalidate: [KEY] })
  const remove = useAdminMutation((p: PromoCode) => promoCodesApi.remove(p.id), { invalidate: [KEY], success: t('Промокод удалён') })

  const columns: Column<PromoCode>[] = [
    {
      key: 'code',
      header: t('Код'),
      cell: (p) => (
        <button
          onClick={(e) => {
            e.stopPropagation()
            navigator.clipboard?.writeText(p.code)
            toast.success(t('Скопировано: {0}', p.code))
          }}
          className="group inline-flex items-center gap-1.5 rounded-xl bg-accent-50 px-2.5 py-1 font-mono text-[13px] font-bold tracking-wider text-accent-700 ring-1 ring-accent-100"
          title={t('Скопировать')}
        >
          {p.code}
          <Copy className="size-3.5 text-accent-400 group-hover:text-accent-700" />
        </button>
      ),
    },
    { key: 'value', header: t('Скидка'), cell: (p) => <span className="tabular font-extrabold text-ink-900">{discountValue(p.kind, p.value)}</span> },
    {
      key: 'period',
      header: t('Период'),
      cell: (p) => (
        <span className="tabular text-ink-700">
          {formatShortDate(p.dateFrom)} — {formatShortDate(p.dateTo)}
        </span>
      ),
    },
    {
      key: 'usage',
      header: t('Использования'),
      cell: (p) => {
        const pct = Math.min(100, (p.usedCount / p.usageLimit) * 100)
        return (
          <div className="w-36">
            <div className="tabular mb-1 flex justify-between text-xs">
              <span className="font-bold text-ink-900">{p.usedCount}</span>
              <span className="text-ink-500">{t('из ')} {p.usageLimit}</span>
            </div>
            <div className="h-1.5 rounded-full bg-cream-200">
              <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-danger-500' : 'bg-accent-500')} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      },
    },
    {
      key: 'per',
      header: t('На родителя'),
      align: 'center',
      cell: (p) => (
        <Pill tone="peri">
          <Users />
          {p.perParentLimit}
        </Pill>
      ),
    },
    {
      key: 'status',
      header: t('Активен'),
      align: 'center',
      cell: (p) => (
        <div onClick={(e) => e.stopPropagation()} className="inline-flex">
          <Switch checked={p.status === 'active'} onChange={() => toggle.mutate(p)} />
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (p) => (
        <div className="flex justify-end gap-0.5">
          <IconAction label={t('Редактировать')} onClick={() => setEditing(p)}>
            <Pencil />
          </IconAction>
          <IconAction label={t('Удалить')} onClick={() => setRemoving(p)} danger>
            <Trash2 />
          </IconAction>
        </div>
      ),
    },
  ]

  return (
    <div className="animate-slide-up">
      <AdminHeader
        title={t('Промокоды')}
        description={t('Коды со скидкой, лимитами использования и сроком действия')}
        actions={
          <Button leftIcon={<Plus />} onClick={() => setEditing('new')}>
            
            {t('Новый промокод')}
          </Button>
        }
      />

      <StatsRow>
        <PastelStat tone="butter" icon={<TicketPercent />} label={t('Всего промокодов')} value={data?.length} />
        <PastelStat tone="olive" icon={<CircleCheckBig />} label={t('Активных')} value={data?.filter((p) => p.status === 'active').length} />
        <PastelStat tone="blush" icon={<Users />} label={t('Использований')} value={data?.reduce((s, p) => s + p.usedCount, 0)} />
        <PastelStat tone="peri" icon={<CircleX />} label={t('Исчерпано лимитов')} value={data?.filter((p) => p.usedCount >= p.usageLimit).length} />
      </StatsRow>

      <PromoChecker />

      <Panel>
        <DataTable
          columns={columns}
          rows={data}
          loading={isLoading}
          rowKey={(p) => p.id}
          onRowClick={(p) => setEditing(p)}
          empty={<EmptyBlock icon={<TicketPercent />} title={t('Промокодов пока нет')} action={<Button onClick={() => setEditing('new')}>{t('Создать промокод')}</Button>} />}
        />
      </Panel>

      {editing && <PromoForm promo={editing === 'new' ? undefined : editing} onClose={() => setEditing(undefined)} />}
      <ConfirmModal
        open={Boolean(removing)}
        onClose={() => setRemoving(undefined)}
        title={t('Удалить промокод?')}
        description={removing && t('Промокод {0} перестанет работать.', removing.code)}
        confirmLabel={t('Удалить')}
        danger
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing, { onSuccess: () => setRemoving(undefined) })}
      />
    </div>
  )
}

function PromoChecker() {
  const [code, setCode] = useState('')
  const [result, setResult] = useState<PromoCheck>()
  const [loading, setLoading] = useState(false)
  const check = async () => {
    if (!code.trim()) return
    setLoading(true)
    setResult(await promoCodesApi.check(code))
    setLoading(false)
  }
  return (
    <section className="glass mb-5 flex flex-col gap-3 rounded-3xl p-4 sm:flex-row sm:items-center sm:p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-accent-50 text-accent-600 ring-1 ring-accent-100">
          <ScanSearch className="size-5" />
        </span>
        <div>
          <div className="font-extrabold text-ink-900">{t('Проверка промокода')}</div>
          <div className="text-xs font-medium text-mist-500">{t('Срок, статус и лимит использований')}</div>
        </div>
      </div>
      <div className="flex flex-1 gap-2 sm:ml-auto sm:max-w-md">
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase())
            setResult(undefined)
          }}
          onKeyDown={(e) => e.key === 'Enter' && check()}
          placeholder={t('Введите код')}
          className="h-11 min-w-0 flex-1 rounded-full bg-white/80 px-4 font-mono text-sm font-bold tracking-wider text-ink-900 ring-1 ring-mist-200 placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-mist-400 focus:ring-2 focus:ring-accent-400 focus:outline-none"
        />
        <Button className="rounded-full" onClick={check} loading={loading}>
          
          {t('Проверить')}
        </Button>
      </div>
      {result && (
        <div
          className={cn(
            'flex animate-pop-in items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-bold sm:ml-2',
            result.valid ? 'bg-mint-50 text-mint-600 ring-1 ring-mint-100' : 'bg-rose-50 text-rose-500 ring-1 ring-rose-100',
          )}
        >
          {result.valid ? <CircleCheckBig className="size-4" /> : <CircleX className="size-4" />}
          {result.valid ? t('Действует: {0}', discountValue(result.promo.kind, result.promo.value)) : result.reason}
        </div>
      )}
    </section>
  )
}

function PromoForm({ promo, onClose }: { promo?: PromoCode; onClose: () => void }) {
  const user = useCurrentUser()
  const today = toIsoDate(new Date())
  const [form, setForm] = useState<PromoInput>(
    promo
      ? {
          code: promo.code,
          kind: promo.kind,
          value: promo.value,
          dateFrom: promo.dateFrom,
          dateTo: promo.dateTo,
          usageLimit: promo.usageLimit,
          perParentLimit: promo.perParentLimit,
          status: promo.status,
        }
      : { code: randomCode(), kind: 'percent', value: 10, dateFrom: today, dateTo: today, usageLimit: 100, perParentLimit: 1, status: 'active' },
  )
  const set = <K extends keyof PromoInput>(k: K, v: PromoInput[K]) => setForm((f) => ({ ...f, [k]: v }))
  const save = useAdminMutation((f: PromoInput) => promoCodesApi.save(f, user.id, promo?.id), {
    invalidate: [KEY],
    success: promo ? t('Промокод сохранён') : t('Промокод создан'),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={promo ? t('Редактировать промокод') : t('Новый промокод')}
      description={promo ? t('Использован {0} раз', promo.usedCount) : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            
            {t('Отмена')}
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate(form, { onSuccess: onClose })}>
            
            {t('Сохранить')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={t('Код')}
          required
          value={form.code}
          onChange={(e) => set('code', e.target.value.toUpperCase())}
          className="font-mono font-bold tracking-wider"
          containerClassName="sm:col-span-2"
          rightSlot={
            <Button type="button" size="icon-sm" variant="ghost" onClick={() => set('code', randomCode())} aria-label={t('Сгенерировать')} title={t('Сгенерировать')}>
              <Dices />
            </Button>
          }
        />
        <DiscountFields form={form} set={set} />
        <NumberInput label={t('Лимит использований')} min={1} value={form.usageLimit} onValueChange={(v) => set('usageLimit', v)} />
        <NumberInput label={t('Макс. на одного родителя')} min={1} value={form.perParentLimit} onValueChange={(v) => set('perParentLimit', v)} />
        <Switch checked={form.status === 'active'} onChange={(v) => set('status', v ? 'active' : 'inactive')} label={t('Промокод активен')} />
      </div>
    </Modal>
  )
}
