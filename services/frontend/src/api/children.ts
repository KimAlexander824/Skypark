import type { Child, Gender, ID, Nanny, Parent, Visit } from '@/types'
import { normalizePhone } from '@/lib/format'
import { isOngoing } from '@/lib/time'
import { ApiError } from './errors'
import { db, delay, persist, uid } from './mock/db'
import { syncVisits } from './visits'

export interface ChildListItem extends Child {
  parent: Parent
  visitsCount: number
  lastVisitAt?: string
  activeVisit?: Visit
}

export interface VisitWithNanny extends Visit {
  nanny?: Nanny
}

export interface ChildDetail {
  child: Child
  parent: Parent
  siblings: Child[]
  visits: VisitWithNanny[]
}

export interface ChildrenQuery {
  search?: string
  status?: 'all' | 'active' | 'no_visits'
  /** ТЗ §23 — дата посещения, YYYY-MM-DD */
  visitDate?: string
}

export interface NewParentInput {
  phone: string
  firstName: string
  lastName?: string
  note?: string
}

export interface NewChildInput {
  firstName: string
  lastName: string
  birthDate: string
  gender: Gender
  photoUrl?: string
  note?: string
}

export interface RegisterChildInput {
  parent: { existingId: ID } | { new: NewParentInput }
  child: NewChildInput
  createdBy: ID
}

function toListItem(child: Child): ChildListItem {
  const visits = db.visits.filter((v) => v.childId === child.id)
  const sorted = [...visits].sort((a, b) => b.startAt.localeCompare(a.startAt))
  return {
    ...child,
    parent: db.parents.find((p) => p.id === child.parentId)!,
    visitsCount: visits.filter((v) => v.status !== 'cancelled').length,
    lastVisitAt: sorted[0]?.startAt,
    activeVisit: visits.find(isOngoing),
  }
}

export const parentsApi = {
  /** ТЗ §5.1 — проверка существования родителя по номеру телефона. */
  async findByPhone(phone: string): Promise<{ parent: Parent; children: Child[] } | null> {
    await delay(300)
    const parent = db.parents.find((p) => p.phone === normalizePhone(phone))
    if (!parent) return null
    return { parent, children: db.children.filter((c) => c.parentId === parent.id) }
  },
}

export const childrenApi = {
  async list(query: ChildrenQuery = {}): Promise<ChildListItem[]> {
    await delay()
    syncVisits()
    const q = query.search?.trim().toLowerCase() ?? ''
    const digits = q.replace(/\D/g, '')
    let items = db.children.map(toListItem)
    if (q) {
      items = items.filter((c) => {
        const name = `${c.firstName} ${c.lastName} ${c.parent.firstName} ${c.parent.lastName ?? ''}`.toLowerCase()
        return name.includes(q) || (digits.length >= 3 && c.parent.phone.includes(digits))
      })
    }
    if (query.visitDate) {
      const day = query.visitDate
      const visited = new Set(
        db.visits
          .filter((v) => {
            const d = new Date(v.startAt)
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === day
          })
          .map((v) => v.childId),
      )
      items = items.filter((c) => visited.has(c.id))
    }
    if (query.status === 'active') items = items.filter((c) => c.activeVisit)
    if (query.status === 'no_visits') items = items.filter((c) => c.visitsCount === 0)
    return items.sort((a, b) => (b.lastVisitAt ?? b.createdAt).localeCompare(a.lastVisitAt ?? a.createdAt))
  },

  async get(id: ID): Promise<ChildDetail> {
    await delay()
    syncVisits()
    const child = db.children.find((c) => c.id === id)
    if (!child) throw new ApiError('not_found', 'Карточка ребёнка не найдена')
    const parent = db.parents.find((p) => p.id === child.parentId)!
    const visits = db.visits
      .filter((v) => v.childId === id)
      .sort((a, b) => b.startAt.localeCompare(a.startAt))
      .map((v) => ({ ...v, nanny: db.nannies.find((n) => n.id === v.nannyId) }))
    return {
      child,
      parent,
      siblings: db.children.filter((c) => c.parentId === parent.id && c.id !== id),
      visits,
    }
  },

  /** ТЗ §5 — регистрация ребёнка (с созданием родителя при необходимости). */
  async register(input: RegisterChildInput): Promise<Child> {
    await delay(600)
    let parentId: ID
    if ('existingId' in input.parent) {
      parentId = input.parent.existingId
    } else {
      const phone = normalizePhone(input.parent.new.phone)
      if (db.parents.some((p) => p.phone === phone)) {
        throw new ApiError('conflict', 'Родитель с таким номером уже существует')
      }
      const parent: Parent = {
        id: uid('p'),
        ...input.parent.new,
        phone,
        telegram: { linked: false },
        createdAt: new Date().toISOString(),
      }
      db.parents.push(parent)
      parentId = parent.id
    }
    const child: Child = {
      id: uid('c'),
      parentId,
      ...input.child,
      hasFaceProfile: Boolean(input.child.photoUrl),
      createdAt: new Date().toISOString(),
      createdBy: input.createdBy,
    }
    db.children.push(child)
    persist()
    return child
  },

  /** Есть ли у ребёнка сохранённый профиль лица (после успешной/неудачной записи в сервис распознавания). */
  async setFaceProfile(id: ID, hasFaceProfile: boolean): Promise<void> {
    const child = db.children.find((c) => c.id === id)
    if (!child) throw new ApiError('not_found', 'Ребёнок не найден')
    child.hasFaceProfile = hasFaceProfile
    persist()
  },
}
