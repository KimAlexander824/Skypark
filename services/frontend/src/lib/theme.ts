import { useSyncExternalStore } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'skypark:theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

function read(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
  }
  return 'system'
}

let preference = read()

const resolve = (p: ThemePreference) => (p === 'system' ? (media.matches ? 'dark' : 'light') : p)

function apply() {
  const theme = resolve(preference)
  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0f0f12' : '#f2f2f6')
}

export function setTheme(next: ThemePreference, origin?: { x: number; y: number }) {
  const changed = resolve(next) !== resolve(preference)
  preference = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
  }
  const commit = () => {
    apply()
    listeners.forEach((l) => l())
  }
  if (!changed) return commit()

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!reduceMotion && typeof document.startViewTransition === 'function') {
    const x = origin?.x ?? window.innerWidth / 2
    const y = origin?.y ?? window.innerHeight / 2
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
    const transition = document.startViewTransition(commit)
    transition.ready
      .then(() =>
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 650, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', pseudoElement: '::view-transition-new(root)' },
        ),
      )
      .catch(() => {})
    return
  }

  const root = document.documentElement
  root.classList.add('theme-transition')
  commit()
  window.setTimeout(() => root.classList.remove('theme-transition'), 400)
}

export const originOf = (el: Element) => {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

media.addEventListener('change', () => {
  if (preference !== 'system') return
  apply()
  listeners.forEach((l) => l())
})

apply()

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useTheme() {
  const pref = useSyncExternalStore(subscribe, () => preference)
  const resolved = useSyncExternalStore(subscribe, () => resolve(preference))
  return { preference: pref, resolved, setTheme }
}
