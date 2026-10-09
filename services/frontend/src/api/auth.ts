import type { Employee, Session } from '@/types'
import { normalizePhone } from '@/lib/format'
import { ApiError } from './errors'
import { db, delay } from './mock/db'
import { t } from '@/i18n'

export const authApi = {
  async login(phone: string, password: string): Promise<Session> {
    await delay(500)
    const user = db.employees.find((e) => e.phone === normalizePhone(phone))
    if (!user || db.passwords[user.id] !== password) {
      throw new ApiError('invalid_credentials', t('Неверный номер телефона или пароль'))
    }
    if (user.status === 'blocked') {
      throw new ApiError('user_blocked', t('Учётная запись заблокирована. Обратитесь к администратору'))
    }
    return { token: `mock.${user.id}.${Date.now()}`, user }
  },

  async me(token: string): Promise<Employee> {
    await delay(100)
    const id = token.split('.')[1]
    const user = db.employees.find((e) => e.id === id)
    if (!user) throw new ApiError('not_found', t('Сессия истекла'))
    return user
  },

  demoAccounts() {
    return (['admin', 'staff', 'nanny'] as const).map((role) => db.employees.find((e) => e.role === role)!)
  },
}
