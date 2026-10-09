import type { AppNotification, AuditAction, AuditEntry, ID } from '@/types'
import { db, delay, persist } from './mock/db'
import { syncVisits } from './visits'

/* ---------- Уведомления (ТЗ §15, §30) ---------- */

export interface NotificationItem extends AppNotification {
  childName: string
}

const withChild = (n: AppNotification): NotificationItem => {
  const c = db.children.find((x) => x.id === n.childId)
  return { ...n, childName: c ? `${c.firstName} ${c.lastName}` : '—' }
}

export const notificationsApi = {
  async list(): Promise<NotificationItem[]> {
    await delay(200)
    syncVisits()
    return db.notifications.map(withChild)
  },
  /** Непрочитанные уведомления сотрудникам — для счётчика в меню. */
  async unreadCount(): Promise<number> {
    syncVisits()
    return db.notifications.filter((n) => n.recipient === 'staff' && !n.read).length
  },
  async markAllRead(): Promise<void> {
    await delay(150)
    for (const n of db.notifications) if (n.recipient === 'staff') n.read = true
    persist()
  },
}

/* ---------- Журнал действий (ТЗ §41) ---------- */

export interface AuditItem extends AuditEntry {
  actorName: string
}

export interface AuditQuery {
  actorId?: ID
  action?: AuditAction
  /** YYYY-MM-DD */
  date?: string
}

export const auditApi = {
  async list(q: AuditQuery = {}): Promise<AuditItem[]> {
    await delay(250)
    syncVisits()
    return db.audit
      .filter((a) => (!q.actorId || a.actorId === q.actorId) && (!q.action || a.action === q.action))
      .filter((a) => {
        if (!q.date) return true
        const d = new Date(a.at)
        const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        return day === q.date
      })
      .map((a) => {
        const e = a.actorId ? db.employees.find((x) => x.id === a.actorId) : undefined
        return { ...a, actorName: e ? `${e.firstName} ${e.lastName}` : (a.actorLabel ?? '—') }
      })
  },
}
