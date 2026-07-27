import { EndodonticPainPathwayCard } from "@/components/EndodonticPainPathwayCard";
import { apiGet } from "@/lib/api";
import { registerCopilot } from "./registry";

/**
 * Side-effect module: importing it once (from `VisitDetailPage`) registers
 * every Copilot module that ships with the frontend. Extra Copilots can be
 * added here without touching the launcher UI.
 */

interface EndodonticPathwayResponse {
  feature_enabled: boolean;
}

registerCopilot({
  key: "endodontic_pain_v1",
  featureFlagKey: "clinical_copilot.endodontic_pain_v1",
  title: "Đau răng / nội nha",
  shortLabel: "Nội nha",
  description: "Checklist AAE cho đau răng, hỗ trợ pattern engine.",
  iconKey: "endodontic",
  accent: "cyan",
  async checkEnabled(visitId) {
    try {
      const response = await apiGet<EndodonticPathwayResponse>(`/api/visits/${visitId}/clinical-pathways/endodontic-pain`);
      return Boolean(response?.feature_enabled);
    } catch (error) {
      console.warn("[clinical-copilots] endodontic_pain_v1 checkEnabled failed", error);
      return false;
    }
  },
  render: ({ visitId, canWrite, canReview }) => (
    <EndodonticPainPathwayCard visitId={visitId} canWrite={canWrite} canReview={canReview} />
  ),
});

export { getRegisteredCopilots, getCopilotIcon } from "./registry";
export type { ClinicalCopilotDefinition, CopilotAccent, CopilotIconKey, CopilotRenderProps } from "./registry";
