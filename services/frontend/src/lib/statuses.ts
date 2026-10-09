import type { Tone } from '@/components/ui/Display'
import type { NannyStatus, PaymentStatus, Role, VisitStatus } from '@/types'

interface StatusMeta {
  label: string
  tone: Tone
}

// ТЗ §31
export const visitStatus: Record<VisitStatus, StatusMeta> = {
  created: { label: 'Создано', tone: 'neutral' },
  active: { label: 'Активно', tone: 'success' },
  awaiting_extension: { label: 'Ожидает продления', tone: 'sun' },
  extended: { label: 'Продлено', tone: 'violet' },
  completed: { label: 'Завершено', tone: 'brand' },
  cancelled: { label: 'Отменено', tone: 'danger' },
}

// ТЗ §32
export const paymentStatus: Record<PaymentStatus, StatusMeta> = {
  unpaid: { label: 'Не оплачено', tone: 'neutral' },
  pending: { label: 'Ожидает оплаты', tone: 'warning' },
  paid: { label: 'Оплачено', tone: 'success' },
  failed: { label: 'Ошибка', tone: 'danger' },
  cancelled: { label: 'Отменено', tone: 'neutral' },
  refunded: { label: 'Возвращено', tone: 'info' },
}

// ТЗ §10
export const nannyStatus: Record<NannyStatus, StatusMeta> = {
  free: { label: 'Свободна', tone: 'success' },
  busy: { label: 'Занята', tone: 'warning' },
  break: { label: 'Перерыв', tone: 'info' },
  off: { label: 'Не работает', tone: 'neutral' },
}

export const roleLabel: Record<Role, string> = {
  admin: 'Администратор',
  staff: 'Сотрудник',
  nanny: 'Няня',
}
