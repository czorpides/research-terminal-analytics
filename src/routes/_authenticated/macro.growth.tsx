import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import {
  getGrowthEngine,
  type GrowthRegion,
  type GrowthIndicatorRow,
} from "@/lib/panels/growth-engine.functions";
import { triggerUsGrowthKalmanFn } from "@/lib/analytics/analytics.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/macro/growth")({
  head: () => ({
    meta: [
      { title: "US Growth Engine — Macro — Research Terminal" },
      { name: "description", content: "Industrial production, retail sales, housing starts, initial jobless claims and nonfarm payrolls with a point-in-time Kalman latent-trend estimate." },
    ],
  }),
  component: GrowthEnginePage,
});

function GrowthEnginePage() {
  const [region, setRegion] = useState<GrowthRegion>("US");
  const fetchGrowth = useServerFn(getGrowthEngine);
  const triggerKalman = useServerFn(triggerUsGrowthKalmanFn);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["growth-engine", region],
    queryFn: () => fetchGrowth({ data: { region } }),
    refetchOnWindowFocus: false,
  });

  const runKalman = useMutation({
    mutationFn: (mode: "live" | "historical") =>
      triggerKalman({ data: { force: true, mode } as never }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["growth-engine", region] }),
  });

  return (
    <AppShell>
      <SectionHeader
        code="Macro · Stage 1 · US Growth Engine"
        title={`${data?.regionLabel ?? region} Growth`}
        purpose="Five official growth indicators — Industrial Production, Retail Sales, Housing Starts, Initial Jobless Claims, Nonfarm Payrolls — with a point-in-time local-linear-trend Kalman filter (statsmodels)."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5 font-mono text-[10px] uppercase tracking-wider">
          {(["US", "UK", "EA"] as GrowthRegion[]).map((r) => (
            <button
              key={r}
              type="button"
              disabled={r !== "US"}
              onClick={() => setRegion(r)}
              className={cn(
                "rounded-sm border px-3 py-1 transition-colors",
                region === r ? "border-[var(--primary)] text-foreground" : "border-border/70 text-muted-foreground hover:border-foreground hover:text-foreground",
                r !== "US" && "cursor-not-allowed opacity-40",
              )}
            >
              {r === "US" ? "United States" : r === "UK" ? "United Kingdom" : "Euro area"}
              {r !== "US" && <span className="ml-2 text-muted-foreground/60">planned</span>}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {data?.latestRun && (
            <span className="font-mono text-[10px] text-muted-foreground">
              latest run · {data.latestRun.status} · {data.latestRun.model_version}
              {data.latestRun.calculation_mode ? ` · ${data.latestRun.calculation_mode}` : ""}
            </span>
          )}
          <button
            type="button"
            onClick={() => runKalman.mutate("live")}
            disabled={runKalman.isPending}
            className="rounded-sm border border-border/70 px-3 py-1 font-mono text-[10px] uppercase tracking-wider hover:border-foreground disabled:opacity-40"
          >
            {runKalman.isPending ? "Queueing…" : "Run Kalman (live)"}
          </button>
        </div>
      </div>

      {isLoading && <div className="font-mono text-xs text-muted-foreground">Loading…</div>}
      {error && <div className="font-mono text-xs text-[var(--negative)]">{String((error as Error).message)}</div>}

      {data && (
        <div className="grid gap-3 md:grid-cols-2">
          {data.indicators.map((row) => <IndicatorPanel key={row.concept_code} row={row} />)}
        </div>
      )}
    </AppShell>
  );
}

function IndicatorPanel({ row }: { row: GrowthIndicatorRow }) {
  const [open, setOpen] = useState(false);
  const zoneStyles = ZONE_STYLES[row.kalman.trend_zone];
  const change = row.previous_value !== null && row.latest_value !== null
    ? row.latest_value - row.previous_value
    : null;

  return (
    <div className={cn("rounded-sm border bg-card/40 p-3", zoneStyles.border)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{row.name}</div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {row.concept_code} · {row.series_code_native} · {row.frequency}
            {row.seasonal_adj ? " · SA" : ""}
          </div>
        </div>
        <span className={cn("rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider", zoneStyles.badge)}>
          {row.kalman.trend_direction}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <Stat label="Latest" value={fmt(row.latest_value, row.unit)} sub={row.latest_date ?? "—"} />
        <Stat label="Previous" value={fmt(row.previous_value, row.unit)} sub={row.previous_date ?? "—"} />
        <Stat
          label="Δ vs prev"
          value={change !== null ? (change >= 0 ? `+${change.toFixed(2)}` : change.toFixed(2)) : "—"}
          sub={row.data_freshness_days !== null ? `${row.data_freshness_days}d fresh` : ""}
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <Stat
          label="Kalman level"
          value={row.kalman.status === "ok" ? fmt(row.kalman.latest_level, row.unit) : "—"}
          sub={row.kalman.status === "ok" && row.kalman.latest_ci_low !== null && row.kalman.latest_ci_high !== null
            ? `95% CI ${row.kalman.latest_ci_low.toFixed(1)}–${row.kalman.latest_ci_high.toFixed(1)}`
            : row.kalman.reason ?? ""}
        />
        <Stat
          label="Slope"
          value={row.kalman.latest_slope !== null ? row.kalman.latest_slope.toFixed(3) : "—"}
          sub={row.kalman.acceleration !== null ? `accel ${row.kalman.acceleration.toFixed(3)}` : ""}
        />
        <Stat
          label="Zone"
          value={row.kalman.trend_zone.toUpperCase()}
          sub={row.direction === "lower_is_better" ? "lower is better" : row.direction === "higher_is_better" ? "higher is better" : ""}
        />
      </div>

      {row.latest_revision && (
        <div className="mt-3 rounded-sm border border-amber-500/40 bg-amber-500/5 px-2 py-1 font-mono text-[10px] text-amber-300">
          Revised {row.latest_revision.observation_date}:{" "}
          {row.latest_revision.previous_value !== null ? row.latest_revision.previous_value.toFixed(2) : "—"} → {row.latest_revision.revised_value.toFixed(2)}
        </div>
      )}

      <Sparkline history={row.history} trajectory={row.kalman.trajectory} />

      <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
        <div>
          {row.source ?? "—"} · {row.observation_count} obs
          {row.min_history !== null ? ` · min ${row.min_history}` : ""}
        </div>
        <div>
          {row.kalman.model_version ?? "no model run"}
          {row.kalman.calc_mode ? ` · ${row.kalman.calc_mode}` : ""}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {open ? "Hide" : "Show"} calculation drawer
      </button>

      {open && <CalcDrawer row={row} />}

      <AiSummary row={row} />
    </div>
  );
}

const ZONE_STYLES: Record<GrowthIndicatorRow["kalman"]["trend_zone"], { border: string; badge: string }> = {
  green:  { border: "border-emerald-500/40", badge: "border-emerald-500/40 text-emerald-300 bg-emerald-500/10" },
  yellow: { border: "border-amber-500/40",   badge: "border-amber-500/40 text-amber-300 bg-amber-500/10" },
  red:    { border: "border-rose-500/40",    badge: "border-rose-500/40 text-rose-300 bg-rose-500/10" },
  gray:   { border: "border-border/70",      badge: "border-border/70 text-muted-foreground bg-muted/30" },
};

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-sm border border-border/50 bg-background/30 px-2 py-1.5">
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-sm">{value}</div>
      {sub && <div className="font-mono text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function fmt(v: number | null, unit?: string | null): string {
  if (v === null || Number.isNaN(v)) return "—";
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`;
}

function Sparkline({ history, trajectory }: {
  history: Array<{ date: string; value: number | null }>;
  trajectory: Array<{ date: string; level: number; ci_low: number; ci_high: number }>;
}) {
  const pts = history.filter((h) => h.value !== null) as Array<{ date: string; value: number }>;
  if (pts.length < 2) return <div className="mt-3 h-16 rounded-sm border border-dashed border-border/40" />;
  const W = 320, H = 60;
  const vals = pts.map((p) => p.value);
  const trajVals = trajectory.map((t) => t.level);
  const min = Math.min(...vals, ...trajVals);
  const max = Math.max(...vals, ...trajVals);
  const range = max - min || 1;
  const path = pts.map((p, i) => {
    const x = (i / (pts.length - 1)) * W;
    const y = H - ((p.value - min) / range) * H;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const trajPath = trajectory.length >= 2 ? trajectory.map((t, i) => {
    const x = (i / (trajectory.length - 1)) * W;
    const y = H - ((t.level - min) / range) * H;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ") : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-16 w-full">
      <path d={path} fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1" />
      {trajPath && <path d={trajPath} fill="none" stroke="var(--primary)" strokeWidth="1.5" />}
    </svg>
  );
}

function CalcDrawer({ row }: { row: GrowthIndicatorRow }) {
  const params = row.kalman.model_params_json ? JSON.parse(row.kalman.model_params_json) as Record<string, number> : null;
  return (
    <div className="mt-3 space-y-2 rounded-sm border border-border/50 bg-background/40 p-2 font-mono text-[10px]">
      <Row k="Input version" v="raw_observations.v1" />
      <Row k="Source" v={row.source ?? "—"} />
      <Row k="Frequency" v={row.frequency} />
      <Row k="Allowed transforms" v={row.allowed_transformations.join(", ") || "—"} />
      <Row k="Default transform" v={row.transform_default ?? "—"} />
      <Row k="Observations" v={String(row.observation_count)} />
      <Row k="Min history" v={row.min_history !== null ? String(row.min_history) : "default"} />
      <div className="mt-2 border-t border-border/50 pt-2">
        <div className="mb-1 uppercase tracking-wider text-muted-foreground">Model — {row.kalman.model_version ?? "not run"}</div>
        <Row k="Calc mode" v={row.kalman.calc_mode ?? "—"} />
        <Row k="As-of" v={row.kalman.as_of_date ?? "live"} />
        <Row k="Training window" v={row.kalman.training_start && row.kalman.training_end ? `${row.kalman.training_start} → ${row.kalman.training_end}` : "—"} />
        {params && (
          <div className="mt-1">
            <div className="uppercase tracking-wider text-muted-foreground">MLE params</div>
            {Object.entries(params).map(([k, v]) => (
              <Row key={k} k={k} v={Number(v).toExponential(3)} />
            ))}
          </div>
        )}
        <Row k="Trend reason" v={row.kalman.status === "ok"
          ? `slope ${row.kalman.latest_slope?.toFixed(3) ?? "—"} → ${row.kalman.trend_direction}; direction=${row.direction ?? "—"} → zone=${row.kalman.trend_zone}`
          : row.kalman.reason ?? "—"} />
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span className="truncate text-right">{v}</span>
    </div>
  );
}

// AI summary is deterministic-first: it templates a plain-English sentence
// from the model output. No AI is called here — the trend and zone come
// straight from the Kalman filter; text merely explains the numbers.
function AiSummary({ row }: { row: GrowthIndicatorRow }) {
  if (row.kalman.status !== "ok" || row.kalman.latest_slope === null) return null;
  const dir = row.kalman.trend_direction;
  const zone = row.kalman.trend_zone;
  const lowerIsBetter = row.direction === "lower_is_better";
  const meaning = lowerIsBetter
    ? dir === "improving" ? "rising, which is unfavourable for this indicator"
      : dir === "deteriorating" ? "falling, which is favourable" : "roughly flat"
    : dir === "improving" ? "improving" : dir === "deteriorating" ? "deteriorating" : "roughly flat";
  const text = `Filtered latent trend is ${meaning} (slope ${row.kalman.latest_slope.toFixed(3)}). Classification: ${zone.toUpperCase()}. This summary explains the deterministic model output — it does not calculate it.`;
  return (
    <div className="mt-2 rounded-sm border border-border/40 bg-background/40 px-2 py-1.5 text-xs text-muted-foreground">
      <span className="mr-1 font-mono text-[9px] uppercase tracking-wider text-foreground/70">AI note</span>
      {text}
    </div>
  );
}