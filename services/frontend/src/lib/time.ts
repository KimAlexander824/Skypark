import { useEffect, useState } from 'react'
import type { Visit } from '@/types'

/** Текущее время, обновляемое с заданным интервалом. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

/** ТЗ §16 — за сколько минут до конца уведомляем родителя. */
export const EXTENSION_NOTICE_MIN = 15

export const ONGOING_STATUSES: Visit['status'][] = ['active', 'awaiting_extension', 'extended']
export const isOngoing = (v: Pick<Visit, 'status'>) => ONGOING_STATUSES.includes(v.status)

const paidExtensions = (v: Visit) => v.extensions.filter((e) => e.paymentStatus === 'paid')
export const visitTotalMinutes = (v: Visit) => v.durationMin + paidExtensions(v).reduce((s, e) => s + e.minutes, 0)
export const visitTotalPrice = (v: Visit) => v.price + paidExtensions(v).reduce((s, e) => s + e.price, 0)

/** ТЗ §11 — прошедшее, оставшееся время и прогресс посещения. */
export function visitTiming(v: Pick<Visit, 'startAt' | 'endAt'>, now: number) {
  const start = new Date(v.startAt).getTime()
  const end = new Date(v.endAt).getTime()
  const elapsedMs = Math.max(0, now - start)
  const leftMs = Math.max(0, end - now)
  return {
    elapsedMin: elapsedMs / 60_000,
    leftMin: leftMs / 60_000,
    leftMs,
    progress: Math.min(100, (elapsedMs / Math.max(1, end - start)) * 100),
    endingSoon: leftMs > 0 && leftMs <= EXTENSION_NOTICE_MIN * 60_000,
    over: leftMs === 0,
  }
}

/** Обратный отсчёт: 1:05:09 / 34:12 */
export function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export const addMinutes = (date: Date | number, min: number) => new Date(new Date(date).getTime() + min * 60_000)

/** «HH:MM» → минуты от начала суток */
export const hhmmToMinutes = (s: string) => {
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}
