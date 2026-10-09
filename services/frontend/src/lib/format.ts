import { clsx, type ClassValue } from 'clsx'

export const cn = (...inputs: ClassValue[]) => clsx(inputs)

/** Оставляет только цифры и приводит к виду 998XXXXXXXXX. */
export function normalizePhone(value: string): string {
  let digits = value.replace(/\D/g, '')
  if (digits.startsWith('998')) digits = digits.slice(3)
  return '998' + digits.slice(0, 9)
}

/** 998901234567 → +998 90 123 45 67 */
export function formatPhone(phone: string): string {
  const d = normalizePhone(phone).slice(3)
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean)
  return ['+998', ...parts].join(' ')
}

/** Национальная часть номера (9 цифр) для поля ввода. */
export function phoneLocalPart(value: string): string {
  return normalizePhone(value).slice(3)
}

export function isPhoneComplete(value: string): boolean {
  return phoneLocalPart(value).length === 9
}

export function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1]
  return forms[2]
}

export function ageFrom(birthDate: string, now = new Date()): number {
  const b = new Date(birthDate)
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age
}

export function formatAge(birthDate: string): string {
  const age = ageFrom(birthDate)
  if (age < 1) {
    const b = new Date(birthDate)
    const now = new Date()
    const months = (now.getFullYear() - b.getFullYear()) * 12 + now.getMonth() - b.getMonth()
    return `${months} ${plural(months, ['месяц', 'месяца', 'месяцев'])}`
  }
  return `${age} ${plural(age, ['год', 'года', 'лет'])}`
}

const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
const shortDateFmt = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })

export const formatDate = (iso: string) => dateFmt.format(new Date(iso))
export const formatShortDate = (iso: string) => shortDateFmt.format(new Date(iso))
export const formatTime = (iso: string) => timeFmt.format(new Date(iso))

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('ru-RU').format(amount) + ' сум'
}

export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h === 0) return `${rest} мин`
  if (rest === 0) return `${h} ч`
  return `${h} ч ${rest} мин`
}

export function initials(first?: string, last?: string): string {
  return ((first?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase() || '•'
}

export function fullName(p: { firstName: string; lastName?: string }): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ')
}
