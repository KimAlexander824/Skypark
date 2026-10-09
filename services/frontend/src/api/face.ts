import type { ID } from '@/types'
import { db, delay } from './mock/db'

/**
 * Распознавание лиц. Два режима (переменная `VITE_FACE_API` в `.env.local`):
 * - `mock` (по умолчанию) — правдоподобные случайные ответы, без сервиса;
 * - `service` — настоящий сервис распознавания (services/recognition, HTTP API)
 *   через прокси Vite `/recognition` → `RECOGNITION_URL` (см. vite.config.ts).
 *
 * Контракт сервиса: docs/contracts/recognition.md.
 * Когда появится основной backend, фронтенд будет ходить в него, а не в сервис напрямую —
 * поменяется только этот файл.
 */
export const faceMode: 'mock' | 'service' = import.meta.env.VITE_FACE_API === 'service' ? 'service' : 'mock'

export interface FaceCandidate {
  childId: ID
  confidence: number
}

/** Ответ поиска по фото (ТЗ §39) и ошибки фото (§44). */
export type FaceResult =
  | { status: 'match'; childId: ID; confidence: number }
  | { status: 'ambiguous'; candidates: FaceCandidate[] }
  | { status: 'not_found' }
  | { status: 'no_face' }
  | { status: 'multiple_faces' }
  | { status: 'low_quality' }
  | { status: 'bad_image' }
  /** Сервис недоступен (§43): искать ребёнка по телефону. */
  | { status: 'unavailable' }

export type FaceErrorCode = 'no_face' | 'multiple_faces' | 'low_quality' | 'bad_image' | 'unavailable'

export type EnrollResult = { ok: true; facesCount: number; ignoredFaces: number } | { ok: false; error: FaceErrorCode; message?: string }

/* ---------- Мост идентификаторов ---------- */

/*
 * Сервис хранит лица по целому child_id, а в демо-базе id строковые («c2», «cl8x…»).
 * До появления backend (где id будут общими) держим соответствие в localStorage:
 * «c<число>» → это число, остальные — по порядку начиная с 1000.
 */
const IDS_KEY = 'skypark.faceIds'

function readIds(): { map: Record<ID, number>; next: number } {
  try {
    const raw = localStorage.getItem(IDS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* повреждённые данные — начинаем заново */
  }
  return { map: {}, next: 1000 }
}

function toServiceId(childId: ID): number {
  const seeded = /^c(\d+)$/.exec(childId)
  if (seeded) return Number(seeded[1])
  const ids = readIds()
  if (ids.map[childId] === undefined) {
    ids.map[childId] = ids.next++
    try {
      localStorage.setItem(IDS_KEY, JSON.stringify(ids))
    } catch {
      /* не критично */
    }
  }
  return ids.map[childId]
}

function fromServiceId(serviceId: number): ID | undefined {
  const seeded = `c${serviceId}`
  if (db.children.some((c) => c.id === seeded)) return seeded
  const entry = Object.entries(readIds().map).find(([, n]) => n === serviceId)
  return entry && db.children.some((c) => c.id === entry[0]) ? entry[0] : undefined
}

/* ---------- HTTP ---------- */

const BASE = '/recognition/api/recognition'

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob()
}

async function photoForm(photo: string) {
  const form = new FormData()
  form.append('photo', await dataUrlToBlob(photo), 'photo.jpg')
  return form
}

type ServiceError = { error?: string; message?: string }

/** Ошибка фото (422) или недоступность сервиса (сеть, 5xx, прокси без сервиса). */
async function toFaceError(res: Response | null): Promise<{ error: FaceErrorCode; message?: string }> {
  if (!res || res.status >= 500) return { error: 'unavailable' }
  const body: ServiceError = await res.json().catch(() => ({}))
  const known: FaceErrorCode[] = ['no_face', 'multiple_faces', 'low_quality', 'bad_image']
  const error = known.find((k) => k === body.error) ?? 'bad_image'
  return { error, message: body.message }
}

async function request(path: string, init: RequestInit): Promise<Response | null> {
  try {
    return await fetch(`${BASE}${path}`, init)
  } catch {
    return null
  }
}

interface IdentifyOut {
  status: 'found' | 'not_found' | 'ambiguous'
  child_id: number | null
  confidence: number | null
  candidates: { child_id: number; confidence: number; is_match: boolean }[]
}

const service = {
  async identify(photo: string): Promise<FaceResult> {
    const res = await request('/identify', { method: 'POST', body: await photoForm(photo) })
    if (!res?.ok) return { status: (await toFaceError(res)).error }
    const out: IdentifyOut = await res.json()

    if (out.status === 'found' && out.child_id !== null) {
      const childId = fromServiceId(out.child_id)
      // лицо есть в сервисе, но такого ребёнка нет в демо-базе (например, после сброса демо-данных)
      return childId ? { status: 'match', childId, confidence: out.confidence ?? 0 } : { status: 'not_found' }
    }
    if (out.status === 'ambiguous') {
      const candidates = out.candidates
        .map((c) => ({ childId: fromServiceId(c.child_id), confidence: c.confidence }))
        .filter((c): c is FaceCandidate => Boolean(c.childId))
      if (candidates.length === 1) return { status: 'match', ...candidates[0] }
      if (candidates.length > 1) return { status: 'ambiguous', candidates }
    }
    return { status: 'not_found' }
  },

  async enroll(childId: ID, photo: string, source: 'registration' | 'visit'): Promise<EnrollResult> {
    const res = await request(`/faces/${toServiceId(childId)}?source=${source}`, { method: 'POST', body: await photoForm(photo) })
    if (!res?.ok) return { ok: false, ...(await toFaceError(res)) }
    const out: { faces_count: number; ignored_faces: number } = await res.json()
    return { ok: true, facesCount: out.faces_count, ignoredFaces: out.ignored_faces }
  },

  /** Вырезка последнего запомненного лица — сотрудник сверяет, то ли лицо сохранено. */
  thumbnailUrl(childId: ID) {
    return `${BASE}/faces/${toServiceId(childId)}/thumbnail?t=${Date.now()}`
  },

  async deleteFaces(childId: ID) {
    await request(`/faces/${toServiceId(childId)}`, { method: 'DELETE' })
  },
}

/* ---------- Заглушка ---------- */

const mock = {
  async identify(_photo: string): Promise<FaceResult> {
    await delay(1400)
    const r = Math.random()
    const candidates = db.children.filter((c) => c.hasFaceProfile)
    if (r < 0.62 && candidates.length) {
      const child = candidates[Math.floor(Math.random() * candidates.length)]
      return { status: 'match', childId: child.id, confidence: 0.86 + Math.random() * 0.12 }
    }
    if (r < 0.7 && candidates.length > 1) {
      const [a, b] = [...candidates].sort(() => Math.random() - 0.5)
      return { status: 'ambiguous', candidates: [{ childId: a.id, confidence: 0.71 }, { childId: b.id, confidence: 0.69 }] }
    }
    if (r < 0.85) return { status: 'not_found' }
    if (r < 0.92) return { status: 'low_quality' }
    if (r < 0.96) return { status: 'multiple_faces' }
    return { status: 'no_face' }
  },

  async enroll(_childId: ID, _photo: string, _source: 'registration' | 'visit'): Promise<EnrollResult> {
    await delay(500)
    return { ok: true, facesCount: 1, ignoredFaces: 0 }
  },

  thumbnailUrl(_childId: ID): string | undefined {
    return undefined
  },

  async deleteFaces(_childId: ID) {},
}

export const faceApi: {
  identify(photo: string): Promise<FaceResult>
  enroll(childId: ID, photo: string, source: 'registration' | 'visit'): Promise<EnrollResult>
  thumbnailUrl(childId: ID): string | undefined
  deleteFaces(childId: ID): Promise<void>
} = faceMode === 'service' ? service : mock
