import { Navigate, Route, Routes } from "react-router-dom";
import { ROUTES } from "@shared/constants";
import { LoginPage } from "@/pages/LoginPage";
import { TodayPage } from "@/pages/TodayPage";
import { PatientsPage } from "@/pages/PatientsPage";
import { PatientDetailPage } from "@/pages/PatientDetailPage";
import { VisitDetailPage } from "@/pages/VisitDetailPage";
import { TreatmentPlanDetailPage } from "@/pages/TreatmentPlanDetailPage";
import { UsersSettingsPage } from "@/pages/UsersSettingsPage";
import { RolesSettingsPage } from "@/pages/RolesSettingsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { RequireAuth } from "@/components/RequireAuth";

const PATTERNS = {
  PATIENT_DETAIL: "/patients/:id",
  VISIT_DETAIL: "/visits/:id",
  TREATMENT_PLAN: "/treatment-plans/:id",
} as const;

export function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Navigate to={ROUTES.LOGIN} replace />} />
      <Route path={ROUTES.LOGIN} element={<LoginPage />} />

      {/* Protected */}
      <Route
        path={ROUTES.TODAY}
        element={
          <RequireAuth>
            <TodayPage />
          </RequireAuth>
        }
      />
      <Route
        path={ROUTES.PATIENTS}
        element={
          <RequireAuth>
            <PatientsPage />
          </RequireAuth>
        }
      />
      <Route
        path={PATTERNS.PATIENT_DETAIL}
        element={
          <RequireAuth>
            <PatientDetailPage />
          </RequireAuth>
        }
      />
      <Route
        path={PATTERNS.VISIT_DETAIL}
        element={
          <RequireAuth>
            <VisitDetailPage />
          </RequireAuth>
        }
      />
      <Route
        path={PATTERNS.TREATMENT_PLAN}
        element={
          <RequireAuth>
            <TreatmentPlanDetailPage />
          </RequireAuth>
        }
      />
      <Route
        path={ROUTES.SETTINGS_USERS}
        element={
          <RequireAuth>
            <UsersSettingsPage />
          </RequireAuth>
        }
      />
      <Route
        path={ROUTES.SETTINGS_ROLES}
        element={
          <RequireAuth>
            <RolesSettingsPage />
          </RequireAuth>
        }
      />

      {/* 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}