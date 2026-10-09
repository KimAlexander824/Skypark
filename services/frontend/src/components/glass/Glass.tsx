import { useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@/lib/format'

/* Дизайн v3 — Apple / liquid glass. */

export type GlassTone = 'accent' | 'rose' | 'grape' | 'mint' | 'sky'

export const toneChip: Record<GlassTone, string> = {
  accent: 'bg-accent-50 text-accent-600 ring-accent-100',
  rose: 'bg-rose-50 text-rose-500 ring-rose-100',
  grape: 'bg-grape-50 text-grape-500 ring-grape-100',
  mint: 'bg-mint-50 text-mint-600 ring-mint-100',
  sky: 'bg-sky-50 text-sky-500 ring-sky-100',
}

export const toneFill: Record<GlassTone, string> = {
  accent: 'bg-accent-500',
  rose: 'bg-rose-500',
  grape: 'bg-grape-500',
  mint: 'bg-mint-500',
  sky: 'bg-sky-500',
}

/** Стеклянная карточка. */
export function GlassCard({ className, strong, ...props }: HTMLAttributes<HTMLDivElement> & { strong?: boolean }) {
  return <section className={cn('min-w-0 rounded-3xl', strong ? 'glass-strong' : 'glass', className)} {...props} />
}

export function GlassHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="truncate text-[15px] font-bold tracking-tight text-ink-900">{title}</h2>
        {subtitle && <p className="mt-0.5 truncate text-xs font-medium text-mist-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

/** Цветная «пилюля» с иконкой — как маркеры в референсе. */
export function ToneIcon({ tone, children, size = 'md' }: { tone: GlassTone; children: ReactNode; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full ring-1',
        size === 'md' ? 'size-9 [&_svg]:size-[18px]' : 'size-7 [&_svg]:size-3.5',
        toneChip[tone],
      )}
    >
      {children}
    </span>
  )
}

/** Изменение относительно прошлого периода. */
export function Delta({ current, previous, invert }: { current: number; previous: number; invert?: boolean }) {
  if (!previous && !current) return <DeltaPill kind="flat">0%</DeltaPill>
  if (!previous) return <DeltaPill kind="up">новое</DeltaPill>
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return <DeltaPill kind="flat">0%</DeltaPill>
  const good = invert ? pct < 0 : pct > 0
  return <DeltaPill kind={good ? 'up' : 'down'}>{`${pct > 0 ? '+' : ''}${pct}%`}</DeltaPill>
}

function DeltaPill({ kind, children }: { kind: 'up' | 'down' | 'flat'; children: ReactNode }) {
  const Icon = kind === 'up' ? ArrowUpRight : kind === 'down' ? ArrowDownRight : Minus
  return (
    <span
      className={cn(
        'tabular inline-flex h-5 items-center gap-0.5 rounded-full px-1.5 text-[11px] font-bold',
        kind === 'up' && 'bg-mint-50 text-mint-600',
        kind === 'down' && 'bg-rose-50 text-rose-500',
        kind === 'flat' && 'bg-mist-100 text-mist-500',
      )}
    >
      <Icon className="size-3" strokeWidth={2.75} />
      {children}
    </span>
  )
}

/** KPI-карточка: подпись, иконка, крупное число, сравнение. */
export function StatTile({
  label,
  value,
  tone,
  icon,
  delta,
  footnote,
}: {
  label: string
  value?: ReactNode
  tone: GlassTone
  icon: ReactNode
  delta?: ReactNode
  footnote?: ReactNode
}) {
  return (
    <GlassCard className="flex flex-col p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-semibold text-mist-600">{label}</span>
        <ToneIcon tone={tone}>{icon}</ToneIcon>
      </div>
      {value === undefined ? (
        <div className="mt-3 h-8 w-24 animate-pulse rounded-xl bg-mist-200" />
      ) : (
        <div className="tabular mt-2 truncate text-[28px] leading-9 font-extrabold tracking-tight text-ink-900">{value}</div>
      )}
      <div className="mt-1 flex min-h-5 items-center gap-1.5 text-[11.5px] font-medium text-mist-500">
        {delta}
        {footnote && <span className="truncate">{footnote}</span>}
      </div>
    </GlassCard>
  )
}

/** iOS segmented control со скользящим «пузырём». */
export function GlassSegmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  className?: string
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const el = wrap.current?.querySelector<HTMLButtonElement>(`[data-value="${value}"]`)
    if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth })
    else setThumb(null)
  }, [value, options.length])

  return (
    <div ref={wrap} role="tablist" className={cn('glass relative inline-flex rounded-full p-1', className)}>
      {thumb && (
        <span
          aria-hidden
          className="absolute top-1 bottom-1 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.06),0_4px_12px_-4px_rgb(0_0_0/0.12)] transition-all duration-300 ease-[var(--ease-ios)]"
          style={{ left: thumb.left, width: thumb.width }}
        />
      )}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          data-value={o.value}
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'relative z-10 h-8 rounded-full px-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors',
            o.value === value ? 'text-ink-900' : 'text-mist-600 hover:text-ink-900',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Небольшая стеклянная кнопка (белая) и акцентная (оранжевая). */
export function GlassButton({
  variant = 'glass',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'glass' | 'accent' }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-bold whitespace-nowrap transition duration-200 active:scale-[0.97] [&_svg]:size-4',
        variant === 'accent' ? 'glass-accent hover:brightness-105' : 'glass text-ink-900 hover:bg-white',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
