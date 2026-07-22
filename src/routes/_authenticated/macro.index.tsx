import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { PanelGrid } from "@/components/research/PanelGrid";
import { Button } from "@/components/ui/button";
import {
  getMacroCompare,
  getMacroPanelsForRegion,
  type MacroRegion,
} from "@/lib/panels/macro.functions";
import { cn } from "@/lib/utils";
import { ResearchNarrative } from "@/components/research/ResearchContext";
import type { PanelData } from "@/lib/panels/contract";

export const Route = createFileRoute("/_authenticated/macro/")({
  head: () => ({
    meta: [
      { title: "Macro — Research Terminal" },
      {
        name: "description",
        content:
          "US, Euro area and UK rates, inflation, labour, housing, credit and business activity — with trend charts and goldilocks zones.",
      },
    ],
  }),
  component: MacroOverview,
});

type Tab = MacroRegion | "COMPARE";

const TABS: { id: Tab; label: string; hint: string }[] = [
  {
    id: "US",
    label: "United States",
    hint: "Rates · CPI · Labour · Housing · Credit · Business",
  },
  { id: "EZ", label: "Euro area", hint: "ECB · EA 10Y · HICP · Unemployment" },
  { id: "UK", label: "United Kingdom", hint: "BoE · Gilts · CPI · Unemployment" },
  { id: "COMPARE", label: "Compare", hint: "US vs EA vs UK side-by-side" },
];

function MacroOverview() {
  const [tab, setTab] = useState<Tab>("US");
  const fetchRegion = useServerFn(getMacroPanelsForRegion);
  const fetchCompare = useServerFn(getMacroCompare);

  const { data, isLoading, error } = useQuery({
    queryKey: ["macro-panels", tab],
    queryFn: () => (tab === "COMPARE" ? fetchCompare() : fetchRegion({ data: { region: tab } })),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const active = TABS.find((item) => item.id === tab)!;

  return (
    <AppShell>
      <SectionHeader
        code="MA · Macroeconomic Environment"
        title="What is the macro backdrop across regions?"
        purpose="Rates, inflation, labour, housing, credit and business activity for the US, Euro area and UK, with trend charts, projections and goldilocks, warning and danger zones."
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {TABS.map((item) => (
          <Button
            key={item.id}
            variant={item.id === tab ? "default" : "outline"}
            size="sm"
            onClick={() => setTab(item.id)}
            className={cn("h-7 gap-2 text-xs", item.id === tab && "shadow")}
          >
            <span className="font-mono text-[10px] uppercase tracking-wider">
              {item.id === "COMPARE" ? "CMP" : item.id}
            </span>
            {item.label}
          </Button>
        ))}
        <span className="ml-2 text-[11px] text-muted-foreground">{active.hint}</span>
      </div>

      {isLoading && <div className="text-xs text-muted-foreground">Loading live FRED data…</div>}
      {error && (
        <div className="text-xs text-[var(--negative)]">
          Failed to load: {(error as Error).message}
        </div>
      )}
      {data && (
        <>
          <div className="mb-3">
            <ResearchNarrative
              summary={macroSummary(data, active.label)}
              detail="The overview refreshes every 15 minutes while open, refreshes again when you return to the tab, and shows the source date on every evidence row. Dashed chart tails mean the last official release is being carried forward, not mistaken for a new observation."
              watch={data.flatMap((panel) => panel.whyBullets ?? []).slice(0, 4)}
              asOf={latestEvidenceDate(data)}
              confidence={averageConfidence(data)}
            />
          </div>
          <PanelGrid panels={data} />
        </>
      )}
    </AppShell>
  );
}

function latestEvidenceDate(panels: PanelData[]): string | null {
  return (
    panels
      .flatMap((panel) => panel.evidence.map((item) => item.asOf))
      .filter(Boolean)
      .sort()
      .at(-1) ?? null
  );
}

function averageConfidence(panels: Array<{ confidence: { value: number } }>): number | null {
  return panels.length
    ? panels.reduce((sum, panel) => sum + panel.confidence.value, 0) / panels.length
    : null;
}

function macroSummary(
  panels: Array<{ title: string; whatChanged: string }>,
  region: string,
): string {
  const updates = panels
    .slice(0, 3)
    .map((panel) => `${panel.title}: ${panel.whatChanged}`)
    .join(" ");
  return `${region} macro snapshot. ${updates}`;
}
