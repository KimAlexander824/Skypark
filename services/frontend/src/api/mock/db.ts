import type { AppNotification, AppSettings, AuditEntry, Child, Discount, Employee, Nanny, News, Parent, PromoCode, Visit, WorkSchedule } from '@/types'

/**
 * Временное хранилище до подключения backend.
 * Данные живут в localStorage, чтобы переживать перезагрузку страницы.
 */
export interface MockDB {
  parents: Parent[]
  children: Child[]
  employees: Employee[]
  nannies: Nanny[]
  visits: Visit[]
  passwords: Record<string, string> // employeeId → пароль
  settings: AppSettings
  schedule: WorkSchedule
  discounts: Discount[]
  promoCodes: PromoCode[]
  news: News[]
  /** ТЗ §41 — журнал действий, новые записи первыми */
  audit: AuditEntry[]
  /** ТЗ §30 — уведомления родителям и сотрудникам, новые первыми */
  notifications: AppNotification[]
}

const STORAGE_KEY = 'skypark.mockdb.v5'

const daysAgo = (d: number, h = 12, m = 0) => {
  const date = new Date()
  date.setDate(date.getDate() - d)
  date.setHours(h, m, 0, 0)
  return date.toISOString()
}

const minutesAgo = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
const addMin = (iso: string, min: number) => new Date(new Date(iso).getTime() + min * 60_000).toISOString()

function seed(): MockDB {
  const employees: Employee[] = [
    { id: 'e1', firstName: 'Abdulloh', lastName: 'Rahimov', phone: '998901112233', position: 'Администратор', role: 'admin', experienceYears: 6, status: 'active', createdAt: daysAgo(400) },
    { id: 'e2', firstName: 'Jasur', lastName: 'Karimov', phone: '998902223344', position: 'Администратор ресепшн', role: 'staff', experienceYears: 3, status: 'active', createdAt: daysAgo(210) },
    { id: 'e3', firstName: 'Madina', lastName: 'Yusupova', phone: '998903334455', position: 'Няня', role: 'nanny', experienceYears: 4, status: 'active', createdAt: daysAgo(180) },
    { id: 'e4', firstName: 'Gulnora', lastName: 'Ahmedova', phone: '998904445566', position: 'Няня', role: 'nanny', experienceYears: 7, status: 'active', createdAt: daysAgo(320) },
    { id: 'e5', firstName: 'Olga', lastName: 'Kim', phone: '998905556677', position: 'Няня', role: 'nanny', experienceYears: 2, status: 'active', createdAt: daysAgo(90) },
    { id: 'e6', firstName: 'Sabina', lastName: 'Tursunova', phone: '998906667788', position: 'Няня', role: 'nanny', experienceYears: 5, status: 'active', createdAt: daysAgo(260) },
    { id: 'e7', firstName: 'Nigora', lastName: 'Ismoilova', phone: '998907778899', position: 'Няня', role: 'nanny', experienceYears: 1, status: 'active', createdAt: daysAgo(40) },
  ]

  const nannies: Nanny[] = [
    { id: 'n1', employeeId: 'e3', firstName: 'Madina', lastName: 'Yusupova', phone: '998903334455', experienceYears: 4, startedAt: daysAgo(180), status: 'busy', workHours: '10:00 — 18:00', activeChildren: 2, maxChildren: 4 },
    { id: 'n2', employeeId: 'e4', firstName: 'Gulnora', lastName: 'Ahmedova', phone: '998904445566', experienceYears: 7, startedAt: daysAgo(320), status: 'free', workHours: '10:00 — 18:00', activeChildren: 1, maxChildren: 4 },
    { id: 'n3', employeeId: 'e5', firstName: 'Olga', lastName: 'Kim', phone: '998905556677', experienceYears: 2, startedAt: daysAgo(90), status: 'free', workHours: '14:00 — 22:00', activeChildren: 0, maxChildren: 3 },
    { id: 'n4', employeeId: 'e6', firstName: 'Sabina', lastName: 'Tursunova', phone: '998906667788', experienceYears: 5, startedAt: daysAgo(260), status: 'break', workHours: '12:00 — 20:00', activeChildren: 0, maxChildren: 4 },
    { id: 'n5', employeeId: 'e7', firstName: 'Nigora', lastName: 'Ismoilova', phone: '998907778899', experienceYears: 1, startedAt: daysAgo(40), status: 'off', workHours: '14:00 — 22:00', activeChildren: 0, maxChildren: 3 },
  ]

  const parents: Parent[] = [
    { id: 'p1', firstName: 'Ivan', lastName: 'Ivanov', phone: '998901234567', telegram: { linked: true, username: 'ivan_ivanov', linkedAt: daysAgo(60) }, createdAt: daysAgo(60) },
    { id: 'p2', firstName: 'Aziza', lastName: 'Nasirova', phone: '998935557711', telegram: { linked: true, username: 'aziza_n', linkedAt: daysAgo(30) }, createdAt: daysAgo(30) },
    { id: 'p3', firstName: 'Timur', lastName: 'Aliyev', phone: '998977001122', telegram: { linked: false }, createdAt: daysAgo(14) },
    { id: 'p4', firstName: 'Kamola', lastName: 'Sharipova', phone: '998998887766', telegram: { linked: true, username: 'kamola_sh', linkedAt: daysAgo(100) }, createdAt: daysAgo(100) },
    { id: 'p5', firstName: 'Sergey', lastName: 'Pak', phone: '998946543210', telegram: { linked: false }, createdAt: daysAgo(5) },
    { id: 'p6', firstName: 'Feruza', lastName: 'Mirzayeva', phone: '998909998877', telegram: { linked: true, username: 'feruza_m', linkedAt: daysAgo(2) }, createdAt: daysAgo(2) },
  ]

  const children: Child[] = [
    { id: 'c1', parentId: 'p1', firstName: 'Anna', lastName: 'Ivanova', birthDate: '2019-04-12', gender: 'female', hasFaceProfile: true, createdAt: daysAgo(60), createdBy: 'e2' },
    { id: 'c2', parentId: 'p1', firstName: 'Maksim', lastName: 'Ivanov', birthDate: '2017-09-03', gender: 'male', note: 'Аллергия на орехи', hasFaceProfile: true, createdAt: daysAgo(60), createdBy: 'e2' },
    { id: 'c3', parentId: 'p1', firstName: 'Sofiya', lastName: 'Ivanova', birthDate: '2021-01-25', gender: 'female', hasFaceProfile: true, createdAt: daysAgo(20), createdBy: 'e2' },
    { id: 'c4', parentId: 'p2', firstName: 'Amir', lastName: 'Nasirov', birthDate: '2018-06-18', gender: 'male', hasFaceProfile: true, createdAt: daysAgo(30), createdBy: 'e2' },
    { id: 'c5', parentId: 'p3', firstName: 'Leyla', lastName: 'Aliyeva', birthDate: '2020-11-07', gender: 'female', hasFaceProfile: false, createdAt: daysAgo(14), createdBy: 'e1' },
    { id: 'c6', parentId: 'p4', firstName: 'Samir', lastName: 'Sharipov', birthDate: '2016-03-30', gender: 'male', hasFaceProfile: true, createdAt: daysAgo(100), createdBy: 'e2' },
    { id: 'c7', parentId: 'p4', firstName: 'Madina', lastName: 'Sharipova', birthDate: '2019-08-14', gender: 'female', hasFaceProfile: true, createdAt: daysAgo(100), createdBy: 'e2' },
    { id: 'c8', parentId: 'p5', firstName: 'Daniel', lastName: 'Pak', birthDate: '2018-12-01', gender: 'male', hasFaceProfile: true, createdAt: daysAgo(5), createdBy: 'e2' },
    { id: 'c9', parentId: 'p6', firstName: 'Asal', lastName: 'Mirzayeva', birthDate: '2020-05-22', gender: 'female', hasFaceProfile: true, createdAt: daysAgo(2), createdBy: 'e2' },
  ]

  const completed = (id: string, childId: string, nannyId: string, d: number, h: number, dur: number, extra = 0): Visit => {
    const startAt = daysAgo(d, h)
    const ext = extra
      ? [{ id: id + '-x', visitId: id, minutes: extra, price: (extra / 60) * 50_000, paymentStatus: 'paid' as const, createdAt: addMin(startAt, dur - 15) }]
      : []
    return {
      id, childId, nannyId, startAt, durationMin: dur, endAt: addMin(startAt, dur + extra),
      status: 'completed', price: (dur / 60) * 50_000, paymentStatus: 'paid', extensions: ext,
      createdBy: 'e2', endedAt: addMin(startAt, dur + extra), endedBy: 'e2',
    }
  }

  const activeStart1 = minutesAgo(85)
  const activeStart2 = minutesAgo(25)
  const activeStart3 = minutesAgo(50)

  const visits: Visit[] = [
    { id: 'v100', childId: 'c1', nannyId: 'n1', startAt: activeStart1, durationMin: 120, endAt: addMin(activeStart1, 120), status: 'active', price: 100_000, paymentStatus: 'paid', extensions: [], createdBy: 'e2' },
    { id: 'v101', childId: 'c2', nannyId: 'n1', startAt: activeStart2, durationMin: 120, endAt: addMin(activeStart2, 120), status: 'active', price: 100_000, paymentStatus: 'paid', extensions: [], createdBy: 'e2' },
    { id: 'v102', childId: 'c4', nannyId: 'n2', startAt: activeStart3, durationMin: 60, endAt: addMin(activeStart3, 60), status: 'awaiting_extension', price: 50_000, paymentStatus: 'paid', extensions: [], createdBy: 'e2' },
    completed('v1', 'c1', 'n2', 7, 15, 120, 60),
    completed('v2', 'c2', 'n2', 7, 15, 120),
    completed('v3', 'c1', 'n1', 21, 11, 60),
    completed('v4', 'c6', 'n4', 3, 16, 180),
    completed('v5', 'c7', 'n4', 3, 16, 120, 30),
    completed('v6', 'c4', 'n1', 12, 13, 60),
    completed('v7', 'c8', 'n3', 5, 18, 60),
    completed('v8', 'c3', 'n2', 20, 12, 60),
    { ...completed('v9', 'c9', 'n3', 2, 17, 120), status: 'cancelled', paymentStatus: 'refunded' },
  ]

  visits.push(
    { id: 'v103', childId: 'c6', nannyId: 'n3', startAt: minutesAgo(40), durationMin: 120, endAt: addMin(minutesAgo(40), 120), status: 'active', price: 100_000, paymentStatus: 'paid', extensions: [], createdBy: 'e2' },
    { id: 'v104', childId: 'c8', nannyId: 'n2', startAt: minutesAgo(70), durationMin: 180, endAt: addMin(minutesAgo(70), 180), status: 'extended', price: 150_000, paymentStatus: 'paid', extensions: [{ id: 'v104-x', visitId: 'v104', minutes: 60, price: 50_000, paymentStatus: 'paid', createdAt: minutesAgo(10) }], createdBy: 'e2' },
  )
  // у v104 есть продление — окончание сдвигается
  visits[visits.length - 1].endAt = addMin(visits[visits.length - 1].startAt, 240)

  visits.push(...generateHistory(children, nannies))

  const passwords = Object.fromEntries(employees.map((e) => [e.id, '123456']))

  const isoDay = (offset: number) => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const settings: AppSettings = { hourlyRate: 50_000, durations: [30, 60, 120, 180], extensionOptions: [30, 60, 120], extensionNoticeMin: 15 }

  const schedule: WorkSchedule = {
    week: Array.from({ length: 7 }, (_, day) => ({ day, open: true, from: '10:00', to: '22:00' })),
    exceptions: [
      { id: 'ex1', dateFrom: isoDay(25), dateTo: isoDay(25), type: 'holiday', from: '12:00', to: '18:00', comment: 'Праздничный день — сокращённый график' },
      { id: 'ex2', dateFrom: isoDay(40), dateTo: isoDay(41), type: 'closure', comment: 'Санитарные дни' },
    ],
  }

  const discounts: Discount[] = [
    { id: 'd1', name: 'Будние дни до 14:00', kind: 'percent', value: 15, dateFrom: isoDay(-30), dateTo: isoDay(60), conditions: 'Пн–Пт, начало посещения до 14:00', status: 'active', createdAt: daysAgo(30), createdBy: 'e1' },
    { id: 'd2', name: 'Второй ребёнок', kind: 'percent', value: 20, dateFrom: isoDay(-90), dateTo: isoDay(270), conditions: 'Для второго и следующих детей одного родителя', status: 'active', createdAt: daysAgo(90), createdBy: 'e1' },
    { id: 'd3', name: 'День рождения', kind: 'fixed', value: 50_000, dateFrom: isoDay(-120), dateTo: isoDay(-10), conditions: 'В день рождения ребёнка', status: 'inactive', createdAt: daysAgo(120), createdBy: 'e1' },
  ]

  const promoCodes: PromoCode[] = [
    { id: 'pc1', code: 'SKY2026', kind: 'percent', value: 10, dateFrom: isoDay(-20), dateTo: isoDay(40), usageLimit: 200, usedCount: 87, perParentLimit: 1, status: 'active', createdAt: daysAgo(20), createdBy: 'e1' },
    { id: 'pc2', code: 'WELCOME', kind: 'fixed', value: 25_000, dateFrom: isoDay(-60), dateTo: isoDay(120), usageLimit: 500, usedCount: 312, perParentLimit: 1, status: 'active', createdAt: daysAgo(60), createdBy: 'e1' },
    { id: 'pc3', code: 'SUMMER', kind: 'percent', value: 25, dateFrom: isoDay(-120), dateTo: isoDay(-30), usageLimit: 100, usedCount: 100, perParentLimit: 2, status: 'inactive', createdAt: daysAgo(120), createdBy: 'e1' },
  ]

  const news: News[] = [
    { id: 'nw1', title: 'Новая игровая зона «Космос»', text: 'Мы открыли новую зону для детей от 5 лет: батуты, лабиринт и космическая горка.', publishAt: daysAgo(3), status: 'published', createdAt: daysAgo(4) },
    { id: 'nw2', title: 'Мастер-класс по рисованию', text: 'В субботу в 15:00 — бесплатный мастер-класс для всех гостей Skypark.', publishAt: daysAgo(-2), status: 'draft', createdAt: daysAgo(1) },
    { id: 'nw3', title: 'Летние каникулы', text: 'Специальное расписание и скидки на весь летний сезон.', publishAt: daysAgo(100), status: 'archived', createdAt: daysAgo(101) },
  ]

  const out: MockDB = { parents, children, employees, nannies, visits, passwords, settings, schedule, discounts, promoCodes, news, audit: [], notifications: [] }
  out.audit = deriveAudit(out)
  return out
}

/** Детерминированный генератор, чтобы история была одинаковой при каждом сбросе. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** История посещений за 45 дней для аналитики (включая утро сегодняшнего дня). */
function generateHistory(children: Child[], nannies: Nanny[]): Visit[] {
  const rnd = mulberry32(42)
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)]
  const workers = nannies.filter((n) => n.status !== 'off')
  const durations = [30, 60, 60, 120, 120, 120, 180]
  const out: Visit[] = []
  for (let d = 45; d >= 0; d--) {
    const weekday = new Date(daysAgo(d)).getDay()
    const weekend = weekday === 0 || weekday === 6
    const count = d === 0 ? 3 : Math.floor((weekend ? 8 : 4) + rnd() * 5)
    for (let i = 0; i < count; i++) {
      const dur = pick(durations)
      // сегодня — только утренние посещения, уже завершённые
      const hour = d === 0 ? 10 + Math.floor(rnd() * 2) : 10 + Math.floor(rnd() * (21 - Math.ceil(dur / 60) - 10))
      const startAt = daysAgo(d, hour, pick([0, 15, 30, 45]))
      const id = `h${d}-${i}`
      const extensions: Visit['extensions'] = []
      if (rnd() < 0.28) {
        const minutes = pick([30, 60, 60])
        const failed = rnd() < 0.12
        extensions.push({ id: id + '-x', visitId: id, minutes, price: (minutes / 60) * 50_000, paymentStatus: failed ? 'failed' : 'paid', createdAt: addMin(startAt, dur - 15) })
      }
      const paidExt = extensions.filter((e) => e.paymentStatus === 'paid').reduce((s, e) => s + e.minutes, 0)
      const cancelled = rnd() < 0.03
      const endAt = addMin(startAt, dur + paidExt)
      if (d === 0 && new Date(endAt).getTime() > Date.now()) continue
      // ребёнок должен быть зарегистрирован до посещения
      const eligible = children.filter((c) => c.createdAt <= startAt)
      if (!eligible.length) continue
      out.push({
        id,
        childId: pick(eligible).id,
        nannyId: pick(workers).id,
        startAt,
        durationMin: dur,
        endAt,
        status: cancelled ? 'cancelled' : 'completed',
        price: (dur / 60) * 50_000,
        paymentStatus: cancelled ? 'refunded' : 'paid',
        extensions: cancelled ? [] : extensions,
        createdBy: 'e2',
        endedAt: endAt,
        endedBy: rnd() < 0.2 ? 'e2' : undefined,
      })
    }
  }
  return out
}

/** Журнал по уже существующим данным — для демо-базы и баз, созданных до появления журнала. */
function deriveAudit(d: Pick<MockDB, 'children' | 'visits' | 'nannies' | 'discounts' | 'promoCodes'>): AuditEntry[] {
  const out: AuditEntry[] = []
  const name = (c?: Child) => (c ? `${c.firstName} ${c.lastName}` : '—')
  let n = 0
  const add = (e: Omit<AuditEntry, 'id'>) => out.push({ id: `a-seed-${n++}`, ...e })
  for (const c of d.children) add({ at: c.createdAt, action: 'child_registered', actorId: c.createdBy, subject: name(c), link: `/children/${c.id}` })
  for (const v of d.visits) {
    const child = d.children.find((c) => c.id === v.childId)
    const nanny = d.nannies.find((x) => x.id === v.nannyId)
    const link = `/children/${v.childId}`
    add({ at: v.startAt, action: 'visit_created', actorId: v.createdBy, subject: name(child), details: nanny ? `Няня: ${nanny.firstName} ${nanny.lastName}` : undefined, link })
    for (const e of v.extensions)
      if (e.paymentStatus === 'paid') add({ at: e.createdAt, action: 'visit_extended', actorLabel: 'Родитель (Telegram)', subject: name(child), details: `+${e.minutes} мин`, link })
    if (v.status === 'completed' && v.endedAt)
      add({ at: v.endedAt, action: 'visit_finished', actorId: v.endedBy, actorLabel: v.endedBy ? undefined : 'Система', subject: name(child), link })
  }
  for (const x of d.discounts) add({ at: x.createdAt, action: 'discount_saved', actorId: x.createdBy, subject: x.name, details: 'Создана скидка' })
  for (const x of d.promoCodes) add({ at: x.createdAt, action: 'promo_saved', actorId: x.createdBy, subject: x.code, details: 'Создан промокод' })
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 1000)
}

/** Демо-имена переведены на латиницу — для баз, сохранённых раньше. */
const LATIN_NAMES: Record<string, string> = {
  Рахимова: 'Rahimov',
  Жасур: 'Jasur',
  Каримов: 'Karimov',
  Мадина: 'Madina',
  Юсупова: 'Yusupova',
  Гульнора: 'Gulnora',
  Ахмедова: 'Ahmedova',
  Ольга: 'Olga',
  Ким: 'Kim',
  Сабина: 'Sabina',
  Турсунова: 'Tursunova',
  Нигора: 'Nigora',
  Исмоилова: 'Ismoilova',
  Иван: 'Ivan',
  Иванов: 'Ivanov',
  Азиза: 'Aziza',
  Насырова: 'Nasirova',
  Тимур: 'Timur',
  Алиев: 'Aliyev',
  Камола: 'Kamola',
  Шарипова: 'Sharipova',
  Сергей: 'Sergey',
  Пак: 'Pak',
  Феруза: 'Feruza',
  Мирзаева: 'Mirzayeva',
  Анна: 'Anna',
  Иванова: 'Ivanova',
  Максим: 'Maksim',
  София: 'Sofiya',
  Амир: 'Amir',
  Насыров: 'Nasirov',
  Лейла: 'Leyla',
  Алиева: 'Aliyeva',
  Самир: 'Samir',
  Шарипов: 'Sharipov',
  Даниэль: 'Daniel',
  Асаль: 'Asal',
}

function latinizeNames(d: MockDB) {
  const fix = (x: { firstName: string; lastName?: string }) => {
    x.firstName = LATIN_NAMES[x.firstName] ?? x.firstName
    if (x.lastName) x.lastName = LATIN_NAMES[x.lastName] ?? x.lastName
  }
  ;[...d.employees, ...d.nannies, ...d.parents, ...d.children].forEach(fix)
  const re = new RegExp(`(?<![А-Яа-яЁё])(${Object.keys(LATIN_NAMES).join('|')})(?![А-Яа-яЁё])`, 'g')
  const text = (v?: string) => v?.replace(re, (w) => LATIN_NAMES[w])
  for (const a of d.audit) {
    a.subject = text(a.subject) ?? a.subject
    a.details = text(a.details)
  }
  for (const n of d.notifications) n.text = text(n.text) ?? n.text
}

function load(): MockDB {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as MockDB
      // базы, сохранённые до появления журнала и уведомлений
      parsed.audit ??= deriveAudit(parsed)
      parsed.notifications ??= []
      // администратор e1 переименован — обновляем и уже сохранённую базу
      const admin = parsed.employees?.find((e) => e.id === 'e1')
      if (admin && (admin.firstName === 'Дилноза' || admin.firstName === 'Абдуллох')) admin.firstName = 'Abdulloh'
      latinizeNames(parsed)
      return parsed
    }
  } catch {
    // повреждённые данные — пересоздаём
  }
  const fresh = seed()
  save(fresh)
  return fresh
}

function save(db: MockDB) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch {
    // хранилище недоступно — работаем в памяти
  }
}

export const db: MockDB = load()

export const persist = () => save(db)

export function resetMockDB() {
  localStorage.removeItem(STORAGE_KEY)
  location.reload()
}

export const uid = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** Имитация сетевой задержки. */
export const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms + Math.random() * 150))
