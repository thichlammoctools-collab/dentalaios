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

// Replace :id placeholders with real patterns
const PATTERNS = {
  PATIENT_DETAIL: "/patients/:id",
  VISIT_DETAIL: "/visits/:id",
  TREATMENT_PLAN: "/treatment-plans/:id",
} as const;

export function AppRoutes() {
  return (
    <Routes>
      {/* Root redirects to login until auth is wired in Phase 2 */}
      <Route path="/" element={<Navigate to={ROUTES.LOGIN} replace />} />
      <Route path={ROUTES.LOGIN} element={<LoginPage />} />
      <Route path={ROUTES.TODAY} element={<TodayPage />} />
      <Route path={ROUTES.PATIENTS} element={<PatientsPage />} />
      <Route path={PATTERNS.PATIENT_DETAIL} element={<PatientDetailPage />} />
      <Route path={PATTERNS.VISIT_DETAIL} element={<VisitDetailPage />} />
      <Route path={PATTERNS.TREATMENT_PLAN} element={<TreatmentPlanDetailPage />} />
      <Route path={ROUTES.SETTINGS_USERS} element={<UsersSettingsPage />} />
      <Route path={ROUTES.SETTINGS_ROLES} element={<RolesSettingsPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}