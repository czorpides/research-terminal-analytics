import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import {
  ContributionLedger,
  EngineKpi,
  EngineSection,
  IndicatorGrid,
  ModelNote,
  ScoreScale,
} from "@/components/research/MacroEngineView";
import { getLiquidityEngine } from "@/lib/panels/liquidity.functions";
import { toneForScore, type EngineTone } from "@/lib/panels/macro-view";

export const Route = createFileRoute("/_authenticated/macro/liquidity")({
  head: () => ({
    meta: [
      { title: "US Liquidity & Financial Conditions — Research Terminal" },
      {
        name: "description",
        content:
          "US rates, curve shape, credit spreads, financial stress and monetary liquidity in one transparent financial-conditions score.",
      },
    ],
  }),
  component: LiquidityEngine,
});

function LiquidityEngine() {
  const load = useServerFn(getLiquidityEngine);
  const { data, error, isLoading } = useQuery({
    queryKey: ["liquidity-engine"],
    queryFn: () => load(),
    refetchOnWindowFocus: false,
  });

  return (
    <AppShell>
      <SectionHeader
        code="MA · Stage 3 · US Liquidity"
        title="How restrictive are US financial conditions?"
        purpose="Rates, curve shape, credit spreads, stress and liquidity aggregates, standardised against their own histories and combined in one inspectable score."
      />

      {isLoading && <PageState>Loading Liquidity Engine…</PageState>}
      {error && <PageState error>Failed to load: {(error as Error).message}</PageState>}

      {data &&
        (() => {
          const score = data.score.score;
          const components = data.score.components;
          const dominant = components
            .filter((component) => component.contribution != null)
            .sort((a, b) => Math.abs(b.contribution ?? 0) - Math.abs(a.contribution ?? 0))[0];
          const componentMap = new Map(components.map((component) => [component.key, component]));
          const totalObservations = data.indicators.reduce(
            (sum, indicator) => sum + indicator.observationCount,
            0,
          );
          const latestDate = data.indicators
            .map((indicator) => indicator.date)
            .filter((date): date is string => Boolean(date))
            .sort()
            .at(-1);

          return (
            <>
              <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <EngineKpi
                  label="Financial Conditions Index"
                  value={score?.toFixed(2) ?? "—"}
                  sub="Positive is tighter than the historical norm"
                  tone={toneForScore(score)}
                  badge={data.score.regime}
                />
                <EngineKpi
                  label="Coverage"
                  value={`${data.score.confidence}%`}
                  sub={`${components.filter((item) => item.zScore != null).length}/${components.length} configured components active`}
                  tone={data.score.confidence >= 80 ? "positive" : "warning"}
                />
                <EngineKpi
                  label="Dominant driver"
                  value={dominant?.label ?? "—"}
                  sub={
                    dominant?.contribution == null
                      ? "No active contribution"
                      : `${dominant.contribution > 0 ? "Tightening" : "Easing"} contribution ${signed(dominant.contribution)}`
                  }
                  tone={toneForScore(dominant?.contribution ?? null)}
                />
                <EngineKpi
                  label="Data footprint"
                  value={totalObservations.toLocaleString()}
                  sub={`Latest observation ${latestDate ?? "unavailable"}`}
                  tone="primary"
                />
              </div>

              <div className="mb-3 grid gap-3 xl:grid-cols-[1.4fr_0.6fr]">
                <ScoreScale value={score} lowLabel="Easier" highLabel="Tighter" />
                <ReadThrough regime={data.score.regime} dominant={dominant?.label ?? null} />
              </div>

              <EngineSection
                title="Contribution ledger"
                description="Every component is direction-adjusted. Positive contributions tighten the index, negative contributions ease it."
                className="mb-3"
              >
                <ContributionLedger
                  rows={components.map((component) => ({
                    key: component.key,
                    label: component.label,
                    family: component.family,
                    zScore: component.zScore,
                    weight: component.weight,
                    contribution: component.contribution,
                  }))}
                />
              </EngineSection>

              <EngineSection
                title="Underlying indicators"
                description="Latest levels and the most recent 36 observations for each rates, credit and liquidity series."
              >
                <IndicatorGrid
                  rows={data.indicators.map((indicator) => {
                    const component = componentMap.get(indicator.concept);
                    return {
                      ...indicator,
                      family: component?.family,
                      zScore: component?.zScore,
                    };
                  })}
                />
              </EngineSection>

              <ModelNote>
                {data.note} Methodology: <span className="font-mono">{data.score.methodology}</span>
                .
              </ModelNote>
            </>
          );
        })()}
    </AppShell>
  );
}

function ReadThrough({
  regime,
  dominant,
}: {
  regime: "restrictive" | "neutral" | "accommodative" | "insufficient";
  dominant: string | null;
}) {
  const copy = {
    restrictive:
      "Financing conditions are tighter than their historical norm. This is a headwind for leveraged balance sheets, refinancing activity and rate-sensitive growth.",
    neutral:
      "The combined signal is close to its historical norm. Individual credit or rates pressures matter more than the headline score at this point.",
    accommodative:
      "Conditions are easier than their historical norm. This generally supports refinancing capacity, risk appetite and rate-sensitive demand.",
    insufficient:
      "There is not enough active history to make a reliable conditions call. Treat the component readings as incomplete.",
  }[regime];
  const tone: EngineTone =
    regime === "restrictive"
      ? "negative"
      : regime === "accommodative"
        ? "positive"
        : regime === "insufficient"
          ? "warning"
          : "neutral";
  return (
    <div className="rounded border border-border bg-card p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Current read-through
      </div>
      <div className={`mt-1 text-sm font-semibold capitalize ${toneClass(tone)}`}>{regime}</div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{copy}</p>
      {dominant && (
        <p className="mt-2 border-t border-border/50 pt-2 text-[10px] text-muted-foreground">
          Largest absolute contribution: <span className="text-foreground">{dominant}</span>
        </p>
      )}
    </div>
  );
}

function PageState({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <div className={error ? "text-xs text-[var(--negative)]" : "text-xs text-muted-foreground"}>
      {children}
    </div>
  );
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function toneClass(tone: EngineTone): string {
  return {
    positive: "text-[var(--positive)]",
    negative: "text-[var(--negative)]",
    warning: "text-[var(--warning)]",
    neutral: "text-foreground",
    primary: "text-[var(--primary)]",
  }[tone];
}
