export type ID = string
export type ISODate = string

export type Role = 'staff' | 'nanny' | 'admin'

export type Gender = 'male' | 'female'

export interface Parent {
  id: ID
  firstName: string
  lastName?: string
  phone: string
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

export type VisitStatus =
  | 'created'
  | 'active'
  | 'awaiting_extension'
  | 'extended'
  | 'completed'
  | 'cancelled'

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
  extensionDeclined?: { at: ISODate; endAt: ISODate }
  basePrice?: number
  discount?: VisitDiscount
}

export interface VisitDiscount {
  source: 'discount' | 'promo'
  id: ID
  label: string
  kind: DiscountKind
  value: number
  amount: number
  appliedBy: ID
}

export interface Session {
  token: string
  user: Employee
}


export interface AppSettings {
  hourlyRate: number
  durations: number[]
  extensionOptions: number[]
  extensionNoticeMin: number
}

export interface WorkDay {
  day: number
  open: boolean
  from: string
  to: string
}

export type ScheduleExceptionType = 'day_off' | 'holiday' | 'closure' | 'custom_hours'

export interface ScheduleException {
  id: ID
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
  actorId?: ID
  actorLabel?: string
  subject: string
  details?: string
  link?: string
}

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
  delivery?: 'sent' | 'not_linked'
  read?: boolean
}
