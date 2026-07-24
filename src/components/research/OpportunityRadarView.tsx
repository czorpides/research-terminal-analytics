import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FlaskConical,
  Maximize2,
  Search,
  ShieldCheck,
} from "lucide-react";
import {
  CartesianGrid,
  Cell,
  ReferenceArea,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  HORIZON_CONFIGS,
  classificationLabel,
  type InvestmentHorizon,
  type OpportunityClassification,
  type OpportunityHorizonScore,
  type OpportunityModelState,
} from "@/lib/opportunity/model";
import type {
  OpportunityCandidate,
  OpportunityRadarWorkspace,
} from "@/lib/opportunity/workspace.functions";
import type { RegimeMonitorPayload } from "@/lib/panels/regime.functions";
import { BandBar, InfoTip, ResearchNarrative } from "./ResearchContext";
import { DashboardGrid, DashboardPanel } from "./DashboardPanel";

const HORIZONS: InvestmentHorizon[] = ["one_to_three", "three_to_five", "five_to_ten"];

export function OpportunityRadarView({
  workspace,
  regime,
}: {
  workspace: OpportunityRadarWorkspace;
  regime: RegimeMonitorPayload;
}) {
  const [horizon, setHorizon] = useState<InvestmentHorizon>("one_to_three");
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<OpportunityModelState | "all">("all");
  const summary =
    workspace.horizonSummaries.find((item) => item.horizon === horizon) ??
    workspace.horizonSummaries[0];
  const candidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return workspace.candidates
      .filter((candidate) => {
        if (
          needle &&
          !`${candidate.symbol} ${candidate.name} ${candidate.industryName ?? ""}`
            .toLowerCase()
            .includes(needle)
        ) {
          return false;
        }
        return stateFilter === "all" || candidate.horizons[horizon].modelState === stateFilter;
      })
      .sort(
        (left, right) =>
          right.horizons[horizon].researchPriority - left.horizons[horizon].researchPriority,
      );
  }, [horizon, query, stateFilter, workspace.candidates]);

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/5 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" />
          <div>
            <div className="text-xs font-semibold">Shadow model, strict evidence gates active</div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              {workspace.modelNote} The current universe contains {workspace.universe.loaded} of{" "}
              {workspace.universe.activeEquities} active equities
              {workspace.universe.truncated
                ? `, capped at ${workspace.universe.cap} for this trial`
                : ""}
              .
            </p>
          </div>
        </div>
      </div>

      <DashboardGrid columns={4}>
        <SummaryTile
          label="Tracked equities"
          value={workspace.universe.loaded}
          detail={workspace.universe.truncated ? "Trial cap reached" : "Full tracked set loaded"}
          explanation="This is the database universe currently being assessed, not every listed company worldwide."
        />
        <SummaryTile
          label="Research candidates"
          value={summary?.candidates ?? 0}
          detail={summary?.label ?? "1–3 years"}
          explanation="Names whose preliminary classification merits research. This count can include shadow results."
        />
        <SummaryTile
          label="Production eligible"
          value={summary?.eligible ?? 0}
          detail="All critical gates must pass"
          explanation="Requires a score of at least 70, confidence of at least 70, low impairment risk and every critical input observed rather than proxied."
        />
        <SummaryTile
          label="Median confidence"
          value={`${summary?.medianConfidence.toFixed(0) ?? "0"}%`}
          detail={`Through ${formatDate(workspace.asOf)}`}
          explanation="Falls when inputs are missing, stale, proxy-only or unsupported by a sector-specific model."
        />
      </DashboardGrid>

      <DashboardGrid columns={2}>
        <DashboardPanel
          eyebrow="Systematic cross-check"
          title="Current US macro setting"
          description="Macro context is visible, but cannot silently alter the equity score."
          expandedChildren={<MacroDetail regime={regime} />}
        >
          <MacroDetail regime={regime} compact />
        </DashboardPanel>
        <DashboardPanel
          eyebrow="Operating cadence"
          title={summary?.label ?? "1–3 years"}
          description={summary?.description}
        >
          <div className="grid grid-cols-3 gap-2">
            <SmallMetric label="Refresh" value={summary?.refresh ?? "—"} />
            <SmallMetric label="Shadow" value={String(summary?.shadow ?? 0)} />
            <SmallMetric label="Blocked" value={String(summary?.blocked ?? 0)} />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            One evidence engine supplies all horizons. The weights and minimum history change, so
            the platform does not duplicate raw data or run three independent ingestion systems.
          </p>
        </DashboardPanel>
      </DashboardGrid>

      <Tabs
        value={horizon}
        onValueChange={(value) => setHorizon(value as InvestmentHorizon)}
        className="space-y-3"
      >
        <TabsList className="grid h-auto w-full grid-cols-3 bg-muted/55 p-1">
          {HORIZONS.map((item) => (
            <TabsTrigger key={item} value={item} className="h-10 text-xs">
              <span className="flex items-center gap-1.5">
                {HORIZON_CONFIGS[item].label}
                {HORIZON_CONFIGS[item].experimental && (
                  <Badge variant="outline" className="px-1 py-0 text-[8px]">
                    EXP
                  </Badge>
                )}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {HORIZONS.map((item) => (
          <TabsContent key={item} value={item} className="space-y-3">
            <DashboardPanel
              eyebrow="Dislocation map"
              title="Price damage versus permanent impairment risk"
              description="The most interesting area is the green upper-left: heavy share-price damage, low estimated business impairment."
              equalHeight={false}
              bodyClassName="h-[330px]"
              expandedChildren={
                <div className="h-[68vh] min-h-[520px]">
                  <OpportunityScatter candidates={workspace.candidates} horizon={item} />
                </div>
              }
            >
              <OpportunityScatter candidates={workspace.candidates} horizon={item} />
            </DashboardPanel>

            <DashboardPanel
              eyebrow="Ranked evidence"
              title={`${HORIZON_CONFIGS[item].label} results`}
              description={`${HORIZON_CONFIGS[item].scoreLabel}, impairment, company-specific damage and confidence shown separately.`}
              equalHeight={false}
              expandedChildren={<CandidateTable candidates={candidates} horizon={item} expanded />}
              actions={
                <Badge variant="outline" className="font-mono text-[9px]">
                  {candidates.length} shown
                </Badge>
              }
            >
              <div className="mb-3 flex flex-col gap-2 sm:flex-row">
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
                  value={stateFilter}
                  onChange={(event) =>
                    setStateFilter(event.target.value as OpportunityModelState | "all")
                  }
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  aria-label="Filter by model state"
                >
                  <option value="all">All model states</option>
                  <option value="eligible">Production eligible</option>
                  <option value="shadow">Shadow</option>
                  <option value="experimental">Experimental</option>
                  <option value="blocked">Sector model blocked</option>
                </select>
              </div>
              <CandidateTable candidates={candidates} horizon={item} />
            </DashboardPanel>
          </TabsContent>
        ))}
      </Tabs>

      <DashboardGrid columns={2}>
        <DashboardPanel
          eyebrow="Coverage"
          title="Market activation gates"
          description="Coverage expands only after each market passes the same point-in-time quality tests."
          expandedChildren={<CoverageTable workspace={workspace} expanded />}
        >
          <CoverageTable workspace={workspace} />
        </DashboardPanel>
        <DashboardPanel
          eyebrow="Evidence"
          title="Capability audit"
          description="What the model can use today, and what remains deliberately excluded."
          expandedChildren={<CapabilityTable workspace={workspace} expanded />}
        >
          <CapabilityTable workspace={workspace} />
        </DashboardPanel>
      </DashboardGrid>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  detail,
  explanation,
}: {
  label: string;
  value: string | number;
  detail: string;
  explanation: string;
}) {
  return (
    <DashboardPanel title={label} description={explanation} expandable={false}>
      <div className="font-mono text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-[10px] text-muted-foreground">{detail}</div>
    </DashboardPanel>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/60 bg-muted/25 p-2">
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xs font-semibold">{value}</div>
    </div>
  );
}

function MacroDetail({
  regime,
  compact = false,
}: {
  regime: RegimeMonitorPayload;
  compact?: boolean;
}) {
  const label = regime.current.label.replaceAll("_", " ");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-lg font-semibold capitalize">{label}</div>
          <div className="text-[10px] text-muted-foreground">
            Rules-based regime · {regime.current.confidence}% confidence
          </div>
        </div>
        <StateBadge state={regime.current.label === "insufficient" ? "blocked" : "shadow"} />
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {Object.entries(regime.inputs).map(([key, value]) => (
          <SmallMetric
            key={key}
            label={plainLabel(key)}
            value={value === null ? "—" : value.toFixed(2)}
          />
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        This regime helps explain whether pressure is widespread. It remains context-only for
        individual stocks until the platform can estimate each company’s rate, currency, commodity,
        market and style exposure without look-ahead bias.
      </p>
      {!compact && (
        <div className="rounded border border-border/60 bg-muted/20 p-3 text-[11px] leading-relaxed">
          <strong>Why this matters:</strong> a share fall is not genuinely company-specific simply
          because its peers fell less. The production model must also remove the return expected
          from the country, equity factors and relevant macro shocks. Until that layer is validated,
          the idiosyncrasy figure is clearly marked as a proxy.
        </div>
      )}
    </div>
  );
}

interface ScatterDatum {
  x: number;
  y: number;
  z: number;
  symbol: string;
  name: string;
  score: number;
  confidence: number;
  classification: OpportunityClassification;
  modelState: OpportunityModelState;
}

function OpportunityScatter({
  candidates,
  horizon,
}: {
  candidates: OpportunityCandidate[];
  horizon: InvestmentHorizon;
}) {
  const points: ScatterDatum[] = candidates.flatMap((candidate) => {
    const damage = candidate.evidence.priceDislocation?.value;
    const impairment = candidate.evidence.impairmentRisk?.value;
    const result = candidate.horizons[horizon];
    if (
      damage === null ||
      damage === undefined ||
      impairment === null ||
      impairment === undefined
    ) {
      return [];
    }
    return [
      {
        x: impairment,
        y: damage,
        z: Math.max(40, result.researchPriority),
        symbol: candidate.symbol,
        name: candidate.name,
        score: result.score,
        confidence: result.dataConfidence,
        classification: result.classification,
        modelState: result.modelState,
      },
    ];
  });

  if (points.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded border border-dashed border-border text-xs text-muted-foreground">
        No candidates have enough price and fundamental evidence to plot.
      </div>
    );
  }
  return (
    <div className="h-full min-h-[270px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 12, bottom: 10, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.45} />
          <ReferenceArea
            x1={0}
            x2={30}
            y1={60}
            y2={100}
            fill="var(--positive)"
            fillOpacity={0.08}
          />
          <ReferenceArea
            x1={50}
            x2={100}
            y1={50}
            y2={100}
            fill="var(--negative)"
            fillOpacity={0.08}
          />
          <ReferenceArea
            x1={30}
            x2={50}
            y1={60}
            y2={100}
            fill="var(--warning)"
            fillOpacity={0.06}
          />
          <XAxis
            type="number"
            dataKey="x"
            domain={[0, 100]}
            tick={{ fontSize: 9 }}
            label={{
              value: "Permanent impairment risk →",
              position: "insideBottom",
              offset: -5,
              fontSize: 9,
            }}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={[0, 100]}
            tick={{ fontSize: 9 }}
            label={{ value: "Price damage →", angle: -90, position: "insideLeft", fontSize: 9 }}
          />
          <ZAxis type="number" dataKey="z" range={[45, 190]} />
          <RechartsTooltip cursor={{ strokeDasharray: "3 3" }} content={<ScatterTooltip />} />
          <Scatter data={points}>
            {points.map((point) => (
              <Cell
                key={`${point.symbol}-${horizon}`}
                fill={classificationColour(point.classification)}
                fillOpacity={point.modelState === "blocked" ? 0.35 : 0.82}
                stroke="var(--background)"
                strokeWidth={1}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function ScatterTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ScatterDatum }>;
}) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0].payload;
  return (
    <div className="min-w-52 rounded-md border border-border bg-popover p-2.5 text-popover-foreground shadow-lg">
      <div className="font-semibold">
        {point.symbol} · {point.name}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px]">
        <span className="text-muted-foreground">Price damage</span>
        <span className="text-right">{point.y.toFixed(1)}</span>
        <span className="text-muted-foreground">Impairment risk</span>
        <span className="text-right">{point.x.toFixed(1)}</span>
        <span className="text-muted-foreground">Horizon score</span>
        <span className="text-right">{point.score.toFixed(1)}</span>
        <span className="text-muted-foreground">Confidence</span>
        <span className="text-right">{point.confidence.toFixed(0)}%</span>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        {classificationLabel(point.classification)} · {plainLabel(point.modelState)}
      </div>
    </div>
  );
}

function CandidateTable({
  candidates,
  horizon,
  expanded = false,
}: {
  candidates: OpportunityCandidate[];
  horizon: InvestmentHorizon;
  expanded?: boolean;
}) {
  const rows = candidates.slice(0, expanded ? 200 : 50);
  if (rows.length === 0) {
    return (
      <div className="rounded border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
        No companies match the current filters.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1060px] border-collapse text-left text-[11px]">
        <thead>
          <tr className="border-b border-border/70 text-[9px] uppercase tracking-wider text-muted-foreground">
            <th className="px-2 py-2 font-medium">Rank</th>
            <th className="px-2 py-2 font-medium">Company</th>
            <th className="px-2 py-2 font-medium">Classification</th>
            <th className="px-2 py-2 text-right font-medium">
              <InfoTip label={HORIZON_CONFIGS[horizon].scoreLabel} />
            </th>
            <th className="px-2 py-2 text-right font-medium">
              <InfoTip
                label="Research priority"
                explanation="Horizon score adjusted down for weak confidence and permanent impairment risk."
              />
            </th>
            <th className="px-2 py-2 text-right font-medium">
              <InfoTip label="Price damage" />
            </th>
            <th className="px-2 py-2 text-right font-medium">
              <InfoTip label="Impairment risk" />
            </th>
            <th className="px-2 py-2 text-right font-medium">
              <InfoTip label="Idiosyncrasy" />
            </th>
            <th className="px-2 py-2 text-right font-medium">
              <InfoTip label="Confidence" />
            </th>
            <th className="px-2 py-2 font-medium">State</th>
            <th className="px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((candidate, index) => {
            const result = candidate.horizons[horizon];
            return (
              <tr
                key={candidate.assetId}
                className="border-b border-border/45 transition-colors hover:bg-muted/35"
              >
                <td className="px-2 py-2 font-mono text-muted-foreground">{index + 1}</td>
                <td className="px-2 py-2">
                  <div className="font-semibold">{candidate.symbol}</div>
                  <div className="max-w-48 truncate text-[9px] text-muted-foreground">
                    {candidate.name} · {candidate.industryName ?? "Unmapped industry"}
                  </div>
                </td>
                <td className="px-2 py-2">
                  <ClassificationBadge classification={result.classification} />
                </td>
                <td
                  className={cn(
                    "px-2 py-2 text-right font-mono tabular-nums",
                    scoreTone(result.score),
                  )}
                >
                  {result.score.toFixed(1)}
                </td>
                <td className="px-2 py-2 text-right font-mono tabular-nums">
                  {result.researchPriority.toFixed(1)}
                </td>
                <td className="px-2 py-2 text-right font-mono tabular-nums">
                  {candidate.evidence.priceDislocation?.value?.toFixed(1) ?? "—"}
                </td>
                <td
                  className={cn(
                    "px-2 py-2 text-right font-mono tabular-nums",
                    candidate.evidence.impairmentRisk?.value == null
                      ? "text-muted-foreground"
                      : riskTone(candidate.evidence.impairmentRisk.value),
                  )}
                >
                  {candidate.evidence.impairmentRisk?.value?.toFixed(1) ?? "—"}
                </td>
                <td className="px-2 py-2 text-right font-mono tabular-nums">
                  {candidate.evidence.idiosyncrasy?.value?.toFixed(1) ?? "—"}
                </td>
                <td className="px-2 py-2 text-right font-mono tabular-nums">
                  {result.dataConfidence.toFixed(0)}%
                </td>
                <td className="px-2 py-2">
                  <StateBadge state={result.modelState} />
                </td>
                <td className="px-2 py-2 text-right">
                  <CandidateDialog candidate={candidate} horizon={horizon} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!expanded && candidates.length > rows.length && (
        <div className="pt-2 text-center text-[10px] text-muted-foreground">
          Showing the first {rows.length} results. Use Expand to view the full filtered set.
        </div>
      )}
    </div>
  );
}

function CandidateDialog({
  candidate,
  horizon,
}: {
  candidate: OpportunityCandidate;
  horizon: InvestmentHorizon;
}) {
  const result = candidate.horizons[horizon];
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[10px]">
          <Maximize2 className="h-3 w-3" />
          Open
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] w-[min(96vw,1120px)] max-w-none overflow-y-auto">
        <DialogHeader className="border-b border-border/60 pb-3 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono">
              {candidate.symbol}
            </Badge>
            <ClassificationBadge classification={result.classification} />
            <StateBadge state={result.modelState} />
          </div>
          <DialogTitle>{candidate.name}</DialogTitle>
          <DialogDescription>
            {HORIZON_CONFIGS[horizon].label} · {candidate.industryName ?? "Unmapped industry"} ·{" "}
            {candidate.exchange ?? "Unknown exchange"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <DetailMetric label={result.scoreLabel} value={result.score} />
          <DetailMetric label="Research priority" value={result.researchPriority} />
          <DetailMetric
            label="Impairment risk"
            value={candidate.evidence.impairmentRisk?.value ?? null}
            inverse
          />
          <DetailMetric
            label="Idiosyncrasy"
            value={candidate.evidence.idiosyncrasy?.value ?? null}
          />
          <DetailMetric label="Data confidence" value={result.dataConfidence} />
        </div>

        <ResearchNarrative
          summary={candidate.narrative.summary}
          detail={candidate.narrative.detail}
          watch={candidate.narrative.watch}
          asOf={candidate.priceAsOf}
          confidence={result.dataConfidence}
        />

        <div className="grid gap-3 lg:grid-cols-2">
          <DashboardPanel
            title="Score components"
            description="Missing inputs are held at neutral in the preliminary score and reduce confidence to zero for their weight."
            expandable={false}
          >
            <div className="space-y-3">
              {result.components.map((component) => (
                <div key={component.key}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-[10px]">
                    <InfoTip label={component.label} explanation={component.detail} />
                    <span className="font-mono text-muted-foreground">
                      {component.value.toFixed(0)} · {component.weight}% · {component.status}
                    </span>
                  </div>
                  <BandBar value={component.value} />
                </div>
              ))}
            </div>
          </DashboardPanel>

          <DashboardPanel
            title="Evidence and blockers"
            description="The model cannot promote a result until every critical item is directly observed."
            expandable={false}
          >
            <div className="space-y-3">
              <EvidenceList title="Supporting evidence" items={result.positives} positive />
              <EvidenceList title="Risks and missing evidence" items={result.risks} />
              <div className="rounded border border-border/60 bg-muted/20 p-2 text-[10px] leading-relaxed text-muted-foreground">
                <strong className="text-foreground">Macro control:</strong>{" "}
                {candidate.macroControl.detail}
              </div>
              <div className="font-mono text-[9px] text-muted-foreground">
                {result.calcVersion} · coverage {result.evidenceCoverage.toFixed(0)}%
              </div>
            </div>
          </DashboardPanel>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailMetric({
  label,
  value,
  inverse = false,
}: {
  label: string;
  value: number | null;
  inverse?: boolean;
}) {
  return (
    <div className="rounded-md border border-border/70 bg-card/70 p-3">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
        <InfoTip label={label} />
      </div>
      <div
        className={cn(
          "mt-1 font-mono text-xl font-semibold tabular-nums",
          value === null ? "text-muted-foreground" : inverse ? riskTone(value) : scoreTone(value),
        )}
      >
        {value === null ? "—" : value.toFixed(1)}
      </div>
    </div>
  );
}

function EvidenceList({
  title,
  items,
  positive = false,
}: {
  title: string;
  items: string[];
  positive?: boolean;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {items.length === 0 ? (
        <div className="text-[10px] text-muted-foreground">No directly observed item yet.</div>
      ) : (
        <ul className="space-y-1.5 text-[11px]">
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

function CoverageTable({
  workspace,
  expanded = false,
}: {
  workspace: OpportunityRadarWorkspace;
  expanded?: boolean;
}) {
  const rows = expanded ? workspace.coverage : workspace.coverage.slice(0, 3);
  return (
    <div className="space-y-2">
      {rows.map((item) => (
        <div key={item.code} className="rounded border border-border/60 bg-muted/20 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold">
              {item.market}{" "}
              <span className="font-mono text-[9px] text-muted-foreground">{item.code}</span>
            </div>
            <StateBadge state={item.state === "shadow" ? "shadow" : "blocked"} label={item.state} />
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            {item.trackedAssets} tracked · {item.available}
          </div>
          <div className="mt-1 text-[10px] text-[var(--warning)]">Missing: {item.missing}</div>
          {expanded && (
            <div className="mt-1.5 text-[10px] leading-relaxed">
              <strong>Activation rule:</strong> {item.activationRule}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CapabilityTable({
  workspace,
  expanded = false,
}: {
  workspace: OpportunityRadarWorkspace;
  expanded?: boolean;
}) {
  const rows = expanded ? workspace.capabilities : workspace.capabilities.slice(0, 4);
  return (
    <div className="space-y-2">
      {rows.map((item) => (
        <div key={item.capability} className="rounded border border-border/60 bg-muted/20 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold">{item.capability}</div>
            <CapabilityBadge state={item.state} />
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">{item.currentUse}</div>
          {expanded && (
            <div className="mt-1.5 text-[10px] leading-relaxed">
              <strong>Production requirement:</strong> {item.productionRequirement}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ClassificationBadge({ classification }: { classification: OpportunityClassification }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "whitespace-nowrap text-[9px]",
        classification === "broken_stock" ||
          classification === "durable_candidate" ||
          classification === "quality_profile"
          ? "border-[var(--positive)]/45 text-[var(--positive)]"
          : classification === "possible_value_trap" || classification === "quality_risk"
            ? "border-[var(--negative)]/45 text-[var(--negative)]"
            : classification === "sector_washout" || classification === "recovery_watch"
              ? "border-[var(--warning)]/45 text-[var(--warning)]"
              : "text-muted-foreground",
      )}
    >
      {classificationLabel(classification)}
    </Badge>
  );
}

function StateBadge({ state, label }: { state: OpportunityModelState; label?: string }) {
  const icon =
    state === "eligible" ? (
      <ShieldCheck className="h-3 w-3" />
    ) : state === "shadow" ? (
      <Clock3 className="h-3 w-3" />
    ) : state === "experimental" ? (
      <FlaskConical className="h-3 w-3" />
    ) : (
      <AlertTriangle className="h-3 w-3" />
    );
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 whitespace-nowrap text-[9px]",
        state === "eligible"
          ? "border-[var(--positive)]/45 text-[var(--positive)]"
          : state === "blocked"
            ? "border-[var(--negative)]/45 text-[var(--negative)]"
            : "border-[var(--warning)]/45 text-[var(--warning)]",
      )}
    >
      {icon}
      {label ?? plainLabel(state)}
    </Badge>
  );
}

function CapabilityBadge({ state }: { state: "live" | "partial" | "missing" }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[9px]",
        state === "live"
          ? "border-[var(--positive)]/45 text-[var(--positive)]"
          : state === "partial"
            ? "border-[var(--warning)]/45 text-[var(--warning)]"
            : "border-[var(--negative)]/45 text-[var(--negative)]",
      )}
    >
      {plainLabel(state)}
    </Badge>
  );
}

function classificationColour(classification: OpportunityClassification): string {
  if (
    classification === "broken_stock" ||
    classification === "durable_candidate" ||
    classification === "quality_profile"
  ) {
    return "var(--positive)";
  }
  if (classification === "possible_value_trap" || classification === "quality_risk") {
    return "var(--negative)";
  }
  if (classification === "sector_washout" || classification === "recovery_watch") {
    return "var(--warning)";
  }
  return "var(--muted-foreground)";
}

function scoreTone(value: number): string {
  return value >= 70
    ? "text-[var(--positive)]"
    : value < 45
      ? "text-[var(--negative)]"
      : "text-[var(--warning)]";
}

function riskTone(value: number): string {
  return value < 30
    ? "text-[var(--positive)]"
    : value >= 50
      ? "text-[var(--negative)]"
      : "text-[var(--warning)]";
}

function plainLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date.toLocaleDateString();
}
