import { Check } from 'lucide-react'
import { cn } from '@/lib/format'

export function Stepper({ steps, current }: { steps: { title: string; description?: string }[]; current: number }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3">
      {steps.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={s.title} className={cn('flex items-center gap-2 sm:gap-3', i < steps.length - 1 && 'flex-1')}>
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  'tabular flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold transition-all',
                  done && 'bg-accent-500 text-snow',
                  active && 'glass-accent ring-4 ring-accent-100',
                  !done && !active && 'bg-white/70 text-mist-400 ring-1 ring-mist-200',
                )}
              >
                {done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
              </span>
              <div className={cn('hidden leading-tight sm:block', !active && 'max-xl:hidden')}>
                <div className={cn('text-[13px] font-bold whitespace-nowrap', active || done ? 'text-ink-900' : 'text-ink-400')}>{s.title}</div>
                {s.description && <div className="text-xs whitespace-nowrap text-ink-500">{s.description}</div>}
              </div>
            </div>
            {i < steps.length - 1 && (
              <span className="h-0.5 min-w-4 flex-1 overflow-hidden rounded-full bg-mist-200">
                <span className={cn('block h-full bg-accent-500 transition-all duration-500', done ? 'w-full' : 'w-0')} />
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
