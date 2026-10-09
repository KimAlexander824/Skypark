import {
  BadgePercent,
  Baby,
  Bell,
  CalendarClock,
  ClipboardList,
  CreditCard,
  HeartHandshake,
  History,
  LayoutDashboard,
  Megaphone,
  Newspaper,
  ScanFace,
  Settings,
  Settings2,
  TicketPercent,
  UserCog,
  UsersRound,
  Wallet,
  Contact,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/types'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  roles: Role[]
  end?: boolean
  /** Счётчик справа от пункта */
  badge?: 'unreadNotifications'
}

export interface NavGroup {
  id: string
  title: string
  icon: LucideIcon
  /** Пункты без раскрывающегося заголовка (например, Dashboard). */
  flat?: boolean
  items: NavItem[]
}

// Права доступа по ТЗ §33, разделы админ-панели по ТЗ §20
export const navigation: NavGroup[] = [
  {
    id: 'overview',
    title: 'Обзор',
    icon: LayoutDashboard,
    flat: true,
    items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin'], end: true }],
  },
  {
    id: 'nanny',
    title: 'Няня',
    icon: HeartHandshake,
    flat: true,
    items: [{ to: '/nanny', label: 'Мои дети', icon: HeartHandshake, roles: ['nanny'] }],
  },
  {
    id: 'reception',
    title: 'Ресепшн',
    icon: ScanFace,
    items: [
      { to: '/reception', label: 'Приём ребёнка', icon: ScanFace, roles: ['staff', 'admin'] },
      { to: '/children', label: 'Дети', icon: Baby, roles: ['staff', 'admin'] },
      { to: '/visits', label: 'Посещения', icon: ClipboardList, roles: ['staff', 'admin'] },
    ],
  },
  {
    id: 'notifications',
    title: 'Уведомления',
    icon: Bell,
    flat: true,
    items: [{ to: '/notifications', label: 'Уведомления', icon: Bell, roles: ['staff', 'admin'], badge: 'unreadNotifications' }],
  },
  {
    id: 'people',
    title: 'Люди',
    icon: Contact,
    items: [
      { to: '/admin/parents', label: 'Родители', icon: UsersRound, roles: ['admin'] },
      { to: '/admin/nannies', label: 'Няни', icon: HeartHandshake, roles: ['admin'] },
      { to: '/admin/employees', label: 'Сотрудники', icon: UserCog, roles: ['admin'] },
    ],
  },
  {
    id: 'finance',
    title: 'Финансы',
    icon: Wallet,
    items: [
      { to: '/admin/payments', label: 'Оплаты', icon: CreditCard, roles: ['admin'] },
      { to: '/admin/discounts', label: 'Скидки', icon: BadgePercent, roles: ['admin'] },
      { to: '/admin/promocodes', label: 'Промокоды', icon: TicketPercent, roles: ['admin'] },
    ],
  },
  {
    id: 'content',
    title: 'Контент',
    icon: Megaphone,
    items: [{ to: '/admin/news', label: 'Новости', icon: Newspaper, roles: ['admin'] }],
  },
  {
    id: 'system',
    title: 'Система',
    icon: Settings2,
    items: [
      { to: '/admin/schedule', label: 'Время работы', icon: CalendarClock, roles: ['admin'] },
      { to: '/admin/audit', label: 'Журнал действий', icon: History, roles: ['admin'] },
      { to: '/admin/settings', label: 'Настройки', icon: Settings, roles: ['admin'] },
      { to: '/settings', label: 'Настройки', icon: Settings, roles: ['staff', 'nanny'] },
    ],
  },
]

export const navigationFor = (role: Role): NavGroup[] =>
  navigation
    .map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) }))
    .filter((g) => g.items.length > 0)

export const isItemActive = (item: NavItem, pathname: string) =>
  item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + '/')
