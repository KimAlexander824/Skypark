import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { errorMessage } from '@/api/errors'
import type { VisitListItem } from '@/api/visits'
import { TelegramLogo } from '@/components/brand/TelegramLogo'
import { Modal } from '@/components/ui/Overlay'
import { useDeclineExtension, useExtensionOptions, usePayExtension, useRequestExtension } from '@/features/visits/queries'
import { cn, formatDuration, formatMoney, formatTime, fullName } from '@/lib/format'
import { visitTiming } from '@/lib/time'
import type { Extension } from '@/types'
import { t } from '@/i18n'

/**
 * Демо Telegram-бота для родителя (ТЗ §16–18, сценарии §37, §38).
 * Пока бота нет, сотрудник может пройти сценарий за родителя: окно повторяет
 * сообщения и кнопки бота и вызывает те же методы API, что будет вызывать бот.
 */
export function TelegramExtensionDemo({ visit, onClose }: { visit?: VisitListItem; onClose: () => void }) {
  // помним последнее посещение, чтобы содержимое не пропадало во время анимации закрытия
  const last = useRef<VisitListItem | undefined>(visit)
  if (visit) last.current = visit
  const v = visit ?? last.current
  return (
    <Modal open={Boolean(visit)} onClose={onClose} size="sm" bare>
      {v && <Chat key={v.id} visit={v} onClose={onClose} />}
    </Modal>
  )
}

type Step = 'offer' | 'choose' | 'pay' | 'done' | 'declined'

interface Message {
  id: number
  from: 'bot' | 'parent'
  text: ReactNode
}

function Chat({ visit, onClose }: { visit: VisitListItem; onClose: () => void }) {
  const leftMin = Math.max(1, Math.round(visitTiming(visit, Date.now()).leftMin))
  const [step, setStep] = useState<Step>('offer')
  const [ext, setExt] = useState<Extension>()
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: 0,
      from: 'bot',
      text: (
        <>
          <b>{visit.child.firstName}</b>{t(': время посещения заканчивается через ')} {formatDuration(leftMin)}  {t(' (в ')} {formatTime(visit.endAt)}{t('). Хотите продлить посещение?')}
        </>
      ),
    },
  ])

  const options = useExtensionOptions(step === 'choose' ? visit.id : undefined)
  const request = useRequestExtension()
  const pay = usePayExtension()
  const decline = useDeclineExtension()
  const busy = request.isPending || pay.isPending || decline.isPending

  const say = (...items: Omit<Message, 'id'>[]) =>
    setMessages((m) => [...m, ...items.map((x, i) => ({ ...x, id: m.length + i }))])

  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [messages, step])

  const onExtend = () => {
    say({ from: 'parent', text: t('Продлить') }, { from: 'bot', text: t('Выберите дополнительное время:') })
    setStep('choose')
  }

  const onDecline = async () => {
    try {
      const v = await decline.mutateAsync(visit.id)
      say({ from: 'parent', text: t('Не продлевать') }, { from: 'bot', text: t('Хорошо, посещение завершится в {0}.', formatTime(v.endAt)) })
      setStep('declined')
      toast.info(t('Родитель отказался от продления'), { description: t('{0} · окончание в {1}', fullName(visit.child), formatTime(v.endAt)) })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const onChoose = async (minutes: number) => {
    try {
      const created = await request.mutateAsync({ visitId: visit.id, minutes })
      setExt(created)
      say(
        { from: 'parent', text: `+${formatDuration(minutes)}` },
        {
          from: 'bot',
          text: (
            <>
              
              {t('Дополнительно: ')} <b>{formatDuration(minutes)}</b>
              <br />
              
              {t('Стоимость: ')} <b>{formatMoney(created.price)}</b>
            </>
          ),
        },
      )
      setStep('pay')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const onPay = async (outcome: 'paid' | 'failed') => {
    if (!ext) return
    try {
      const v = await pay.mutateAsync({ visitId: visit.id, extensionId: ext.id, outcome })
      if (outcome === 'failed') {
        say({ from: 'bot', text: t('Ошибка оплаты. Деньги не списаны — выберите время и попробуйте ещё раз.') })
        setExt(undefined)
        setStep('choose')
        return
      }
      say({
        from: 'bot',
        text: (
          <>
            
            {t('Оплата успешно проведена. Посещение продлено до ')} <b>{formatTime(v.endAt)}</b>.
          </>
        ),
      })
      setStep('done')
      toast.success(t('Продление выполнено'), {
        description: t('{0} · +{1}, до {2}', fullName(visit.child), formatDuration(ext.minutes), formatTime(v.endAt)),
      })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className="flex max-h-[min(640px,85dvh)] flex-col">
      <div className="flex items-center gap-3 border-b border-white/80 px-5 py-4">
        <TelegramLogo className="size-9" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-extrabold text-ink-900">Skypark</div>
          <div className="truncate text-xs font-medium text-mist-500">
            
            {t('бот · ')} {fullName(visit.parent)} · <span className="font-semibold text-sun-600">{t('демо')}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('Закрыть')}
          className="flex size-8 items-center justify-center rounded-full bg-mist-100 text-mist-500 transition hover:bg-mist-200 hover:text-ink-900"
        >
          <X className="size-4" />
        </button>
      </div>

      <div ref={scroller} className="flex flex-1 flex-col gap-2 overflow-y-auto bg-mist-100 px-4 py-4">
        {messages.map((m) => (
          <Bubble key={m.id} from={m.from}>
            {m.text}
          </Bubble>
        ))}

        {step === 'offer' && (
          <Keyboard>
            <KeyButton onClick={onExtend} disabled={busy}>
              
              {t('Продлить')}
            </KeyButton>
            <KeyButton onClick={onDecline} disabled={busy}>
              
              {t('Не продлевать')}
            </KeyButton>
          </Keyboard>
        )}

        {step === 'choose' && (
          <Keyboard>
            {options.isLoading && <div className="col-span-2 py-2 text-center text-xs font-medium text-mist-500">{t('Загрузка…')}</div>}
            {options.data?.map((o) => (
              <KeyButton key={o.minutes} onClick={() => onChoose(o.minutes)} disabled={busy || Boolean(o.unavailableReason)} title={o.unavailableReason}>
                +{formatDuration(o.minutes)} · {formatMoney(o.price)}
              </KeyButton>
            ))}
            {options.data?.some((o) => o.unavailableReason) && (
              <div className="col-span-2 text-center text-[11px] font-medium text-mist-500">
                {options.data.find((o) => o.unavailableReason)?.unavailableReason}
              </div>
            )}
            <KeyButton onClick={onDecline} disabled={busy} wide>
              
              {t('Не продлевать')}
            </KeyButton>
          </Keyboard>
        )}

        {step === 'pay' && (
          <Keyboard>
            <KeyButton onClick={() => onPay('paid')} disabled={busy} wide>
              {pay.isPending ? t('Оплата…') : t('Оплатить онлайн')}
            </KeyButton>
            <KeyButton onClick={() => onPay('failed')} disabled={busy} wide muted>
              
              {t('Демо: оплата не прошла')}
            </KeyButton>
          </Keyboard>
        )}
      </div>

      <div className="border-t border-white/80 px-5 py-3 text-center text-[11.5px] leading-snug font-medium text-mist-500">
        
        {t('Так родитель ответит в Telegram-боте. Пока бота нет, ответ можно отправить отсюда.')}
      </div>
    </div>
  )
}

function Bubble({ from, children }: { from: Message['from']; children: ReactNode }) {
  return (
    <div
      className={cn(
        'max-w-[85%] animate-slide-up rounded-2xl px-3.5 py-2.5 text-[14px] leading-snug font-medium',
        from === 'bot' ? 'self-start rounded-bl-md bg-white text-ink-900 shadow-sm' : 'self-end rounded-br-md bg-sky-500 text-snow',
      )}
    >
      {children}
    </div>
  )
}

function Keyboard({ children }: { children: ReactNode }) {
  return <div className="grid max-w-[85%] grid-cols-2 gap-1.5 self-start">{children}</div>
}

function KeyButton({
  wide,
  muted,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { wide?: boolean; muted?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'min-h-10 rounded-xl bg-white/80 px-3 py-2 text-[13px] font-bold transition hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45',
        muted ? 'text-mist-500' : 'text-sky-500',
        wide && 'col-span-2',
        className,
      )}
    />
  )
}
