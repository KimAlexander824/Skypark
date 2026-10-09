import { Languages, Palette } from 'lucide-react'
import { AdminHeader, Panel, SectionTitle } from '@/components/admin/AdminKit'
import { ThemePicker } from '@/components/ui/ThemePicker'
import { LanguagePicker } from '@/components/ui/LanguagePicker'
import { t } from '@/i18n'

/** Личные настройки сотрудника и няни (у администратора они в общем разделе «Настройки»). */
export function PreferencesPage() {
  return (
    <div className="animate-slide-up">
      <AdminHeader title={t('Настройки')} description={t('Оформление и язык интерфейса на этом устройстве')} />
      <Panel>
        <SectionTitle icon={<Palette />} tone="bg-peri-300" title={t('Оформление')} text={t('Тема интерфейса сохраняется на этом устройстве и применяется сразу')} />
        <ThemePicker />
      </Panel>
      <Panel className="mt-5">
        <SectionTitle icon={<Languages />} tone="bg-olive-300" title={t('Язык')} text={t('Язык интерфейса сохраняется на этом устройстве')} />
        <LanguagePicker />
      </Panel>
    </div>
  )
}
