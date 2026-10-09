import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import { LangFlag } from '@/components/brand/Flags'
import { LANGS, setLang, useLang } from '@/i18n'
import { cn } from '@/lib/format'
import { usePopover } from './usePopover'

/** Выбор языка: кнопка с флагом текущего языка и выпадающий список. Язык меняется сразу, без перезагрузки. */
export function LanguageSwitch({ className }: { className?: string }) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const { open, setOpen, pos } = usePopover(triggerRef, panelRef, { panelHeight: LANGS.length * 44 + 12, panelWidth: 184, align: 'right' })
  const lang = useLang()
  const current = LANGS.find((l) => l.value === lang)!

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={current.label}
        title={current.label}
        className={cn(
          'glass flex size-10 shrink-0 items-center justify-center rounded-full transition hover:bg-white active:scale-90',
          open && 'bg-white',
          className,
        )}
      >
        <LangFlag lang={lang} className="size-6 rounded-full shadow-[0_0_0_1px_rgb(0_0_0/0.08)]" />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            aria-label="Language"
            className="glass-strong fixed z-[60] animate-pop-in rounded-3xl p-1.5"
            style={{ left: pos.left, top: pos.top, width: pos.width }}
          >
            {LANGS.map((l) => {
              const active = l.value === lang
              return (
                <button
                  key={l.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setOpen(false)
                    setLang(l.value)
                  }}
                  className={cn(
                    'flex h-11 w-full items-center gap-3 rounded-2xl px-3 text-left text-sm font-semibold text-ink-900 transition hover:bg-white/70',
                    active && 'bg-white/70',
                  )}
                >
                  <LangFlag lang={l.value} className="size-6 shrink-0 rounded-full shadow-[0_0_0_1px_rgb(0_0_0/0.08)]" />
                  <span className="flex-1">{l.label}</span>
                  {active && <Check className="size-4 text-accent-500" />}
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </>
  )
}
