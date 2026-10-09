import { useLocation } from 'react-router-dom'
import { Hammer } from 'lucide-react'
import { navigation } from '@/app/navigation'
import { Card, EmptyState, PageHeader } from '@/components/ui/Display'

/** Заглушка для разделов, которые ещё будут реализованы по ТЗ. */
export function ComingSoonPage({ title, section }: { title?: string; section?: string }) {
  const { pathname } = useLocation()
  const item = navigation.flatMap((g) => g.items).find((i) => i.to === pathname)
  const name = title ?? item?.label ?? 'Раздел'
  return (
    <div className="animate-slide-up">
      <PageHeader title={name} />
      <Card>
        <EmptyState
          icon={<Hammer />}
          title="Раздел в разработке"
          description={`«${name}» появится на следующих этапах${section ? ` (ТЗ ${section})` : ''}.`}
        />
      </Card>
    </div>
  )
}
