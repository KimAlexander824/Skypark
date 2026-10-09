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
import { t, localized } from '@/i18n'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  roles: Role[]
  end?: boolean
  badge?: 'unreadNotifications'
}

export interface NavGroup {
  id: string
  title: string
  icon: LucideIcon
  flat?: boolean
  items: NavItem[]
}

export const navigation: NavGroup[] = localized(() => ([
  {
    id: 'overview',
    title: t('Обзор'),
    icon: LayoutDashboard,
    flat: true,
    items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin'], end: true }],
  },
  {
    id: 'nanny',
    title: t('Няня'),
    icon: HeartHandshake,
    flat: true,
    items: [{ to: '/nanny', label: t('Мои дети'), icon: HeartHandshake, roles: ['nanny'] }],
  },
  {
    id: 'reception',
    title: t('Ресепшн'),
    icon: ScanFace,
    items: [
      { to: '/reception', label: t('Приём ребёнка'), icon: ScanFace, roles: ['staff', 'admin'] },
      { to: '/children', label: t('Дети'), icon: Baby, roles: ['staff', 'admin'] },
      { to: '/visits', label: t('Посещения'), icon: ClipboardList, roles: ['staff', 'admin'] },
    ],
  },
  {
    id: 'notifications',
    title: t('Уведомления'),
    icon: Bell,
    flat: true,
    items: [{ to: '/notifications', label: t('Уведомления'), icon: Bell, roles: ['staff', 'admin'], badge: 'unreadNotifications' }],
  },
  {
    id: 'people',
    title: t('Люди'),
    icon: Contact,
    items: [
      { to: '/admin/parents', label: t('Родители'), icon: UsersRound, roles: ['admin'] },
      { to: '/admin/nannies', label: t('Няни'), icon: HeartHandshake, roles: ['admin'] },
      { to: '/admin/employees', label: t('Сотрудники'), icon: UserCog, roles: ['admin'] },
    ],
  },
  {
    id: 'finance',
    title: t('Финансы'),
    icon: Wallet,
    items: [
      { to: '/admin/payments', label: t('Оплаты'), icon: CreditCard, roles: ['admin'] },
      { to: '/admin/discounts', label: t('Скидки'), icon: BadgePercent, roles: ['admin'] },
      { to: '/admin/promocodes', label: t('Промокоды'), icon: TicketPercent, roles: ['admin'] },
    ],
  },
  {
    id: 'content',
    title: t('Контент'),
    icon: Megaphone,
    items: [{ to: '/admin/news', label: t('Новости'), icon: Newspaper, roles: ['admin'] }],
  },
  {
    id: 'system',
    title: t('Система'),
    icon: Settings2,
    items: [
      { to: '/admin/schedule', label: t('Время работы'), icon: CalendarClock, roles: ['admin'] },
      { to: '/admin/audit', label: t('Журнал действий'), icon: History, roles: ['admin'] },
      { to: '/admin/settings', label: t('Настройки'), icon: Settings, roles: ['admin'] },
      { to: '/settings', label: t('Настройки'), icon: Settings, roles: ['staff', 'nanny'] },
    ],
  },
]))

export const navigationFor = (role: Role): NavGroup[] =>
  navigation
    .map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) }))
    .filter((g) => g.items.length > 0)

export const isItemActive = (item: NavItem, pathname: string) =>
  item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + '/')
