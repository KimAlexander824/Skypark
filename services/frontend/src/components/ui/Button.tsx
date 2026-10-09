import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/format'

type Variant = 'primary' | 'contrast' | 'secondary' | 'soft' | 'ghost' | 'danger' | 'sun'
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

const variants: Record<Variant, string> = {
  primary: 'glass-accent hover:brightness-105 disabled:opacity-50 disabled:shadow-none',
  contrast: 'bg-ink-900 text-mist-50 shadow-[0_8px_20px_-10px_rgb(0_0_0/0.45)] hover:bg-ink-800 disabled:opacity-50',
  secondary: 'glass text-ink-900 hover:bg-white disabled:text-mist-400',
  soft: 'bg-accent-50 text-accent-700 ring-1 ring-inset ring-accent-100 hover:bg-accent-100 disabled:opacity-50',
  ghost: 'text-mist-600 hover:bg-white/70 hover:text-ink-900 disabled:text-mist-300',
  danger: 'bg-danger-500 text-snow hover:bg-danger-600 active:bg-danger-700 disabled:bg-danger-100',
  sun: 'bg-sun-400 text-[#1c1c1e] hover:bg-sun-300 active:bg-sun-500 disabled:opacity-60',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[13px] gap-1.5 rounded-full',
  md: 'h-11 px-5 text-sm gap-2 rounded-full',
  lg: 'h-13 px-6 text-[15px] gap-2.5 rounded-full',
  icon: 'size-11 rounded-full',
  'icon-sm': 'size-9 rounded-full',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, leftIcon, rightIcon, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-bold whitespace-nowrap transition-all duration-200 ease-[var(--ease-ios)] select-none',
        'active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 [&_svg]:size-[1.15em] [&_svg]:shrink-0',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  )
})
