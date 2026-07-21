export const PATIENT_WORKSPACE_SECTIONS = [
  "overview",
  "alerts",
  "visits",
  "plans",
  "payments",
  "appointments",
  "images",
] as const;

export type PatientWorkspaceSection = (typeof PATIENT_WORKSPACE_SECTIONS)[number];

export function isPatientWorkspaceSection(value: string | undefined): value is PatientWorkspaceSection {
  return Boolean(value && PATIENT_WORKSPACE_SECTIONS.includes(value as PatientWorkspaceSection));
}

export function patientWorkspacePath(patientId: string, section: PatientWorkspaceSection = "overview") {
  return `/patients/${patientId}/${section}`;
}

export function withPatientReturnContext(
  destination: string,
  patientId: string,
  section: PatientWorkspaceSection,
) {
  const [path, hash = ""] = destination.split("#", 2);
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}return_to=${encodeURIComponent(patientWorkspacePath(patientId, section))}${hash ? `#${hash}` : ""}`;
}

export function patientReturnPath(
  returnTo: string | null,
  patientId: string,
  fallbackSection: PatientWorkspaceSection,
) {
  const fallback = patientWorkspacePath(patientId, fallbackSection);
  const patientPath = `/patients/${patientId}/`;

  // Only honor a same-patient workspace path to avoid an untrusted redirect target.
  return returnTo?.startsWith(patientPath) ? returnTo : fallback;
}
