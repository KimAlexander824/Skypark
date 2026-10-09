import { forwardRef, useEffect, useId, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { AlertCircle } from 'lucide-react'
import { cn, phoneLocalPart } from '@/lib/format'

interface FieldShellProps {
  label?: string
  hint?: string
  error?: string
  required?: boolean
  htmlFor?: string
  className?: string
  children: ReactNode
}

export function FieldShell({ label, hint, error, required, htmlFor, className, children }: FieldShellProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-[13px] font-semibold text-mist-600">
          {label}
          {required && <span className="ml-0.5 text-danger-500">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-xs font-medium text-danger-600">
          <AlertCircle className="size-3.5" />
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-ink-500">{hint}</p>
      )}
    </div>
  )
}

const controlBase =
  'w-full rounded-2xl bg-white/75 text-[15px] font-medium text-ink-900 ring-1 ring-inset ring-mist-200 backdrop-blur-xl transition ' +
  'placeholder:font-normal placeholder:text-mist-400 hover:ring-mist-300 ' +
  'focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-400 disabled:bg-mist-100 disabled:text-mist-500'

const controlError = 'ring-danger-500/70 hover:ring-danger-500 focus:ring-danger-500'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  hint?: string
  error?: string
  leftIcon?: ReactNode
  rightSlot?: ReactNode
  containerClassName?: string
  inputSize?: 'md' | 'lg'
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leftIcon, rightSlot, className, containerClassName, required, id, inputSize = 'md', ...props },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} htmlFor={inputId} className={containerClassName}>
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute inset-y-0 left-3.5 z-10 flex items-center text-mist-500 [&_svg]:size-[18px]">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          className={cn(
            controlBase,
            inputSize === 'lg' ? 'h-14 text-base' : 'h-11',
            leftIcon ? 'pl-10.5' : 'pl-3.5',
            rightSlot ? 'pr-11' : 'pr-3.5',
            error && controlError,
            className,
          )}
          {...props}
        />
        {rightSlot && <span className="absolute inset-y-0 right-1.5 flex items-center">{rightSlot}</span>}
      </div>
    </FieldShell>
  )
})

export interface NumberInputProps extends Omit<InputProps, 'value' | 'onChange' | 'type'> {
  value: number
  onValueChange: (value: number) => void
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput({ value, onValueChange, onBlur, min, max, ...props }, ref) {
  const [text, setText] = useState(String(value))
  useEffect(() => {
    setText((t) => (t !== '' && Number(t) === value ? t : String(value)))
  }, [value])

  const lo = min === undefined ? undefined : Number(min)
  const hi = max === undefined ? undefined : Number(max)
  return (
    <Input
      ref={ref}
      {...props}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={text}
      onChange={(e) => {
        const next = e.target.value.replace(/^0+(?=\d)/, '')
        setText(next)
        if (next !== '' && !Number.isNaN(Number(next))) onValueChange(Number(next))
      }}
      onBlur={(e) => {
        let n = text === '' || Number.isNaN(Number(text)) ? (lo ?? 0) : Number(text)
        if (lo !== undefined) n = Math.max(lo, n)
        if (hi !== undefined) n = Math.min(hi, n)
        setText(String(n))
        if (n !== value) onValueChange(n)
        onBlur?.(e)
      }}
    />
  )
})

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string
  containerClassName?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, containerClassName, id, required, ...props },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} htmlFor={inputId} className={containerClassName}>
      <textarea
        ref={ref}
        id={inputId}
        rows={3}
        className={cn(controlBase, 'resize-none px-3.5 py-2.5', error && controlError, className)}
        {...props}
      />
    </FieldShell>
  )
})

export interface PhoneInputProps extends Omit<InputProps, 'value' | 'onChange' | 'type'> {
  value: string
  onChange: (localDigits: string) => void
}

const maskLocal = (d: string) =>
  [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ')

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  { value, onChange, inputSize = 'md', ...props },
  ref,
) {
  return (
    <Input
      ref={ref}
      type="tel"
      inputMode="numeric"
      autoComplete="tel"
      placeholder="90 123 45 67"
      inputSize={inputSize}
      leftIcon={<span className={cn('font-semibold text-ink-500', inputSize === 'lg' ? 'text-base' : 'text-[15px]')}>+998</span>}
      className={cn('tabular tracking-wide', inputSize === 'lg' ? 'pl-17' : 'pl-15.5')}
      value={maskLocal(value)}
      onChange={(e) => {
        const raw = e.target.value.replace(/\D/g, '')
        onChange(raw.length > 9 ? phoneLocalPart(raw) : raw.slice(0, 9))
      }}
      {...props}
    />
  )
})

