import type { Tone } from '@/components/ui/Display'
import type { AuditAction, NannyStatus, NotificationEvent, PaymentStatus, Role, VisitStatus } from '@/types'
import { t, localized } from '@/i18n'

interface StatusMeta {
  label: string
  tone: Tone
}

export const visitStatus: Record<VisitStatus, StatusMeta> = localized(() => ({
  created: { label: t('Создано'), tone: 'neutral' },
  active: { label: t('Активно'), tone: 'success' },
  awaiting_extension: { label: t('Ожидает продления'), tone: 'sun' },
  extended: { label: t('Продлено'), tone: 'violet' },
  completed: { label: t('Завершено'), tone: 'brand' },
  cancelled: { label: t('Отменено'), tone: 'danger' },
}))

export const paymentStatus: Record<PaymentStatus, StatusMeta> = localized(() => ({
  unpaid: { label: t('Не оплачено'), tone: 'neutral' },
  pending: { label: t('Ожидает оплаты'), tone: 'warning' },
  paid: { label: t('Оплачено'), tone: 'success' },
  failed: { label: t('Ошибка'), tone: 'danger' },
  cancelled: { label: t('Отменено'), tone: 'neutral' },
  refunded: { label: t('Возвращено'), tone: 'info' },
}))

export const nannyStatus: Record<NannyStatus, StatusMeta> = localized(() => ({
  free: { label: t('Свободна'), tone: 'success' },
  busy: { label: t('Занята'), tone: 'warning' },
  break: { label: t('Перерыв'), tone: 'info' },
  off: { label: t('Не работает'), tone: 'neutral' },
}))

export const roleLabel: Record<Role, string> = localized(() => ({
  admin: t('Администратор'),
  staff: t('Сотрудник'),
  nanny: t('Няня'),
}))

export const auditActionLabel: Record<AuditAction, string> = localized(() => ({
  child_registered: t('Зарегистрировал ребёнка'),
  visit_created: t('Создал посещение и назначил няню'),
  visit_finished: t('Завершил посещение'),
  visit_extended: t('Продлил посещение'),
  extension_declined: t('Отказался от продления'),
  discount_applied: t('Применил скидку'),
  discount_saved: t('Скидка'),
  promo_saved: t('Промокод'),
}))

export const notificationEventLabel: Record<NotificationEvent, string> = localized(() => ({
  visit_started: t('Посещение началось'),
  ending_soon: t('До окончания 15 минут'),
  extended: t('Продление выполнено'),
  extension_declined: t('Отказ от продления'),
  payment_paid: t('Оплата выполнена'),
  payment_failed: t('Ошибка оплаты'),
  visit_finished: t('Посещение завершено'),
}))
