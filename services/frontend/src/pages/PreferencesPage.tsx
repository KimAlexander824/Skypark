import { Palette } from 'lucide-react'
import { AdminHeader, Panel, SectionTitle } from '@/components/admin/AdminKit'
import { ThemePicker } from '@/components/ui/ThemePicker'

/** Личные настройки сотрудника и няни (у администратора они в общем разделе «Настройки»). */
export function PreferencesPage() {
  return (
    <div className="animate-slide-up">
      <AdminHeader title="Настройки" description="Оформление интерфейса на этом устройстве" />
      <Panel>
        <SectionTitle icon={<Palette />} tone="bg-peri-300" title="Оформление" text="Тема интерфейса сохраняется на этом устройстве и применяется сразу" />
        <ThemePicker />
      </Panel>
    </div>
  )
}
