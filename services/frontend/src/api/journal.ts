import type { AuditEntry, NotificationEvent, Visit } from '@/types'
import { db, uid } from './mock/db'
import { t } from '@/i18n'


const AUDIT_LIMIT = 1000
const NOTIFICATIONS_LIMIT = 300

export const PARENT_ACTOR = () => t('Родитель (Telegram)')
export const SYSTEM_ACTOR = () => t('Система')

export function audit(entry: Omit<AuditEntry, 'id' | 'at'>) {
  db.audit.unshift({ id: uid('a'), at: new Date().toISOString(), ...entry })
  if (db.audit.length > AUDIT_LIMIT) db.audit.length = AUDIT_LIMIT
}

export const childLabel = (childId: string) => {
  const c = db.children.find((x) => x.id === childId)
  return c ? `${c.firstName} ${c.lastName}` : '—'
}

export function notify(visit: Visit, event: NotificationEvent, recipients: ('parent' | 'staff')[], text: string) {
  const child = db.children.find((c) => c.id === visit.childId)
  const parent = db.parents.find((p) => p.id === child?.parentId)
  const at = new Date().toISOString()
  for (const recipient of recipients)
    db.notifications.unshift({
      id: uid('nt'),
      at,
      event,
      recipient,
      visitId: visit.id,
      childId: visit.childId,
      text,
      ...(recipient === 'parent' ? { delivery: parent?.telegram?.linked ? 'sent' : 'not_linked' } : { read: false }),
    })
  if (db.notifications.length > NOTIFICATIONS_LIMIT) db.notifications.length = NOTIFICATIONS_LIMIT
}
