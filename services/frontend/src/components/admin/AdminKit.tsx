import type { ReactNode } from 'react'
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage } from '@/api/errors'
import { StatTile, type GlassTone } from '@/components/glass/Glass'
import { Skeleton } from '@/components/ui/Display'
import { cn } from '@/lib/format'

export type PastelTone = 'butter' | 'blush' | 'olive' | 'peri'

const toneMap: Record<PastelTone, GlassTone> = { butter: 'accent', blush: 'rose', olive: 'mint', peri: 'grape' }

export function PastelStat({ tone, icon, label, value }: { tone: PastelTone; icon: ReactNode; label: string; value?: ReactNode }) {
  return <StatTile tone={toneMap[tone]} icon={icon} label={label} value={value} />
}

export function StatsRow({ children }: { children: ReactNode }) {
  return <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
}


export function AdminHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[28px] leading-tight font-extrabold tracking-tight text-ink-900 sm:text-[30px]">{title}</h1>
        {description && <p className="mt-1 text-sm font-medium text-mist-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export interface Column<T> {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loading,
  empty,
  minWidth = 760,
}: {
  columns: Column<T>[]
  rows?: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  loading?: boolean
  empty?: ReactNode
  minWidth?: number
}) {
  if (loading || !rows)
    return (
      <div className="space-y-2 p-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-2xl" />
        ))}
      </div>
    )
  if (!rows.length) return <>{empty}</>
  const align = (a?: Column<T>['align']) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left')
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead>
          <tr className="text-[11.5px] font-semibold text-mist-500">
            {columns.map((c, i) => (
              <th key={c.key} className={cn('px-3 pb-2.5 font-semibold whitespace-nowrap', i === 0 && 'pl-2', align(c.align), c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={cn('border-t border-white/80 transition', onRowClick && 'cursor-pointer hover:bg-white/60')}
            >
              {columns.map((c, i) => (
                <td key={c.key} className={cn('px-3 py-2.5', i === 0 && 'pl-2', align(c.align), c.className)}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Panel({ toolbar, children, className }: { toolbar?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('glass min-w-0 rounded-3xl p-4 sm:p-5', className)}>
      {toolbar && <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">{toolbar}</div>}
      {children}
    </section>
  )
}

export function Pill({ tone = 'muted', children, className }: { tone?: PastelTone | 'dark' | 'muted' | 'danger'; children: ReactNode; className?: string }) {
  const map = {
    butter: 'bg-accent-50 text-accent-700',
    blush: 'bg-rose-50 text-rose-500',
    olive: 'bg-mint-50 text-mint-600',
    peri: 'bg-grape-50 text-grape-500',
    dark: 'bg-ink-900 text-mist-50',
    muted: 'bg-mist-100 text-mist-600',
    danger: 'bg-danger-50 text-danger-700',
  }
  return (
    <span className={cn('inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-bold whitespace-nowrap [&_svg]:size-3.5', map[tone], className)}>
      {children}
    </span>
  )
}

export function IconAction({ label, onClick, children, danger }: { label: string; onClick: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        'flex size-8 items-center justify-center rounded-full text-ink-500 transition [&_svg]:size-4',
        danger ? 'hover:bg-danger-50 hover:text-danger-600' : 'hover:bg-accent-50 hover:text-accent-600',
      )}
    >
      {children}
    </button>
  )
}

export function EmptyBlock({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl bg-white/50 px-6 py-12 text-center">
      <span className="glass-strong flex size-14 items-center justify-center rounded-full text-accent-600 [&_svg]:size-6">{icon}</span>
      <h3 className="mt-3 text-base font-extrabold text-ink-900">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm text-ink-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}


export function useAdminMutation<TVars, TRes = unknown>(
  fn: (vars: TVars) => Promise<TRes>,
  { invalidate, success }: { invalidate: QueryKey[]; success?: string | ((vars: TVars) => string) },
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (_r, vars) => {
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k }))
      if (success) toast.success(typeof success === 'function' ? success(vars) : success)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export function SectionTitle({ icon, tone, title, text, className }: { icon: ReactNode; tone: string; title: string; text: string; className?: string }) {
  return (
    <div className={cn('mb-4 flex items-start gap-3', className)}>
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-2xl text-ink-900 [&_svg]:size-5', tone)}>{icon}</span>
      <div>
        <h2 className="text-[17px] font-extrabold text-ink-900">{title}</h2>
        <p className="text-xs text-ink-500">{text}</p>
      </div>
    </div>
  )
}
