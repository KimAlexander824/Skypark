import type { ScheduleException, ScheduleExceptionType, WorkSchedule } from '@/types'
import { t, localized } from '@/i18n'

export const WEEKDAY_NAMES = localized(() => ([t('Понедельник'), t('Вторник'), t('Среда'), t('Четверг'), t('Пятница'), t('Суббота'), t('Воскресенье')]))
export const WEEKDAY_SHORT = localized(() => ([t('Пн'), t('Вт'), t('Ср'), t('Чт'), t('Пт'), t('Сб'), t('Вс')]))

export const exceptionTypeLabel: Record<ScheduleExceptionType, string> = localized(() => ({
  day_off: t('Выходной день'),
  holiday: t('Праздничный день'),
  closure: t('Временное закрытие'),
  custom_hours: t('Изменение графика'),
}))

/** Типы, при которых Скайпарк закрыт весь день. */
export const closedTypes: ScheduleExceptionType[] = ['day_off', 'closure']

export const toIsoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Понедельник = 0 */
export const weekdayIndex = (d: Date) => (d.getDay() + 6) % 7

export interface DayHours {
  open: boolean
  from?: string
  to?: string
  exception?: ScheduleException
}

/** ТЗ §26 — фактический график на дату с учётом исключений. */
export function hoursFor(schedule: WorkSchedule, date: Date): DayHours {
  const iso = toIsoDate(date)
  const exception = schedule.exceptions.find((e) => e.dateFrom <= iso && iso <= e.dateTo)
  if (exception) {
    if (closedTypes.includes(exception.type)) return { open: false, exception }
    return { open: true, from: exception.from, to: exception.to, exception }
  }
  const day = schedule.week[weekdayIndex(date)]
  return day.open ? { open: true, from: day.from, to: day.to } : { open: false }
}
