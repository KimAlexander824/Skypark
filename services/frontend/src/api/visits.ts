import type { Child, Discount, DiscountKind, Extension, ID, Nanny, NannyStatus, Parent, PromoCode, Visit, VisitDiscount, VisitStatus } from '@/types'
import { EXTENSION_NOTICE_MIN, hhmmToMinutes, isOngoing } from '@/lib/time'
import { exceptionTypeLabel, hoursFor } from '@/lib/schedule'
import { ApiError } from './errors'
import { audit, childLabel, notify, PARENT_ACTOR, SYSTEM_ACTOR } from './journal'
import { db, delay, persist, uid } from './mock/db'
import { t, LOCALE } from '@/i18n'

/* ---------- Настройки посещений (ТЗ §17, §26) ---------- */

export interface VisitSettings {
  /** Стоимость часа посещения, сум. Правило расчёта согласуется отдельно (ТЗ §48 п.7). */
  hourlyRate: number
  /** Доступные варианты продолжительности, минуты (ТЗ §48 п.6). */
  durations: number[]
  /** Часы работы на сегодня; null — сегодня закрыто. */
  workHours: { open: string; close: string } | null
  closedReason?: string
}

function currentVisitSettings(): VisitSettings {
  const today = hoursFor(db.schedule, new Date())
  return {
    hourlyRate: db.settings.hourlyRate,
    durations: db.settings.durations,
    workHours: today.open && today.from && today.to ? { open: today.from, close: today.to } : null,
    closedReason: today.exception ? exceptionTypeLabel[today.exception.type] : today.open ? undefined : t('Выходной день'),
  }
}

export const settingsApi = {
  async get(): Promise<VisitSettings> {
    await delay(150)
    return currentVisitSettings()
  },
}

const fullNameOf = (p: { firstName: string; lastName?: string }) => [p.firstName, p.lastName].filter(Boolean).join(' ')
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })

export const priceFor = (minutes: number, s: VisitSettings) => Math.round((s.hourlyRate * minutes) / 60)

/* ---------- Скидки и промокоды при оформлении (ТЗ §27, §28) ---------- */

/*
 * К посещению применяется что-то одно: скидка или промокод. Можно ли их совмещать
 * и как скидка зависит от «условий применения», ТЗ не уточняет (§48 п.15–16) —
 * условия скидки проверяет сотрудник, система проверяет статус, период и лимиты.
 */

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const discountAmount = (kind: DiscountKind, value: number, base: number) =>
  Math.min(base, kind === 'percent' ? Math.round((base * value) / 100) : value)

const isDiscountActive = (d: Pick<Discount, 'status' | 'dateFrom' | 'dateTo'>, today = localDay()) =>
  d.status === 'active' && d.dateFrom <= today && today <= d.dateTo

export type PromoCheck = { valid: true; promo: PromoCode } | { valid: false; reason: string }

/** ТЗ §28 — проверка промокода перед применением, включая лимит на одного родителя. */
function checkPromo(code: string, parentId: ID): PromoCheck {
  const p = db.promoCodes.find((x) => x.code === code.trim().toUpperCase())
  const today = localDay()
  if (!p) return { valid: false, reason: t('Промокод не найден') }
  if (p.status !== 'active') return { valid: false, reason: t('Промокод отключён') }
  if (today < p.dateFrom) return { valid: false, reason: t('Срок действия ещё не начался') }
  if (today > p.dateTo) return { valid: false, reason: t('Срок действия истёк') }
  if (p.usedCount >= p.usageLimit) return { valid: false, reason: t('Лимит использований исчерпан') }
  const childIds = new Set(db.children.filter((c) => c.parentId === parentId).map((c) => c.id))
  const usedByParent = db.visits.filter(
    (v) => childIds.has(v.childId) && v.discount?.source === 'promo' && v.discount.id === p.id && v.status !== 'cancelled',
  ).length
  if (usedByParent >= p.perParentLimit) return { valid: false, reason: t('Родитель уже использовал этот промокод') }
  return { valid: true, promo: p }
}

export const pricingApi = {
  /** Скидки, которые можно выбрать сейчас: включены и действуют сегодня. */
  async discounts(): Promise<Discount[]> {
    await delay(200)
    return db.discounts.filter((d) => isDiscountActive(d)).sort((a, b) => a.name.localeCompare(b.name))
  },
  async checkPromo(code: string, parentId: ID): Promise<PromoCheck> {
    await delay(350)
    return checkPromo(code, parentId)
  },
}

/* ---------- Автоматические переходы статусов (ТЗ §12, §16) ---------- */

/**
 * На backend это будет фоновая задача. В мок-режиме выполняется при каждом чтении:
 * — за 15 минут до конца посещение переходит в «Ожидает продления» (если родитель
 *   ещё не отказался продлевать именно это окончание);
 * — по окончании оплаченного времени посещение завершается автоматически,
 *   неоплаченный платёж за продление отменяется.
 */
export function syncVisits(now = Date.now()) {
  let changed = false
  for (const v of db.visits) {
    if (!isOngoing(v)) continue
    const end = new Date(v.endAt).getTime()
    if (now >= end) {
      v.status = 'completed'
      v.endedAt = v.endAt
      v.endedBy = undefined // система
      cancelPendingExtensions(v)
      finishedEvents(v)
      changed = true
    } else if (
      (v.status === 'active' || v.status === 'extended') &&
      end - now <= EXTENSION_NOTICE_MIN * 60_000 &&
      v.extensionDeclined?.endAt !== v.endAt
    ) {
      v.status = 'awaiting_extension'
      // ТЗ §16 — предложение продлить
      notify(v, 'ending_soon', ['parent'], t('{0}: до окончания посещения 15 минут. Продлить?', childLabel(v.childId)))
      changed = true
    }
  }
  if (changed) persist()
}

/** ТЗ §12, §30 — посещение завершено: запись в журнал и уведомления родителю и сотрудникам. */
function finishedEvents(v: Visit) {
  const name = childLabel(v.childId)
  audit({
    action: 'visit_finished',
    actorId: v.endedBy,
    actorLabel: v.endedBy ? undefined : SYSTEM_ACTOR(),
    subject: name,
    details: v.endedBy ? t('Досрочно') : t('По окончании времени'),
    link: `/children/${v.childId}`,
  })
  notify(v, 'visit_finished', ['parent', 'staff'], t('{0}: посещение завершено', name))
}

/** Статус посещения, когда вопрос о продлении закрыт. */
const runningStatus = (v: Visit): VisitStatus => (v.extensions.some((e) => e.paymentStatus === 'paid') ? 'extended' : 'active')

function cancelPendingExtensions(v: Visit) {
  for (const e of v.extensions) if (e.paymentStatus === 'pending') e.paymentStatus = 'cancelled'
}

/* ---------- Няни (ТЗ §10) ---------- */

export interface NannyWithLoad extends Nanny {
  available: boolean
  unavailableReason?: string
}

function withLoad(n: Nanny): NannyWithLoad {
  const activeChildren = db.visits.filter((v) => v.nannyId === n.id && isOngoing(v)).length
  const full = activeChildren >= n.maxChildren
  const status: NannyStatus = n.status === 'off' || n.status === 'break' ? n.status : full ? 'busy' : 'free'
  const reason =
    n.status === 'off' ? t('Не работает') : n.status === 'break' ? t('На перерыве') : full ? t('Нет свободных мест') : undefined
  return { ...n, status, activeChildren, available: !reason, unavailableReason: reason }
}

export const nanniesApi = {
  async list(): Promise<NannyWithLoad[]> {
    await delay(250)
    syncVisits()
    const order: Record<NannyStatus, number> = { free: 0, busy: 1, break: 2, off: 3 }
    return db.nannies
      .map(withLoad)
      .sort((a, b) => Number(b.available) - Number(a.available) || order[a.status] - order[b.status] || a.activeChildren - b.activeChildren)
  },
}

/* ---------- Интерфейс няни (ТЗ §13, §33 — только назначенные дети) ---------- */

export interface NannyWorkspace {
  nanny: NannyWithLoad
  current: VisitListItem[]
  completedToday: VisitListItem[]
}

export const nannyWorkspaceApi = {
  async get(employeeId: ID): Promise<NannyWorkspace> {
    await delay(250)
    syncVisits()
    const nanny = db.nannies.find((n) => n.employeeId === employeeId)
    if (!nanny) throw new ApiError('not_found', t('Профиль няни не найден'))
    const own = db.visits.filter((v) => v.nannyId === nanny.id)
    const today = new Date().toDateString()
    return {
      nanny: withLoad(nanny),
      current: own.filter(isOngoing).sort((a, b) => a.endAt.localeCompare(b.endAt)).map(toItem),
      completedToday: own
        .filter((v) => v.status === 'completed' && v.endedAt && new Date(v.endedAt).toDateString() === today)
        .sort((a, b) => b.endedAt!.localeCompare(a.endedAt!))
        .map(toItem),
    }
  },
}

/* ---------- Посещения (ТЗ §9, §11, §12) ---------- */

export interface VisitListItem extends Visit {
  child: Child
  parent: Parent
  nanny?: Nanny
  /** ТЗ §41 — кто завершил посещение (undefined — автоматически). */
  endedByName?: string
}

export type VisitsScope = 'current' | 'completed' | 'all'

export interface CreateVisitInput {
  childId: ID
  nannyId: ID
  durationMin: number
  createdBy: ID
  /** Скидка или промокод — что-то одно */
  discountId?: ID
  promoCode?: string
}

const toItem = (v: Visit): VisitListItem => {
  const child = db.children.find((c) => c.id === v.childId)!
  return {
    ...v,
    child,
    parent: db.parents.find((p) => p.id === child.parentId)!,
    nanny: db.nannies.find((n) => n.id === v.nannyId),
    endedByName: (() => {
      const e = v.endedBy && db.employees.find((x) => x.id === v.endedBy)
      return e ? `${e.firstName} ${e.lastName}` : undefined
    })(),
  }
}

/** Проверка рабочего времени (ТЗ §26). Возвращает текст ошибки или null. */
export function checkWorkHours(start: Date, durationMin: number, s: VisitSettings): string | null {
  if (!s.workHours) return t('Скайпарк сегодня закрыт{0}', s.closedReason ? `: ${s.closedReason.toLowerCase()}` : '')
  const startMin = start.getHours() * 60 + start.getMinutes()
  const open = hhmmToMinutes(s.workHours.open)
  const close = hhmmToMinutes(s.workHours.close)
  if (startMin < open || startMin >= close) return t('Скайпарк закрыт. Время работы: {0} — {1}', s.workHours.open, s.workHours.close)
  if (startMin + durationMin > close) return t('Посещение должно закончиться до {0}', s.workHours.close)
  return null
}

export const visitsApi = {
  async list(scope: VisitsScope = 'current'): Promise<VisitListItem[]> {
    await delay(250)
    syncVisits()
    let items = db.visits
    if (scope === 'current') items = items.filter(isOngoing)
    if (scope === 'completed') items = items.filter((v) => v.status === 'completed' || v.status === 'cancelled')
    const sorted = [...items].sort((a, b) =>
      scope === 'current' ? a.endAt.localeCompare(b.endAt) : b.startAt.localeCompare(a.startAt),
    )
    return sorted.map(toItem)
  },

  /** ТЗ §9.1 — создание посещения и запуск таймера. */
  async create(input: CreateVisitInput): Promise<Visit> {
    await delay(500)
    syncVisits()
    const child = db.children.find((c) => c.id === input.childId)
    if (!child) throw new ApiError('not_found', t('Ребёнок не найден'))
    if (db.visits.some((v) => v.childId === child.id && isOngoing(v)))
      throw new ApiError('conflict', t('Ребёнок уже находится на посещении'))
    const nanny = db.nannies.find((n) => n.id === input.nannyId)
    if (!nanny) throw new ApiError('not_found', t('Няня не найдена'))
    const load = withLoad(nanny)
    if (!load.available) throw new ApiError('conflict', t('Няня недоступна: {0}', load.unavailableReason?.toLowerCase()))
    const settings = currentVisitSettings()
    if (!settings.durations.includes(input.durationMin)) throw new ApiError('validation', t('Выбранное время недоступно'))

    const start = new Date()
    const hoursError = checkWorkHours(start, input.durationMin, settings)
    if (hoursError) throw new ApiError('validation', hoursError)

    const basePrice = priceFor(input.durationMin, settings)
    let discount: VisitDiscount | undefined
    let promo: PromoCode | undefined
    if (input.discountId && input.promoCode) throw new ApiError('validation', t('Можно применить только скидку или только промокод'))
    if (input.discountId) {
      const d = db.discounts.find((x) => x.id === input.discountId)
      if (!d || !isDiscountActive(d)) throw new ApiError('validation', t('Скидка недоступна'))
      discount = { source: 'discount', id: d.id, label: d.name, kind: d.kind, value: d.value, amount: discountAmount(d.kind, d.value, basePrice), appliedBy: input.createdBy }
    }
    if (input.promoCode) {
      const check = checkPromo(input.promoCode, child.parentId)
      if (!check.valid) throw new ApiError('validation', check.reason)
      promo = check.promo
      discount = { source: 'promo', id: promo.id, label: promo.code, kind: promo.kind, value: promo.value, amount: discountAmount(promo.kind, promo.value, basePrice), appliedBy: input.createdBy }
    }

    const visit: Visit = {
      id: uid('v'),
      childId: child.id,
      nannyId: nanny.id,
      startAt: start.toISOString(),
      durationMin: input.durationMin,
      endAt: new Date(start.getTime() + input.durationMin * 60_000).toISOString(),
      status: 'active',
      price: basePrice - (discount?.amount ?? 0),
      ...(discount && { basePrice, discount }),
      paymentStatus: 'unpaid',
      extensions: [],
      createdBy: input.createdBy,
    }
    db.visits.push(visit)
    if (promo) promo.usedCount += 1
    const name = fullNameOf(child)
    const link = `/children/${child.id}`
    audit({
      action: 'visit_created',
      actorId: input.createdBy,
      subject: name,
      details: t('Няня: {0} · {1} мин', fullNameOf(nanny), input.durationMin),
      link,
    })
    if (discount)
      audit({
        action: 'discount_applied',
        actorId: input.createdBy,
        subject: name,
        details: t('{0} «{1}»: −{2} сум', discount.source === 'promo' ? t('Промокод') : t('Скидка'), discount.label, discount.amount.toLocaleString(LOCALE)),
        link,
      })
    notify(visit, 'visit_started', ['parent'], t('{0}: посещение началось, окончание в {1}', name, hhmm(visit.endAt)))
    persist()
    return visit
  },

  /** ТЗ §12 — ручное завершение посещения сотрудником. */
  async finish(id: ID, by: ID): Promise<Visit> {
    await delay(400)
    const v = db.visits.find((x) => x.id === id)
    if (!v) throw new ApiError('not_found', t('Посещение не найдено'))
    if (!isOngoing(v)) throw new ApiError('conflict', t('Посещение уже завершено'))
    v.status = 'completed'
    v.endedAt = new Date().toISOString()
    v.endedBy = by
    cancelPendingExtensions(v)
    finishedEvents(v)
    persist()
    return v
  },
}

/* ---------- Продление (ТЗ §16–19, §37, §38) ---------- */

/*
 * Решение принимает родитель в Telegram-боте. Пока бота нет, эти же вызовы делает
 * демо-окно на экране посещений. Оплата — заглушка: исход задаётся вызовом pay(),
 * позже его будет присылать платёжный провайдер.
 */

export interface ExtensionOption {
  minutes: number
  price: number
  /** ТЗ §44 — «выбранное время недоступно» (продление выходит за часы работы). */
  unavailableReason?: string
}

function findOngoing(id: ID): Visit {
  const v = db.visits.find((x) => x.id === id)
  if (!v) throw new ApiError('not_found', t('Посещение не найдено'))
  if (!isOngoing(v)) throw new ApiError('conflict', t('Посещение уже завершено'))
  return v
}

function extensionFitError(endAt: string, minutes: number, s: VisitSettings): string | undefined {
  if (!s.workHours) return t('Скайпарк сегодня закрыт')
  const end = new Date(endAt)
  const endMin = end.getHours() * 60 + end.getMinutes()
  if (endMin + minutes > hhmmToMinutes(s.workHours.close)) return t('Скайпарк работает до {0}', s.workHours.close)
  return undefined
}

export const extensionsApi = {
  /** Шаг 1 — варианты дополнительного времени (настраиваются в «Настройках»). */
  async options(visitId: ID): Promise<ExtensionOption[]> {
    await delay(200)
    syncVisits()
    const v = findOngoing(visitId)
    const s = currentVisitSettings()
    return db.settings.extensionOptions.map((minutes) => ({
      minutes,
      price: priceFor(minutes, s),
      unavailableReason: extensionFitError(v.endAt, minutes, s),
    }))
  },

  /** Шаги 1–2 — родитель выбрал время: система считает стоимость и создаёт платёж «Ожидает оплаты». */
  async request(visitId: ID, minutes: number): Promise<Extension> {
    await delay(400)
    syncVisits()
    const v = findOngoing(visitId)
    if (v.status !== 'awaiting_extension') throw new ApiError('conflict', t('Продление сейчас недоступно'))
    if (!db.settings.extensionOptions.includes(minutes)) throw new ApiError('validation', t('Выбранное время недоступно'))
    const s = currentVisitSettings()
    const fit = extensionFitError(v.endAt, minutes, s)
    if (fit) throw new ApiError('validation', t('Выбранное время недоступно: {0}', fit))
    cancelPendingExtensions(v)
    const ext: Extension = {
      id: uid('x'),
      visitId: v.id,
      minutes,
      price: priceFor(minutes, s),
      paymentStatus: 'pending',
      createdAt: new Date().toISOString(),
    }
    v.extensions.push(ext)
    persist()
    return ext
  },

  /** Шаги 3–4 — результат онлайн-оплаты. После успешной оплаты время окончания сдвигается. */
  async pay(visitId: ID, extensionId: ID, outcome: 'paid' | 'failed'): Promise<Visit> {
    await delay(900)
    syncVisits()
    const v = findOngoing(visitId)
    const ext = v.extensions.find((e) => e.id === extensionId)
    if (!ext || ext.paymentStatus !== 'pending') throw new ApiError('conflict', t('Платёж уже обработан или отменён'))
    const name = childLabel(v.childId)
    if (outcome === 'failed') {
      ext.paymentStatus = 'failed'
      notify(v, 'payment_failed', ['parent'], t('{0}: ошибка оплаты продления', name))
      persist()
      return v
    }
    ext.paymentStatus = 'paid'
    v.endAt = new Date(new Date(v.endAt).getTime() + ext.minutes * 60_000).toISOString()
    v.status = 'extended'
    audit({ action: 'visit_extended', actorLabel: PARENT_ACTOR(), subject: name, details: t('+{0} мин, до {1}', ext.minutes, hhmm(v.endAt)), link: `/children/${v.childId}` })
    notify(v, 'payment_paid', ['parent'], t('{0}: оплата продления проведена', name))
    notify(v, 'extended', ['parent', 'staff'], t('{0}: посещение продлено на {1} мин, до {2}', name, ext.minutes, hhmm(v.endAt)))
    persist()
    return v
  },

  /** ТЗ §18 — отказ: решение фиксируется, окончание не меняется, по времени посещение завершится само. */
  async decline(visitId: ID): Promise<Visit> {
    await delay(400)
    syncVisits()
    const v = findOngoing(visitId)
    if (v.status !== 'awaiting_extension') throw new ApiError('conflict', t('Продление сейчас недоступно'))
    cancelPendingExtensions(v)
    v.extensionDeclined = { at: new Date().toISOString(), endAt: v.endAt }
    v.status = runningStatus(v)
    const name = childLabel(v.childId)
    audit({ action: 'extension_declined', actorLabel: PARENT_ACTOR(), subject: name, details: t('Окончание в {0}', hhmm(v.endAt)), link: `/children/${v.childId}` })
    notify(v, 'extension_declined', ['parent', 'staff'], t('{0}: продление не требуется, посещение завершится в {1}', name, hhmm(v.endAt)))
    persist()
    return v
  },
}
