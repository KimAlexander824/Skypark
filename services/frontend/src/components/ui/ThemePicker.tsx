import type { ReactNode } from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/format'
import { originOf, useTheme, type ThemePreference } from '@/lib/theme'
import { t, localized } from '@/i18n'

const THEME_OPTIONS: { value: ThemePreference; label: string; hint: string; icon: ReactNode }[] = localized(() => ([
  { value: 'light', label: t('Светлая'), hint: t('Всегда светлый интерфейс'), icon: <Sun /> },
  { value: 'dark', label: t('Тёмная'), hint: t('Бережёт глаза вечером'), icon: <Moon /> },
  { value: 'system', label: t('Как в системе'), hint: t('Следует настройке устройства'), icon: <Monitor /> },
]))

/** Выбор темы интерфейса карточками с мини-превью. Используется в настройках всех ролей. */
export function ThemePicker() {
  const { preference, setTheme } = useTheme()
  return (
    <div role="radiogroup" aria-label={t('Тема интерфейса')} className="grid gap-3 sm:grid-cols-3">
      {THEME_OPTIONS.map((o) => {
        const active = preference === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={(e) => setTheme(o.value, originOf(e.currentTarget))}
            className={cn(
              'group rounded-3xl p-2 text-left ring-1 transition active:scale-[0.98]',
              active ? 'bg-accent-50 ring-2 ring-accent-500' : 'bg-mist-100/80 ring-transparent hover:ring-mist-300',
            )}
          >
            <ThemePreview variant={o.value} />
            <div className="flex items-center gap-2.5 px-2 pt-3 pb-1.5">
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-xl [&_svg]:size-4',
                  active ? 'glass-accent' : 'bg-white text-ink-700',
                )}
              >
                {o.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-extrabold text-ink-900">{o.label}</div>
                <div className="truncate text-xs text-ink-500">{o.hint}</div>
              </div>
              <span
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full transition [&_svg]:size-3',
                  active ? 'bg-accent-500 text-snow' : 'ring-1 ring-mist-300',
                )}
              >
                {active && <Check strokeWidth={3.5} />}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

/** Мини-превью интерфейса. Цвета зашиты намеренно: превью не должно зависеть от текущей темы. */
function ThemePreview({ variant }: { variant: ThemePreference }) {
  if (variant === 'system')
    return (
      <div className="relative h-24 overflow-hidden rounded-2xl">
        <MiniUi dark={false} />
        <div className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]">
          <MiniUi dark />
        </div>
      </div>
    )
  return (
    <div className="h-24 overflow-hidden rounded-2xl">
      <MiniUi dark={variant === 'dark'} />
    </div>
  )
}

function MiniUi({ dark }: { dark: boolean }) {
  const c = dark
    ? { bg: '#0e0e11', side: '#1c1c1f', card: '#2a2a2f', line: '#3a3a40', text: '#f5f5f7' }
    : { bg: '#f2f2f6', side: '#ffffff', card: '#ffffff', line: '#e8e8ee', text: '#1a1a1a' }
  return (
    <div className="flex h-full gap-1.5 p-1.5" style={{ background: c.bg }}>
      <div className="flex w-1/4 flex-col gap-1 rounded-lg p-1.5" style={{ background: c.side }}>
        <div className="h-1.5 w-3/4 rounded-full bg-[#ff6b2c]" />
        <div className="h-1.5 w-full rounded-full" style={{ background: c.line }} />
        <div className="h-1.5 w-2/3 rounded-full" style={{ background: c.line }} />
        <div className="h-1.5 w-3/4 rounded-full" style={{ background: c.line }} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="h-2 w-1/2 rounded-full" style={{ background: c.text, opacity: 0.85 }} />
        <div className="flex flex-1 gap-1.5">
          <div className="flex flex-1 items-end gap-1 rounded-lg p-1.5" style={{ background: c.card }}>
            {[40, 70, 55, 90, 60].map((h, i) => (
              <div key={i} className="flex-1 rounded-sm" style={{ height: `${h}%`, background: i === 3 ? '#ff6b2c' : c.line }} />
            ))}
          </div>
          <div className="flex w-1/3 flex-col gap-1 rounded-lg p-1.5" style={{ background: c.card }}>
            <div className="h-1.5 w-full rounded-full" style={{ background: c.line }} />
            <div className="h-1.5 w-2/3 rounded-full" style={{ background: c.line }} />
          </div>
        </div>
      </div>
    </div>
  )
}
