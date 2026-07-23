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
import { getLabourEngine } from "@/lib/panels/labour.functions";
import { toneForScore } from "@/lib/panels/macro-view";
import { ResearchNarrative } from "@/components/research/ResearchContext";

export const Route = createFileRoute("/_authenticated/macro/labour")({
  head: () => ({
    meta: [
      { title: "US Labour Engine — Research Terminal" },
      {
        name: "description",
        content:
          "US employment, slack, worker demand and wage pressure compared with history in an auditable Labour Heat Score.",
      },
    ],
  }),
  component: LabourEngine,
});

const FAMILY_LABELS = {
  employment: "Employment momentum",
  slack: "Labour slack",
  demand: "Worker demand",
  wages: "Wage pressure",
} as const;

function LabourEngine() {
  const load = useServerFn(getLabourEngine);
  const { data, error, isLoading } = useQuery({
    queryKey: ["labour-engine"],
    queryFn: () => load(),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  return (
    <AppShell>
      <SectionHeader
        code="MA · Stage 4 · US Labour"
        title="Is the US labour market heating, balanced or breaking?"
        purpose="Employment momentum, labour slack, worker demand and wage pressure, compared with their histories and combined into one auditable cycle score."
      />

      {isLoading && <div className="text-xs text-muted-foreground">Loading Labour Engine…</div>}
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
          const familyRows = Object.entries(data.score.familyScores)
            .filter((entry): entry is [keyof typeof FAMILY_LABELS, number] => entry[1] != null)
            .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
          const dominantFamily = familyRows[0];
          const latestDate = data.indicators
            .map((indicator) => indicator.date)
            .filter((date): date is string => Boolean(date))
            .sort()
            .at(-1);

          return (
            <>
              <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <EngineKpi
                  label="Labour Heat Score"
                  value={score?.toFixed(2) ?? "—"}
                  sub="Positive is hotter, negative is cooler"
                  tone={toneForScore(score, false)}
                  badge={data.score.regime}
                />
                <EngineKpi
                  label="Coverage"
                  value={`${data.score.confidence}%`}
                  sub={`${data.score.components.filter((item) => item.zScore != null).length}/${data.score.components.length} configured components active`}
                  tone={data.score.confidence >= 80 ? "positive" : "warning"}
                />
                <EngineKpi
                  label="Dominant family"
                  value={dominantFamily ? FAMILY_LABELS[dominantFamily[0]] : "—"}
                  sub={
                    dominantFamily ? `Family score ${signed(dominantFamily[1])}` : "No family score"
                  }
                  tone={toneForScore(dominantFamily?.[1] ?? null, false)}
                />
                <EngineKpi
                  label="Noise-filtered trend"
                  value={normaliseStatus(data.kalman.status)}
                  sub={`${data.kalman.version ?? "not run"} · ${formatDate(data.kalman.asOf ?? latestDate)}`}
                  tone={data.kalman.status === "success" ? "positive" : "warning"}
                  badge="experimental model"
                  explanation="A statistical filter removes some short-term noise to estimate the underlying labour trend. The raw releases remain visible below."
                />
              </div>

              <div className="mb-3">
                <ResearchNarrative
                  summary={`The US labour market is classified as ${data.score.regime}. The heat score is ${score?.toFixed(2) ?? "unavailable"}, with ${dominantFamily ? FAMILY_LABELS[dominantFamily[0]] : "no single family"} furthest from its normal range.`}
                  detail="The score combines employment momentum, slack, worker demand and wage pressure after adjusting every component so the direction is consistent. A cooling labour market can ease inflation pressure, but deeper weakness can become a growth risk."
                  watch={familyRows
                    .slice(0, 4)
                    .map(
                      ([family, value]) =>
                        `${FAMILY_LABELS[family]} is ${value > 0 ? "above" : value < 0 ? "below" : "near"} its adjusted historical norm at ${signed(value)}.`,
                    )}
                  asOf={latestDate}
                  confidence={data.score.confidence}
                />
              </div>

              <div className="mb-3 grid gap-3 xl:grid-cols-[1.25fr_0.75fr]">
                <ScoreScale value={score} lowLabel="Cooling / stressed" highLabel="Hot" />
                <LabourReadThrough regime={data.score.regime} family={dominantFamily ?? null} />
              </div>

              <EngineSection
                title="Family monitor"
                description="Each family is scored independently before its configured indicators feed the headline heat score."
                className="mb-3"
              >
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {(Object.keys(FAMILY_LABELS) as Array<keyof typeof FAMILY_LABELS>).map(
                    (family) => {
                      const value = data.score.familyScores[family] ?? null;
                      return (
                        <EngineKpi
                          key={family}
                          label={FAMILY_LABELS[family]}
                          value={value?.toFixed(2) ?? "—"}
                          sub={familyMeaning(family, value)}
                          tone={toneForScore(value, false)}
                        />
                      );
                    },
                  )}
                </div>
              </EngineSection>

              <EngineSection
                title="Contribution ledger"
                description="Shows how much each release heats or cools the combined labour signal after its direction and importance are applied."
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
                title="Underlying indicators"
                description="The latest transformed readings and recent path for employment, slack, demand and wages."
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

function LabourReadThrough({
  regime,
  family,
}: {
  regime: "hot" | "balanced" | "cooling" | "stressed" | "insufficient";
  family: [keyof typeof FAMILY_LABELS, number] | null;
}) {
  const copy = {
    hot: "Labour demand is running above its historical norm. Wage persistence and policy sensitivity deserve more weight in the research process.",
    balanced:
      "Employment, slack and wage signals are broadly consistent with a balanced labour market. Watch the family split for early turning points.",
    cooling:
      "The labour impulse is losing heat. This can reduce inflation pressure, but continued deterioration would become a growth warning.",
    stressed:
      "Labour conditions are materially weak relative to history. Treat this as a potential contraction signal and confirm it against growth and market stress.",
    insufficient:
      "The active data does not yet meet the minimum coverage required for a reliable cycle call.",
  }[regime];
  return (
    <div className="rounded border border-border bg-card p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Current read-through
      </div>
      <div className="mt-1 text-sm font-semibold capitalize">{regime}</div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{copy}</p>
      {family && (
        <p className="mt-2 border-t border-border/50 pt-2 text-[10px] text-muted-foreground">
          Largest family deviation:{" "}
          <span className="text-foreground">{FAMILY_LABELS[family[0]]}</span> at{" "}
          <span className="font-mono text-foreground">{signed(family[1])}</span>
        </p>
      )}
    </div>
  );
}

function familyMeaning(family: keyof typeof FAMILY_LABELS, value: number | null): string {
  if (value == null) return "Insufficient active history";
  const direction = value > 0.35 ? "above" : value < -0.35 ? "below" : "near";
  return `${direction} its historical norm${family === "slack" ? " after direction adjustment" : ""}`;
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function normaliseStatus(status: string): string {
  return status.replaceAll("_", " ");
}

function formatDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "no run date";
}
