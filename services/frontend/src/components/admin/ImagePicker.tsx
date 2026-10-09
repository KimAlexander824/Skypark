import { useRef } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { cn } from '@/lib/format'
import { t } from '@/i18n'

/** Сжимает изображение до maxSide и возвращает JPEG data URL. */
export function compressImage(file: File, maxSide = 960): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.naturalWidth * scale)
      canvas.height = Math.round(img.naturalHeight * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(img.src)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

export function ImagePicker({
  value,
  onChange,
  label = t('Изображение'),
  shape = 'wide',
  maxSide,
}: {
  value?: string
  onChange: (v: string | undefined) => void
  label?: string
  shape?: 'wide' | 'square'
  maxSide?: number
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-ink-700">{label}</span>
      <div
        className={cn(
          'group relative overflow-hidden rounded-2xl bg-cream-100 ring-1 ring-cream-200 ring-dashed',
          shape === 'wide' ? 'aspect-[16/7] w-full' : 'size-28',
        )}
      >
        {value ? (
          <>
            <img src={value} alt="" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-ink-900/70 text-mist-50 backdrop-blur transition hover:bg-ink-900"
              aria-label={t('Удалить изображение')}
            >
              <X className="size-4" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => ref.current?.click()}
            className="flex size-full flex-col items-center justify-center gap-1.5 text-ink-500 transition hover:bg-cream-200/60 hover:text-ink-900"
          >
            <ImagePlus className="size-6" />
            <span className="text-xs font-semibold">{t('Загрузить')}</span>
          </button>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onChange(await compressImage(f, maxSide))
        }}
      />
    </div>
  )
}
