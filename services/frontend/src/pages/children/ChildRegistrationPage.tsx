import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Camera,
  ChevronRight,
  PartyPopper,
  Search,
  UserPlus,
  UserRound,
  UserRoundCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { childrenApi, type NewChildInput, type NewParentInput } from '@/api/children'
import { faceApi, faceMode, type FaceErrorCode } from '@/api/face'
import { errorMessage } from '@/api/errors'
import { CameraCapture } from '@/components/camera/CameraCapture'
import { Button } from '@/components/ui/Button'
import { Avatar, Badge, Card, IconTile, PageHeader } from '@/components/ui/Display'
import { FieldShell, Input, PhoneInput, Textarea } from '@/components/ui/Field'
import { Modal, Segmented } from '@/components/ui/Overlay'
import { Stepper } from '@/components/ui/Stepper'
import { useCurrentUser } from '@/features/auth/AuthProvider'
import { useParentLookup, useRegisterChild } from '@/features/children/queries'
import { cn, formatAge, formatDate, formatPhone, fullName, isPhoneComplete, phoneLocalPart } from '@/lib/format'
import type { Child, Gender, Parent } from '@/types'
import { DatePicker, toIso } from '@/components/ui/DatePicker'
import { TelegramLogo } from '@/components/brand/TelegramLogo'
import { t, localized } from '@/i18n'

const STEPS = localized(() => ([
  { title: t('Родитель'), description: t('Поиск по телефону') },
  { title: t('Ребёнок'), description: t('Основные данные') },
  { title: t('Фотография'), description: t('Для распознавания') },
  { title: t('Проверка'), description: t('Создание карточки') },
]))

type ParentState =
  | { kind: 'unknown' }
  | { kind: 'existing'; parent: Parent; children: Child[] }
  | { kind: 'new'; data: NewParentInput }

const emptyChild: NewChildInput = { firstName: '', lastName: '', birthDate: '', gender: 'female' }

type ChildErrors = Partial<Record<keyof NewChildInput, string>>

function validateChild(c: NewChildInput): ChildErrors {
  const e: ChildErrors = {}
  if (!c.firstName.trim()) e.firstName = t('Укажите имя')
  if (!c.lastName.trim()) e.lastName = t('Укажите фамилию')
  if (!c.birthDate) e.birthDate = t('Укажите дату рождения')
  else {
    const d = new Date(c.birthDate)
    const now = new Date()
    if (d > now) e.birthDate = t('Дата не может быть в будущем')
    else if (now.getFullYear() - d.getFullYear() > 18) e.birthDate = t('Проверьте год рождения')
  }
  return e
}

const photoErrorText: Record<FaceErrorCode, string> = localized(() => ({
  no_face: t('Лицо не найдено. Сфотографируйте ребёнка анфас при хорошем свете'),
  multiple_faces: t('В кадре несколько лиц. Сфотографируйте только ребёнка'),
  low_quality: t('Лицо слишком маленькое. Подойдите ближе'),
  bad_image: t('Не удалось прочитать фото. Сфотографируйте ещё раз'),
  unavailable: t('Сервис распознавания недоступен. Фото можно добавить позже'),
}))

export function ChildRegistrationPage() {
  const user = useCurrentUser()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [step, setStep] = useState(0)
  const [phone, setPhone] = useState(phoneLocalPart(params.get('phone') ?? ''))
  const [parent, setParent] = useState<ParentState>({ kind: 'unknown' })
  const [parentErrors, setParentErrors] = useState<{ firstName?: string }>({})
  const [child, setChild] = useState<NewChildInput>(emptyChild)
  const [childErrors, setChildErrors] = useState<ChildErrors>({})
  const [photo, setPhoto] = useState<string>()

  const lookup = useParentLookup()
  const register = useRegisterChild()

  const runLookup = async (p = phone) => {
    if (!isPhoneComplete(p)) return
    const res = await lookup.mutateAsync(p)
    setParent(res ? { kind: 'existing', ...res } : { kind: 'new', data: { phone: p, firstName: '' } })
  }

  useEffect(() => {
    if (isPhoneComplete(phone)) runLookup(phone)
  }, [])

  const parentName = parent.kind === 'existing' ? fullName(parent.parent) : parent.kind === 'new' ? fullName(parent.data) : ''
  const parentLastName = parent.kind === 'existing' ? parent.parent.lastName : parent.kind === 'new' ? parent.data.lastName : ''

  const goChild = () => {
    if (parent.kind === 'new' && !parent.data.firstName.trim()) {
      setParentErrors({ firstName: t('Укажите имя родителя') })
      return
    }
    setParentErrors({})
    if (!child.lastName && parentLastName) setChild((c) => ({ ...c, lastName: parentLastName }))
    setStep(1)
  }

  const goPhoto = () => {
    const e = validateChild(child)
    setChildErrors(e)
    if (Object.keys(e).length === 0) setStep(2)
  }

  const [saving, setSaving] = useState<string>()
  const [duplicate, setDuplicate] = useState<{ child: Child; parent: Parent }>()

  const submit = async (override?: Child) => {
    try {
      if (photo && faceMode === 'service' && !override) {
        setSaving(t('Проверяем, нет ли ребёнка в базе…'))
        const found = await faceApi.identify(photo)
        if (found.status === 'match' || found.status === 'ambiguous') {
          const id = found.status === 'match' ? found.childId : found.candidates[0].childId
          const dup = await childrenApi.get(id)
          setDuplicate({ child: dup.child, parent: dup.parent })
          return
        }
        if (found.status !== 'not_found' && found.status !== 'unavailable') {
          toast.error(photoErrorText[found.status])
          setStep(2)
          return
        }
      }

      setSaving(t('Создаём карточку…'))
      const created = await register.mutateAsync({
        parent: parent.kind === 'existing' ? { existingId: parent.parent.id } : { new: (parent as { data: NewParentInput }).data },
        child: { ...child, firstName: child.firstName.trim(), lastName: child.lastName.trim(), photoUrl: photo },
        createdBy: user.id,
        faceMatchOverride: override ? fullName(override) : undefined,
      })

      if (photo) {
        setSaving(t('Сохраняем лицо для распознавания…'))
        const enrolled = await faceApi.enroll(created.id, photo, 'registration')
        if (!enrolled.ok) {
          await childrenApi.setFaceProfile(created.id, false)
          toast.warning(t('Карточка создана, но лицо не сохранено'), {
            description: enrolled.message ?? photoErrorText[enrolled.error],
          })
        } else if (enrolled.ignoredFaces > 0) {
          toast.info(t('В кадре были другие лица'), { description: t('Проверьте в карточке, что сохранено лицо нужного ребёнка') })
        }
      }

      toast.success(t('Карточка ребёнка создана'), { description: fullName(created) })
      navigate(`/children/${created.id}`, { replace: true, state: { justCreated: true } })
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(undefined)
    }
  }

  return (
    <div className="mx-auto max-w-4xl animate-slide-up">
      <PageHeader
        back={
          <Link to="/children" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900">
            <ArrowLeft className="size-4" />  {t(' К списку детей')}
          </Link>
        }
        title={t('Регистрация ребёнка')}
        description={t('Первое посещение: карточка ребёнка, родитель и фото для распознавания')}
      />

      <Card className="mb-5 px-5 py-4">
        <Stepper steps={STEPS} current={step} />
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <Card className="p-5 sm:p-7">
          {step === 0 && (
            <StepSection icon={<UserRound />} title={t('Родитель')} text={t('Введите номер телефона — система проверит, есть ли родитель в базе.')}>
              <div className="flex gap-2">
                <PhoneInput
                  value={phone}
                  onChange={(v) => {
                    setPhone(v)
                    if (parent.kind !== 'unknown') setParent({ kind: 'unknown' })
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && runLookup()}
                  containerClassName="flex-1"
                  inputSize="lg"
                  autoFocus
                />
                <Button
                  size="lg"
                  variant="soft"
                  onClick={() => runLookup()}
                  disabled={!isPhoneComplete(phone)}
                  loading={lookup.isPending}
                  leftIcon={<Search />}
                >
                  
                  {t('Проверить')}
                </Button>
              </div>

              {parent.kind === 'existing' && (
                <ExistingParent parent={parent.parent} kids={parent.children} onAddChild={goChild} />
              )}

              {parent.kind === 'new' && (
                <div className="mt-6 animate-pop-in">
                  <div className="mb-5 flex items-center gap-3 rounded-2xl bg-blush-200 p-4 ring-1 ring-blush-300">
                    <IconTile tone="sun" size="sm">
                      <UserPlus />
                    </IconTile>
                    <div className="text-sm">
                      <div className="font-bold text-ink-900">{t('Новый родитель')}</div>
                      <div className="text-ink-600">{t('Номер ')} {formatPhone(phone)}  {t(' не найден — создадим новую запись')}</div>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      label={t('Имя родителя')}
                      required
                      autoFocus
                      value={parent.data.firstName}
                      error={parentErrors.firstName}
                      onChange={(e) => setParent({ kind: 'new', data: { ...parent.data, firstName: e.target.value } })}
                      placeholder={t('Например, Азиза')}
                    />
                    <Input
                      label={t('Фамилия')}
                      value={parent.data.lastName ?? ''}
                      onChange={(e) => setParent({ kind: 'new', data: { ...parent.data, lastName: e.target.value } })}
                      placeholder={t('Необязательно')}
                    />
                    <Textarea
                      label={t('Дополнительно')}
                      containerClassName="sm:col-span-2"
                      value={parent.data.note ?? ''}
                      onChange={(e) => setParent({ kind: 'new', data: { ...parent.data, note: e.target.value } })}
                      placeholder={t('Второй контакт, комментарий для сотрудников…')}
                    />
                  </div>
                  <StepFooter>
                    <Button onClick={goChild} rightIcon={<ArrowRight />}>
                      
                      {t('Далее')}
                    </Button>
                  </StepFooter>
                </div>
              )}
            </StepSection>
          )}

          {step === 1 && (
            <StepSection icon={<CalendarDays />} title={t('Данные ребёнка')} text={t('Обязательные поля отмечены звёздочкой.')}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label={t('Имя')}
                  required
                  autoFocus
                  value={child.firstName}
                  error={childErrors.firstName}
                  onChange={(e) => setChild({ ...child, firstName: e.target.value })}
                />
                <Input
                  label={t('Фамилия')}
                  required
                  value={child.lastName}
                  error={childErrors.lastName}
                  onChange={(e) => setChild({ ...child, lastName: e.target.value })}
                />
                <DatePicker
                  label={t('Дата рождения')}
                  required
                  max={toIso(new Date())}
                  value={child.birthDate}
                  error={childErrors.birthDate}
                  hint={child.birthDate && !childErrors.birthDate ? formatAge(child.birthDate) : undefined}
                  onChange={(v) => setChild({ ...child, birthDate: v })}
                />
                <FieldShell label={t('Пол')} required>
                  <Segmented<Gender>
                    value={child.gender}
                    onChange={(g) => setChild({ ...child, gender: g })}
                    className="h-11 w-full [&>button]:h-9"
                    options={[
                      { value: 'female', label: t('Девочка') },
                      { value: 'male', label: t('Мальчик') },
                    ]}
                  />
                </FieldShell>
                <Textarea
                  label={t('Дополнительно')}
                  containerClassName="sm:col-span-2"
                  value={child.note ?? ''}
                  onChange={(e) => setChild({ ...child, note: e.target.value })}
                  placeholder={t('Аллергии, особенности, важные заметки для няни')}
                />
              </div>
              <StepFooter onBack={() => setStep(0)}>
                <Button onClick={goPhoto} rightIcon={<ArrowRight />}>
                  
                  {t('Далее')}
                </Button>
              </StepFooter>
            </StepSection>
          )}

          {step === 2 && (
            <StepSection
              icon={<Camera />}
              title={t('Фотография')}
              text={t('Фото сохраняется в карточке и используется для распознавания при следующих посещениях.')}
            >
              <CameraCapture value={photo} onChange={setPhoto} />
              {!photo && (
                <p className="mt-3 flex items-start gap-2 text-[13px] text-ink-500">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-500" />
                  
                  {t('Без фотографии ребёнка можно будет найти только по номеру телефона родителя.')}
                </p>
              )}
              <StepFooter onBack={() => setStep(1)}>
                {!photo && (
                  <Button variant="ghost" onClick={() => setStep(3)}>
                    
                    {t('Пропустить')}
                  </Button>
                )}
                <Button onClick={() => setStep(3)} disabled={!photo} rightIcon={<ArrowRight />}>
                  
                  {t('Далее')}
                </Button>
              </StepFooter>
            </StepSection>
          )}

          {step === 3 && (
            <StepSection icon={<BadgeCheck />} title={t('Проверьте данные')} text={t('После создания карточки можно сразу оформить посещение.')}>
              <div className="overflow-hidden rounded-2xl ring-1 ring-cream-200">
                <div className="flex items-center gap-4 bg-cream-100 p-5">
                  <Avatar src={photo} firstName={child.firstName} lastName={child.lastName} size="lg" />
                  <div>
                    <div className="text-lg font-extrabold text-ink-900">{fullName(child)}</div>
                    <div className="text-sm text-ink-600">
                      {formatAge(child.birthDate)} · {child.gender === 'female' ? t('девочка') : t('мальчик')}
                    </div>
                  </div>
                </div>
                <dl className="divide-y divide-cream-200 text-sm">
                  <SummaryRow label={t('Дата рождения')} value={formatDate(child.birthDate)} />
                  <SummaryRow
                    label={t('Родитель')}
                    value={
                      <span className="flex items-center gap-2">
                        {parentName}
                        {parent.kind === 'new' ? <Badge tone="sun">{t('новый')}</Badge> : <Badge tone="brand">{t('в базе')}</Badge>}
                      </span>
                    }
                  />
                  <SummaryRow label={t('Телефон')} value={<span className="tabular">{formatPhone(phone)}</span>} />
                  <SummaryRow
                    label={t('Фото для распознавания')}
                    value={photo ? <Badge tone="success">{t('Есть')}</Badge> : <Badge tone="warning">{t('Нет фото')}</Badge>}
                  />
                  {child.note && <SummaryRow label={t('Заметка')} value={child.note} />}
                </dl>
              </div>
              <StepFooter onBack={() => setStep(2)}>
                <Button size="lg" onClick={() => submit()} loading={Boolean(saving)} leftIcon={<PartyPopper />}>
                  {saving ?? t('Создать карточку')}
                </Button>
              </StepFooter>
            </StepSection>
          )}
        </Card>

        <SummaryAside step={step} parentName={parentName} phone={phone} child={child} photo={photo} />
      </div>

      <DuplicateModal
        match={duplicate}
        onClose={() => setDuplicate(undefined)}
        onOpen={(id) => navigate(`/children/${id}`)}
        onRegisterAnyway={(c) => {
          setDuplicate(undefined)
          submit(c)
        }}
      />

    </div>
  )
}

function DuplicateModal({
  match,
  onClose,
  onOpen,
  onRegisterAnyway,
}: {
  match?: { child: Child; parent: Parent }
  onClose: () => void
  onOpen: (childId: string) => void
  onRegisterAnyway: (child: Child) => void
}) {
  const [last, setLast] = useState(match)
  if (match && match !== last) setLast(match)
  const m = match ?? last

  return (
    <Modal open={Boolean(match)} onClose={onClose} size="xs" bare>
      {m && (
        <div className="px-6 pt-5 pb-6 text-center sm:pt-7">
          <div className="flex justify-center">
            <Avatar src={m.child.photoUrl} firstName={m.child.firstName} lastName={m.child.lastName} seed={m.child.id} size="lg" />
          </div>
          <h2 className="mt-4 text-[19px] font-extrabold tracking-tight text-ink-900">{t('Ребёнок уже зарегистрирован?')}</h2>
          <p className="mx-auto mt-1.5 max-w-[290px] text-[13.5px] leading-snug font-medium text-mist-500">
            
            {t('Лицо на фото совпало с карточкой ')} <b className="text-ink-900">{fullName(m.child)}</b>  {t(' (родитель ')} {fullName(m.parent)}, {formatPhone(m.parent.phone)}).
          </p>

          <div className="mt-5 flex flex-col gap-2">
            <Button size="lg" variant="contrast" className="w-full" onClick={() => onOpen(m.child.id)}>
              
              {t('Открыть карточку')}
            </Button>
            <Button size="lg" variant="secondary" className="w-full" onClick={() => onRegisterAnyway(m.child)}>
              
              {t('Это другой ребёнок (близнец)')}
            </Button>
            <button type="button" onClick={onClose} className="h-11 rounded-full text-sm font-bold text-mist-500 transition hover:text-ink-900">
              
              {t('Отмена')}
            </button>
          </div>
          <p className="mt-3 text-[11.5px] leading-snug font-medium text-mist-400">{t('Регистрация другого ребёнка с совпавшим лицом сохранится в журнале действий.')}</p>
        </div>
      )}
    </Modal>
  )
}

function StepSection({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children: ReactNode }) {
  return (
    <section className="animate-fade-in">
      <div className="mb-6 flex items-start gap-3.5">
        <IconTile>{icon}</IconTile>
        <div>
          <h2 className="text-lg font-bold text-ink-900">{title}</h2>
          <p className="mt-0.5 text-sm text-ink-500">{text}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function StepFooter({ onBack, children }: { onBack?: () => void; children: ReactNode }) {
  return (
    <div className="mt-7 flex items-center gap-2 border-t border-cream-200 pt-5">
      {onBack && (
        <Button variant="ghost" onClick={onBack} leftIcon={<ArrowLeft />}>
          
          {t('Назад')}
        </Button>
      )}
      <div className="ml-auto flex gap-2">{children}</div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right font-semibold text-ink-900">{value}</dd>
    </div>
  )
}

function ExistingParent({ parent, kids, onAddChild }: { parent: Parent; kids: Child[]; onAddChild: () => void }) {
  return (
    <div className="mt-6 animate-pop-in">
      <div className="flex items-center gap-3 rounded-2xl bg-olive-200 p-4 ring-1 ring-olive-300">
        <IconTile tone="success" size="sm">
          <UserRoundCheck />
        </IconTile>
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-bold text-ink-900">{fullName(parent)}</div>
          <div className="tabular text-ink-600">{formatPhone(parent.phone)}</div>
        </div>
        {parent.telegram?.linked ? (
          <Badge tone="info" icon={<TelegramLogo />}>
            Telegram
          </Badge>
        ) : (
          <Badge tone="neutral">{t('Без Telegram')}</Badge>
        )}
      </div>

      {kids.length > 0 && (
        <>
          <p className="mt-6 mb-3 text-[13px] font-semibold text-ink-700">
            
            {t('Уже зарегистрированы — выберите, если ребёнок пришёл повторно:')}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {kids.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/children/${c.id}`}
                  className="group flex items-center gap-3 rounded-2xl p-3 ring-1 ring-cream-300 transition hover:bg-cream-100 hover:ring-ink-400"
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
        </>
      )}

      <StepFooter>
        <Button onClick={onAddChild} leftIcon={<UserPlus />}>
          
          {t('Добавить нового ребёнка')}
        </Button>
      </StepFooter>
    </div>
  )
}

function SummaryAside({
  step,
  parentName,
  phone,
  child,
  photo,
}: {
  step: number
  parentName: string
  phone: string
  child: NewChildInput
  photo?: string
}) {
  const rows = [
    { label: t('Родитель'), value: parentName || (isPhoneComplete(phone) ? formatPhone(phone) : ''), done: step > 0 },
    { label: t('Ребёнок'), value: fullName(child).trim(), done: step > 1 },
    { label: t('Фото'), value: photo ? t('Сделано') : step > 2 ? t('Пропущено') : '', done: step > 2 },
  ]
  return (
    <aside className="hidden lg:block">
      <Card className="sticky top-24 p-5">
        <div className="text-[13px] font-bold tracking-wide text-ink-400 uppercase">{t('Карточка')}</div>
        <div className="mt-4 flex flex-col items-center text-center">
          <Avatar src={photo} firstName={child.firstName || '?'} lastName={child.lastName} size="xl" className={cn(!child.firstName && !photo && 'opacity-30')} />
          <div className="mt-3 min-h-6 text-base font-extrabold text-ink-900">{fullName(child).trim() || t('Новый ребёнок')}</div>
          {child.birthDate && <div className="text-sm text-ink-500">{formatAge(child.birthDate)}</div>}
        </div>
        <ul className="mt-5 space-y-3 border-t border-cream-200 pt-4">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-2.5 text-sm">
              <span className={cn('size-2 rounded-full', r.done ? 'bg-mint-500' : r.value ? 'bg-accent-500' : 'bg-mist-300')} />
              <span className="text-ink-500">{r.label}</span>
              <span className="ml-auto truncate font-semibold text-ink-800">{r.value || '—'}</span>
            </li>
          ))}
        </ul>
      </Card>
    </aside>
  )
}
