import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getCopilotIcon, getRegisteredCopilots, type ClinicalCopilotDefinition, type CopilotAccent } from "@/features/clinical-copilots";

interface ClinicalCopilotLauncherProps {
  visitId: string;
  canWrite: boolean;
  canReview: boolean;
}

type EnabledState = "loading" | "enabled" | "locked";

const ACCENT_STYLES: Record<CopilotAccent, { border: string; bg: string; icon: string; ring: string }> = {
  cyan: {
    border: "border-cyan-500/40",
    bg: "bg-cyan-500/[0.04]",
    icon: "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10",
    ring: "ring-cyan-500/60",
  },
  amber: {
    border: "border-amber-500/40",
    bg: "bg-amber-500/[0.04]",
    icon: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
    ring: "ring-amber-500/60",
  },
  violet: {
    border: "border-violet-500/40",
    bg: "bg-violet-500/[0.04]",
    icon: "text-violet-600 dark:text-violet-400 bg-violet-500/10",
    ring: "ring-violet-500/60",
  },
  emerald: {
    border: "border-emerald-500/40",
    bg: "bg-emerald-500/[0.04]",
    icon: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    ring: "ring-emerald-500/60",
  },
};

/**
 * Copilot Launcher Row: chip grid at the top of the "Khám" tab. Each chip
 * represents a purchasable Clinical Copilot module. Enabled chips expand a
 * single active panel inline; locked chips show an upsell CTA that navigates
 * to platform feature flags rather than opening a panel.
 */
export function ClinicalCopilotLauncher({ visitId, canWrite, canReview }: ClinicalCopilotLauncherProps) {
  const copilots = useMemo(() => getRegisteredCopilots(), []);
  const [states, setStates] = useState<Record<string, EnabledState>>(() =>
    Object.fromEntries(copilots.map((item) => [item.key, item.checkEnabled ? "loading" : "enabled"])),
  );
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    for (const definition of copilots) {
      if (!definition.checkEnabled) continue;
      void (async () => {
        try {
          const enabled = await definition.checkEnabled!(visitId);
          if (cancelled) return;
          setStates((current) => ({ ...current, [definition.key]: enabled ? "enabled" : "locked" }));
        } catch (error) {
          if (cancelled) return;
          console.warn(`[clinical-copilots] ${definition.key} checkEnabled threw`, error);
          setStates((current) => ({ ...current, [definition.key]: "locked" }));
        }
      })();
    }
    return () => { cancelled = true; };
  }, [copilots, visitId]);

  if (copilots.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-5 text-sm text-muted-foreground">
          Chưa có Copilot nào được cấu hình cho phòng khám này.
        </CardContent>
      </Card>
    );
  }

  const active = activeKey ? copilots.find((item) => item.key === activeKey) ?? null : null;

  return (
    <Card id="clinical-copilot-launcher">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Trợ lý lâm sàng</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Chọn một Copilot chuyên môn để mở panel hỗ trợ ngay trong lượt khám.</p>
          </div>
          <Badge variant="secondary">{copilots.length} Copilot</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {copilots.map((definition) => (
            <CopilotChip
              key={definition.key}
              definition={definition}
              state={states[definition.key] ?? "loading"}
              active={activeKey === definition.key}
              onToggle={() => setActiveKey((current) => (current === definition.key ? null : definition.key))}
              onUpsell={() => navigate("/platform/configuration")}
            />
          ))}
        </div>
        {active && (
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{active.title}</p>
                <p className="truncate text-xs text-muted-foreground">{active.description}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setActiveKey(null)}>Đóng</Button>
            </div>
            <div className="p-3">
              {active.render({ visitId, canWrite, canReview })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface CopilotChipProps {
  definition: ClinicalCopilotDefinition;
  state: EnabledState;
  active: boolean;
  onToggle: () => void;
  onUpsell: () => void;
}

function CopilotChip({ definition, state, active, onToggle, onUpsell }: CopilotChipProps) {
  const accent = ACCENT_STYLES[definition.accent];
  const locked = state === "locked";
  const loading = state === "loading";
  return (
    <button
      type="button"
      onClick={locked ? undefined : onToggle}
      aria-pressed={active}
      aria-disabled={locked}
      disabled={loading}
      className={cn(
        "flex h-full flex-col gap-2 rounded-xl border p-3 text-left transition-colors",
        accent.border,
        accent.bg,
        active && !locked && "ring-2 ring-offset-2 ring-offset-background",
        active && !locked && accent.ring,
        locked && "cursor-default opacity-75 border-dashed",
        !locked && !active && "hover:border-primary/60 hover:bg-accent/40",
        loading && "opacity-60",
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", accent.icon)}>
          {getCopilotIcon(definition.iconKey)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{definition.title}</p>
          <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">{definition.shortLabel}</p>
        </div>
      </div>
      <p className="line-clamp-2 text-xs text-muted-foreground">{definition.description}</p>
      <div className="mt-auto flex items-center justify-between gap-2">
        {loading ? (
          <Badge variant="secondary">Đang kiểm tra…</Badge>
        ) : locked ? (
          <Badge variant="warning">Cần kích hoạt</Badge>
        ) : active ? (
          <Badge variant="success">Đang mở</Badge>
        ) : (
          <Badge variant="secondary">Đang hoạt động</Badge>
        )}
        {locked && (
          <span
            role="button"
            tabIndex={0}
            onClick={(event) => { event.stopPropagation(); onUpsell(); }}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onUpsell(); } }}
            className="text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            Kích hoạt
          </span>
        )}
      </div>
    </button>
  );
}
