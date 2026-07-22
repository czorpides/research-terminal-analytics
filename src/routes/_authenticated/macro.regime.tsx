import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { EngineKpi, EngineSection, ModelNote } from "@/components/research/MacroEngineView";
import { toneForScore } from "@/lib/panels/macro-view";
import { getRegimeMonitor } from "@/lib/panels/regime.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/macro/regime")({
  head: () => ({
    meta: [
      { title: "US Regime Monitor — Research Terminal" },
      {
        name: "description",
        content:
          "A cross-engine US macro regime call using Growth, Inflation, Liquidity, Labour and Market evidence with a shadow HMM comparison.",
      },
    ],
  }),
  component: RegimeMonitor,
});

const LABELS = {
  growth: "Growth",
  inflation: "Inflation pressure",
  liquidityStress: "Financial conditions",
  labourHeat: "Labour heat",
  marketStress: "Market stress",
} as const;

const POLARITY = {
  growth: false,
  inflation: true,
  liquidityStress: true,
  labourHeat: false,
  marketStress: true,
} as const;

function RegimeMonitor() {
  const load = useServerFn(getRegimeMonitor);
  const { data, error, isLoading } = useQuery({
    queryKey: ["regime-monitor"],
    queryFn: () => load(),
    refetchOnWindowFocus: false,
  });

  return (
    <AppShell>
      <SectionHeader
        code="MA · Stage 5 · US Regime"
        title="What regime are the five US engines describing?"
        purpose="One inspectable cross-engine state call, with every input, classification probability and shadow-model comparison visible. It directs research priorities rather than generating trades."
      />

      {isLoading && <div className="text-xs text-muted-foreground">Loading Regime Monitor…</div>}
      {error && (
        <div className="text-xs text-[var(--negative)]">
          Failed to load: {(error as Error).message}
        </div>
      )}

      {data &&
        (() => {
          const rulesProbabilities = sortedProbabilities(data.current.probabilities);
          const hmmProbabilities = sortedProbabilities(data.hmm.probabilities);
          const rulesLeader = rulesProbabilities[0]?.[0] ?? null;
          const hmmLeader = data.hmm.label ?? hmmProbabilities[0]?.[0] ?? null;
          const agreement =
            rulesLeader && hmmLeader ? normalise(rulesLeader) === normalise(hmmLeader) : null;
          const availableInputs = Object.values(data.inputs).filter(
            (value) => value != null,
          ).length;

          return (
            <>
              <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <EngineKpi
                  label="Current regime"
                  value={humanise(data.current.label)}
                  sub="Live, rules-based classification"
                  tone={regimeTone(data.current.label)}
                  badge="decision aid"
                />
                <EngineKpi
                  label="Classification confidence"
                  value={`${data.current.confidence}%`}
                  sub={`${availableInputs}/5 engine inputs available`}
                  tone={data.current.confidence >= 60 ? "positive" : "warning"}
                />
                <EngineKpi
                  label="Shadow HMM state"
                  value={hmmLeader ? humanise(hmmLeader) : "—"}
                  sub={data.hmm.asOf ? `As of ${data.hmm.asOf}` : "No shadow state available"}
                  tone="primary"
                  badge={data.hmm.status}
                />
                <EngineKpi
                  label="Model comparison"
                  value={agreement == null ? "Pending" : agreement ? "Aligned" : "Divergent"}
                  sub={
                    agreement == null
                      ? "A complete shadow result is required"
                      : agreement
                        ? "Rules and HMM identify the same leading state"
                        : "Treat disagreement as diagnostic evidence"
                  }
                  tone={agreement == null ? "warning" : agreement ? "positive" : "warning"}
                />
              </div>

              <EngineSection
                title="Five-engine state vector"
                description="All inputs use a common direction-aware scale. Missing engines remain visibly missing rather than being replaced with assumed values."
                className="mb-3"
              >
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  {(Object.entries(data.inputs) as Array<[keyof typeof LABELS, number | null]>).map(
                    ([key, value]) => {
                      const driver = data.current.drivers.find((item) => item.engine === key);
                      return (
                        <InputCard
                          key={key}
                          label={LABELS[key]}
                          value={value}
                          effect={driver?.effect ?? "missing"}
                          positiveIsRisk={POLARITY[key]}
                        />
                      );
                    },
                  )}
                </div>
              </EngineSection>

              <div className="mb-3 grid gap-3 lg:grid-cols-2">
                <EngineSection
                  title="Rules-based probabilities"
                  description={`Live classifier · total ${probabilityTotal(data.current.probabilities)}`}
                >
                  <ProbabilityList
                    rows={rulesProbabilities}
                    empty="No rules-based probabilities."
                  />
                </EngineSection>
                <EngineSection
                  title="Shadow HMM probabilities"
                  description={`${data.hmm.version ?? "Model not run"} · total ${probabilityTotal(data.hmm.probabilities)}`}
                >
                  <ProbabilityList
                    rows={hmmProbabilities}
                    empty="Run the Stage 5 model pipeline after ingest to populate the shadow distribution."
                  />
                </EngineSection>
              </div>

              <EngineSection
                title="Research posture"
                description="Deterministic read-through from the current rules label. This changes what to investigate, not what to buy or sell."
              >
                <RegimeReadThrough label={data.current.label} />
              </EngineSection>

              <ModelNote>
                {data.note} Live methodology:{" "}
                <span className="font-mono">{data.current.methodology}</span>. The HMM remains{" "}
                <span className="font-mono">{data.hmm.status}</span> and is not promoted into the
                live decision signal.
              </ModelNote>
            </>
          );
        })()}
    </AppShell>
  );
}

function InputCard({
  label,
  value,
  effect,
  positiveIsRisk,
}: {
  label: string;
  value: number | null;
  effect: string;
  positiveIsRisk: boolean;
}) {
  const position = value == null ? 50 : Math.max(0, Math.min(100, ((value + 3) / 6) * 100));
  return (
    <div className="rounded border border-border/70 bg-background/20 p-3">
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold", toneClass(value, positiveIsRisk))}>
        {value?.toFixed(2) ?? "—"}
      </div>
      <div className="text-[10px] capitalize text-muted-foreground">{effect}</div>
      <div className="relative mt-3 h-1.5 rounded-full bg-muted">
        <div className="absolute left-1/2 top-[-2px] h-2.5 w-px bg-foreground/30" />
        {value != null && (
          <div
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--primary)]"
            style={{ left: `${position}%` }}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[8px] text-muted-foreground">
        <span>-3</span>
        <span>0</span>
        <span>+3</span>
      </div>
    </div>
  );
}

function ProbabilityList({ rows, empty }: { rows: Array<[string, number]>; empty: string }) {
  if (!rows.length) return <div className="py-4 text-xs text-muted-foreground">{empty}</div>;
  return (
    <div className="space-y-2">
      {rows.map(([label, probability], index) => (
        <div key={label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs">
            <span className="capitalize">
              {humanise(label)}{" "}
              {index === 0 && <span className="text-[var(--primary)]">· lead</span>}
            </span>
            <span className="font-mono tabular-nums">{(probability * 100).toFixed(1)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-background/60">
            <div
              className={cn(
                "h-1.5 rounded-full",
                index === 0 ? "bg-[var(--primary)]" : "bg-muted-foreground/40",
              )}
              style={{ width: `${Math.max(1, Math.min(100, probability * 100))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function RegimeReadThrough({ label }: { label: string }) {
  const posture: Record<string, { summary: string; focus: string[] }> = {
    goldilocks: {
      summary: "Growth is supportive without broad inflation or financial-stress pressure.",
      focus: [
        "Quality growth with improving earnings breadth",
        "Valuation discipline where risk appetite is already strong",
        "Early inflation or liquidity reversals",
      ],
    },
    reflation: {
      summary:
        "Growth is positive and inflation pressure is rebuilding without severe financial tightening.",
      focus: [
        "Pricing power and nominal revenue growth",
        "Rate sensitivity and duration risk",
        "Commodity and cyclical earnings exposure",
      ],
    },
    overheating: {
      summary: "Strong activity is colliding with high inflation or labour heat.",
      focus: [
        "Margin resilience under wage and input pressure",
        "Balance-sheet sensitivity to higher rates",
        "Policy-tightening catalysts",
      ],
    },
    late_cycle: {
      summary: "Growth is losing room while financial or labour conditions become less supportive.",
      focus: [
        "Refinancing and liquidity risk",
        "Earnings quality over headline growth",
        "Defensive cash-flow durability",
      ],
    },
    slowdown: {
      summary: "Growth is below trend, but stress has not yet reached a contractionary extreme.",
      focus: [
        "Negative operating leverage",
        "Estimate revisions and demand sensitivity",
        "Potential policy support",
      ],
    },
    contraction: {
      summary: "Growth or combined labour-market stress is materially weak.",
      focus: [
        "Survival, liquidity and covenant headroom",
        "Downside cases before upside narratives",
        "Distressed or recovery catalysts only with hard evidence",
      ],
    },
    policy_reflation: {
      summary: "Growth remains soft while easier financial conditions begin to offer support.",
      focus: [
        "Early-cycle beneficiaries",
        "Evidence that easing reaches the real economy",
        "False starts in cyclical recovery",
      ],
    },
    mixed: {
      summary: "The engines do not form a clean historical regime pattern.",
      focus: [
        "Bottom-up evidence over macro beta",
        "Engine disagreements and turning points",
        "Smaller position-sizing assumptions in research cases",
      ],
    },
    insufficient: {
      summary: "There are too few active inputs for a reliable cross-engine call.",
      focus: [
        "Resolve missing or stale data",
        "Avoid regime-dependent conclusions",
        "Use the available engines separately",
      ],
    },
  };
  const item = posture[label] ?? posture.mixed;
  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--primary)]">
          {humanise(label)}
        </div>
        <p className="mt-1 text-sm leading-relaxed">{item.summary}</p>
      </div>
      <div>
        <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          Research emphasis
        </div>
        <ul className="mt-1 space-y-1 text-[11px] text-muted-foreground">
          {item.focus.map((focus) => (
            <li key={focus} className="flex gap-2">
              <span className="text-[var(--primary)]">›</span>
              <span>{focus}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function sortedProbabilities(values: Record<string, number>): Array<[string, number]> {
  return Object.entries(values).sort((a, b) => b[1] - a[1]);
}

function probabilityTotal(values: Record<string, number>): string {
  const total = Object.values(values).reduce((sum, value) => sum + value, 0);
  return `${(total * 100).toFixed(1)}%`;
}

function regimeTone(label: string): "positive" | "negative" | "warning" | "neutral" | "primary" {
  if (["goldilocks", "policy_reflation"].includes(label)) return "positive";
  if (["contraction", "overheating"].includes(label)) return "negative";
  if (["late_cycle", "slowdown", "insufficient"].includes(label)) return "warning";
  return "primary";
}

function toneClass(value: number | null, positiveIsRisk: boolean): string {
  const tone = toneForScore(value, positiveIsRisk);
  return {
    positive: "text-[var(--positive)]",
    negative: "text-[var(--negative)]",
    warning: "text-[var(--warning)]",
    neutral: "text-foreground",
    primary: "text-[var(--primary)]",
  }[tone];
}

function humanise(value: string): string {
  return value.replaceAll("_", " ");
}

function normalise(value: string): string {
  return value.toLowerCase().replaceAll(" ", "_");
}
