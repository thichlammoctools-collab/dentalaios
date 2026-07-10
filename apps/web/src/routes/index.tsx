import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { ROUTES } from "@shared/constants";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { VerifyEmailPage } from "@/pages/VerifyEmailPage";
import { InviteAcceptPage } from "@/pages/InviteAcceptPage";
import { TodayPage } from "@/pages/TodayPage";
import { PatientsPage } from "@/pages/PatientsPage";
import { PatientDetailPage } from "@/pages/PatientDetailPage";
import { VisitDetailPage } from "@/pages/VisitDetailPage";
import { TreatmentPlanDetailPage } from "@/pages/TreatmentPlanDetailPage";
import { UsersSettingsPage } from "@/pages/UsersSettingsPage";
import { MembersSettingsPage } from "@/pages/MembersSettingsPage";
import { ClinicSettingsPage } from "@/pages/ClinicSettingsPage";
import { RolesSettingsPage } from "@/pages/RolesSettingsPage";
import { AuditLogsPage } from "@/pages/AuditLogsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { SchedulePage } from "@/pages/SchedulePage";
import { ScheduleNewPage } from "@/pages/ScheduleNewPage";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";

const PATTERNS = {
  PATIENT_DETAIL: "/patients/:id",
  VISIT_DETAIL: "/visits/:id",
  TREATMENT_PLAN: "/treatment-plans/:id",
} as const;

function Protected({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Navigate to={ROUTES.LOGIN} replace />} />
      <Route path={ROUTES.LOGIN} element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/invite/:token" element={<InviteAcceptPage />} />

      {/* Protected */}
      <Route
        path={ROUTES.TODAY}
        element={
          <Protected>
            <TodayPage />
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
        path={ROUTES.SETTINGS_USERS}
        element={
          <Protected>
            <UsersSettingsPage />
          </Protected>
        }
      />
      <Route
        path={ROUTES.SETTINGS_MEMBERS}
        element={
          <Protected>
            <MembersSettingsPage />
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