import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Search,
  ShieldAlert,
  Target,
  Telescope,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  computeResearchConviction,
  type ConvictionResult,
  type ConvictionTier,
  type ResearchCase,
} from "@/lib/opportunity/conviction";
import type {
  OpportunityCandidate,
  OpportunityRadarWorkspace,
} from "@/lib/opportunity/workspace.functions";
import type { RegimeMonitorPayload } from "@/lib/panels/regime.functions";
import { cn } from "@/lib/utils";
import { OpportunityRadarView } from "./OpportunityRadarView";

interface RankedCandidate {
  candidate: OpportunityCandidate;
  conviction: ConvictionResult;
}

type TierFilter = "researchable" | ConvictionTier | "all";

const TIER_ORDER: Record<ConvictionTier, number> = {
  research_now: 0,
  promising: 1,
  watch: 2,
  insufficient: 3,
  weak: 4,
  excluded: 5,
};

export function OpportunityRadarConvictionView({
  workspace,
  regime,
}: {
  workspace: OpportunityRadarWorkspace;
  regime: RegimeMonitorPayload;
}) {
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const ranked = useMemo(
    () =>
      workspace.candidates
        .map((candidate) => ({
          candidate,
          conviction: assessCandidate(candidate),
        }))
        .sort(
          (left, right) =>
            TIER_ORDER[left.conviction.tier] - TIER_ORDER[right.conviction.tier] ||
            right.conviction.score - left.conviction.score ||
            right.conviction.agreement - left.conviction.agreement ||
            right.candidate.horizons.one_to_three.dataConfidence -
              left.candidate.horizons.one_to_three.dataConfidence,
        ),
    [workspace.candidates],
  );
  const counts = countTiers(ranked);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ranked.filter(({ candidate, conviction }) => {
      if (
        needle &&
        !`${candidate.symbol} ${candidate.name} ${candidate.industryName ?? ""}`
          .toLowerCase()
          .includes(needle)
      ) {
        return false;
      }
      if (tierFilter === "all") return true;
      if (tierFilter === "researchable") {
        return conviction.tier === "research_now" || conviction.tier === "promising";
      }
      return conviction.tier === tierFilter;
    });
  }, [query, ranked, tierFilter]);

  const visibleRows = filtered.slice(0, 50);
  const researchableCount = counts.research_now + counts.promising;

  return (
    <div className="space-y-3">
      <section className="rounded-md border border-[var(--positive)]/35 bg-[var(--positive)]/5 p-3">
        <div className="flex items-start gap-2">
          <Target className="mt-0.5 h-4 w-4 shrink-0 text-[var(--positive)]" />
          <div>
            <div className="text-xs font-semibold">
              Rules-based research conviction is now the primary shortlist
            </div>
            <p className="mt-1 max-w-5xl text-[11px] leading-relaxed text-muted-foreground">
              Piotroski, Magic Formula, valuation, quality, price dislocation, balance-sheet strength,
              recovery and impairment risk now directly change the shortlist order. Negative earnings,
              negative operating cash flow, very weak F-Scores and high impairment risk can exclude a
              company even when it looks cheap. The original horizon score remains visible below as a
              separate evidence model rather than being silently rewritten.
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <ConvictionTile
          icon={Telescope}
          label="Research now"
          value={counts.research_now}
          detail="Strong multi-model agreement"
          tone="positive"
        />
        <ConvictionTile
          icon={Target}
          label="Promising"
          value={counts.promising}
          detail={`${researchableCount} total researchable names`}
          tone="positive"
        />
        <ConvictionTile
          icon={AlertTriangle}
          label="Watch"
          value={counts.watch}
          detail="Interesting, but not enough confirmation"
          tone="warning"
        />
        <ConvictionTile
          icon={ShieldAlert}
          label="Hard exclusions"
          value={counts.excluded}
          detail="Value-trap or model-specific gate failed"
          tone="negative"
        />
      </div>

      <section className="rounded-md border border-border/70 bg-card/35">
        <header className="border-b border-border/60 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Primary 1–3 year research queue
              </div>
              <h2 className="mt-0.5 text-sm font-semibold">Multi-model conviction shortlist</h2>
              <p className="mt-1 max-w-4xl text-[10px] leading-relaxed text-muted-foreground">
                Conviction is 76% weighted evidence and 24% model agreement, then adjusted for warnings
                and data confidence. A company needs both an identifiable research case and agreement
                across several independent lenses. This ranks where research time should go, not what to buy.
              </p>
            </div>
            <Badge variant="outline" className="w-fit font-mono text-[9px]">
              {filtered.length.toLocaleString()} matched
            </Badge>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label className="relative min-w-0 flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search company, ticker or industry"
                className="h-8 pl-8 text-xs"
              />
            </label>
            <select
              value={tierFilter}
              onChange={(event) => setTierFilter(event.target.value as TierFilter)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              aria-label="Filter by research conviction"
            >
              <option value="all">All companies</option>
              <option value="researchable">Research now + promising</option>
              <option value="research_now">Research now only</option>
              <option value="promising">Promising only</option>
              <option value="watch">Watch only</option>
              <option value="insufficient">Insufficient evidence</option>
              <option value="weak">Weak setup</option>
              <option value="excluded">Hard exclusions</option>
            </select>
          </div>
        </header>

        <ConvictionTable rows={visibleRows} />
        {filtered.length > visibleRows.length && (
          <div className="border-t border-border/50 p-2 text-center text-[10px] text-muted-foreground">
            Showing the first {visibleRows.length} of {filtered.length.toLocaleString()} ranked companies.
          </div>
        )}
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <MethodCard
          title="What earns conviction"
          items={[
            "Attractive valuation relative to peers",
            "Acceptable quality and low estimated impairment risk",
            "Piotroski profitability, cash conversion and balance-sheet evidence",
            "Magic Formula return on capital and earnings-yield rank",
            "Meaningful price dislocation with signs of recovery or fundamental improvement",
          ]}
          positive
        />
        <MethodCard
          title="What blocks or reduces conviction"
          items={[
            "Negative annual net income or operating cash flow",
            "Piotroski F-Score of 3/9 or lower",
            "Very weak quality, balance sheet or high impairment risk",
            "Dilution, falling margins, weak cash conversion or no recovery confirmation",
            "Financials and REITs until their sector-specific models are active",
          ]}
        />
      </section>

      <div className="rounded-md border border-border/70 bg-muted/20 p-3">
        <div className="text-xs font-semibold">Full evidence engine and audit trail</div>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          The detailed model below keeps the original horizon score, impairment estimate, model state,
          Piotroski tests, Magic Formula ranks and every missing-data blocker visible. Use the shortlist
          above to decide where to open a company, then use the evidence panels below to challenge it.
        </p>
      </div>

      <OpportunityRadarView workspace={workspace} regime={regime} />
    </div>
  );
}

function assessCandidate(candidate: OpportunityCandidate): ConvictionResult {
  const result = candidate.horizons.one_to_three;
  return computeResearchConviction({
    valuation: candidate.evidence.valuationCompression?.value ?? null,
    quality: candidate.evidence.fundamentalResilience?.value ?? null,
    priceDislocation: candidate.evidence.priceDislocation?.value ?? null,
    recoveryConfirmation: candidate.evidence.recoveryConfirmation?.value ?? null,
    balanceSheetDurability: candidate.evidence.balanceSheetDurability?.value ?? null,
    impairmentRisk: candidate.evidence.impairmentRisk?.value ?? null,
    dataConfidence: result.dataConfidence,
    sectorModelBlocked: result.modelState === "blocked",
    piotroski: candidate.fundamentalModels.piotroski,
    magicFormula: {
      state: candidate.fundamentalModels.magicFormula.state,
      universePercentile: candidate.fundamentalModels.magicFormula.universePercentile,
      industryPercentile: candidate.fundamentalModels.magicFormula.industryPercentile,
      exclusionReason: candidate.fundamentalModels.magicFormula.exclusionReason,
    },
  });
}

function ConvictionTable({ rows }: { rows: RankedCandidate[] }) {
  if (rows.length === 0) {
    return (
      <div className="p-10 text-center text-xs text-muted-foreground">
        No companies match this conviction filter. Switch to Watch or All companies to inspect the next tier.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1540px] border-collapse text-left text-[11px]">
        <thead>
          <tr className="border-b border-border/70 text-[9px] uppercase tracking-wider text-muted-foreground">
            <th className="px-2 py-2 font-medium">Rank</th>
            <th className="px-2 py-2 font-medium">Company</th>
            <th className="px-2 py-2 font-medium">Research case</th>
            <th className="px-2 py-2 font-medium">Conviction</th>
            <th className="px-2 py-2 text-right font-medium">Score</th>
            <th className="px-2 py-2 text-right font-medium">Agreement</th>
            <th className="px-2 py-2 text-right font-medium">Core model</th>
            <th className="px-2 py-2 text-right font-medium">Valuation</th>
            <th className="px-2 py-2 text-right font-medium">Quality</th>
            <th className="px-2 py-2 text-right font-medium">F-Score</th>
            <th className="px-2 py-2 text-right font-medium">Magic</th>
            <th className="px-2 py-2 text-right font-medium">Price damage</th>
            <th className="px-2 py-2 text-right font-medium">Impairment</th>
            <th className="px-2 py-2 font-medium">Basis</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ candidate, conviction }, index) => {
            const horizon = candidate.horizons.one_to_three;
            const piotroski = candidate.fundamentalModels.piotroski;
            const magic = candidate.fundamentalModels.magicFormula;
            return (
              <tr
                key={candidate.assetId}
                className={cn(
                  "border-b border-border/45 transition-colors hover:bg-muted/35",
                  conviction.tier === "research_now" && "bg-[var(--positive)]/[0.035]",
                )}
              >
                <td className="px-2 py-2 font-mono text-muted-foreground">{index + 1}</td>
                <td className="px-2 py-2">
                  <Link
                    to="/security/$symbol"
                    params={{ symbol: candidate.symbol }}
                    className="font-semibold hover:underline"
                  >
                    {candidate.symbol}
                  </Link>
                  <div className="max-w-52 truncate text-[9px] text-muted-foreground">
                    {candidate.name} · {candidate.industryName ?? "Unmapped industry"}
                  </div>
                </td>
                <td className="px-2 py-2">
                  <ResearchCaseBadges cases={conviction.researchCases} />
                </td>
                <td className="px-2 py-2">
                  <ConvictionBadge tier={conviction.tier} />
                </td>
                <ScoreCell value={conviction.score} />
                <td className="px-2 py-2 text-right font-mono tabular-nums">
                  {conviction.agreement.toFixed(0)}%
                  <div className="text-[8px] text-muted-foreground">
                    {conviction.confirmingCount}/{conviction.availableCount} lenses
                  </div>
                </td>
                <ScoreCell value={horizon.score} />
                <ScoreCell value={candidate.evidence.valuationCompression?.value ?? null} />
                <ScoreCell value={candidate.evidence.fundamentalResilience?.value ?? null} />
                <td className="px-2 py-2 text-right font-mono tabular-nums">
                  {piotroski.state === "complete"
                    ? `${piotroski.score}/9`
                    : piotroski.state === "partial"
                      ? `${piotroski.provisionalScore ?? 0}/${piotroski.availableTests}`
                      : "—"}
                </td>
                <td className="px-2 py-2 text-right font-mono tabular-nums">
                  {magic.state === "ranked"
                    ? `${magic.universePercentile?.toFixed(0) ?? "—"}th`
                    : magic.state === "ineligible"
                      ? "N/A"
                      : "—"}
                </td>
                <ScoreCell value={candidate.evidence.priceDislocation?.value ?? null} />
                <td
                  className={cn(
                    "px-2 py-2 text-right font-mono tabular-nums",
                    riskTone(candidate.evidence.impairmentRisk?.value ?? null),
                  )}
                >
                  {candidate.evidence.impairmentRisk?.value?.toFixed(0) ?? "—"}
                </td>
                <td className="max-w-80 px-2 py-2 text-[9px] leading-relaxed text-muted-foreground">
                  {conviction.exclusions.length > 0
                    ? conviction.exclusions[0]
                    : conviction.confirmations.slice(0, 2).join(" · ") ||
                      "No lens has crossed its confirmation threshold."}
                  {conviction.warnings.length > 0 && (
                    <div className="mt-0.5 text-[var(--warning)]">
                      {conviction.warnings.length} warning
                      {conviction.warnings.length === 1 ? "" : "s"}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ConvictionTile({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Target;
  label: string;
  value: number;
  detail: string;
  tone: "positive" | "warning" | "negative";
}) {
  return (
    <div className="rounded-md border border-border/70 bg-card/35 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div
        className={cn(
          "mt-1 font-mono text-2xl font-semibold tabular-nums",
          tone === "positive" && "text-[var(--positive)]",
          tone === "warning" && "text-[var(--warning)]",
          tone === "negative" && "text-[var(--negative)]",
        )}
      >
        {value.toLocaleString()}
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">{detail}</div>
    </div>
  );
}

function MethodCard({
  title,
  items,
  positive = false,
}: {
  title: string;
  items: string[];
  positive?: boolean;
}) {
  return (
    <div className="rounded-md border border-border/70 bg-card/30 p-3">
      <div className="text-xs font-semibold">{title}</div>
      <div className="mt-2 space-y-1.5">
        {items.map((item) => (
          <div
            key={item}
            className="flex items-start gap-2 text-[10px] leading-relaxed text-muted-foreground"
          >
            {positive ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--positive)]" />
            ) : (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--warning)]" />
            )}
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResearchCaseBadges({ cases }: { cases: ResearchCase[] }) {
  if (cases.length === 0) {
    return (
      <Badge variant="outline" className="text-[8px] text-muted-foreground">
        NO CASE
      </Badge>
    );
  }
  return (
    <div className="flex max-w-72 flex-wrap gap-1">
      {cases.slice(0, 3).map((researchCase) => (
        <Badge key={researchCase} variant="outline" className="px-1.5 py-0 text-[8px]">
          {caseLabel(researchCase)}
        </Badge>
      ))}
      {cases.length > 3 && (
        <Badge variant="outline" className="px-1.5 py-0 text-[8px] text-muted-foreground">
          +{cases.length - 3}
        </Badge>
      )}
    </div>
  );
}

function ConvictionBadge({ tier }: { tier: ConvictionTier }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "whitespace-nowrap px-1.5 py-0 text-[8px]",
        tier === "research_now" && "border-[var(--positive)]/50 text-[var(--positive)]",
        tier === "promising" && "border-primary/45 text-primary",
        tier === "watch" && "border-[var(--warning)]/45 text-[var(--warning)]",
        tier === "excluded" && "border-[var(--negative)]/45 text-[var(--negative)]",
        (tier === "weak" || tier === "insufficient") && "text-muted-foreground",
      )}
    >
      {tierLabel(tier)}
    </Badge>
  );
}

function ScoreCell({ value }: { value: number | null }) {
  return (
    <td className={cn("px-2 py-2 text-right font-mono tabular-nums", scoreTone(value))}>
      {value?.toFixed(0) ?? "—"}
    </td>
  );
}

function countTiers(rows: RankedCandidate[]): Record<ConvictionTier, number> {
  const counts: Record<ConvictionTier, number> = {
    research_now: 0,
    promising: 0,
    watch: 0,
    weak: 0,
    insufficient: 0,
    excluded: 0,
  };
  for (const row of rows) counts[row.conviction.tier] += 1;
  return counts;
}

function caseLabel(researchCase: ResearchCase): string {
  const labels: Record<ResearchCase, string> = {
    broken_stock: "BROKEN STOCK",
    improving_deep_value: "IMPROVING VALUE",
    quality_value: "QUALITY VALUE",
    fundamental_inflection: "INFLECTION",
    multi_model_value: "MULTI-MODEL",
  };
  return labels[researchCase];
}

function tierLabel(tier: ConvictionTier): string {
  const labels: Record<ConvictionTier, string> = {
    research_now: "RESEARCH NOW",
    promising: "PROMISING",
    watch: "WATCH",
    weak: "WEAK",
    insufficient: "INSUFFICIENT",
    excluded: "EXCLUDED",
  };
  return labels[tier];
}

function scoreTone(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  if (value >= 70) return "text-[var(--positive)]";
  if (value < 45) return "text-[var(--negative)]";
  return "text-foreground";
}

function riskTone(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  if (value <= 35) return "text-[var(--positive)]";
  if (value >= 60) return "text-[var(--negative)]";
  return "text-[var(--warning)]";
}
