import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, HeartHandshake, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { authApi } from '@/api/auth'
import { errorMessage } from '@/api/errors'
import { AnalyticsArt } from '@/components/brand/AnalyticsArt'
import { APP_NAME, Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/Button'
import { Input, PhoneInput } from '@/components/ui/Field'
import { homeFor, useAuth } from '@/features/auth/AuthProvider'
import { isPhoneComplete, phoneLocalPart } from '@/lib/format'
import { roleLabel } from '@/lib/statuses'
import type { Role } from '@/types'
import { t } from '@/i18n'

const roleIcon: Record<Role, typeof UserRound> = { admin: ShieldCheck, staff: UserRound, nanny: HeartHandshake }

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to={homeFor(user.role)} replace />

  const submit = async (p = phone, pw = password) => {
    setError(undefined)
    if (!isPhoneComplete(p)) return setError(t('Введите номер телефона полностью'))
    if (!pw) return setError(t('Введите пароль'))
    setLoading(true)
    try {
      const u = await login(p, pw)
      toast.success(t('Добро пожаловать, {0}!', u.firstName))
      const from = (location.state as { from?: string } | null)?.from
      navigate(from ?? homeFor(u.role), { replace: true })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    submit()
  }

  return (
    <div className="relative grid min-h-dvh gap-3 bg-mist-100 p-3 lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel />

      <main className="flex items-center justify-center px-4 py-16 sm:px-10">
        <div className="w-full max-w-[400px] animate-slide-up">
          <Logo className="mb-12 lg:hidden" />

          <h1 className="text-[32px] leading-tight font-extrabold tracking-tight text-ink-900">{t('Вход в систему')}</h1>
          <p className="mt-2 text-[15px] font-medium text-mist-500">{t('Используйте номер телефона и пароль сотрудника')}</p>

          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" noValidate>
            <PhoneInput label={t('Номер телефона')} value={phone} onChange={setPhone} inputSize="lg" autoFocus />
            <Input
              label={t('Пароль')}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              inputSize="lg"
              leftIcon={<LockKeyhole />}
              autoComplete="current-password"
              rightSlot={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t('Скрыть пароль') : t('Показать пароль')}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              }
            />

            {error && (
              <div className="animate-fade-in rounded-2xl bg-danger-50 px-4 py-3 text-sm font-semibold text-danger-700">
                {error}
              </div>
            )}

            <Button type="submit" variant="contrast" size="lg" loading={loading} rightIcon={<ArrowRight />} className="mt-2">
              
              {t('Войти')}
            </Button>
          </form>

          <DemoAccounts
            disabled={loading}
            onPick={(p) => {
              const local = phoneLocalPart(p)
              setPhone(local)
              setPassword('123456')
              submit(local, '123456')
            }}
          />
        </div>
      </main>
    </div>
  )
}

function DemoAccounts({ onPick, disabled }: { onPick: (phone: string) => void; disabled: boolean }) {
  const accounts = authApi.demoAccounts()
  return (
    <div className="mt-10">
      <div className="flex items-center gap-3 text-xs font-semibold tracking-wide text-mist-400 uppercase">
        <span className="h-px flex-1 bg-mist-200" />
        
        {t('Демо-доступ')}
        <span className="h-px flex-1 bg-mist-200" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {accounts.map((a) => {
          const Icon = roleIcon[a.role]
          return (
            <button
              key={a.id}
              type="button"
              disabled={disabled}
              onClick={() => onPick(a.phone)}
              className="group flex flex-col items-center gap-2 rounded-3xl bg-white px-2 py-4 ring-1 ring-mist-200 transition hover:-translate-y-0.5 hover:ring-mist-300 hover:shadow-card disabled:opacity-50"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-mist-100 text-ink-700 transition group-hover:bg-ink-900 group-hover:text-mist-50">
                <Icon className="size-[18px]" />
              </span>
              <span className="text-[13px] font-extrabold text-ink-900">{roleLabel[a.role]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function BrandPanel() {
  return (
    <aside className="relative isolate hidden overflow-hidden rounded-4xl bg-[#121216] ring-1 ring-snow/5 lg:flex lg:flex-col lg:justify-between lg:p-12">
      {/* приглушённая иллюстрация-дашборд и затемнение к тексту */}
      <AnalyticsArt className="absolute inset-0 -z-10 size-full opacity-45" />
      <div className="absolute inset-0 -z-10 bg-linear-to-t from-[#121216] via-[#121216]/75 to-[#121216]/20" />
      <div className="absolute -top-40 -right-32 -z-10 size-[30rem] rounded-full bg-snow/[0.06] blur-3xl" />

      <div className="relative">
        <Logo inverted />
      </div>

      <div className="relative max-w-md">
        <h2 className="text-[40px] leading-[1.1] font-extrabold tracking-tight text-snow">
          
          {t('Каждый визит —')}<br />
          
          {t('под контролем.')}
        </h2>
        <p className="mt-4 text-[17px] leading-relaxed text-snow/70">
          
          {t('Регистрация, няни, время и уведомления родителям в одной системе.')}
        </p>
      </div>

      <div className="relative text-xs font-medium text-snow/40">© {new Date().getFullYear()} {APP_NAME}</div>
    </aside>
  )
}

