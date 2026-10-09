import { useSyncExternalStore } from 'react'
import { en } from './en'
import { uz } from './uz'

export type Lang = 'uz' | 'ru' | 'en'

export const LANGS: { value: Lang; label: string }[] = [
  { value: 'uz', label: "O'zbekcha" },
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
]

const KEY = 'skypark.lang'
const LOCALES: Record<Lang, string> = { uz: 'uz-Latn-UZ', ru: 'ru-RU', en: 'en-GB' }
const DICTS: Record<Lang, Record<string, string> | undefined> = { uz, en, ru: undefined }

function readLang(): Lang {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'uz' || v === 'ru' || v === 'en') return v
  } catch {
  }
  return 'ru'
}

export let LANG: Lang = readLang()
export let LOCALE = LOCALES[LANG]
let dict = DICTS[LANG]

export function t(key: string, ...args: unknown[]): string {
  const text = dict?.[key] ?? key
  return args.length ? text.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? '')) : text
}

const listeners = new Set<() => void>()

export function setLang(lang: Lang) {
  if (lang === LANG) return
  LANG = lang
  LOCALE = LOCALES[lang]
  dict = DICTS[lang]
  try {
    localStorage.setItem(KEY, lang)
  } catch {
  }
  document.documentElement.lang = lang
  listeners.forEach((l) => l())
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => LANG,
  )
}

export function localized<T extends object>(build: () => T): T {
  let lang: Lang | undefined
  let value: T
  const current = () => {
    if (lang !== LANG) {
      value = build()
      lang = LANG
    }
    return value
  }
  return new Proxy({} as T, {
    get: (_, p) => {
      const v = current()
      const r = Reflect.get(v, p)
      return typeof r === 'function' && Array.isArray(v) ? r.bind(v) : r
    },
    has: (_, p) => Reflect.has(current(), p),
    ownKeys: () => Reflect.ownKeys(current()),
    getOwnPropertyDescriptor: (_, p) => {
      const d = Reflect.getOwnPropertyDescriptor(current(), p)
      return d && { ...d, configurable: true }
    },
  })
}

if (typeof document !== 'undefined') document.documentElement.lang = LANG
