import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/app/AppLayout'
import { homeFor, RequireAuth, useAuth } from '@/features/auth/AuthProvider'
import { DashboardPage } from '@/pages/admin/DashboardPage'
import { DiscountsPage } from '@/pages/admin/DiscountsPage'
import { EmployeesPage } from '@/pages/admin/EmployeesPage'
import { NanniesAdminPage } from '@/pages/admin/NanniesAdminPage'
import { AuditLogPage } from '@/pages/admin/AuditLogPage'
import { NewsPage } from '@/pages/admin/NewsPage'
import { ParentsPage } from '@/pages/admin/ParentsPage'
import { PaymentsPage } from '@/pages/admin/PaymentsPage'
import { PromoCodesPage } from '@/pages/admin/PromoCodesPage'
import { SchedulePage } from '@/pages/admin/SchedulePage'
import { SettingsPage } from '@/pages/admin/SettingsPage'
import { ChildDetailPage } from '@/pages/children/ChildDetailPage'
import { ChildRegistrationPage } from '@/pages/children/ChildRegistrationPage'
import { ChildrenListPage } from '@/pages/children/ChildrenListPage'
import { NannyPage } from '@/pages/nanny/NannyPage'
import { LoginPage } from '@/pages/LoginPage'
import { NotificationsPage } from '@/pages/NotificationsPage'
import { PreferencesPage } from '@/pages/PreferencesPage'
import { ReceptionPage } from '@/pages/ReceptionPage'
import { NewVisitPage } from '@/pages/visits/NewVisitPage'
import { VisitsPage } from '@/pages/visits/VisitsPage'

function HomeRedirect() {
  const { user, ready } = useAuth()
  if (!ready) return null
  return <Navigate to={user ? homeFor(user.role) : '/login'} replace />
}

const admin = ['admin'] as const
const reception = ['staff', 'admin'] as const

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />

        <Route path="reception" element={<RequireAuth roles={[...reception]}><ReceptionPage /></RequireAuth>} />
        <Route path="children" element={<RequireAuth roles={[...reception]}><ChildrenListPage /></RequireAuth>} />
        <Route path="children/new" element={<RequireAuth roles={[...reception]}><ChildRegistrationPage /></RequireAuth>} />
        <Route path="children/:id" element={<RequireAuth roles={[...reception]}><ChildDetailPage /></RequireAuth>} />
        <Route path="visits" element={<RequireAuth roles={[...reception]}><VisitsPage /></RequireAuth>} />
        <Route path="visits/new" element={<RequireAuth roles={[...reception]}><NewVisitPage /></RequireAuth>} />

        <Route path="notifications" element={<RequireAuth roles={[...reception]}><NotificationsPage /></RequireAuth>} />
        <Route path="nanny" element={<RequireAuth roles={['nanny']}><NannyPage /></RequireAuth>} />

        <Route path="settings" element={<RequireAuth roles={['staff', 'nanny']}><PreferencesPage /></RequireAuth>} />

        <Route path="admin" element={<RequireAuth roles={[...admin]}><DashboardPage /></RequireAuth>} />
        <Route path="admin/parents" element={<RequireAuth roles={[...admin]}><ParentsPage /></RequireAuth>} />
        <Route path="admin/nannies" element={<RequireAuth roles={[...admin]}><NanniesAdminPage /></RequireAuth>} />
        <Route path="admin/employees" element={<RequireAuth roles={[...admin]}><EmployeesPage /></RequireAuth>} />
        <Route path="admin/payments" element={<RequireAuth roles={[...admin]}><PaymentsPage /></RequireAuth>} />
        <Route path="admin/discounts" element={<RequireAuth roles={[...admin]}><DiscountsPage /></RequireAuth>} />
        <Route path="admin/promocodes" element={<RequireAuth roles={[...admin]}><PromoCodesPage /></RequireAuth>} />
        <Route path="admin/news" element={<RequireAuth roles={[...admin]}><NewsPage /></RequireAuth>} />
        <Route path="admin/schedule" element={<RequireAuth roles={[...admin]}><SchedulePage /></RequireAuth>} />
        <Route path="admin/audit" element={<RequireAuth roles={[...admin]}><AuditLogPage /></RequireAuth>} />
        <Route path="admin/settings" element={<RequireAuth roles={[...admin]}><SettingsPage /></RequireAuth>} />
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  )
}
