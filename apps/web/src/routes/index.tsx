import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { ROUTES } from "@shared/constants";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { VerifyEmailPage } from "@/pages/VerifyEmailPage";
import { TodayPage } from "@/pages/TodayPage";
import { PatientsPage } from "@/pages/PatientsPage";
import { PatientDetailPage } from "@/pages/PatientDetailPage";
import { VisitDetailPage } from "@/pages/VisitDetailPage";
import { TreatmentPlanDetailPage } from "@/pages/TreatmentPlanDetailPage";
import { TreatmentPlanAiPage } from "@/pages/TreatmentPlanAiPage";
import { AppointmentDetailPage } from "@/pages/AppointmentDetailPage";
import { CalendarPage } from "@/pages/CalendarPage";
import { UsersSettingsPage } from "@/pages/UsersSettingsPage";
import { ClinicSettingsPage } from "@/pages/ClinicSettingsPage";
import { TreatmentServicesPage } from "@/pages/TreatmentServicesPage";
import { RolesSettingsPage } from "@/pages/RolesSettingsPage";
import { AuditLogsPage } from "@/pages/AuditLogsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { SchedulePage } from "@/pages/SchedulePage";
import { ScheduleNewPage } from "@/pages/ScheduleNewPage";
import { ManagementDashboardPage } from "@/pages/ManagementDashboardPage";
import { ChairBoardPage } from "@/pages/ChairBoardPage";
import { ChairSettingsPage } from "@/pages/ChairSettingsPage";
import { ChairRevenueReportPage } from "@/pages/ChairRevenueReportPage";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { PlatformGuard } from "@/components/platform/PlatformGuard";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { PlatformLoginPage } from "@/pages/platform/PlatformLoginPage";
import {
  PlatformAdminsPage,
  PlatformAuditLogsPage,
  PlatformConfigurationPage,
  PlatformContentPage,
  PlatformDashboardPage,
  PlatformProceduresPage,
  PlatformTenantDetailPage,
  PlatformTenantsPage,
} from "@/pages/platform/PlatformPages";

const PATTERNS = {
  PATIENT_DETAIL: "/patients/:id",
  PATIENT_WORKSPACE: "/patients/:id/:section",
  VISIT_DETAIL: "/visits/:id",
  TREATMENT_PLAN: "/treatment-plans/:id",
  TREATMENT_PLAN_AI: "/treatment-plans/:id/ai-suggest",
  APPOINTMENT_DETAIL: "/appointments/:id",
} as const;

function Protected({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}

export function AppRoutes() {
  const dashboardRoute = ROUTES.MANAGEMENT_DASHBOARD;

  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Navigate to={ROUTES.LOGIN} replace />} />
      <Route path={ROUTES.LOGIN} element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />

      {/* Platform administration uses an independent identity and route shell. */}
      <Route path="/platform/login" element={<PlatformLoginPage />} />
      <Route element={<PlatformGuard><PlatformShell /></PlatformGuard>}>
        <Route path="/platform/dashboard" element={<PlatformDashboardPage />} />
        <Route path="/platform/tenants" element={<PlatformTenantsPage />} />
        <Route path="/platform/tenants/:id" element={<PlatformTenantDetailPage />} />
        <Route path="/platform/content" element={<PlatformContentPage />} />
        <Route path="/platform/configuration" element={<PlatformConfigurationPage />} />
        <Route path="/platform/procedures" element={<PlatformProceduresPage />} />
        <Route path="/platform/admins" element={<PlatformAdminsPage />} />
        <Route path="/platform/audit-logs" element={<PlatformAuditLogsPage />} />
      </Route>

      {/* Protected */}
      <Route
        path={dashboardRoute}
        element={
          <Protected>
            <ManagementDashboardPage />
          </Protected>
        }
      />
      <Route
        path={ROUTES.TODAY}
        element={
          <Protected>
            <TodayPage />
          </Protected>
        }
      />
      <Route
        path={ROUTES.CALENDAR}
        element={
          <Protected>
            <CalendarPage />
          </Protected>
        }
      />
      <Route
        path={ROUTES.SCHEDULE}
        element={
          <Protected>
            <SchedulePage />
          </Protected>
        }
      />
      <Route
        path={ROUTES.SCHEDULE_NEW}
        element={
          <Protected>
            <ScheduleNewPage />
          </Protected>
        }
      />
      <Route
        path={ROUTES.CHAIRS}
        element={<Protected><ChairBoardPage /></Protected>}
      />
      <Route
        path={ROUTES.CHAIRS_SETTINGS}
        element={<Protected><ChairSettingsPage /></Protected>}
      />
      <Route
        path={ROUTES.CHAIRS_REPORTS}
        element={<Protected><ChairRevenueReportPage /></Protected>}
      />
      <Route
        path={ROUTES.PATIENTS}
        element={
          <Protected>
            <PatientsPage />
          </Protected>
        }
      />
      <Route
        path={PATTERNS.PATIENT_DETAIL}
        element={
          <Protected>
            <PatientDetailPage />
          </Protected>
        }
      />
      <Route
        path={PATTERNS.VISIT_DETAIL}
        element={
          <Protected>
            <VisitDetailPage />
          </Protected>
        }
      />
      <Route
        path={PATTERNS.TREATMENT_PLAN}
        element={
          <Protected>
            <TreatmentPlanDetailPage />
          </Protected>
        }
      />
      <Route
        path={PATTERNS.TREATMENT_PLAN_AI}
        element={
          <Protected>
            <TreatmentPlanAiPage />
          </Protected>
        }
      />
      <Route
        path={PATTERNS.APPOINTMENT_DETAIL}
        element={
          <Protected>
            <AppointmentDetailPage />
          </Protected>
        }
      />
      <Route
        path={ROUTES.SETTINGS_USERS}
        element={
          <Protected>
            <UsersSettingsPage />
          </Protected>
        }
      />
      <Route
        path={ROUTES.SETTINGS_CLINIC}
        element={
          <Protected>
            <ClinicSettingsPage />
          </Protected>
        }
      />
      <Route
        path={PATTERNS.PATIENT_WORKSPACE}
        element={
          <Protected>
            <PatientDetailPage />
          </Protected>
        }
      />
      <Route
        path={ROUTES.SETTINGS_TREATMENT_SERVICES}
        element={
          <Protected>
            <TreatmentServicesPage />
          </Protected>
        }
      />
      <Route
        path={ROUTES.SETTINGS_ROLES}
        element={
          <Protected>
            <RolesSettingsPage />
          </Protected>
        }
      />
      <Route
        path="/settings/audit-logs"
        element={
          <Protected>
            <AuditLogsPage />
          </Protected>
        }
      />

      {/* 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
