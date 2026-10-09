import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Archive, CalendarClock, FilePen, Newspaper, Pencil, Plus, Send, Trash2 } from 'lucide-react'
import { newsApi, type NewsInput } from '@/api/admin'
import { AdminHeader, EmptyBlock, IconAction, Panel, PastelStat, Pill, StatsRow, useAdminMutation, type PastelTone } from '@/components/admin/AdminKit'
import { ImagePicker } from '@/components/admin/ImagePicker'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Display'
import { Input, Textarea } from '@/components/ui/Field'
import { ConfirmModal, Modal, Segmented } from '@/components/ui/Overlay'
import { cn, formatDate, formatTime } from '@/lib/format'
import type { News, NewsStatus } from '@/types'
import { DateTimePicker } from '@/components/ui/DatePicker'

const KEY = ['admin', 'news']

// ТЗ §29
const statusMeta: Record<NewsStatus, { label: string; tone: PastelTone | 'dark' | 'muted' }> = {
  draft: { label: 'Черновик', tone: 'butter' },
  published: { label: 'Опубликовано', tone: 'olive' },
  archived: { label: 'Архив', tone: 'muted' },
}


export function NewsPage() {
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: newsApi.list })
  const [tab, setTab] = useState<NewsStatus | 'all'>('all')
  const [editing, setEditing] = useState<News | 'new'>()
  const [removing, setRemoving] = useState<News>()
  const remove = useAdminMutation((n: News) => newsApi.remove(n.id), { invalidate: [KEY], success: 'Новость удалена' })

  const count = (s: NewsStatus) => data?.filter((n) => n.status === s).length
  const rows = data?.filter((n) => tab === 'all' || n.status === tab)

  return (
    <div className="animate-slide-up">
      <AdminHeader
        title="Новости"
        description="Информационные материалы для родителей"
        actions={
          <Button leftIcon={<Plus />} onClick={() => setEditing('new')}>
            Новая новость
          </Button>
        }
      />

      <StatsRow>
        <PastelStat tone="peri" icon={<Newspaper />} label="Всего материалов" value={data?.length} />
        <PastelStat tone="olive" icon={<Send />} label="Опубликовано" value={count('published')} />
        <PastelStat tone="butter" icon={<FilePen />} label="Черновиков" value={count('draft')} />
        <PastelStat tone="blush" icon={<Archive />} label="В архиве" value={count('archived')} />
      </StatsRow>

      <Panel
        toolbar={
          <Segmented
            value={tab}
            onChange={setTab}
            size="sm"
            className="bg-cream-200/70"
            options={[
              { value: 'all', label: 'Все' },
              { value: 'published', label: 'Опубликовано' },
              { value: 'draft', label: 'Черновики' },
              { value: 'archived', label: 'Архив' },
            ]}
          />
        }
      >
        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[300px] rounded-3xl bg-cream-200" />
            ))}
          </div>
        ) : !rows?.length ? (
          <EmptyBlock icon={<Newspaper />} title="Здесь пока пусто" action={<Button onClick={() => setEditing('new')}>Написать новость</Button>} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {rows.map((n, i) => (
              <article key={n.id} className={cn('flex flex-col overflow-hidden rounded-3xl bg-cream-100 ring-1 ring-cream-200', n.status === 'archived' && 'opacity-70')}>
                <div className={cn('relative isolate aspect-[16/8] overflow-hidden', ['bg-peri-300', 'bg-butter-300', 'bg-blush-300', 'bg-olive-300'][i % 4])}>
                  {n.imageUrl ? (
                    <img src={n.imageUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <>
                      <Newspaper className="absolute top-1/2 left-1/2 size-9 -translate-1/2 text-ink-900/40" />
                    </>
                  )}
                  <div className="absolute top-3 left-3">
                    <Pill tone={statusMeta[n.status].tone} className="shadow-xs">
                      {statusMeta[n.status].label}
                    </Pill>
                  </div>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="line-clamp-2 text-base font-extrabold text-ink-900">{n.title}</h3>
                  <p className="mt-1.5 line-clamp-3 text-[13px] leading-snug text-ink-600">{n.text}</p>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                    <span className="tabular flex items-center gap-1.5 text-xs font-semibold text-ink-500">
                      <CalendarClock className="size-3.5" />
                      {formatDate(n.publishAt)}, {formatTime(n.publishAt)}
                    </span>
                    <div className="flex gap-0.5">
                      <IconAction label="Редактировать" onClick={() => setEditing(n)}>
                        <Pencil />
                      </IconAction>
                      <IconAction label="Удалить" onClick={() => setRemoving(n)} danger>
                        <Trash2 />
                      </IconAction>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      {editing && <NewsForm news={editing === 'new' ? undefined : editing} onClose={() => setEditing(undefined)} />}
      <ConfirmModal
        open={Boolean(removing)}
        onClose={() => setRemoving(undefined)}
        title="Удалить новость?"
        description={removing && `«${removing.title}» будет удалена. Вместо удаления можно перенести её в архив.`}
        confirmLabel="Удалить"
        danger
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing, { onSuccess: () => setRemoving(undefined) })}
      />
    </div>
  )
}

function NewsForm({ news, onClose }: { news?: News; onClose: () => void }) {
  const [form, setForm] = useState<NewsInput>(
    news
      ? { title: news.title, imageUrl: news.imageUrl, text: news.text, publishAt: news.publishAt, status: news.status }
      : { title: '', text: '', publishAt: new Date().toISOString(), status: 'draft' },
  )
  const set = <K extends keyof NewsInput>(k: K, v: NewsInput[K]) => setForm((f) => ({ ...f, [k]: v }))
  const save = useAdminMutation((f: NewsInput) => newsApi.save(f, news?.id), { invalidate: [KEY], success: news ? 'Новость сохранена' : 'Новость создана' })

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={news ? 'Редактировать новость' : 'Новая новость'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate(form, { onSuccess: onClose })}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <ImagePicker value={form.imageUrl} onChange={(v) => set('imageUrl', v)} />
        <Input label="Заголовок" required value={form.title} onChange={(e) => set('title', e.target.value)} autoFocus />
        <Textarea label="Текст" required rows={5} value={form.text} onChange={(e) => set('text', e.target.value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <DateTimePicker label="Дата публикации" value={form.publishAt} onChange={(v) => set('publishAt', v)} />
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-ink-700">Статус</span>
            <Segmented<NewsStatus>
              value={form.status}
              onChange={(s) => set('status', s)}
              className="h-11 w-full [&>button]:h-9"
              options={(Object.keys(statusMeta) as NewsStatus[]).map((s) => ({ value: s, label: statusMeta[s].label }))}
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}
