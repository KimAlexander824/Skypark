import { Check } from 'lucide-react'
import { LangFlag } from '@/components/brand/Flags'
import { LANGS, setLang, t, useLang } from '@/i18n'
import { cn } from '@/lib/format'

export function LanguagePicker() {
  const lang = useLang()
  return (
    <div role="radiogroup" aria-label={t('Язык интерфейса')} className="grid gap-3 sm:grid-cols-3">
      {LANGS.map((l) => {
        const active = l.value === lang
        return (
          <button
            key={l.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setLang(l.value)}
            className={cn(
              'flex items-center gap-3 rounded-3xl p-3 text-left ring-1 transition active:scale-[0.98]',
              active ? 'bg-accent-50 ring-2 ring-accent-500' : 'bg-mist-100/80 ring-transparent hover:ring-mist-300',
            )}
          >
            <LangFlag lang={l.value} className="size-9 shrink-0 rounded-full shadow-[0_0_0_1px_rgb(0_0_0/0.08)]" />
            <span className="min-w-0 flex-1 text-sm font-extrabold text-ink-900">{l.label}</span>
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full transition [&_svg]:size-3',
                active ? 'bg-accent-500 text-snow' : 'ring-1 ring-mist-300',
              )}
            >
              {active && <Check strokeWidth={3.5} />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
