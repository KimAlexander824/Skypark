import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BellRing, Clock3, DatabaseZap, Palette, Plus, Save, TimerReset, Undo2, Wallet, X } from 'lucide-react'
import { appSettingsApi } from '@/api/admin'
import { AdminHeader, Panel, SectionTitle, useAdminMutation } from '@/components/admin/AdminKit'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Display'
import { NumberInput } from '@/components/ui/Field'
import { ThemePicker } from '@/components/ui/ThemePicker'
import { ConfirmModal } from '@/components/ui/Overlay'
import { formatDuration, formatMoney } from '@/lib/format'
import type { AppSettings } from '@/types'

const KEY = ['admin', 'settings']

export function SettingsPage() {
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: appSettingsApi.get })
  const [draft, setDraft] = useState<AppSettings>()
  const [resetOpen, setResetOpen] = useState(false)
  useEffect(() => {
    if (data) setDraft(structuredClone(data))
  }, [data])

  const save = useAdminMutation((s: AppSettings) => appSettingsApi.save(s), { invalidate: [KEY, ['settings', 'visits']], success: 'Настройки сохранены' })
  const dirty = Boolean(data && draft && JSON.stringify(data) !== JSON.stringify(draft))

  if (isLoading || !draft)
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-3xl bg-cream-200" />
        <Skeleton className="h-64 rounded-3xl bg-cream-200" />
      </div>
    )

  return (
    <div className="animate-slide-up">
      <AdminHeader
        title="Настройки"
        description="Оформление, тарифы, варианты продолжительности и продления"
        actions={
          <>
            {dirty && (
              <Button variant="ghost" leftIcon={<Undo2 />} onClick={() => setDraft(structuredClone(data))}>
                Отменить
              </Button>
            )}
            <Button leftIcon={<Save />} disabled={!dirty} loading={save.isPending} onClick={() => save.mutate(draft)}>
              Сохранить
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="lg:col-span-2">
          <SectionTitle icon={<Palette />} tone="bg-peri-300" title="Оформление" text="Тема интерфейса сохраняется на этом устройстве и применяется сразу" />
          <ThemePicker />
        </Panel>

        <Panel>
          <SectionTitle icon={<Wallet />} tone="bg-butter-300" title="Стоимость" text="Цена посещения и продления считается от стоимости часа" />
          <NumberInput
            label="Стоимость часа, сум"
            min={0}
            step={1000}
            value={draft.hourlyRate}
            onValueChange={(v) => setDraft({ ...draft, hourlyRate: v })}
          />
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {draft.durations.slice(0, 4).map((m) => (
              <div key={m} className="rounded-2xl bg-mist-100/80 p-3">
                <div className="text-xs font-semibold text-ink-500">{formatDuration(m)}</div>
                <div className="tabular text-sm font-extrabold text-ink-900">{formatMoney(Math.round((draft.hourlyRate * m) / 60))}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <SectionTitle icon={<BellRing />} tone="bg-blush-300" title="Уведомление о продлении" text="Родитель получает предложение продлить посещение в Telegram" />
          <div className="flex items-center gap-3 rounded-2xl bg-mist-100/80 p-4">
            <span className="tabular text-[28px] font-extrabold text-ink-900">{draft.extensionNoticeMin} мин</span>
            <span className="text-sm text-ink-600">до окончания посещения</span>
          </div>
        </Panel>

        <Panel>
          <SectionTitle icon={<Clock3 />} tone="bg-olive-300" title="Продолжительность посещения" text="Варианты, которые сотрудник выбирает при оформлении" />
          <MinutesEditor value={draft.durations} onChange={(v) => setDraft({ ...draft, durations: v })} hourlyRate={draft.hourlyRate} />
        </Panel>

        <Panel>
          <SectionTitle icon={<TimerReset />} tone="bg-peri-300" title="Варианты продления" text="Родитель выбирает их в Telegram-боте" />
          <MinutesEditor value={draft.extensionOptions} onChange={(v) => setDraft({ ...draft, extensionOptions: v })} hourlyRate={draft.hourlyRate} />
        </Panel>

        <Panel className="lg:col-span-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SectionTitle icon={<DatabaseZap />} tone="bg-cream-200" title="Демо-данные" text="Сбросить тестовую базу до исходного состояния (до подключения backend)" className="mb-0 flex-1" />
            <Button variant="secondary" onClick={() => setResetOpen(true)}>
              Сбросить демо-данные
            </Button>
          </div>
        </Panel>
      </div>

      <ConfirmModal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Сбросить демо-данные?"
        description="Все изменения в тестовой базе будут потеряны, страница перезагрузится."
        confirmLabel="Сбросить"
        danger
        onConfirm={appSettingsApi.resetDemo}
      />
    </div>
  )
}

function MinutesEditor({ value, onChange, hourlyRate }: { value: number[]; onChange: (v: number[]) => void; hourlyRate: number }) {
  const [adding, setAdding] = useState('')
  const add = () => {
    const m = Math.round(Number(adding))
    if (m > 0 && m <= 720 && !value.includes(m)) onChange([...value, m].sort((a, b) => a - b))
    setAdding('')
  }
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {value.map((m) => (
          <span key={m} className="inline-flex items-center gap-2 rounded-full bg-accent-50 py-1.5 pr-1.5 pl-3.5 text-[13px] font-bold text-accent-700 ring-1 ring-accent-100">
            {formatDuration(m)}
            <span className="tabular text-accent-400">{formatMoney(Math.round((hourlyRate * m) / 60))}</span>
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== m))}
              className="flex size-6 items-center justify-center rounded-full text-accent-400 transition hover:bg-accent-100 hover:text-accent-700"
              aria-label={`Убрать ${formatDuration(m)}`}
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          type="number"
          min={5}
          step={15}
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Минут, например 90"
          className="h-10 w-48 rounded-full bg-cream-50 px-4 text-sm ring-1 ring-cream-200 focus:ring-2 focus:ring-ink-900 focus:outline-none"
        />
        <Button size="sm" variant="secondary" className="h-10 rounded-full" leftIcon={<Plus />} onClick={add}>
          Добавить
        </Button>
      </div>
    </div>
  )
}
