import type { Visit } from '@/types'
import { isOngoing, visitTotalMinutes, visitTotalPrice } from '@/lib/time'
import { db, delay } from './mock/db'
import { syncVisits } from './visits'
import { LOCALE } from '@/i18n'

export interface DateRange {
  from: Date
  to: Date
}

export interface SeriesPoint {
  key: string
  label: string
  value: number
  future?: boolean
}

export interface NannyStat {
  id: string
  name: string
  hours: number
  children: number
}

export interface DashboardStats {
  children: { registered: number; new: number; repeatVisits: number }
  visits: { total: number; avgMinutes: number; completed: number; active: number }
  nannies: { hours: number; children: number; avgLoad: number; top: NannyStat[] }
  extensions: { count: number; percent: number; minutes: number; amount: number }
  payments: { count: number; amount: number; extensionsAmount: number; success: number; failed: number }
  visitsSeries: SeriesPoint[]
  revenueSeries: SeriesPoint[]
  granularity: 'hour' | 'day'
  previous: PeriodTotals
  previousVisitsSeries: SeriesPoint[]
}

export interface PeriodTotals {
  visits: number
  payments: number
  extensions: number
  newChildren: number
  nannyHours: number
}

export function previousRange(r: DateRange): DateRange {
  const days = Math.round((startOfDay(r.to).getTime() - startOfDay(r.from).getTime()) / 86_400_000) + 1
  const to = new Date(r.from.getFullYear(), r.from.getMonth(), r.from.getDate() - 1)
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - days + 1)
  return { from, to }
}

function totalsFor(range: DateRange): PeriodTotals {
  const visits = db.visits.filter((v) => v.status !== 'cancelled' && inRange(v.startAt, range))
  const paidExt = visits.flatMap((v) => v.extensions).filter((e) => e.paymentStatus === 'paid')
  const payments =
    visits.filter((v) => v.paymentStatus === 'paid').reduce((s, v) => s + v.price, 0) + paidExt.reduce((s, e) => s + e.price, 0)
  const byNannyDay = new Map<string, Visit[]>()
  visits.forEach((v) => {
    const k = `${v.nannyId}|${dayKey(new Date(v.startAt))}`
    byNannyDay.set(k, [...(byNannyDay.get(k) ?? []), v])
  })
  return {
    visits: visits.length,
    payments,
    extensions: paidExt.length,
    newChildren: db.children.filter((c) => inRange(c.createdAt, range)).length,
    nannyHours: [...byNannyDay.values()].reduce((s, l) => s + busyMinutes(l), 0) / 60,
  }
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
const inRange = (iso: string, r: DateRange) => {
  const t = new Date(iso).getTime()
  return t >= startOfDay(r.from).getTime() && t <= endOfDay(r.to).getTime()
}
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

function busyMinutes(visits: Visit[]) {
  const spans = visits
    .map((v) => [new Date(v.startAt).getTime(), Math.min(new Date(v.endedAt ?? v.endAt).getTime(), Date.now())] as const)
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0])
  let total = 0
  let [cs, ce] = spans[0] ?? [0, 0]
  for (const [s, e] of spans.slice(1)) {
    if (s <= ce) ce = Math.max(ce, e)
    else {
      total += ce - cs
      cs = s
      ce = e
    }
  }
  if (spans.length) total += ce - cs
  return total / 60_000
}

export const analyticsApi = {
  async dashboard(range: DateRange): Promise<DashboardStats> {
    await delay(300)
    syncVisits()

    const visits = db.visits.filter((v) => v.status !== 'cancelled' && inRange(v.startAt, range))
    const sortedAll = [...db.visits].filter((v) => v.status !== 'cancelled').sort((a, b) => a.startAt.localeCompare(b.startAt))
    const firstVisitAt = new Map<string, string>()
    for (const v of sortedAll) if (!firstVisitAt.has(v.childId)) firstVisitAt.set(v.childId, v.startAt)

    const registered = db.children.filter((c) => new Date(c.createdAt) <= endOfDay(range.to)).length
    const newChildren = db.children.filter((c) => inRange(c.createdAt, range)).length
    const repeatVisits = visits.filter((v) => firstVisitAt.get(v.childId) !== v.startAt).length

    const completed = visits.filter((v) => v.status === 'completed')
    const avgMinutes = completed.length ? completed.reduce((s, v) => s + visitTotalMinutes(v), 0) / completed.length : 0

    const top: NannyStat[] = db.nannies
      .map((n) => {
        const own = visits.filter((v) => v.nannyId === n.id)
        const byDay = new Map<string, Visit[]>()
        own.forEach((v) => {
          const k = dayKey(new Date(v.startAt))
          byDay.set(k, [...(byDay.get(k) ?? []), v])
        })
        const hours = [...byDay.values()].reduce((s, list) => s + busyMinutes(list), 0) / 60
        return { id: n.id, name: `${n.firstName} ${n.lastName}`, hours, children: new Set(own.map((v) => v.childId)).size }
      })
      .sort((a, b) => b.hours - a.hours)
    const nannyHours = top.reduce((s, n) => s + n.hours, 0)
    const childMinutes = visits.reduce((s, v) => s + Math.max(0, Math.min(new Date(v.endedAt ?? v.endAt).getTime(), Date.now()) - new Date(v.startAt).getTime()), 0) / 60_000
    const avgLoad = nannyHours ? childMinutes / 60 / nannyHours : 0

    const allExt = visits.flatMap((v) => v.extensions)
    const paidExt = allExt.filter((e) => e.paymentStatus === 'paid')
    const visitsWithExt = visits.filter((v) => v.extensions.some((e) => e.paymentStatus === 'paid')).length
    const paidVisits = visits.filter((v) => v.paymentStatus === 'paid')
    const failed = allExt.filter((e) => e.paymentStatus === 'failed').length + visits.filter((v) => v.paymentStatus === 'failed').length
    const extensionsAmount = paidExt.reduce((s, e) => s + e.price, 0)

    const oneDay = dayKey(range.from) === dayKey(range.to)
    const visitsSeries: SeriesPoint[] = []
    const revenueSeries: SeriesPoint[] = []
    const previousVisitsSeries: SeriesPoint[] = []
    const prev = previousRange(range)
    const prevVisits = db.visits.filter((v) => v.status !== 'cancelled' && inRange(v.startAt, prev))
    if (oneDay) {
      const isToday = dayKey(range.from) === dayKey(new Date())
      const lastHour = isToday ? Math.min(21, Math.max(10, new Date().getHours())) : 21
      for (let h = 10; h <= 21; h++) {
        const future = h > lastHour
        const list = visits.filter((v) => new Date(v.startAt).getHours() === h)
        const label = `${String(h).padStart(2, '0')}:00`
        visitsSeries.push({ key: label, label, value: list.length, future })
        if (!future) revenueSeries.push({ key: label, label, value: list.reduce((s, v) => s + visitTotalPrice(v), 0) })
        previousVisitsSeries.push({ key: label, label, value: prevVisits.filter((v) => new Date(v.startAt).getHours() === h).length })
      }
    } else {
      const fmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' })
      for (let d = startOfDay(range.from); d <= range.to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
        const k = dayKey(d)
        const list = visits.filter((v) => dayKey(new Date(v.startAt)) === k)
        const label = fmt.format(d).replace('.', '')
        visitsSeries.push({ key: k, label, value: list.length })
        revenueSeries.push({ key: k, label, value: list.reduce((s, v) => s + visitTotalPrice(v), 0) })
        const offset = Math.round((startOfDay(d).getTime() - startOfDay(range.from).getTime()) / 86_400_000)
        const pd = new Date(prev.from.getFullYear(), prev.from.getMonth(), prev.from.getDate() + offset)
        const pk = dayKey(pd)
        previousVisitsSeries.push({ key: pk, label: fmt.format(pd).replace('.', ''), value: prevVisits.filter((v) => dayKey(new Date(v.startAt)) === pk).length })
      }
    }

    return {
      children: { registered, new: newChildren, repeatVisits },
      visits: { total: visits.length, avgMinutes, completed: completed.length, active: db.visits.filter(isOngoing).length },
      nannies: { hours: nannyHours, children: new Set(visits.map((v) => v.childId)).size, avgLoad, top },
      extensions: {
        count: paidExt.length,
        percent: visits.length ? (visitsWithExt / visits.length) * 100 : 0,
        minutes: paidExt.reduce((s, e) => s + e.minutes, 0),
        amount: extensionsAmount,
      },
      payments: {
        count: paidVisits.length + paidExt.length,
        amount: paidVisits.reduce((s, v) => s + v.price, 0) + extensionsAmount,
        extensionsAmount,
        success: paidVisits.length + paidExt.length,
        failed,
      },
      visitsSeries,
      revenueSeries,
      granularity: oneDay ? 'hour' : 'day',
      previous: totalsFor(prev),
      previousVisitsSeries,
    }
  },
}
