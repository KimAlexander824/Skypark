import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, CalendarOff, Clock3, Plus, Save, Trash2, Undo2 } from 'lucide-react'
import { scheduleApi } from '@/api/admin'
import { AdminHeader, EmptyBlock, IconAction, Panel, Pill, useAdminMutation } from '@/components/admin/AdminKit'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Display'
import { OptionDot, Select } from '@/components/ui/Select'
import { Switch } from '@/components/ui/Overlay'
import { cn, formatShortDate } from '@/lib/format'
import { WEEKDAY_NAMES, closedTypes, exceptionTypeLabel, hoursFor, toIsoDate } from '@/lib/schedule'
import type { ScheduleException, ScheduleExceptionType, WorkSchedule } from '@/types'
import { DatePicker, TimePicker } from '@/components/ui/DatePicker'
import { t } from '@/i18n'

const KEY = ['admin', 'schedule']

const exceptionDot: Record<ScheduleExceptionType, string> = {
  day_off: 'bg-blush-500',
  holiday: 'bg-butter-500',
  closure: 'bg-danger-500',
  custom_hours: 'bg-peri-500',
}

export function SchedulePage() {
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: scheduleApi.get })
  const [draft, setDraft] = useState<WorkSchedule>()
  useEffect(() => {
    if (data) setDraft(structuredClone(data))
  }, [data])

  const save = useAdminMutation((s: WorkSchedule) => scheduleApi.save(s), { invalidate: [KEY, ['settings', 'visits']], success: t('График сохранён') })
  const dirty = Boolean(data && draft && JSON.stringify(data) !== JSON.stringify(draft))

  if (isLoading || !draft)
    return (
      <div>
        <Skeleton className="mb-5 h-10 w-64" />
        <Skeleton className="h-[420px] rounded-3xl bg-cream-200" />
      </div>
    )

  const today = hoursFor(draft, new Date())
  const setDay = (i: number, patch: Partial<WorkSchedule['week'][number]>) =>
    setDraft((d) => d && { ...d, week: d.week.map((w, j) => (j === i ? { ...w, ...patch } : w)) })
  const setEx = (id: string, patch: Partial<ScheduleException>) =>
    setDraft((d) => d && { ...d, exceptions: d.exceptions.map((e) => (e.id === id ? { ...e, ...patch } : e)) })
  const addEx = () => {
    const t = toIsoDate(new Date())
    setDraft((d) => d && { ...d, exceptions: [...d.exceptions, { id: `ex-${crypto.randomUUID().slice(0, 8)}`, dateFrom: t, dateTo: t, type: 'day_off', comment: '' }] })
  }

  return (
    <div className="animate-slide-up">
      <AdminHeader
        title={t('Время работы')}
        description={t('Вне рабочего времени стандартные посещения создать нельзя')}
        actions={
          <>
            {dirty && (
              <Button variant="ghost" leftIcon={<Undo2 />} onClick={() => setDraft(structuredClone(data))}>
                
                {t('Отменить')}
              </Button>
            )}
            <Button leftIcon={<Save />} disabled={!dirty} loading={save.isPending} onClick={() => save.mutate(draft)}>
              
              {t('Сохранить')}
            </Button>
          </>
        }
      />

      {/* Сегодня */}
      <section className={cn('relative isolate mb-5 flex items-center gap-4 overflow-hidden rounded-3xl p-5', today.open ? 'bg-olive-300' : 'bg-blush-300')}>
        <span className="flex size-12 items-center justify-center rounded-2xl bg-white/55 text-ink-900">
          {today.open ? <Clock3 className="size-6" /> : <CalendarOff className="size-6" />}
        </span>
        <div>
          <div className="text-[13px] font-semibold text-ink-900/65">{t('Сегодня, ')} {WEEKDAY_NAMES[(new Date().getDay() + 6) % 7].toLowerCase()}</div>
          <div className="tabular text-2xl font-extrabold text-ink-900">{today.open ? `${today.from} — ${today.to}` : t('Закрыто')}</div>
          {today.exception && <div className="text-xs font-bold text-ink-900/70">{exceptionTypeLabel[today.exception.type]}{today.exception.comment ? ` · ${today.exception.comment}` : ''}</div>}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* Неделя */}
        <Panel>
          <h2 className="mb-3 text-[17px] font-extrabold text-ink-900">{t('Обычная неделя')}</h2>
          <ul className="space-y-1.5">
            {draft.week.map((d, i) => (
              <li key={d.day} className={cn('flex flex-wrap items-center gap-3 rounded-2xl p-2.5 pl-3.5', d.open ? 'bg-cream-100' : 'bg-cream-100/50')}>
                <span className={cn('w-28 text-sm font-bold', d.open ? 'text-ink-900' : 'text-ink-400')}>{WEEKDAY_NAMES[i]}</span>
                <Switch checked={d.open} onChange={(v) => setDay(i, { open: v })} />
                {d.open ? (
                  <div className="ml-auto flex items-center gap-1.5">
                    <TimeInput value={d.from} onChange={(v) => setDay(i, { from: v })} />
                    <span className="text-ink-400">—</span>
                    <TimeInput value={d.to} onChange={(v) => setDay(i, { to: v })} />
                  </div>
                ) : (
                  <span className="ml-auto pr-2 text-[13px] font-semibold text-ink-400">{t('Выходной')}</span>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setDraft((d) => d && { ...d, week: d.week.map((w) => ({ ...w, from: d.week[0].from, to: d.week[0].to })) })}
            className="mt-3 text-[13px] font-bold text-ink-600 underline-offset-4 hover:text-ink-900 hover:underline"
          >
            
            {t('Применить часы понедельника ко всем дням')}
          </button>
        </Panel>

        {/* Исключения */}
        <Panel>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-[17px] font-extrabold text-ink-900">{t('Особые дни')}</h2>
              <p className="text-xs text-ink-500">{t('Выходные, праздники, временное закрытие и изменение графика')}</p>
            </div>
            <Button size="sm" variant="secondary" leftIcon={<Plus />} onClick={addEx}>
              
              {t('Добавить')}
            </Button>
          </div>
          {draft.exceptions.length === 0 ? (
            <EmptyBlock icon={<CalendarClock />} title={t('Особых дней нет')} text={t('Добавьте праздник или временное закрытие.')} />
          ) : (
            <ul className="space-y-2">
              {[...draft.exceptions]
                .sort((a, b) => a.dateFrom.localeCompare(b.dateFrom))
                .map((e) => {
                  const closed = closedTypes.includes(e.type)
                  const past = e.dateTo < toIsoDate(new Date())
                  return (
                    <li key={e.id} className={cn('rounded-2xl bg-cream-100 p-3', past && 'opacity-60')}>
                      <div className="flex flex-wrap items-end gap-2">
                        <Select
                          label={t('Тип')}
                          value={e.type}
                          onChange={(ev) => setEx(e.id, { type: ev.target.value as ScheduleExceptionType, from: e.from ?? '10:00', to: e.to ?? '18:00' })}
                          options={(Object.keys(exceptionTypeLabel) as ScheduleExceptionType[]).map((t) => ({ value: t, label: exceptionTypeLabel[t], icon: <OptionDot className={exceptionDot[t]} /> }))}
                          containerClassName="min-w-52 flex-1"
                        />
                        <DatePicker label={t('С')} value={e.dateFrom} onChange={(v) => v && setEx(e.id, { dateFrom: v })} containerClassName="w-44" />
                        <DatePicker label={t('По')} min={e.dateFrom} value={e.dateTo} onChange={(v) => v && setEx(e.id, { dateTo: v })} containerClassName="w-44" />
                        <IconAction label={t('Удалить')} danger onClick={() => setDraft((d) => d && { ...d, exceptions: d.exceptions.filter((x) => x.id !== e.id) })}>
                          <Trash2 />
                        </IconAction>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {closed ? (
                          <Pill tone="blush">{t('Закрыто весь день')}</Pill>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <TimeInput value={e.from ?? '10:00'} onChange={(v) => setEx(e.id, { from: v })} />
                            <span className="text-ink-400">—</span>
                            <TimeInput value={e.to ?? '18:00'} onChange={(v) => setEx(e.id, { to: v })} />
                          </div>
                        )}
                        <input
                          value={e.comment ?? ''}
                          onChange={(ev) => setEx(e.id, { comment: ev.target.value })}
                          placeholder={t('Комментарий')}
                          className="h-9 min-w-40 flex-1 rounded-full bg-cream-50 px-3.5 text-[13px] ring-1 ring-cream-200 focus:ring-2 focus:ring-ink-900 focus:outline-none"
                        />
                        {past && <span className="text-[11px] font-bold text-ink-500">{t('прошло · ')} {formatShortDate(e.dateTo)}</span>}
                      </div>
                    </li>
                  )
                })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <TimePicker value={value} onChange={onChange} size="sm" containerClassName="w-28" />
}
