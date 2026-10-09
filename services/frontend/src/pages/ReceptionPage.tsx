import { useRef, useState, type ReactNode, type RefObject } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import {
  AlarmClock,
  ArrowRight,
  CircleCheckBig,
  HeartHandshake,
  Camera,
  CloudOff,
  FileWarning,
  ChevronRight,
  ImageOff,
  Phone,
  Plus,
  RefreshCw,
  ScanFace,
  Search,
  UserRoundSearch,
  UserRoundX,
  Users,
} from 'lucide-react'
import { childrenApi, parentsApi, type ChildDetail } from '@/api/children'
import { faceApi, faceMode, type FaceResult } from '@/api/face'
import { CameraCapture } from '@/components/camera/CameraCapture'
import { Button } from '@/components/ui/Button'
import { Avatar, Badge, Card, CardHeader, IconTile, PageHeader, Skeleton } from '@/components/ui/Display'
import { PhoneInput } from '@/components/ui/Field'
import { useCurrentUser } from '@/features/auth/AuthProvider'
import { useNannies, useVisits } from '@/features/visits/queries'
import { PastelStat, StatsRow } from '@/components/admin/AdminKit'
import { toneBg, visitTone } from '@/components/visits/EndTimeline'
import { formatCountdown, useNow, visitTiming } from '@/lib/time'
import { cn, formatAge, formatPhone, fullName, isPhoneComplete, plural } from '@/lib/format'
import { t, localized } from '@/i18n'

type Recognition = {
  result: FaceResult
  detail?: ChildDetail
  /** Несколько похожих детей — сотрудник выбирает сам. */
  candidates?: { detail: ChildDetail; confidence: number }[]
}

const failureCopy: Record<Exclude<FaceResult['status'], 'match' | 'ambiguous'>, { title: string; text: string; icon: ReactNode }> = localized(() => ({
  not_found: {
    title: t('Ребёнок не найден'),
    text: t('Зарегистрируйте нового ребёнка или выполните поиск по номеру телефона.'),
    icon: <UserRoundX />,
  },
  no_face: { title: t('Лицо не обнаружено'), text: t('Убедитесь, что лицо ребёнка полностью в кадре.'), icon: <ScanFace /> },
  multiple_faces: { title: t('В кадре несколько лиц'), text: t('Сфотографируйте только одного ребёнка.'), icon: <Users /> },
  low_quality: { title: t('Низкое качество фото'), text: t('Подойдите ближе, добавьте света и держите камеру неподвижно.'), icon: <ImageOff /> },
  bad_image: { title: t('Не удалось прочитать фото'), text: t('Сфотографируйте ещё раз или выберите другой файл.'), icon: <FileWarning /> },
  unavailable: {
    title: t('Распознавание недоступно'),
    text: t('Сервис распознавания не отвечает. Найдите ребёнка по номеру телефона родителя.'),
    icon: <CloudOff />,
  },
}))

export function ReceptionPage() {
  const user = useCurrentUser()
  const [photo, setPhoto] = useState<string>()
  const [cameraKey, setCameraKey] = useState(0)
  const phoneRef = useRef<HTMLInputElement>(null)

  const recognize = useMutation({
    mutationFn: async (img: string): Promise<Recognition> => {
      const result = await faceApi.identify(img)
      if (result.status === 'match') return { result, detail: await childrenApi.get(result.childId) }
      if (result.status === 'ambiguous') {
        const candidates = await Promise.all(result.candidates.map(async (c) => ({ detail: await childrenApi.get(c.childId), confidence: c.confidence })))
        return { result, candidates }
      }
      return { result }
    },
  })

  const onPhoto = (img: string | undefined) => {
    setPhoto(img)
    recognize.reset()
    if (img) recognize.mutate(img)
  }

  const retake = () => {
    setPhoto(undefined)
    recognize.reset()
    setCameraKey((k) => k + 1)
  }

  const greeting = new Date().getHours() < 12 ? t('Доброе утро') : new Date().getHours() < 18 ? t('Добрый день') : t('Добрый вечер')

  return (
    <div className="animate-slide-up">
      <PageHeader
        title={`${greeting}, ${user.firstName}`}
        description={t('Сфотографируйте ребёнка или найдите карточку по номеру телефона родителя')}
        actions={
          <Link to="/children/new">
            <Button leftIcon={<Plus />}>{t('Новый ребёнок')}</Button>
          </Link>
        }
      />

      <ReceptionStats />

      <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <Card>
          <CardHeader
            icon={<ScanFace />}
            title={t('Распознавание по лицу')}
            description={t('Для повторного посещения')}
            action={faceMode === 'mock' ? <Badge tone="neutral">{t('Демо')}</Badge> : undefined}
          />
          <div className="grid gap-5 px-5 pb-5 md:grid-cols-[1fr_minmax(240px,0.8fr)] xl:grid-cols-1 2xl:grid-cols-[1fr_minmax(260px,0.8fr)]">
            <CameraCapture key={cameraKey} value={photo} onChange={onPhoto} scanning={recognize.isPending} />
            <RecognitionPanel
              pending={recognize.isPending}
              data={recognize.data}
              hasPhoto={Boolean(photo)}
              onRetake={retake}
              onPhoneSearch={() => phoneRef.current?.focus()}
            />
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <PhoneSearch inputRef={phoneRef} />
          <InParkNow />
        </div>
      </div>
    </div>
  )
}

function RecognitionPanel({
  pending,
  data,
  hasPhoto,
  onRetake,
  onPhoneSearch,
}: {
  pending: boolean
  data?: Recognition
  hasPhoto: boolean
  onRetake: () => void
  onPhoneSearch: () => void
}) {
  const navigate = useNavigate()

  if (pending)
    return (
      <PanelShell>
        <div className="relative mb-4 flex size-16 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-butter-300" />
          <span className="glass-accent relative flex size-16 items-center justify-center rounded-full">
            <ScanFace className="size-7" />
          </span>
        </div>
        <div className="font-bold text-ink-900">{t('Ищем совпадение…')}</div>
        <p className="mt-1 text-sm text-ink-500">{t('Сравниваем с профилями зарегистрированных детей')}</p>
      </PanelShell>
    )

  if (!data)
    return (
      <PanelShell>
        <IconTile tone="neutral" size="lg">
          <Camera />
        </IconTile>
        <div className="mt-4 font-bold text-ink-900">{hasPhoto ? t('Обработка фото') : t('Ожидаем фото')}</div>
        <ol className="mt-3 space-y-2 text-left text-sm text-ink-600">
          {[t('Поставьте ребёнка напротив камеры'), t('Нажмите «Сфотографировать»'), t('Проверьте найденную карточку')].map((t, i) => (
            <li key={t} className="flex items-center gap-2.5">
              <span className="tabular flex size-5 shrink-0 items-center justify-center rounded-full bg-cream-200 text-[11px] font-bold text-ink-600">
                {i + 1}
              </span>
              {t}
            </li>
          ))}
        </ol>
      </PanelShell>
    )

  if (data.result.status === 'match' && data.detail) {
    const { child, parent } = data.detail
    const confidence = Math.round(data.result.confidence * 100)
    return (
      <div className="relative isolate flex animate-pop-in flex-col overflow-hidden rounded-3xl bg-olive-300 p-5">
        <Badge tone="brand" className="self-start">
          
          {t('Совпадение ')} {confidence}%
        </Badge>
        <div className="mt-4 flex items-center gap-3.5">
          <Avatar src={child.photoUrl} firstName={child.firstName} lastName={child.lastName} seed={child.id} size="lg" className="bg-white/60" />
          <div className="min-w-0">
            <div className="truncate text-lg font-extrabold text-ink-900">{fullName(child)}</div>
            <div className="text-sm font-semibold text-ink-900/60">{formatAge(child.birthDate)}</div>
          </div>
        </div>
        <div className="mt-4 rounded-2xl bg-white/50 p-3 text-sm">
          <div className="text-xs font-semibold text-ink-900/60">{t('Родитель')}</div>
          <div className="mt-0.5 font-bold text-ink-900">{fullName(parent)}</div>
          <div className="tabular text-ink-900/70">{formatPhone(parent.phone)}</div>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <Button onClick={() => navigate(`/children/${child.id}`)} rightIcon={<ArrowRight />}>
            
            {t('Открыть карточку')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onPhoneSearch}>
            
            {t('Это не тот ребёнок')}
          </Button>
        </div>
      </div>
    )
  }

  if (data.result.status === 'ambiguous' && data.candidates?.length) {
    return (
      <div className="relative isolate flex animate-pop-in flex-col overflow-hidden rounded-3xl bg-butter-200 p-5">
        <div className="font-extrabold text-ink-900">{t('Найдено несколько похожих детей')}</div>
        <p className="mt-1 text-sm text-ink-900/70">{t('Выберите нужного ребёнка')}</p>
        <div className="mt-4 flex flex-col gap-2">
          {data.candidates.map(({ detail: { child, parent }, confidence }) => (
            <button
              key={child.id}
              type="button"
              onClick={() => navigate(`/children/${child.id}`)}
              className="flex items-center gap-3 rounded-2xl bg-white/60 p-2.5 text-left transition hover:bg-white"
            >
              <Avatar src={child.photoUrl} firstName={child.firstName} lastName={child.lastName} seed={child.id} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-ink-900">{fullName(child)}</div>
                <div className="truncate text-xs text-ink-500">
                  {formatAge(child.birthDate)} · {fullName(parent)}
                </div>
              </div>
              <span className="tabular text-xs font-bold text-ink-600">{Math.round(confidence * 100)}%</span>
              <ChevronRight className="size-4 text-ink-400" />
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <Button variant="ghost" size="sm" onClick={onRetake} leftIcon={<RefreshCw />}>
            
            {t('Сфотографировать снова')}
          </Button>
        </div>
      </div>
    )
  }

  const copy = failureCopy[data.result.status as keyof typeof failureCopy] ?? failureCopy.not_found
  return (
    <div className="relative isolate flex animate-pop-in flex-col items-center justify-center overflow-hidden rounded-3xl bg-blush-300 p-5 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-white/60 text-ink-900 [&_svg]:size-6">{copy.icon}</span>
      <div className="mt-4 font-extrabold text-ink-900">{copy.title}</div>
      <p className="mt-1 text-sm text-ink-900/70">{copy.text}</p>
      <div className="mt-5 flex w-full flex-col gap-2">
        <Button variant="secondary" onClick={onRetake} leftIcon={<RefreshCw />}>
          
          {t('Сфотографировать снова')}
        </Button>
        <Button variant="soft" onClick={onPhoneSearch} leftIcon={<Phone />}>
          
          {t('Поиск по телефону')}
        </Button>
        {data.result.status === 'not_found' && (
          <Link to="/children/new">
            <Button className="w-full" leftIcon={<Plus />}>
              
              {t('Зарегистрировать')}
            </Button>
          </Link>
        )}
      </div>
    </div>
  )
}

function PanelShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl bg-cream-100 p-6 text-center ring-1 ring-cream-300 ring-dashed">
      {children}
    </div>
  )
}

function PhoneSearch({ inputRef }: { inputRef: RefObject<HTMLInputElement | null> }) {
  const [phone, setPhone] = useState('')
  const lookup = useMutation({ mutationFn: (p: string) => parentsApi.findByPhone(p) })

  const search = (p = phone) => isPhoneComplete(p) && lookup.mutate(p)

  return (
    <Card>
      <CardHeader icon={<UserRoundSearch />} title={t('Поиск по телефону')} description={t('Покажем всех детей родителя')} />
      <div className="px-5 pb-5">
        <div className="flex gap-2">
          <PhoneInput
            ref={inputRef}
            value={phone}
            onChange={(v) => {
              setPhone(v)
              lookup.reset()
              if (v.length === 9) search(v)
            }}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            containerClassName="flex-1"
          />
          <Button
            size="icon"
            variant="soft"
            onClick={() => search()}
            disabled={!isPhoneComplete(phone)}
            loading={lookup.isPending}
            aria-label={t('Найти')}
          >
            <Search />
          </Button>
        </div>

        {lookup.data === null && (
          <div className="relative isolate mt-4 animate-pop-in overflow-hidden rounded-3xl bg-butter-300 p-4 text-center">
            <div className="font-extrabold text-ink-900">{t('Родитель не найден')}</div>
            <p className="mt-1 text-sm text-ink-900/70">{t('Номер ')} {formatPhone(phone)}  {t(' ещё не зарегистрирован')}</p>
            <Link to={`/children/new?phone=${phone}`}>
              <Button size="sm" className="mt-3" leftIcon={<Plus />}>
                
                {t('Зарегистрировать ребёнка')}
              </Button>
            </Link>
          </div>
        )}

        {lookup.data && (
          <div className="mt-4 animate-pop-in">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-bold text-ink-900">{fullName(lookup.data.parent)}</span>
              <Link to={`/children/new?phone=${phone}`} className="glass rounded-full px-3 py-1 text-xs font-bold text-ink-900 hover:bg-white">
                
                {t('+ ребёнок')}
              </Link>
            </div>
            <ul className="flex flex-col gap-1.5">
              {lookup.data.children.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/children/${c.id}`}
                    className="group flex items-center gap-3 rounded-2xl bg-cream-100 p-2.5 transition hover:bg-butter-200"
                  >
                    <Avatar src={c.photoUrl} firstName={c.firstName} lastName={c.lastName} seed={c.id} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-ink-900">{fullName(c)}</div>
                      <div className="text-xs text-ink-500">{formatAge(c.birthDate)}</div>
                    </div>
                    <ChevronRight className="size-4 text-ink-300 group-hover:text-ink-600" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  )
}

function InParkNow() {
  const { data } = useVisits('current')
  const now = useNow(1000)
  return (
    <Card>
      <CardHeader
        icon={<Users />}
        title={t('Сейчас в парке')}
        description={data ? `${data.length} ${plural(data.length, [t('ребёнок'), t('ребёнка'), t('детей')])}` : undefined}
        action={
          <Link to="/visits" className="glass rounded-full px-3 py-1 text-xs font-bold text-ink-900 hover:bg-white">
            
            {t('Все')}
          </Link>
        }
      />
      <div className="px-4 pb-4">
        {!data ? (
          <Skeleton className="h-14 rounded-2xl" />
        ) : data.length === 0 ? (
          <p className="rounded-2xl bg-cream-100 p-4 text-center text-sm text-ink-500">{t('Детей в парке нет')}</p>
        ) : (
          <ul className="space-y-1.5">
            {data.slice(0, 5).map((v) => {
              const tone = visitTone(v, now)
              return (
                <li key={v.id}>
                  <Link to={`/children/${v.child.id}`} className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-cream-100">
                    <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl text-[13px] font-extrabold text-ink-900', toneBg[tone])}>
                      {v.child.firstName[0]}
                      {v.child.lastName[0]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-ink-900">{fullName(v.child)}</div>
                      <div className="truncate text-xs text-ink-500">{v.nanny ? fullName(v.nanny) : '—'}</div>
                    </div>
                    <span className={cn('tabular rounded-full px-2.5 py-1 text-xs font-extrabold text-ink-900', toneBg[tone])}>
                      {formatCountdown(visitTiming(v, now).leftMs)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
        {data && data.length > 5 && <p className="mt-2 text-center text-xs font-semibold text-ink-500">{t('и ещё ')} {data.length - 5}</p>}
      </div>
    </Card>
  )
}

/** Пастельные показатели ресепшн — как на Dashboard. */
function ReceptionStats() {
  const { data: current } = useVisits('current')
  const { data: done } = useVisits('completed')
  const { data: nannies } = useNannies()
  const now = useNow(15_000)
  const today = new Date().toDateString()
  return (
    <StatsRow>
      <PastelStat tone="butter" icon={<Users />} label={t('Сейчас в парке')} value={current?.length} />
      <PastelStat tone="blush" icon={<AlarmClock />} label={t('Заканчиваются (≤15 мин)')} value={current?.filter((v) => visitTiming(v, now).endingSoon).length} />
      <PastelStat tone="olive" icon={<HeartHandshake />} label={t('Свободных нянь')} value={nannies?.filter((n) => n.available).length} />
      <PastelStat
        tone="peri"
        icon={<CircleCheckBig />}
        label={t('Завершено сегодня')}
        value={done?.filter((v) => v.status === 'completed' && v.endedAt && new Date(v.endedAt).toDateString() === today).length}
      />
    </StatsRow>
  )
}
