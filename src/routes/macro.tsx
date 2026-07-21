import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { PanelGrid } from "@/components/research/PanelGrid";
import { getMacroPanelsForRegion, getMacroCompare, type MacroRegion } from "@/lib/panels/macro.functions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/macro")({
  head: () => ({ meta: [
    { title: "Macro — Research Terminal" },
    { name: "description", content: "US, Euro area and UK rates, inflation, labour, housing, credit and business activity — with trend charts and goldilocks zones." },
  ]}),
  component: Macro,
});

type Tab = MacroRegion | "COMPARE";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "US",      label: "United States", hint: "Rates · CPI · Labour · Housing · Credit · Business" },
  { id: "EZ",      label: "Euro area",     hint: "ECB · EA 10Y · HICP · Unemployment" },
  { id: "UK",      label: "United Kingdom",hint: "BoE · Gilts · CPI · Unemployment" },
  { id: "COMPARE", label: "Compare",       hint: "US vs EA vs UK side-by-side" },
];

function Macro() {
  const [tab, setTab] = useState<Tab>("US");
  const fetchRegion = useServerFn(getMacroPanelsForRegion);
  const fetchCompare = useServerFn(getMacroCompare);

  const { data, isLoading, error } = useQuery({
    queryKey: ["macro-panels", tab],
    queryFn: () => tab === "COMPARE" ? fetchCompare() : fetchRegion({ data: { region: tab } }),
    refetchOnWindowFocus: false,
  });

  const active = TABS.find((t) => t.id === tab)!;

  return (
    <AppShell>
      <SectionHeader
        code="MA · Macroeconomic Environment"
        title="What is the macro backdrop across regions?"
        purpose="Rates, inflation, labour, housing, credit and business activity for the US, Euro area and UK — with trend charts, projections and goldilocks / warning / danger zones."
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Button
            key={t.id}
            variant={t.id === tab ? "default" : "outline"}
            size="sm"
            onClick={() => setTab(t.id)}
            className={cn("h-7 gap-2 text-xs", t.id === tab && "shadow")}
          >
            <span className="font-mono text-[10px] uppercase tracking-wider">{t.id === "COMPARE" ? "CMP" : t.id}</span>
            {t.label}
          </Button>
        ))}
        <span className="ml-2 text-[11px] text-muted-foreground">{active.hint}</span>
      </div>

      {isLoading && <div className="text-xs text-muted-foreground">Loading live FRED data…</div>}
      {error && <div className="text-xs text-[var(--negative)]">Failed to load: {(error as Error).message}</div>}
      {data && <PanelGrid panels={data} />}
    </AppShell>
  );
}