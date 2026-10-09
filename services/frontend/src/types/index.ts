// Сущности системы по ТЗ §40. Поля совпадают с будущим контрактом backend.

export type ID = string
export type ISODate = string

export type Role = 'staff' | 'nanny' | 'admin'

export type Gender = 'male' | 'female'

export interface Parent {
  id: ID
  firstName: string
  lastName?: string
  phone: string // формат: 998901234567
  telegram?: {
    username?: string
    linked: boolean
    linkedAt?: ISODate
  }
  note?: string
  createdAt: ISODate
}

export interface Child {
  id: ID
  parentId: ID
  firstName: string
  lastName: string
  birthDate: ISODate
  gender: Gender
  photoUrl?: string
  note?: string
  hasFaceProfile: boolean
  createdAt: ISODate
  createdBy: ID
}

export type EmployeeStatus = 'active' | 'blocked'

export interface Employee {
  id: ID
  firstName: string
  lastName: string
  phone: string
  position: string
  role: Role
  experienceYears: number
  photoUrl?: string
  status: EmployeeStatus
  createdAt: ISODate
}

// ТЗ §10
export type NannyStatus = 'free' | 'busy' | 'break' | 'off'

export interface Nanny {
  id: ID
  employeeId: ID
  firstName: string
  lastName: string
  phone: string
  photoUrl?: string
  experienceYears: number
  startedAt: ISODate
  status: NannyStatus
  workHours: string
  activeChildren: number
  maxChildren: number
}

// ТЗ §31
export type VisitStatus =
  | 'created'
  | 'active'
  | 'awaiting_extension'
  | 'extended'
  | 'completed'
  | 'cancelled'

// ТЗ §32
export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded'

export interface Extension {
  id: ID
  visitId: ID
  minutes: number
  price: number
  paymentStatus: PaymentStatus
  createdAt: ISODate
}

export interface Visit {
  id: ID
  childId: ID
  nannyId: ID
  startAt: ISODate
  durationMin: number
  endAt: ISODate
  status: VisitStatus
  price: number
  paymentStatus: PaymentStatus
  extensions: Extension[]
  createdBy: ID
  endedAt?: ISODate
  endedBy?: ID
  /** ТЗ §18 — родитель отказался от продления; endAt — окончание, от продления которого отказались. */
  extensionDeclined?: { at: ISODate; endAt: ISODate }
  /** ТЗ §27–28 — цена до скидки; price — итог с учётом скидки. */
  basePrice?: number
  discount?: VisitDiscount
}

/** Скидка или промокод, применённые к посещению (ТЗ §27, §28, §41 — кто применил). */
export interface VisitDiscount {
  source: 'discount' | 'promo'
  id: ID
  /** Название скидки или код промокода */
  label: string
  kind: DiscountKind
  value: number
  /** Сумма скидки, сум */
  amount: number
  appliedBy: ID
}

export interface Session {
  token: string
  user: Employee
}

/* ---------- Админ-панель ---------- */

// ТЗ §17, §20 «Настройки»
export interface AppSettings {
  /** Стоимость часа, сум */
  hourlyRate: number
  /** Варианты продолжительности посещения, минуты */
  durations: number[]
  /** Варианты продления, минуты (ТЗ §17 — настраиваемые) */
  extensionOptions: number[]
  /** За сколько минут предупреждать о конце (ТЗ §16 — 15 минут) */
  extensionNoticeMin: number
}

// ТЗ §26
export interface WorkDay {
  /** 0 — понедельник … 6 — воскресенье */
  day: number
  open: boolean
  from: string
  to: string
}

export type ScheduleExceptionType = 'day_off' | 'holiday' | 'closure' | 'custom_hours'

export interface ScheduleException {
  id: ID
  /** YYYY-MM-DD */
  dateFrom: string
  dateTo: string
  type: ScheduleExceptionType
  from?: string
  to?: string
  comment?: string
}

export interface WorkSchedule {
  week: WorkDay[]
  exceptions: ScheduleException[]
}

export type DiscountKind = 'percent' | 'fixed'
export type ActiveStatus = 'active' | 'inactive'

// ТЗ §27
export interface Discount {
  id: ID
  name: string
  kind: DiscountKind
  value: number
  dateFrom: string
  dateTo: string
  conditions: string
  status: ActiveStatus
  createdAt: ISODate
  createdBy: ID
}

// ТЗ §28
export interface PromoCode {
  id: ID
  code: string
  kind: DiscountKind
  value: number
  dateFrom: string
  dateTo: string
  usageLimit: number
  usedCount: number
  perParentLimit: number
  status: ActiveStatus
  createdAt: ISODate
  createdBy: ID
}

// ТЗ §29
export type NewsStatus = 'draft' | 'published' | 'archived'

export interface News {
  id: ID
  title: string
  imageUrl?: string
  text: string
  publishAt: ISODate
  status: NewsStatus
  createdAt: ISODate
}

/* ---------- Журнал действий (ТЗ §41) ---------- */

export type AuditAction =
  | 'child_registered'
  | 'visit_created'
  | 'visit_finished'
  | 'visit_extended'
  | 'extension_declined'
  | 'discount_applied'
  | 'discount_saved'
  | 'promo_saved'

export interface AuditEntry {
  id: ID
  at: ISODate
  action: AuditAction
  /** Сотрудник; пусто — действие системы или родителя (см. actorLabel). */
  actorId?: ID
  actorLabel?: string
  /** О ком или о чём запись: ребёнок, скидка, промокод. */
  subject: string
  details?: string
  /** Ссылка на карточку внутри приложения. */
  link?: string
}

/* ---------- Уведомления (ТЗ §15, §30, §40 Notification) ---------- */

export type NotificationEvent =
  | 'visit_started'
  | 'ending_soon'
  | 'extended'
  | 'extension_declined'
  | 'payment_paid'
  | 'payment_failed'
  | 'visit_finished'

export interface AppNotification {
  id: ID
  at: ISODate
  event: NotificationEvent
  recipient: 'parent' | 'staff'
  visitId: ID
  childId: ID
  text: string
  /** Для родителя: отправлено в Telegram или Telegram не привязан (ТЗ §44). */
  delivery?: 'sent' | 'not_linked'
  /** Для сотрудников: прочитано. */
  read?: boolean
}
