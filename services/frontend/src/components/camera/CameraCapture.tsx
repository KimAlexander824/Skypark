import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, ImageUp, RefreshCw, SwitchCamera } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/format'
import { t } from '@/i18n'

const MAX_SIDE = 640

function toCompressedDataUrl(source: CanvasImageSource, width: number, height: number): string {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve(toCompressedDataUrl(img, img.naturalWidth, img.naturalHeight))
      URL.revokeObjectURL(img.src)
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

type CamState = 'idle' | 'starting' | 'live' | 'denied' | 'unavailable'

export interface CameraCaptureProps {
  value?: string
  onChange: (dataUrl: string | undefined) => void
  hint?: string
  className?: string
  scanning?: boolean
  autoStart?: boolean
}

export function CameraCapture({ value, onChange, hint = t('Лицо ребёнка в центре кадра'), className, scanning, autoStart = true }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<CamState>('idle')
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [flash, setFlash] = useState(false)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const start = useCallback(
    async (mode = facing) => {
      if (!navigator.mediaDevices?.getUserMedia) return setState('unavailable')
      stop()
      setState('starting')
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => undefined)
        }
        setState('live')
      } catch (e) {
        setState((e as DOMException)?.name === 'NotAllowedError' ? 'denied' : 'unavailable')
      }
    },
    [facing, stop],
  )

  useEffect(() => {
    if (!value && autoStart) start()
    return stop
  }, [])

  const capture = () => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    setFlash(true)
    setTimeout(() => setFlash(false), 180)
    onChange(toCompressedDataUrl(v, v.videoWidth, v.videoHeight))
    stop()
    setState('idle')
  }

  const retake = () => {
    onChange(undefined)
    start()
  }

  const onFile = async (f?: File) => {
    if (!f) return
    stop()
    setState('idle')
    onChange(await fileToDataUrl(f))
  }

  const switchCamera = () => {
    const next = facing === 'user' ? 'environment' : 'user'
    setFacing(next)
    start(next)
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[#111114] ring-1 ring-cream-300">
        {value ? (
          <img src={value} alt={t('Фото ребёнка')} className="size-full object-cover" />
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            className={cn('size-full object-cover', facing === 'user' && '-scale-x-100', state !== 'live' && 'opacity-0')}
          />
        )}

        {(state === 'live' || (value && scanning)) && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative aspect-[3/4] h-[72%]">
              {(['top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-3xl', 'top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-3xl', 'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-3xl', 'bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-3xl'] as const).map((pos) => (
                <span key={pos} className={cn('absolute size-10 border-snow/90', pos)} />
              ))}
              {scanning && (
                <span className="absolute inset-x-2 h-0.5 animate-scan rounded-full bg-snow shadow-[0_0_16px_4px_rgb(255_255_255/0.6)]" />
              )}
            </div>
          </div>
        )}

        {state === 'live' && !value && (
          <div className="absolute inset-x-0 top-4 flex justify-center">
            <span className="rounded-full bg-black/55 px-3.5 py-1.5 text-xs font-semibold text-snow backdrop-blur">{hint}</span>
          </div>
        )}

        {!value && state !== 'live' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-snow">
            {state === 'starting' ? (
              <>
                <RefreshCw className="size-8 animate-spin text-snow/60" />
                <p className="text-sm text-snow/70">{t('Подключаем камеру...')}</p>
              </>
            ) : (
              <>
                <span className="flex size-14 items-center justify-center rounded-2xl bg-snow/10">
                  {state === 'idle' ? <Camera className="size-7" /> : <CameraOff className="size-7" />}
                </span>
                <div>
                  <p className="font-bold">
                    {state === 'denied' ? t('Нет доступа к камере') : state === 'unavailable' ? t('Камера недоступна') : t('Камера выключена')}
                  </p>
                  <p className="mt-1 text-sm text-snow/60">
                    {state === 'denied' ? t('Разрешите доступ в настройках браузера или загрузите фото') : t('Можно загрузить фото с устройства')}
                  </p>
                </div>
                {state === 'idle' && (
                  <Button size="sm" variant="secondary" onClick={() => start()} leftIcon={<Camera />}>
                    
                    {t('Включить камеру')}
                  </Button>
                )}
              </>
            )}
          </div>
        )}

        {flash && <div className="absolute inset-0 animate-fade-in bg-snow" />}

        {state === 'live' && !value && (
          <button
            type="button"
            onClick={switchCamera}
            className="absolute top-3 right-3 flex size-10 items-center justify-center rounded-xl bg-black/50 text-snow backdrop-blur transition hover:bg-black/70"
            aria-label={t('Сменить камеру')}
          >
            <SwitchCamera className="size-5" />
          </button>
        )}
      </div>

      <div className="flex gap-2">
        {value ? (
          <Button variant="secondary" className="flex-1" onClick={retake} leftIcon={<RefreshCw />}>
            
            {t('Переснять')}
          </Button>
        ) : (
          <Button className="flex-1" onClick={capture} disabled={state !== 'live'} leftIcon={<Camera />}>
            
            {t('Сфотографировать')}
          </Button>
        )}
        <Button variant="secondary" onClick={() => fileRef.current?.click()} leftIcon={<ImageUp />}>
          <span className="hidden sm:inline">{t('Загрузить')}</span>
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            onFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
