import { useQuery } from '@tanstack/react-query'
import { notificationsApi } from '@/api/notifications'

export const notificationKeys = {
  all: ['notifications'] as const,
  list: ['notifications', 'list'] as const,
  unread: ['notifications', 'unread'] as const,
}

/** Список и счётчик обновляются раз в 30 секунд — так подхватываются события по таймеру (15 минут, автозавершение). */
export const useNotifications = () =>
  useQuery({ queryKey: notificationKeys.list, queryFn: notificationsApi.list, refetchInterval: 30_000, placeholderData: (p) => p })

export const useUnreadNotifications = () =>
  useQuery({ queryKey: notificationKeys.unread, queryFn: notificationsApi.unreadCount, refetchInterval: 30_000 })
