import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Eye,
  Search,
  ShieldAlert,
  Target,
  Telescope,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  computeResearchConvictionV2,
  type ConvictionV2Result,
  type ResearchCaseV2,
  type ResearchTierV2,
} from "@/lib/opportunity/conviction-v2";
import type {
  OpportunityCandidate,
  OpportunityRadarWorkspace,
} from "@/lib/opportunity/workspace.functions";
import type { RegimeMonitorPayload } from "@/lib/panels/regime.functions";
import { cn } from "@/lib/utils";
import { BandBar, InfoTip, ResearchNarrative } from "./ResearchContext";
import { DashboardPanel } from "./DashboardPanel";
import { OpportunityRadarView } from "./OpportunityRadarView";

interface RankedCandidateV2 {
  candidate: OpportunityCandidate;
  conviction: ConvictionV2Result;
}

type TierFilterV2 = "researchable" | ResearchTierV2 | "all";
type MarketFilter = "all" | "US" | "UK" | "EU";

const TIER_ORDER: Record<ResearchTierV2, number> = {
  priority: 0,
  qualified: 1,
  watch: 2,
  insufficient: 3,
  avoid: 4,
};

const EU_CODES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
]);

export function OpportunityRadarConvictionViewV2({
  workspace,
  regime,
}: {
  workspace: OpportunityRadarWorkspace;
  regime: RegimeMonitorPayload;
}) {
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<TierFilterV2>("researchable");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("all");
  const [caseFilter, setCaseFilter] = useState<ResearchCaseV2 | "all">("all");

  const ranked = useMemo(
    () =>
      workspace.candidates
        .map((candidate) => ({ candidate, conviction: assessCandidate(candidate) }))
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
      if (!matchesMarket(candidate.countryCode, marketFilter)) return false;
      if (caseFilter !== "all" && !conviction.researchCases.includes(caseFilter)) return false;
      if (tierFilter === "all") return true;
      if (tierFilter === "researchable") {
        return ["priority", "qualified", "watch"].includes(conviction.tier);
      }
      return conviction.tier === tierFilter;
    });
  }, [caseFilter, marketFilter, query, ranked, tierFilter]);

  const shortlist = filtered
    .filter(({ conviction }) => ["priority", "qualified", "watch"].includes(conviction.tier))
    .slice(0, 12);
  const visibleRows = filtered.slice(0, 100);
  const actionable = counts.priority + counts.qualified;

  return (
    <div className="space-y-3">
      <section className="rounded-md border border-[var(--positive)]/40 bg-[var(--positive)]/5 p-3">
        <div className="flex items-start gap-2">
          <Target className="mt-0.5 h-4 w-4 shrink-0 text-[var(--positive)]" />
          <div>
            <div className="text-xs font-semibold">Research conviction now drives the page</div>
            <p className="mt-1 max-w-5xl text-[11px] leading-relaxed text-muted-foreground">
              This queue is deliberately broader than the production-eligibility gate. Temporary losses,
              weak recent cash flow or an incomplete F-Score reduce conviction and create research questions;
              they do not automatically erase a possible recovery. Only severe, combined value-trap risks
              create a hard Avoid classification. The strict horizon model remains available below as the
              audit trail.
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <ConvictionTile
          icon={Telescope}
          label="Priority research"
          value={counts.priority}
          detail="Strongest evidence agreement"
          tone="positive"
        />
        <ConvictionTile
          icon={Target}
          label="Qualified research"
          value={counts.qualified}
          detail={`${actionable} names justify immediate first-pass work`}
          tone="positive"
        />
        <ConvictionTile
          icon={Eye}
          label="Watchlist"
          value={counts.watch}
          detail="One further proof point required"
          tone="warning"
        />
        <ConvictionTile
          icon={ShieldAlert}
          label="Avoid / severe risk"
          value={counts.avoid}
          detail="Combined value-trap or model gate"
          tone="negative"
        />
      </div>

      <section className="rounded-md border border-border/70 bg-card/35 p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              Practical analyst queue
            </div>
            <h2 className="mt-0.5 text-sm font-semibold">
              Which companies have enough basis to investigate?
            </h2>
            <p className="mt-1 max-w-4xl text-[10px] leading-relaxed text-muted-foreground">
              Rankings combine valuation, quality, impairment safety, Piotroski, Magic Formula,
              price dislocation, recovery and balance-sheet durability. Priority and Qualified are
              designed to begin research; Watchlist names remain visible so the platform does not imply
              that no opportunity exists simply because one dataset is incomplete.
            </p>
          </div>
          <Badge variant="outline" className="w-fit font-mono text-[9px]">
            {workspace.universe.loaded.toLocaleString()} assessed · {filtered.length.toLocaleString()} matched
          </Badge>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_170px_190px_220px]">
          <label className="relative">
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
            onChange={(event) => setTierFilter(event.target.value as TierFilterV2)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="researchable">Priority + qualified + watch</option>
            <option value="priority">Priority research</option>
            <option value="qualified">Qualified research</option>
            <option value="watch">Watchlist</option>
            <option value="avoid">Avoid / severe risk</option>
            <option value="insufficient">Insufficient data</option>
            <option value="all">All companies</option>
          </select>
          <select
            value={caseFilter}
            onChange={(event) => setCaseFilter(event.target.value as ResearchCaseV2 | "all")}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="all">All research cases</option>
            <option value="broken_stock">Broken stock</option>
            <option value="improving_value">Improving value</option>
            <option value="quality_value">Quality value</option>
            <option value="fundamental_inflection">Fundamental inflection</option>
            <option value="multi_model_value">Multi-model value</option>
            <option value="cash_backed_value">Cash-backed value</option>
          </select>
          <div className="flex gap-1.5">
            {(["all", "US", "UK", "EU"] as MarketFilter[]).map((market) => (
              <button
                key={market}
                type="button"
                onClick={() => setMarketFilter(market)}
                className={cn(
                  "h-8 flex-1 rounded border px-2 text-[10px]",
                  marketFilter === market
                    ? "border-primary/55 bg-primary/10 text-foreground"
                    : "border-border/70 text-muted-foreground hover:text-foreground",
                )}
              >
                {market === "all" ? "ALL" : market}
              </button>
            ))}
          </div>
        </div>
      </section>

      <ResearchShortlist rows={shortlist} />

      <section className="rounded-md border border-border/70 bg-card/35">
        <header className="border-b border-border/60 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Full ranked population
              </div>
              <h2 className="mt-0.5 text-sm font-semibold">Conviction evidence table</h2>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                Open Basis to see confirmations, warnings, hard risks, missing proof and the individual
                weighted lenses behind the score.
              </p>
            </div>
            <Badge variant="outline" className="font-mono text-[9px]">
              {visibleRows.length} shown
            </Badge>
          </div>
        </header>
        <ConvictionTable rows={visibleRows} />
        {filtered.length > visibleRows.length && (
          <div className="border-t border-border/50 p-2 text-center text-[10px] text-muted-foreground">
            Showing the first {visibleRows.length} of {filtered.length.toLocaleString()} matched companies.
          </div>
        )}
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <MethodCard
          title="What promotes a company"
          items={[
            "Two or more independent lenses confirm the same research case",
            "Valuation is supported by acceptable quality or improving financial health",
            "Price damage appears larger than current impairment risk",
            "Piotroski and Magic Formula now materially affect priority rather than sitting in a side panel",
            "Partial but broad financial evidence can qualify, with missing proof shown explicitly",
          ]}
          positive
        />
        <MethodCard
          title="What now creates an Avoid classification"
          items={[
            "Both annual net income and operating cash flow are negative",
            "Piotroski is 2/9 or lower, or broad partial evidence is severely weak",
            "Business quality, balance-sheet durability or impairment risk is extreme",
            "A generic model is inappropriate for the sector",
            "Temporary weakness by itself is a warning, not a hard exclusion",
          ]}
        />
      </section>

      <details className="group rounded-md border border-border/70 bg-muted/15">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3">
          <div>
            <div className="text-xs font-semibold">Open the strict horizon model and audit trail</div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Price-damage map, production eligibility, component weights, model blockers and full evidence panels.
            </p>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-border/60 p-3">
          <OpportunityRadarView workspace={workspace} regime={regime} />
        </div>
      </details>
    </div>
  );
}

function assessCandidate(candidate: OpportunityCandidate): ConvictionV2Result {
  const result = candidate.horizons.one_to_three;
  return computeResearchConvictionV2({
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

function ResearchShortlist({ rows }: { rows: RankedCandidateV2[] }) {
  return (
    <DashboardPanel
      eyebrow="Conviction shortlist"
      title="The strongest current reasons to start research"
      description="Each card states the main confirming evidence and the next proof required. This is a prioritised research queue, not a buy list."
      equalHeight={false}
      actions={
        <Badge variant="outline" className="font-mono text-[9px]">
          {rows.length} prioritised
        </Badge>
      }
    >
      {rows.length === 0 ? (
        <div className="rounded border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
          No company matches the current research filters. Switch to All companies or Insufficient data
          to distinguish a genuinely weak setup from missing fundamentals.
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {rows.map(({ candidate, conviction }, index) => (
            <article
              key={candidate.assetId}
              className={cn(
                "rounded-md border bg-background/25 p-3",
                conviction.tier === "priority"
                  ? "border-[var(--positive)]/45"
                  : conviction.tier === "qualified"
                    ? "border-primary/40"
                    : "border-[var(--warning)]/35",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-[9px] text-muted-foreground">#{index + 1}</div>
                  <Link
                    to="/security/$symbol"
                    params={{ symbol: candidate.symbol }}
                    className="text-sm font-semibold hover:underline"
                  >
                    {candidate.symbol}
                  </Link>
                  <div className="truncate text-[9px] text-muted-foreground">{candidate.name}</div>
                </div>
                <TierBadge tier={conviction.tier} />
              </div>
              <div className="mt-3 flex items-end justify-between gap-2">
                <div>
                  <div className="font-mono text-2xl font-semibold tabular-nums">
                    {conviction.score.toFixed(0)}
                  </div>
                  <div className="text-[9px] text-muted-foreground">conviction score</div>
                </div>
                <div className="text-right text-[9px] text-muted-foreground">
                  {conviction.confirmingCount}/{conviction.availableCount} lenses confirm
                  <br />
                  {conviction.coverage.toFixed(0)}% evidence coverage
                </div>
              </div>
              <div className="mt-2 min-h-10 text-[10px] leading-relaxed text-muted-foreground">
                {conviction.confirmations.slice(0, 2).join(" · ") || "No lens has crossed confirmation yet."}
              </div>
              <div className="mt-2 flex min-h-7 flex-wrap gap-1">
                <ResearchCaseBadges cases={conviction.researchCases} />
              </div>
              <div className="mt-2 border-t border-border/45 pt-2 text-[9px] leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Next proof: </span>
                {conviction.nextProof[0] ?? "Review the latest filing and guidance."}
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[9px] text-[var(--warning)]">
                  {conviction.warnings.length} warning{conviction.warnings.length === 1 ? "" : "s"}
                </span>
                <CandidateBasisDialog candidate={candidate} conviction={conviction} />
              </div>
            </article>
          ))}
        </div>
      )}
    </DashboardPanel>
  );
}

function ConvictionTable({ rows }: { rows: RankedCandidateV2[] }) {
  if (rows.length === 0) {
    return <div className="p-10 text-center text-xs text-muted-foreground">No companies match these filters.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1460px] border-collapse text-left text-[11px]">
        <thead>
          <tr className="border-b border-border/70 text-[9px] uppercase tracking-wider text-muted-foreground">
            <th className="px-2 py-2 font-medium">Rank</th>
            <th className="px-2 py-2 font-medium">Company</th>
            <th className="px-2 py-2 font-medium">Tier</th>
            <th className="px-2 py-2 font-medium">Research case</th>
            <th className="px-2 py-2 text-right font-medium">Conviction</th>
            <th className="px-2 py-2 text-right font-medium">Agreement</th>
            <th className="px-2 py-2 text-right font-medium">Coverage</th>
            <th className="px-2 py-2 text-right font-medium">Valuation</th>
            <th className="px-2 py-2 text-right font-medium">Quality</th>
            <th className="px-2 py-2 text-right font-medium">F-Score</th>
            <th className="px-2 py-2 text-right font-medium">Magic</th>
            <th className="px-2 py-2 text-right font-medium">Dislocation</th>
            <th className="px-2 py-2 text-right font-medium">Impairment</th>
            <th className="px-2 py-2 font-medium">Basis</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ candidate, conviction }, index) => {
            const piotroski = candidate.fundamentalModels.piotroski;
            const magic = candidate.fundamentalModels.magicFormula;
            return (
              <tr
                key={candidate.assetId}
                className={cn(
                  "border-b border-border/45 transition-colors hover:bg-muted/35",
                  conviction.tier === "priority" && "bg-[var(--positive)]/[0.035]",
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
                  <div className="max-w-56 truncate text-[9px] text-muted-foreground">
                    {candidate.name} · {candidate.industryName ?? "Unmapped industry"}
                  </div>
                </td>
                <td className="px-2 py-2"><TierBadge tier={conviction.tier} /></td>
                <td className="px-2 py-2"><ResearchCaseBadges cases={conviction.researchCases} /></td>
                <ScoreCell value={conviction.score} />
                <td className="px-2 py-2 text-right font-mono tabular-nums">
                  {conviction.agreement.toFixed(0)}%
                  <div className="text-[8px] text-muted-foreground">
                    {conviction.confirmingCount}/{conviction.availableCount}
                  </div>
                </td>
                <td className="px-2 py-2 text-right font-mono tabular-nums">{conviction.coverage.toFixed(0)}%</td>
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
                <td className={cn("px-2 py-2 text-right font-mono tabular-nums", riskTone(candidate.evidence.impairmentRisk?.value ?? null))}>
                  {candidate.evidence.impairmentRisk?.value?.toFixed(0) ?? "—"}
                </td>
                <td className="px-2 py-2"><CandidateBasisDialog candidate={candidate} conviction={conviction} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CandidateBasisDialog({
  candidate,
  conviction,
}: {
  candidate: OpportunityCandidate;
  conviction: ConvictionV2Result;
}) {
  const horizon = candidate.horizons.one_to_three;
  const piotroski = candidate.fundamentalModels.piotroski;
  const magic = candidate.fundamentalModels.magicFormula;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[10px]">
          <Eye className="h-3 w-3" /> Basis
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] w-[min(96vw,1120px)] max-w-none overflow-y-auto">
        <DialogHeader className="border-b border-border/60 pb-3 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono">{candidate.symbol}</Badge>
            <TierBadge tier={conviction.tier} />
            <ResearchCaseBadges cases={conviction.researchCases} />
          </div>
          <DialogTitle>{candidate.name}</DialogTitle>
          <DialogDescription>
            {candidate.industryName ?? "Unmapped industry"} · {candidate.exchange ?? "Unknown exchange"} · practical research priority, not a recommendation
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <Metric label="Conviction" value={conviction.score} />
          <Metric label="Agreement" value={conviction.agreement} suffix="%" />
          <Metric label="Coverage" value={conviction.coverage} suffix="%" />
          <Metric label="Core model" value={horizon.score} />
          <Metric label="Impairment" value={candidate.evidence.impairmentRisk?.value ?? null} inverse />
          <Metric label="Data confidence" value={horizon.dataConfidence} suffix="%" />
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <BasisColumn title="Why it qualifies" items={conviction.confirmations} positive />
          <BasisColumn title="Warnings and contradictions" items={conviction.warnings} />
          <BasisColumn title="Evidence required next" items={conviction.nextProof} />
        </div>

        {conviction.hardRisks.length > 0 && (
          <div className="rounded-md border border-[var(--negative)]/45 bg-[var(--negative)]/5 p-3">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--negative)]">Hard risks</div>
            <ul className="mt-2 space-y-1.5 text-[10px]">
              {conviction.hardRisks.map((item) => <li key={item}>› {item}</li>)}
            </ul>
          </div>
        )}

        <ResearchNarrative
          summary={candidate.narrative.summary}
          detail={candidate.narrative.detail}
          watch={candidate.narrative.watch}
          asOf={candidate.priceAsOf}
          confidence={horizon.dataConfidence}
        />

        <div className="grid gap-3 lg:grid-cols-2">
          <DashboardPanel
            title="Independent conviction lenses"
            description="The practical score is weighted across the evidence that is actually available."
            expandable={false}
          >
            <div className="space-y-3">
              {conviction.lenses.map((lens) => (
                <div key={lens.key}>
                  <div className="mb-1 flex items-center justify-between text-[10px]">
                    <InfoTip label={lens.label} explanation={`Weight ${lens.weight.toFixed(1)}. Confirmation status: ${lens.confirms ? "yes" : "no"}.`} />
                    <span className="font-mono text-muted-foreground">{lens.score.toFixed(0)}</span>
                  </div>
                  <BandBar value={lens.score} />
                </div>
              ))}
            </div>
          </DashboardPanel>

          <DashboardPanel
            title="Piotroski and Magic Formula"
            description="These models now directly affect the practical shortlist."
            expandable={false}
          >
            <div className="grid grid-cols-2 gap-2">
              <SmallMetric
                label="Piotroski"
                value={
                  piotroski.state === "complete"
                    ? `${piotroski.score}/9`
                    : piotroski.state === "partial"
                      ? `${piotroski.provisionalScore ?? 0}/${piotroski.availableTests}`
                      : "—"
                }
              />
              <SmallMetric label="Piotroski coverage" value={`${piotroski.coverage.toFixed(0)}%`} />
              <SmallMetric
                label="Magic universe"
                value={magic.state === "ranked" ? `${magic.universePercentile?.toFixed(0) ?? "—"}th` : "—"}
              />
              <SmallMetric
                label="Magic industry"
                value={magic.state === "ranked" ? `${magic.industryPercentile?.toFixed(0) ?? "—"}th` : "—"}
              />
            </div>
            {piotroski.tests.length > 0 && (
              <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {piotroski.tests.map((test) => (
                  <div key={test.key} className="flex items-center gap-2 rounded border border-border/55 p-2 text-[9px]">
                    {test.passed === true ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--positive)]" />
                    ) : test.passed === false ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-[var(--warning)]" />
                    ) : (
                      <span className="h-3.5 w-3.5 rounded-full border border-border" />
                    )}
                    <span>{test.label}</span>
                  </div>
                ))}
              </div>
            )}
          </DashboardPanel>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BasisColumn({ title, items, positive = false }: { title: string; items: string[]; positive?: boolean }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/15 p-3">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      {items.length === 0 ? (
        <div className="mt-2 text-[10px] text-muted-foreground">No item recorded.</div>
      ) : (
        <ul className="mt-2 space-y-1.5 text-[10px] leading-relaxed">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              {positive ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--positive)]" />
              ) : (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--warning)]" />
              )}
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
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

function MethodCard({ title, items, positive = false }: { title: string; items: string[]; positive?: boolean }) {
  return (
    <div className="rounded-md border border-border/70 bg-card/30 p-3">
      <div className="text-xs font-semibold">{title}</div>
      <div className="mt-2 space-y-1.5">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-2 text-[10px] leading-relaxed text-muted-foreground">
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

function ResearchCaseBadges({ cases }: { cases: ResearchCaseV2[] }) {
  if (cases.length === 0) {
    return <Badge variant="outline" className="text-[8px] text-muted-foreground">NO CASE</Badge>;
  }
  return (
    <div className="flex max-w-72 flex-wrap gap-1">
      {cases.slice(0, 3).map((researchCase) => (
        <Badge key={researchCase} variant="outline" className="px-1.5 py-0 text-[8px]">
          {caseLabel(researchCase)}
        </Badge>
      ))}
      {cases.length > 3 && (
        <Badge variant="outline" className="px-1.5 py-0 text-[8px] text-muted-foreground">+{cases.length - 3}</Badge>
      )}
    </div>
  );
}

function TierBadge({ tier }: { tier: ResearchTierV2 }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "whitespace-nowrap px-1.5 py-0 text-[8px]",
        tier === "priority" && "border-[var(--positive)]/50 bg-[var(--positive)]/8 text-[var(--positive)]",
        tier === "qualified" && "border-primary/50 text-primary",
        tier === "watch" && "border-[var(--warning)]/45 text-[var(--warning)]",
        tier === "avoid" && "border-[var(--negative)]/45 text-[var(--negative)]",
        tier === "insufficient" && "text-muted-foreground",
      )}
    >
      {tierLabel(tier)}
    </Badge>
  );
}

function Metric({ label, value, suffix = "", inverse = false }: { label: string; value: number | null; suffix?: string; inverse?: boolean }) {
  return (
    <div className="rounded border border-border/65 bg-card/40 p-2.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-mono text-lg font-semibold", inverse ? riskTone(value) : scoreTone(value))}>
        {value === null ? "—" : `${value.toFixed(0)}${suffix}`}
      </div>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/60 bg-muted/20 p-2">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xs font-semibold">{value}</div>
    </div>
  );
}

function ScoreCell({ value }: { value: number | null }) {
  return <td className={cn("px-2 py-2 text-right font-mono tabular-nums", scoreTone(value))}>{value?.toFixed(0) ?? "—"}</td>;
}

function countTiers(rows: RankedCandidateV2[]): Record<ResearchTierV2, number> {
  const counts: Record<ResearchTierV2, number> = {
    priority: 0,
    qualified: 0,
    watch: 0,
    avoid: 0,
    insufficient: 0,
  };
  for (const row of rows) counts[row.conviction.tier] += 1;
  return counts;
}

function matchesMarket(countryCode: string, market: MarketFilter): boolean {
  if (market === "all") return true;
  if (market === "US") return countryCode === "US";
  if (market === "UK") return countryCode === "GB" || countryCode === "UK";
  return EU_CODES.has(countryCode);
}

function caseLabel(researchCase: ResearchCaseV2): string {
  const labels: Record<ResearchCaseV2, string> = {
    broken_stock: "BROKEN STOCK",
    improving_value: "IMPROVING VALUE",
    quality_value: "QUALITY VALUE",
    fundamental_inflection: "INFLECTION",
    multi_model_value: "MULTI-MODEL",
    cash_backed_value: "CASH-BACKED",
  };
  return labels[researchCase];
}

function tierLabel(tier: ResearchTierV2): string {
  const labels: Record<ResearchTierV2, string> = {
    priority: "PRIORITY RESEARCH",
    qualified: "QUALIFIED",
    watch: "WATCH",
    avoid: "AVOID",
    insufficient: "INSUFFICIENT",
  };
  return labels[tier];
}

function scoreTone(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  if (value >= 66) return "text-[var(--positive)]";
  if (value < 40) return "text-[var(--negative)]";
  return "text-foreground";
}

function riskTone(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  if (value <= 40) return "text-[var(--positive)]";
  if (value >= 65) return "text-[var(--negative)]";
  return "text-[var(--warning)]";
}
