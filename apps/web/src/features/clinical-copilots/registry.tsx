import type { ReactNode } from "react";

/** Icon key set — keep aligned with getCopilotIcon() below. */
export type CopilotIconKey = "endodontic" | "perio" | "occlusion" | "generic";

/** Accent theme for chip border/background. */
export type CopilotAccent = "cyan" | "amber" | "violet" | "emerald";

/** Props passed to a Copilot's render function when its panel is expanded. */
export interface CopilotRenderProps {
  visitId: string;
  canWrite: boolean;
  canReview: boolean;
}

/**
 * Metadata + renderer for a Clinical Copilot module.
 *
 * The registry is the single source of truth for chip metadata shown in
 * `ClinicalCopilotLauncher`. Whether a chip is enabled/locked is decided
 * at runtime by `checkEnabled` (usually backed by a feature flag) so
 * tenants that have not purchased a Copilot see a Locked + upsell chip.
 */
export interface ClinicalCopilotDefinition {
  key: string;
  featureFlagKey: string;
  title: string;
  shortLabel: string;
  description: string;
  iconKey: CopilotIconKey;
  accent: CopilotAccent;
  /**
   * Resolves the enabled state for a specific visit context.
   * Return false when the Copilot is not available to the tenant.
   * Throwing / rejecting is treated as locked.
   */
  checkEnabled?: (visitId: string) => Promise<boolean>;
  render: (props: CopilotRenderProps) => ReactNode;
}

const registered: ClinicalCopilotDefinition[] = [];

/** Register a Copilot module. Duplicate keys replace the previous entry. */
export function registerCopilot(definition: ClinicalCopilotDefinition): void {
  const existingIndex = registered.findIndex((item) => item.key === definition.key);
  if (existingIndex >= 0) registered[existingIndex] = definition;
  else registered.push(definition);
}

/** Read-only snapshot of registered Copilots. */
export function getRegisteredCopilots(): readonly ClinicalCopilotDefinition[] {
  return registered.slice();
}

/** Inline SVG icons — avoids pulling a new icon package for one-off Copilot glyphs. */
export function getCopilotIcon(iconKey: CopilotIconKey): ReactNode {
  const common = { className: "h-5 w-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.75 } as const;
  if (iconKey === "endodontic") {
    return (
      <svg {...common} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 3c-2 0-3 2-3 4 0 2 .5 3.5 1 5.5s.5 4 .5 6c0 1.5 1 2.5 1.5 2.5S9 20 9 18s.5-4 1.5-4 1 2 1.5 4 1 3 1.5 3 1.5-1 1.5-2.5c0-2 .5-4 .5-6s1-3.5 1-5.5c0-2-1-4-3-4-1 0-1.5.5-2 1-.5-.5-1-1-2-1z" />
      </svg>
    );
  }
  if (iconKey === "perio") {
    return (
      <svg {...common} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 15c4-6 12-6 16 0" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 15v3M8 13v6M12 12v8M16 13v6M20 15v3" />
      </svg>
    );
  }
  if (iconKey === "occlusion") {
    return (
      <svg {...common} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 9h16M4 15h16" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 9v6M11 9v6M15 9v6M19 9v6" />
      </svg>
    );
  }
  return (
    <svg {...common} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.8 7.1 18.2 8 12.7 4 8.8 9.5 8z" />
    </svg>
  );
}
