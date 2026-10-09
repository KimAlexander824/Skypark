import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ChevronDown, LogOut, Menu, X } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { useAuth, useCurrentUser } from '@/features/auth/AuthProvider'
import { useUnreadNotifications } from '@/features/notifications/queries'
import { cn, fullName } from '@/lib/format'
import { roleLabel } from '@/lib/statuses'
import { isItemActive, navigationFor, type NavGroup, type NavItem } from './navigation'

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setMobileOpen(false), [location.pathname])

  return (
    /*
     * Сайдбар и контент — один блок. На очень широких мониторах блок центрируется целиком,
     * поэтому расстояние «меню → контент» всегда одинаковое и не растягивается.
     */
    <div className="mx-auto flex min-h-dvh w-full max-w-[1920px]">
      {/* Цветной фон под стеклом */}
      <div className="app-backdrop" aria-hidden>
        <span />
      </div>

      {/* Desktop sidebar — стеклянная «плавающая» панель */}
      <aside className="sticky top-0 z-30 hidden h-dvh w-[264px] shrink-0 p-3 lg:block 3xl:w-[288px]">
        <Sidebar />
      </aside>

      <div className="min-w-0 flex-1">

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-ink-900/25 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] animate-slide-up p-3">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-7 right-7 z-10 flex size-8 items-center justify-center rounded-full text-mist-500 hover:bg-mist-100 hover:text-ink-900"
              aria-label="Закрыть меню"
            >
              <X className="size-4" />
            </button>
            <Sidebar />
          </aside>
        </div>
      )}

        <Topbar onMenu={() => setMobileOpen(true)} />

        <main className="w-full px-4 pt-3 pb-16 sm:px-6 lg:pt-6 lg:pr-6 lg:pl-3 3xl:pr-10">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/* ---------- Sidebar ---------- */

const OPEN_GROUP_KEY = 'skypark.nav.group'

function readOpenGroup(): string | null {
  try {
    return localStorage.getItem(OPEN_GROUP_KEY)
  } catch {
    return null
  }
}

function NavItemLink({ item, nested }: { item: NavItem; nested?: boolean }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 overflow-hidden rounded-2xl px-3 font-semibold transition duration-200',
          nested ? 'h-9 text-[13.5px]' : 'h-10 text-sm',
          isActive ? 'bg-linear-to-r from-accent-100 via-accent-50 to-transparent text-accent-700' : 'text-mist-600 hover:bg-white/70 hover:text-ink-900',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full bg-accent-500" />}
          <Icon className={cn(nested ? 'size-4' : 'size-[18px]', isActive ? 'text-accent-600' : 'text-mist-400 group-hover:text-ink-900')} />
          <span className="flex-1">{item.label}</span>
          {item.badge === 'unreadNotifications' && <UnreadBadge />}
        </>
      )}
    </NavLink>
  )
}

function UnreadBadge() {
  const { data } = useUnreadNotifications()
  if (!data) return null
  return <span className="tabular min-w-5 rounded-full bg-accent-500 px-1.5 text-center text-[11px] leading-5 font-bold text-snow">{data > 99 ? '99+' : data}</span>
}

function NavGroupSection({ group, open, onToggle }: { group: NavGroup; open: boolean; onToggle: () => void }) {
  const { pathname } = useLocation()
  const hasActive = group.items.some((i) => isItemActive(i, pathname))
  const Icon = group.icon
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          'group flex h-10 w-full items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition hover:bg-white/70',
          hasActive || open ? 'text-ink-900' : 'text-mist-600 hover:text-ink-900',
        )}
      >
        <Icon className={cn('size-[18px]', hasActive ? 'text-accent-600' : open ? 'text-ink-900' : 'text-mist-400 group-hover:text-ink-900')} />
        <span className="flex-1 text-left">{group.title}</span>
        {!open && hasActive && <span className="size-1.5 rounded-full bg-accent-500" />}
        <span className="tabular rounded-full bg-mist-100 px-1.5 text-[11px] leading-5 font-bold text-mist-500">{group.items.length}</span>
        <ChevronDown className={cn('size-4 text-mist-400 transition-transform duration-300 ease-[var(--ease-ios)]', open && 'rotate-180')} />
      </button>
      <div className={cn('grid transition-[grid-template-rows] duration-300 ease-[var(--ease-ios)]', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <ul className="ml-[21px] flex min-h-0 flex-col gap-0.5 overflow-hidden border-l border-mist-200 pl-2.5">
          <li className="h-1" aria-hidden />
          {group.items.map((item) => (
            <li key={item.to}>
              <NavItemLink item={item} nested />
            </li>
          ))}
          <li className="h-1" aria-hidden />
        </ul>
      </div>
    </div>
  )
}

function Sidebar() {
  const user = useCurrentUser()
  const { logout } = useAuth()
  const { pathname } = useLocation()
  const groups = navigationFor(user.role)
  // аккордеон: одновременно раскрыта только одна группа
  const [open, setOpen] = useState<string | null>(readOpenGroup)

  // группа с активным разделом раскрывается автоматически
  useEffect(() => {
    const active = groups.find((g) => !g.flat && g.items.some((i) => isItemActive(i, pathname)))
    if (active) setOpen(active.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  useEffect(() => {
    try {
      if (open) localStorage.setItem(OPEN_GROUP_KEY, open)
      else localStorage.removeItem(OPEN_GROUP_KEY)
    } catch {
      // не критично
    }
  }, [open])

  const toggle = (id: string) => setOpen((o) => (o === id ? null : id))
  const flat = groups.filter((g) => g.flat)
  const collapsible = groups.filter((g) => !g.flat)

  return (
    <div className="glass-strong flex h-full flex-col rounded-4xl">
      <div className="flex h-[68px] items-center gap-2.5 px-6">
        {/* место под знак логотипа — пользователь пришлёт позже */}
        <Logo />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pt-1 pb-4">
        {flat.length > 0 && (
          <>
            <div className="mb-1.5 px-3 text-[11px] font-semibold tracking-wide text-mist-400 uppercase">Главное</div>
            <ul className="mb-4 flex flex-col gap-0.5">
              {flat.flatMap((g) => g.items).map((item) => (
                <li key={item.to}>
                  <NavItemLink item={item} />
                </li>
              ))}
            </ul>
          </>
        )}

        {collapsible.length > 0 && (
          <>
            <div className="mb-1.5 px-3 text-[11px] font-semibold tracking-wide text-mist-400 uppercase">Разделы</div>
            <div className="flex flex-col gap-0.5">
              {collapsible.map((g) => (
                <NavGroupSection key={g.id} group={g} open={open === g.id} onToggle={() => toggle(g.id)} />
              ))}
            </div>
          </>
        )}
      </nav>

      <div className="p-3">
        <div className="relative isolate overflow-hidden rounded-3xl bg-linear-to-br from-accent-50 via-white to-rose-50 p-3 ring-1 ring-white">
          <div className="flex items-center gap-3">
            <span className="glass-accent flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold">
              {user.firstName[0]}
              {user.lastName[0]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-ink-900">{fullName(user)}</div>
              <div className="truncate text-xs font-medium text-mist-500">{roleLabel[user.role]}</div>
            </div>
            <button
              onClick={logout}
              className="flex size-8 items-center justify-center rounded-full text-mist-500 transition hover:bg-white hover:text-rose-500"
              aria-label="Выйти"
              title="Выйти"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- Topbar (только мобильный: кнопка меню) ---------- */

function Topbar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 bg-mist-100/55 px-4 backdrop-blur-2xl backdrop-saturate-150 sm:px-6 lg:hidden">
      <button onClick={onMenu} className="glass flex size-10 items-center justify-center rounded-full text-ink-900" aria-label="Открыть меню">
        <Menu className="size-[18px]" />
      </button>
      <Logo />
    </header>
  )
}
