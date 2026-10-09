import { useSyncExternalStore } from 'react'
import { en } from './en'
import { uz } from './uz'

/**
 * Языки интерфейса. Ключи перевода — сами русские строки: русский текст в коде остаётся
 * как есть, а `uz.ts` / `en.ts` сопоставляют его с переводом. Нет перевода — показываем русский.
 *
 * Язык меняется без перезагрузки: корень приложения подписан на `useLang()` и перерисовывает
 * всё дерево. Константы с переводом на уровне модуля оборачиваются в `localized()`,
 * чтобы пересчитываться для нового языка.
 */
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
    /* хранилище недоступно — язык по умолчанию */
  }
  return 'ru'
}

/** Текущий язык (живая привязка: импортёры видят новое значение после `setLang`). */
export let LANG: Lang = readLang()
/** Локаль для Intl: даты, время, числа. */
export let LOCALE = LOCALES[LANG]
let dict = DICTS[LANG]

/** `t('Осталось {0}', time)` — перевод с подстановкой `{0}`, `{1}`… */
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
    /* не сохранится до перезагрузки — не критично */
  }
  document.documentElement.lang = lang
  listeners.forEach((l) => l())
}

/** Подписка на смену языка — для корня приложения и компонентов, которые кешируют переводы. */
export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => LANG,
  )
}

/**
 * Константа с переводами на уровне модуля, которая пересчитывается при смене языка.
 * Возвращает прокси: обращаться с ней можно как с обычным объектом или массивом.
 */
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
      // прокси-цель пустая, поэтому свойства должны быть настраиваемыми
      return d && { ...d, configurable: true }
    },
  })
}

if (typeof document !== 'undefined') document.documentElement.lang = LANG
