import type {
  ActiveStatus,
  AppSettings,
  Child,
  Discount,
  Employee,
  EmployeeStatus,
  ID,
  Nanny,
  NannyStatus,
  News,
  Parent,
  PaymentStatus,
  PromoCode,
  Role,
  Visit,
  WorkSchedule,
} from '@/types'
import { normalizePhone } from '@/lib/format'
import { auditActionLabel } from '@/lib/statuses'
import { isOngoing, visitTotalMinutes } from '@/lib/time'
import { ApiError } from './errors'
import { audit } from './journal'
import { db, delay, persist, resetMockDB, uid } from './mock/db'
import { syncVisits } from './visits'
import { t } from '@/i18n'

const now = () => new Date().toISOString()

/* ---------- Сотрудники (ТЗ §21) ---------- */

export interface EmployeeInput {
  firstName: string
  lastName: string
  phone: string
  position: string
  role: Role
  experienceYears: number
}

export interface WorkHistoryItem {
  id: string
  at: string
  action: string
  subject: string
}

/** История работы сотрудника по посещениям (ТЗ §21, §41). */
function historyOf(employeeId: ID): WorkHistoryItem[] {
  return db.audit
    .filter((a) => a.actorId === employeeId)
    .map((a) => ({ id: a.id, at: a.at, action: a.details && a.action.endsWith('_saved') ? a.details : auditActionLabel[a.action], subject: a.subject }))
}

function validateEmployee(input: EmployeeInput, exceptId?: ID) {
  if (!input.firstName.trim() || !input.lastName.trim()) throw new ApiError('validation', t('Укажите имя и фамилию'))
  const phone = normalizePhone(input.phone)
  if (phone.length !== 12) throw new ApiError('validation', t('Укажите номер телефона полностью'))
  if (db.employees.some((e) => e.phone === phone && e.id !== exceptId)) throw new ApiError('conflict', t('Сотрудник с таким номером уже есть'))
  return phone
}

export const employeesApi = {
  async list(): Promise<Employee[]> {
    await delay(250)
    return [...db.employees].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  async history(id: ID): Promise<WorkHistoryItem[]> {
    await delay(250)
    return historyOf(id).slice(0, 50)
  },

  async create(input: EmployeeInput): Promise<Employee> {
    await delay(400)
    const phone = validateEmployee(input)
    const e: Employee = { id: uid('e'), ...input, phone, status: 'active', createdAt: now() }
    db.employees.push(e)
    db.passwords[e.id] = '123456'
    if (e.role === 'nanny') db.nannies.push(nannyFromEmployee(e))
    persist()
    return e
  },

  async update(id: ID, input: EmployeeInput): Promise<Employee> {
    await delay(400)
    const e = db.employees.find((x) => x.id === id)
    if (!e) throw new ApiError('not_found', t('Сотрудник не найден'))
    const phone = validateEmployee(input, id)
    Object.assign(e, input, { phone })
    const n = db.nannies.find((x) => x.employeeId === id)
    if (n) Object.assign(n, { firstName: e.firstName, lastName: e.lastName, phone, experienceYears: e.experienceYears })
    else if (e.role === 'nanny') db.nannies.push(nannyFromEmployee(e))
    persist()
    return e
  },

  async setStatus(id: ID, status: EmployeeStatus): Promise<void> {
    await delay(300)
    const e = db.employees.find((x) => x.id === id)
    if (!e) throw new ApiError('not_found', t('Сотрудник не найден'))
    e.status = status
    const n = db.nannies.find((x) => x.employeeId === id)
    if (n && status === 'blocked') n.status = 'off'
    persist()
  },
}

function nannyFromEmployee(e: Employee): Nanny {
  return {
    id: uid('n'),
    employeeId: e.id,
    firstName: e.firstName,
    lastName: e.lastName,
    phone: e.phone,
    experienceYears: e.experienceYears,
    startedAt: e.createdAt,
    status: 'off',
    workHours: '10:00 — 18:00',
    activeChildren: 0,
    maxChildren: 4,
  }
}

/* ---------- Няни (ТЗ §22) ---------- */

export interface NannyAdminItem extends Nanny {
  employeeStatus: EmployeeStatus
  servedChildren: number
  visitsCount: number
  hoursWorked: number
  activeNow: number
}

export interface NannyInput {
  firstName: string
  lastName: string
  phone: string
  experienceYears: number
  workHours: string
  maxChildren: number
  photoUrl?: string
}

export interface NannyVisitRow extends Visit {
  child?: Child
}

export const nanniesAdminApi = {
  async list(): Promise<NannyAdminItem[]> {
    await delay(250)
    syncVisits()
    return db.nannies.map((n) => {
      const own = db.visits.filter((v) => v.nannyId === n.id && v.status !== 'cancelled')
      const done = own.filter((v) => v.status === 'completed')
      const emp = db.employees.find((e) => e.id === n.employeeId)
      const activeNow = own.filter(isOngoing).length
      // статус как при выборе няни: «Занята» — только когда нет свободных мест
      const status: NannyStatus = n.status === 'off' || n.status === 'break' ? n.status : activeNow >= n.maxChildren ? 'busy' : 'free'
      return {
        ...n,
        status,
        employeeStatus: emp?.status ?? 'active',
        servedChildren: new Set(own.map((v) => v.childId)).size,
        visitsCount: own.length,
        hoursWorked: done.reduce((s, v) => s + visitTotalMinutes(v), 0) / 60,
        activeNow,
      }
    })
  },

  async visits(id: ID): Promise<NannyVisitRow[]> {
    await delay(250)
    return db.visits
      .filter((v) => v.nannyId === id)
      .sort((a, b) => b.startAt.localeCompare(a.startAt))
      .slice(0, 40)
      .map((v) => ({ ...v, child: db.children.find((c) => c.id === v.childId) }))
  },

  async create(input: NannyInput): Promise<Nanny> {
    await delay(400)
    const phone = validateEmployee({ ...input, position: t('Няня'), role: 'nanny' })
    const e: Employee = {
      id: uid('e'),
      firstName: input.firstName,
      lastName: input.lastName,
      phone,
      position: t('Няня'),
      role: 'nanny',
      experienceYears: input.experienceYears,
      photoUrl: input.photoUrl,
      status: 'active',
      createdAt: now(),
    }
    db.employees.push(e)
    db.passwords[e.id] = '123456'
    const n: Nanny = { ...nannyFromEmployee(e), workHours: input.workHours, maxChildren: input.maxChildren, photoUrl: input.photoUrl, status: 'free' }
    db.nannies.push(n)
    persist()
    return n
  },

  async update(id: ID, input: NannyInput): Promise<void> {
    await delay(400)
    const n = db.nannies.find((x) => x.id === id)
    if (!n) throw new ApiError('not_found', t('Няня не найдена'))
    const phone = validateEmployee({ ...input, position: t('Няня'), role: 'nanny' }, n.employeeId)
    Object.assign(n, input, { phone })
    const e = db.employees.find((x) => x.id === n.employeeId)
    if (e) Object.assign(e, { firstName: input.firstName, lastName: input.lastName, phone, experienceYears: input.experienceYears, photoUrl: input.photoUrl })
    persist()
  },

  /** «Отключить няню» — она больше не доступна для назначения. */
  async setEnabled(id: ID, enabled: boolean): Promise<void> {
    await delay(300)
    const n = db.nannies.find((x) => x.id === id)
    if (!n) throw new ApiError('not_found', t('Няня не найдена'))
    if (!enabled && db.visits.some((v) => v.nannyId === id && isOngoing(v)))
      throw new ApiError('conflict', t('У няни есть дети на посещении — сначала завершите их'))
    n.status = enabled ? 'free' : 'off'
    persist()
  },
}

/* ---------- Родители ---------- */

export interface ParentAdminItem extends Parent {
  children: Child[]
  visitsCount: number
  paidTotal: number
  lastVisitAt?: string
}

export const parentsAdminApi = {
  async list(): Promise<ParentAdminItem[]> {
    await delay(250)
    return db.parents
      .map((p) => {
        const kids = db.children.filter((c) => c.parentId === p.id)
        const visits = db.visits.filter((v) => kids.some((k) => k.id === v.childId) && v.status !== 'cancelled')
        const paid = visits.reduce(
          (s, v) => s + (v.paymentStatus === 'paid' ? v.price : 0) + v.extensions.filter((e) => e.paymentStatus === 'paid').reduce((a, e) => a + e.price, 0),
          0,
        )
        const last = visits.map((v) => v.startAt).sort().at(-1)
        return { ...p, children: kids, visitsCount: visits.length, paidTotal: paid, lastVisitAt: last }
      })
      .sort((a, b) => (b.lastVisitAt ?? b.createdAt).localeCompare(a.lastVisitAt ?? a.createdAt))
  },
}

/* ---------- Оплаты (ТЗ §19) ---------- */

export interface PaymentRow {
  id: string
  at: string
  visitId: ID
  kind: 'visit' | 'extension'
  amount: number
  status: PaymentStatus
  child?: Child
  parent?: Parent
  minutes: number
}

export const paymentsApi = {
  async list(): Promise<PaymentRow[]> {
    await delay(300)
    const rows: PaymentRow[] = []
    for (const v of db.visits) {
      const child = db.children.find((c) => c.id === v.childId)
      const parent = child && db.parents.find((p) => p.id === child.parentId)
      rows.push({ id: v.id, at: v.startAt, visitId: v.id, kind: 'visit', amount: v.price, status: v.paymentStatus, child, parent, minutes: v.durationMin })
      for (const e of v.extensions)
        rows.push({ id: e.id, at: e.createdAt, visitId: v.id, kind: 'extension', amount: e.price, status: e.paymentStatus, child, parent, minutes: e.minutes })
    }
    return rows.sort((a, b) => b.at.localeCompare(a.at))
  },
}

/* ---------- Скидки (ТЗ §27) ---------- */

export type DiscountInput = Omit<Discount, 'id' | 'createdAt' | 'createdBy'>

function validateDiscountLike(d: { kind: Discount['kind']; value: number; dateFrom: string; dateTo: string }) {
  if (!(d.value > 0)) throw new ApiError('validation', t('Размер скидки должен быть больше нуля'))
  if (d.kind === 'percent' && d.value > 100) throw new ApiError('validation', t('Процент не может быть больше 100'))
  if (!d.dateFrom || !d.dateTo) throw new ApiError('validation', t('Укажите период действия'))
  if (d.dateFrom > d.dateTo) throw new ApiError('validation', t('Дата окончания раньше даты начала'))
}

export const discountsApi = {
  async list(): Promise<Discount[]> {
    await delay(250)
    return [...db.discounts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },
  async save(input: DiscountInput, by: ID, id?: ID): Promise<Discount> {
    await delay(400)
    if (!input.name.trim()) throw new ApiError('validation', t('Укажите название'))
    validateDiscountLike(input)
    if (id) {
      const d = db.discounts.find((x) => x.id === id)
      if (!d) throw new ApiError('not_found', t('Скидка не найдена'))
      Object.assign(d, input)
      audit({ action: 'discount_saved', actorId: by, subject: d.name, details: t('Изменена скидка') })
      persist()
      return d
    }
    const d: Discount = { id: uid('d'), ...input, createdAt: now(), createdBy: by }
    db.discounts.push(d)
    audit({ action: 'discount_saved', actorId: by, subject: d.name, details: t('Создана скидка') })
    persist()
    return d
  },
  async setStatus(id: ID, status: ActiveStatus) {
    await delay(250)
    const d = db.discounts.find((x) => x.id === id)
    if (d) d.status = status
    persist()
  },
  async remove(id: ID) {
    await delay(250)
    db.discounts = db.discounts.filter((x) => x.id !== id)
    persist()
  },
}

/* ---------- Промокоды (ТЗ §28) ---------- */

export type PromoInput = Omit<PromoCode, 'id' | 'createdAt' | 'createdBy' | 'usedCount'>

export type PromoCheck = { valid: true; promo: PromoCode } | { valid: false; reason: string }

export const promoCodesApi = {
  async list(): Promise<PromoCode[]> {
    await delay(250)
    return [...db.promoCodes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },
  async save(input: PromoInput, by: ID, id?: ID): Promise<PromoCode> {
    await delay(400)
    const code = input.code.trim().toUpperCase()
    if (!/^[A-Z0-9_-]{3,20}$/.test(code)) throw new ApiError('validation', t('Код: 3–20 символов, латиница и цифры'))
    if (db.promoCodes.some((p) => p.code === code && p.id !== id)) throw new ApiError('conflict', t('Такой промокод уже существует'))
    validateDiscountLike(input)
    if (!(input.usageLimit > 0) || !(input.perParentLimit > 0)) throw new ApiError('validation', t('Лимиты должны быть больше нуля'))
    if (id) {
      const p = db.promoCodes.find((x) => x.id === id)
      if (!p) throw new ApiError('not_found', t('Промокод не найден'))
      Object.assign(p, input, { code })
      audit({ action: 'promo_saved', actorId: by, subject: code, details: t('Изменён промокод') })
      persist()
      return p
    }
    const p: PromoCode = { id: uid('pc'), ...input, code, usedCount: 0, createdAt: now(), createdBy: by }
    db.promoCodes.push(p)
    audit({ action: 'promo_saved', actorId: by, subject: code, details: t('Создан промокод') })
    persist()
    return p
  },
  async setStatus(id: ID, status: ActiveStatus) {
    await delay(250)
    const p = db.promoCodes.find((x) => x.id === id)
    if (p) p.status = status
    persist()
  },
  async remove(id: ID) {
    await delay(250)
    db.promoCodes = db.promoCodes.filter((x) => x.id !== id)
    persist()
  },
  /** ТЗ §28 — проверка валидности перед применением. */
  async check(code: string): Promise<PromoCheck> {
    await delay(350)
    const p = db.promoCodes.find((x) => x.code === code.trim().toUpperCase())
    const today = new Date().toISOString().slice(0, 10)
    if (!p) return { valid: false, reason: t('Промокод не найден') }
    if (p.status !== 'active') return { valid: false, reason: t('Промокод отключён') }
    if (today < p.dateFrom) return { valid: false, reason: t('Срок действия ещё не начался') }
    if (today > p.dateTo) return { valid: false, reason: t('Срок действия истёк') }
    if (p.usedCount >= p.usageLimit) return { valid: false, reason: t('Лимит использований исчерпан') }
    return { valid: true, promo: p }
  },
}

/* ---------- Новости (ТЗ §29) ---------- */

export type NewsInput = Omit<News, 'id' | 'createdAt'>

export const newsApi = {
  async list(): Promise<News[]> {
    await delay(250)
    return [...db.news].sort((a, b) => b.publishAt.localeCompare(a.publishAt))
  },
  async save(input: NewsInput, id?: ID): Promise<News> {
    await delay(400)
    if (!input.title.trim()) throw new ApiError('validation', t('Укажите заголовок'))
    if (!input.text.trim()) throw new ApiError('validation', t('Добавьте текст новости'))
    if (id) {
      const n = db.news.find((x) => x.id === id)
      if (!n) throw new ApiError('not_found', t('Новость не найдена'))
      Object.assign(n, input)
      persist()
      return n
    }
    const n: News = { id: uid('nw'), ...input, createdAt: now() }
    db.news.push(n)
    persist()
    return n
  },
  async remove(id: ID) {
    await delay(250)
    db.news = db.news.filter((x) => x.id !== id)
    persist()
  },
}

/* ---------- Время работы (ТЗ §26) и настройки ---------- */

export const scheduleApi = {
  async get(): Promise<WorkSchedule> {
    await delay(200)
    return structuredClone(db.schedule)
  },
  async save(s: WorkSchedule): Promise<void> {
    await delay(400)
    for (const d of s.week) if (d.open && d.from >= d.to) throw new ApiError('validation', t('Время закрытия должно быть позже открытия'))
    for (const e of s.exceptions) {
      if (!e.dateFrom || !e.dateTo || e.dateFrom > e.dateTo) throw new ApiError('validation', t('Проверьте даты исключений'))
      if ((e.type === 'holiday' || e.type === 'custom_hours') && (!e.from || !e.to || e.from >= e.to))
        throw new ApiError('validation', t('Укажите часы работы для праздничного дня или изменённого графика'))
    }
    db.schedule = structuredClone(s)
    persist()
  },
}

export const appSettingsApi = {
  async get(): Promise<AppSettings> {
    await delay(200)
    return structuredClone(db.settings)
  },
  async save(s: AppSettings): Promise<void> {
    await delay(400)
    if (!(s.hourlyRate > 0)) throw new ApiError('validation', t('Стоимость часа должна быть больше нуля'))
    if (!s.durations.length) throw new ApiError('validation', t('Нужен хотя бы один вариант продолжительности'))
    if (!s.extensionOptions.length) throw new ApiError('validation', t('Нужен хотя бы один вариант продления'))
    db.settings = { ...structuredClone(s), durations: [...new Set(s.durations)].sort((a, b) => a - b), extensionOptions: [...new Set(s.extensionOptions)].sort((a, b) => a - b) }
    persist()
  },
  resetDemo: resetMockDB,
}
