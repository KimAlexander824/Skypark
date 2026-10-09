import type { Tone } from '@/components/ui/Display'
import type { AuditAction, NannyStatus, NotificationEvent, PaymentStatus, Role, VisitStatus } from '@/types'

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

// ТЗ §41
export const auditActionLabel: Record<AuditAction, string> = {
  child_registered: 'Зарегистрировал ребёнка',
  visit_created: 'Создал посещение и назначил няню',
  visit_finished: 'Завершил посещение',
  visit_extended: 'Продлил посещение',
  extension_declined: 'Отказался от продления',
  discount_applied: 'Применил скидку',
  discount_saved: 'Скидка',
  promo_saved: 'Промокод',
}

// ТЗ §15, §30
export const notificationEventLabel: Record<NotificationEvent, string> = {
  visit_started: 'Посещение началось',
  ending_soon: 'До окончания 15 минут',
  extended: 'Продление выполнено',
  extension_declined: 'Отказ от продления',
  payment_paid: 'Оплата выполнена',
  payment_failed: 'Ошибка оплаты',
  visit_finished: 'Посещение завершено',
}
