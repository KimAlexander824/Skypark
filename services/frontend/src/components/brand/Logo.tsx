import { cn } from '@/lib/format'

export const APP_NAME = 'Skypark'

export function Logo({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <div className={cn('flex items-center', className)}>
      <span className={cn('text-[20px] font-extrabold tracking-tight', inverted ? 'text-snow' : 'text-ink-900')}>{APP_NAME}</span>
    </div>
  )
}
