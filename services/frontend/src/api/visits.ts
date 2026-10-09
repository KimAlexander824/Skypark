import type { Child, ID, Nanny, NannyStatus, Parent, Visit } from '@/types'
import { EXTENSION_NOTICE_MIN, hhmmToMinutes, isOngoing } from '@/lib/time'
import { exceptionTypeLabel, hoursFor } from '@/lib/schedule'
import { ApiError } from './errors'
import { db, delay, persist, uid } from './mock/db'

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
    closedReason: today.exception ? exceptionTypeLabel[today.exception.type] : today.open ? undefined : 'Выходной день',
  }
}

export const settingsApi = {
  async get(): Promise<VisitSettings> {
    await delay(150)
    return currentVisitSettings()
  },
}

export const priceFor = (minutes: number, s: VisitSettings) => Math.round((s.hourlyRate * minutes) / 60)

/* ---------- Автоматические переходы статусов (ТЗ §12, §16) ---------- */

/**
 * На backend это будет фоновая задача. В мок-режиме выполняется при каждом чтении:
 * — за 15 минут до конца посещение переходит в «Ожидает продления»;
 * — по окончании оплаченного времени посещение завершается автоматически.
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
      changed = true
    } else if (v.status === 'active' && end - now <= EXTENSION_NOTICE_MIN * 60_000) {
      v.status = 'awaiting_extension'
      changed = true
    }
  }
  if (changed) persist()
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
    n.status === 'off' ? 'Не работает' : n.status === 'break' ? 'На перерыве' : full ? 'Нет свободных мест' : undefined
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
    if (!nanny) throw new ApiError('not_found', 'Профиль няни не найден')
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
  if (!s.workHours) return `Скайпарк сегодня закрыт${s.closedReason ? `: ${s.closedReason.toLowerCase()}` : ''}`
  const startMin = start.getHours() * 60 + start.getMinutes()
  const open = hhmmToMinutes(s.workHours.open)
  const close = hhmmToMinutes(s.workHours.close)
  if (startMin < open || startMin >= close) return `Скайпарк закрыт. Время работы: ${s.workHours.open} — ${s.workHours.close}`
  if (startMin + durationMin > close) return `Посещение должно закончиться до ${s.workHours.close}`
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
    if (!child) throw new ApiError('not_found', 'Ребёнок не найден')
    if (db.visits.some((v) => v.childId === child.id && isOngoing(v)))
      throw new ApiError('conflict', 'Ребёнок уже находится на посещении')
    const nanny = db.nannies.find((n) => n.id === input.nannyId)
    if (!nanny) throw new ApiError('not_found', 'Няня не найдена')
    const load = withLoad(nanny)
    if (!load.available) throw new ApiError('conflict', `Няня недоступна: ${load.unavailableReason?.toLowerCase()}`)
    const settings = currentVisitSettings()
    if (!settings.durations.includes(input.durationMin)) throw new ApiError('validation', 'Выбранное время недоступно')

    const start = new Date()
    const hoursError = checkWorkHours(start, input.durationMin, settings)
    if (hoursError) throw new ApiError('validation', hoursError)

    const visit: Visit = {
      id: uid('v'),
      childId: child.id,
      nannyId: nanny.id,
      startAt: start.toISOString(),
      durationMin: input.durationMin,
      endAt: new Date(start.getTime() + input.durationMin * 60_000).toISOString(),
      status: 'active',
      price: priceFor(input.durationMin, settings),
      paymentStatus: 'unpaid',
      extensions: [],
      createdBy: input.createdBy,
    }
    db.visits.push(visit)
    persist()
    return visit
  },

  /** ТЗ §12 — ручное завершение посещения сотрудником. */
  async finish(id: ID, by: ID): Promise<Visit> {
    await delay(400)
    const v = db.visits.find((x) => x.id === id)
    if (!v) throw new ApiError('not_found', 'Посещение не найдено')
    if (!isOngoing(v)) throw new ApiError('conflict', 'Посещение уже завершено')
    v.status = 'completed'
    v.endedAt = new Date().toISOString()
    v.endedBy = by
    persist()
    return v
  },
}
