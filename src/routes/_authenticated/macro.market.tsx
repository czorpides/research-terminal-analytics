import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

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
import { getMarketEngine } from "@/lib/panels/market.functions";
import { toneForScore } from "@/lib/panels/macro-view";

export const Route = createFileRoute("/_authenticated/macro/market")({
  head: () => ({
    meta: [
      { title: "US Market Engine — Research Terminal" },
      {
        name: "description",
        content:
          "US equities, volatility, credit, real yields, the dollar and commodities compressed into an auditable Market Stress Score.",
      },
    ],
  }),
  component: MarketEngine,
});

function MarketEngine() {
  const load = useServerFn(getMarketEngine);
  const { data, error, isLoading } = useQuery({
    queryKey: ["market-engine"],
    queryFn: () => load(),
    refetchOnWindowFocus: false,
  });

  return (
    <AppShell>
      <SectionHeader
        code="MA · Stage 5 · US Market"
        title="Are markets confirming or contradicting the macro picture?"
        purpose="Equities, volatility, credit, real yields, the dollar and commodities, compressed into transparent market stress with a separate shadow co-movement diagnostic."
      />

      {isLoading && <div className="text-xs text-muted-foreground">Loading Market Engine…</div>}
      {error && (
        <div className="text-xs text-[var(--negative)]">
          Failed to load: {(error as Error).message}
        </div>
      )}

      {data &&
        (() => {
          const score = data.score.score;
          const componentMap = new Map(
            data.score.components.map((component) => [component.key, component]),
          );
          const dominant = data.score.components
            .filter((component) => component.contribution != null)
            .sort((a, b) => Math.abs(b.contribution ?? 0) - Math.abs(a.contribution ?? 0))[0];
          const latestDate = data.indicators
            .map((indicator) => indicator.date)
            .filter((date): date is string => Boolean(date))
            .sort()
            .at(-1);

          return (
            <>
              <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <EngineKpi
                  label="Market Stress Score"
                  value={score?.toFixed(2) ?? "—"}
                  sub="Positive is more stressed, negative is more risk-on"
                  tone={toneForScore(score)}
                  badge={data.score.regime.replaceAll("_", " ")}
                />
                <EngineKpi
                  label="Coverage"
                  value={`${data.score.confidence}%`}
                  sub={`${data.score.components.filter((item) => item.zScore != null).length}/${data.score.components.length} configured components active`}
                  tone={data.score.confidence >= 80 ? "positive" : "warning"}
                />
                <EngineKpi
                  label="Dominant signal"
                  value={dominant?.label ?? "—"}
                  sub={
                    dominant?.contribution == null
                      ? "No active contribution"
                      : `${dominant.contribution > 0 ? "Adds" : "Reduces"} stress by ${Math.abs(dominant.contribution).toFixed(2)}`
                  }
                  tone={toneForScore(dominant?.contribution ?? null)}
                />
                <EngineKpi
                  label="Shadow PCA"
                  value={data.pca.status === "shadow" ? "Shadow" : "Not run"}
                  sub={`${data.pca.explainedVariance == null ? "—" : `${(data.pca.explainedVariance * 100).toFixed(1)}%`} first-factor variance · ${latestDate ?? "no date"}`}
                  tone={data.pca.status === "shadow" ? "primary" : "warning"}
                  badge={data.pca.version ?? undefined}
                />
              </div>

              <div className="mb-3 grid gap-3 xl:grid-cols-[1.25fr_0.75fr]">
                <ScoreScale value={score} lowLabel="Risk-on" highLabel="Risk-off" />
                <MarketReadThrough regime={data.score.regime} dominant={dominant?.label ?? null} />
              </div>

              <EngineSection
                title="Stress contribution ledger"
                description="Each market series is transformed and direction-adjusted so positive contributions consistently mean more stress."
                className="mb-3"
              >
                <ContributionLedger
                  rows={data.score.components.map((component) => ({
                    key: component.key,
                    label: component.label,
                    family: component.family,
                    zScore: component.zScore,
                    weight: component.effectiveWeight,
                    contribution: component.contribution,
                  }))}
                />
              </EngineSection>

              <EngineSection
                title="Underlying market signals"
                description="The latest transformed reading and recent path for every market-stress input."
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
                {data.note} The live methodology is{" "}
                <span className="font-mono">{data.score.methodology}</span>. PCA label:{" "}
                <span className="font-mono">{data.pca.label}</span>.
              </ModelNote>
            </>
          );
        })()}
    </AppShell>
  );
}

function MarketReadThrough({
  regime,
  dominant,
}: {
  regime: "risk_on" | "neutral" | "fragile" | "risk_off" | "insufficient";
  dominant: string | null;
}) {
  const copy = {
    risk_on:
      "Market pricing is unusually supportive relative to history. This can validate a constructive macro view, but it also raises the bar for fresh upside surprises.",
    neutral:
      "Cross-asset pricing is close to normal. The market is not sending a strong confirmation or contradiction signal to the macro engines.",
    fragile:
      "Stress is elevated but not yet broad enough for a full risk-off call. Credit, volatility and equity confirmation should be watched together.",
    risk_off:
      "Stress is broad and materially above normal. Tighten research hurdles and test liquidity, refinancing and downside sensitivity in candidate names.",
    insufficient:
      "The active market inputs do not meet the minimum coverage required for a reliable stress call.",
  }[regime];
  return (
    <div className="rounded border border-border bg-card p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Current read-through
      </div>
      <div className="mt-1 text-sm font-semibold capitalize">{regime.replaceAll("_", " ")}</div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{copy}</p>
      {dominant && (
        <p className="mt-2 border-t border-border/50 pt-2 text-[10px] text-muted-foreground">
          Largest absolute contribution: <span className="text-foreground">{dominant}</span>
        </p>
      )}
    </div>
  );
}
