import { Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/format'
import { originOf, useTheme } from '@/lib/theme'
import { t } from '@/i18n'

/** Быстрое переключение светлой/тёмной темы. Полный выбор (включая «Как в системе») — в Настройках. */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, setTheme } = useTheme()
  const dark = resolved === 'dark'
  const label = dark ? t('Включить светлую тему') : t('Включить тёмную тему')
  return (
    <button
      type="button"
      onClick={(e) => setTheme(dark ? 'light' : 'dark', originOf(e.currentTarget))}
      className={cn(
        'glass relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-ink-900 transition hover:bg-white active:scale-90',
        className,
      )}
      aria-label={label}
      title={label}
    >
      <Sun
        className={cn(
          'absolute size-[18px] transition duration-500 ease-[var(--ease-ios)]',
          dark ? 'rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100',
        )}
      />
      <Moon
        className={cn(
          'absolute size-[18px] transition duration-500 ease-[var(--ease-ios)]',
          dark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0',
        )}
      />
    </button>
  )
}
