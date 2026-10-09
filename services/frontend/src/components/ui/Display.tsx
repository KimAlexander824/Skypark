import type { HTMLAttributes, ReactNode } from 'react'
import { cn, initials } from '@/lib/format'


export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('glass min-w-0 rounded-3xl', className)} {...props} />
}

export function CardHeader({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start gap-3 px-5 pt-5 pb-4', className)}>
      {icon && <IconTile>{icon}</IconTile>}
      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] font-bold tracking-tight text-ink-900">{title}</h3>
        {description && <p className="mt-0.5 text-xs font-medium text-mist-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}


type Tone = 'brand' | 'violet' | 'sun' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const tileTones: Record<Tone, string> = {
  brand: 'bg-accent-50 text-accent-600 ring-1 ring-accent-100',
  violet: 'bg-grape-50 text-grape-500 ring-1 ring-grape-100',
  sun: 'bg-rose-50 text-rose-500 ring-1 ring-rose-100',
  success: 'bg-mint-50 text-mint-600 ring-1 ring-mint-100',
  warning: 'bg-accent-50 text-accent-600 ring-1 ring-accent-100',
  danger: 'bg-danger-50 text-danger-600 ring-1 ring-danger-100',
  info: 'bg-sky-50 text-sky-500 ring-1 ring-sky-100',
  neutral: 'bg-mist-100 text-mist-600 ring-1 ring-mist-200',
}

export function IconTile({ tone = 'brand', size = 'md', children }: { tone?: Tone; size?: 'sm' | 'md' | 'lg'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        size === 'sm' && 'size-8 rounded-full [&_svg]:size-4',
        size === 'md' && 'size-10 rounded-full [&_svg]:size-[18px]',
        size === 'lg' && 'size-12 rounded-2xl [&_svg]:size-6',
        tileTones[tone],
      )}
    >
      {children}
    </span>
  )
}


const badgeTones: Record<Tone, string> = {
  brand: 'bg-accent-50 text-accent-700',
  violet: 'bg-grape-50 text-grape-500',
  sun: 'bg-rose-50 text-rose-500',
  success: 'bg-mint-50 text-mint-600',
  warning: 'bg-accent-50 text-accent-700',
  danger: 'bg-danger-50 text-danger-700',
  info: 'bg-sky-50 text-sky-500',
  neutral: 'bg-mist-100 text-mist-600',
}

const dotTones: Record<Tone, string> = {
  brand: 'bg-accent-500',
  violet: 'bg-grape-500',
  sun: 'bg-rose-500',
  success: 'bg-mint-500',
  warning: 'bg-accent-500',
  danger: 'bg-danger-500',
  info: 'bg-sky-500',
  neutral: 'bg-mist-400',
}

export function Badge({
  tone = 'neutral',
  dot,
  pulse,
  icon,
  className,
  children,
}: {
  tone?: Tone
  dot?: boolean
  pulse?: boolean
  icon?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-bold whitespace-nowrap [&_svg]:size-3.5',
        badgeTones[tone],
        className,
      )}
    >
      {dot && (
        <span className="relative flex size-1.5">
          {pulse && <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-75', dotTones[tone])} />}
          <span className={cn('relative inline-flex size-1.5 rounded-full', dotTones[tone])} />
        </span>
      )}
      {icon}
      {children}
    </span>
  )
}

export type { Tone }


const gradients = ['bg-accent-100 text-accent-700', 'bg-rose-100 text-rose-500', 'bg-grape-100 text-grape-500', 'bg-mint-100 text-mint-600', 'bg-sky-100 text-sky-500']

const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)

const avatarSizes = {
  xs: 'size-7 text-[10px]',
  sm: 'size-9 text-xs',
  md: 'size-11 text-sm',
  lg: 'size-16 text-xl',
  xl: 'size-28 text-4xl',
}

export function Avatar({
  src,
  firstName,
  lastName,
  seed,
  size = 'md',
  className,
}: {
  src?: string
  firstName?: string
  lastName?: string
  seed?: string
  size?: keyof typeof avatarSizes
  className?: string
}) {
  const g = gradients[hash(seed ?? `${firstName}${lastName}`) % gradients.length]
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-extrabold',
        avatarSizes[size],
        !src && g,
        className,
      )}
    >
      {src ? <img src={src} alt="" className="size-full object-cover" /> : initials(firstName, lastName)}
    </span>
  )
}


export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-mist-200/70', className)} />
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      <div className="relative mb-5">
        <div className="absolute inset-0 scale-150 rounded-full bg-accent-100/70 blur-2xl" />
        <div className="glass-strong relative flex size-16 items-center justify-center rounded-full text-accent-600 [&_svg]:size-7">{icon}</div>
      </div>
      <h3 className="text-base font-extrabold text-ink-900">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}



export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  back?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back}
        <h1 className="text-[28px] leading-tight font-extrabold tracking-tight text-ink-900 sm:text-[30px]">{title}</h1>
        {description && <p className="mt-1 text-sm font-medium text-mist-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-white/70 px-1.5 text-[11px] font-semibold text-mist-500 ring-1 ring-mist-200">
      {children}
    </kbd>
  )
}
