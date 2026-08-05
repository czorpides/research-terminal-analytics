import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  CalendarClock,
  CircleDollarSign,
  Gauge,
  LineChart,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  WalletCards,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { FUNDAMENTAL_METRICS } from "@/lib/ingestion/fundamentals/metrics";
import type { PresentedOpportunity } from "@/lib/opportunity/presentation";
import type {
  AdvancedPriceBar,
  AdvancedSecurityResearch,
  AdvancedStatementPeriod,
} from "@/lib/research/advanced-security.functions";
import { cn } from "@/lib/utils";
import { MetricHelp, type MetricGlossaryKey } from "./MetricHelp";

type ChartRange = "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y";

const RANGE_BARS: Record<ChartRange, number> = {
  "1M": 23,
  "3M": 66,
  "6M": 132,
  "1Y": 260,
  "3Y": 780,
  "5Y": 1300,
};

export function AdvancedSecurityResearchView({
  research,
  opportunity,
}: {
  research: AdvancedSecurityResearch;
  opportunity: PresentedOpportunity | null;
}) {
  const [range, setRange] = useState<ChartRange>("1Y");
  const candidate = opportunity?.candidate ?? null;
  const analysis = opportunity?.institutional ?? null;
  const raw = analysis?.rawMetrics ?? {};
  const f = research.fundamentals.values;
  const latestStatement = research.statements[0] ?? null;
  const previousStatement = research.statements[1] ?? null;

  const strengths = unique([
    ...(analysis?.strengths ?? []),
    ...(opportunity?.conviction.confirmations ?? []),
  ]).slice(0, 4);
  const risks = unique([
    ...(opportunity?.hardRisks ?? []),
    ...(analysis?.warnings ?? []),
    ...(opportunity?.warnings ?? []),
    ...(candidate?.narrative.watch ?? []),
  ]).slice(0, 5);
  const nextProof = unique([
    ...(analysis?.nextProof ?? []),
    opportunity?.discovery.bestRoute?.nextProof ?? null,
  ].filter((value): value is string => Boolean(value))).slice(0, 4);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.08] via-card/65 to-card/30 p-5 lg:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-3xl font-semibold tracking-tight">{research.identity.symbol}</span>
              <Badge variant="outline">{research.identity.exchange ?? "Exchange —"}</Badge>
              <Badge variant="outline">{research.identity.currency ?? "Currency —"}</Badge>
            </div>
            <h1 className="mt-1 text-xl text-muted-foreground">{research.identity.name}</h1>
            <div className="mt-2 text-sm text-muted-foreground">
              {[research.identity.industry, research.identity.country].filter(Boolean).join(" · ")}
            </div>
          </div>

          <div className="grid min-w-0 gap-3 sm:grid-cols-3 xl:min-w-[620px]">
            <HeaderMetric
              label="Last price"
              value={formatCurrency(research.price.current, research.identity.currency)}
              detail={research.price.latestDate ?? "No daily price"}
            />
            <HeaderMetric
              label="52-week drawdown"
              value={formatPct(research.price.drawdownFromHighPct)}
              detail={`High ${formatCurrency(research.price.high52, research.identity.currency)}`}
              tone={(research.price.drawdownFromHighPct ?? 0) <= -20 ? "warning" : "neutral"}
            />
            <HeaderMetric
              label="Radar assessment"
              value={opportunity ? `${opportunity.score.toFixed(0)} / 100` : "—"}
              detail={opportunity ? `${titleCase(opportunity.tier)} · ${opportunity.discovery.bestRoute?.label ?? "No route"}` : "Not currently ranked"}
              tone={opportunity?.tier === "priority" || opportunity?.tier === "qualified" ? "positive" : "neutral"}
              metric="radarScore"
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <ResearchSummary
          opportunity={opportunity}
          strengths={strengths}
          risks={risks}
          nextProof={nextProof}
        />
        <RecentDevelopmentsPlaceholder candidateSummary={candidate?.narrative.detail ?? null} />
      </section>

      <PriceContext research={research} range={range} setRange={setRange} />

      <section className="grid gap-4 xl:grid-cols-2">
        <SectionCard
          icon={CircleDollarSign}
          eyebrow="Valuation"
          title="What are you paying?"
          description="Current valuation multiples and cash-yield measures already stored by the platform."
        >
          <MetricGrid>
            <MetricTile label="Market cap" metric="marketCap" value={formatLarge(f[FUNDAMENTAL_METRICS.marketCap], research.identity.currency)} />
            <MetricTile label="P/E" metric="pe" value={formatMultiple(f[FUNDAMENTAL_METRICS.pe])} />
            <MetricTile label="Forward P/E" metric="forwardPe" value={formatMultiple(research.expectations?.forwardPe)} status={research.expectations ? undefined : "Awaiting verified estimate"} />
            <MetricTile label="EV / EBITDA" metric="evEbitda" value={formatMultiple(f[FUNDAMENTAL_METRICS.evEbitda])} />
            <MetricTile label="Price / Sales" metric="ps" value={formatMultiple(f[FUNDAMENTAL_METRICS.ps])} />
            <MetricTile label="Price / Book" metric="pb" value={formatMultiple(f[FUNDAMENTAL_METRICS.pb])} />
            <MetricTile label="FCF yield" metric="fcfYield" value={formatRatioPct(f[FUNDAMENTAL_METRICS.fcfYield])} />
            <MetricTile label="Enterprise value" metric="enterpriseValue" value={formatLarge(raw.enterpriseValue, research.identity.currency)} />
          </MetricGrid>
        </SectionCard>

        <SectionCard
          icon={Target}
          eyebrow="Analyst expectations"
          title="What does consensus expect?"
          description="Only verified structured analyst snapshots are shown. Missing values remain missing."
        >
          {research.expectations ? (
            <>
              <MetricGrid>
                <MetricTile label="12m target" metric="priceTarget" value={formatCurrency(research.expectations.targetConsensus, research.identity.currency)} />
                <MetricTile label="Implied upside" metric="targetUpside" value={formatPct(research.expectations.impliedTargetUpsidePct)} />
                <MetricTile label="Target high" value={formatCurrency(research.expectations.targetHigh, research.identity.currency)} />
                <MetricTile label="Target low" value={formatCurrency(research.expectations.targetLow, research.identity.currency)} />
                <MetricTile label="Forward EPS" value={formatNumber(research.expectations.fy1EpsAvg)} status={research.expectations.fy1Date ?? undefined} />
                <MetricTile label="Forward revenue" value={formatLarge(research.expectations.fy1RevenueAvg, research.identity.currency)} status={research.expectations.fy1Date ?? undefined} />
              </MetricGrid>
              <div className="mt-3 rounded-lg border border-border/60 bg-muted/10 p-3 text-xs leading-5 text-muted-foreground">
                Verified {formatDateTime(research.expectations.lastVerifiedAt)} · confidence {research.expectations.confidence.toFixed(0)}% · provider {research.expectations.provider.toUpperCase()}.
              </div>
            </>
          ) : (
            <UnavailableState text="No accepted analyst-estimate snapshot is stored for this company yet. Forward P/E, consensus target and forward earnings remain blank rather than being estimated." />
          )}
        </SectionCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <SectionCard
          icon={TrendingUp}
          eyebrow="Growth & profitability"
          title="Is the business improving?"
          description="Annual statement history and the institutional model's operating metrics."
        >
          <MetricGrid>
            <MetricTile label="Revenue growth" metric="revenueGrowth" value={formatRatioPct(raw.revenueGrowth)} />
            <MetricTile label="Revenue CAGR" value={formatRatioPct(raw.revenueCagr)} />
            <MetricTile label="Gross margin" metric="grossMargin" value={formatRatioPct(raw.grossMargin ?? f[FUNDAMENTAL_METRICS.grossMargin])} />
            <MetricTile label="Operating margin" metric="operatingMargin" value={formatRatioPct(raw.ebitMargin)} />
            <MetricTile label="Net margin" metric="netMargin" value={formatRatioPct(f[FUNDAMENTAL_METRICS.netMargin])} />
            <MetricTile label="FCF margin" metric="fcfMargin" value={formatRatioPct(raw.fcfMargin)} />
            <MetricTile label="ROIC" metric="roic" value={formatRatioPct(raw.roic ?? f[FUNDAMENTAL_METRICS.roic])} />
            <MetricTile label="ROIC - WACC" metric="roicWacc" value={formatRatioPct(raw.roicWaccSpread)} />
          </MetricGrid>
        </SectionCard>

        <SectionCard
          icon={WalletCards}
          eyebrow="Balance sheet & cash"
          title="Can the company fund the thesis?"
          description="Leverage, liquidity, cash generation and capital-allocation evidence."
        >
          <MetricGrid>
            <MetricTile label="Cash & investments" value={formatLarge(latestStatement?.cashAndInvestments, research.identity.currency)} />
            <MetricTile label="Total debt" value={formatLarge(latestStatement?.totalDebt, research.identity.currency)} />
            <MetricTile label="Net debt / EBITDA" metric="netDebtEbitda" value={formatMultiple(raw.netDebtEbitda)} />
            <MetricTile label="Debt / Equity" metric="debtEquity" value={formatMultiple(f[FUNDAMENTAL_METRICS.debtEquity])} />
            <MetricTile label="Current ratio" metric="currentRatio" value={formatMultiple(raw.currentRatio ?? f[FUNDAMENTAL_METRICS.currentRatio])} />
            <MetricTile label="Interest coverage" metric="interestCoverage" value={formatMultiple(raw.interestCoverage)} />
            <MetricTile label="Free cash flow" value={formatLarge(raw.fcf ?? latestStatement?.freeCashFlow, research.identity.currency)} />
            <MetricTile label="Beta" metric="beta" value={formatNumber(f[FUNDAMENTAL_METRICS.beta])} />
          </MetricGrid>
        </SectionCard>
      </section>

      <FinancialHistory statements={research.statements} currency={research.identity.currency} />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <SectionCard
          icon={Gauge}
          eyebrow="Research Terminal assessment"
          title="How our evidence scores the opportunity"
          description="These scores prioritise research. They are not price targets or automatic buy/sell signals."
        >
          <MetricGrid>
            <MetricTile label="Radar score" metric="radarScore" value={opportunity ? `${opportunity.score.toFixed(0)} / 100` : "—"} />
            <MetricTile label="Valuation" metric="valuationScore" value={scoreValue(candidate?.evidence.valuationCompression?.value)} />
            <MetricTile label="Quality" metric="qualityScore" value={scoreValue(candidate?.evidence.fundamentalResilience?.value)} />
            <MetricTile label="Price dislocation" metric="priceDislocation" value={scoreValue(candidate?.evidence.priceDislocation?.value)} />
            <MetricTile label="Recovery" metric="recoveryScore" value={scoreValue(candidate?.evidence.recoveryConfirmation?.value)} />
            <MetricTile label="Evidence coverage" metric="evidenceCoverage" value={opportunity ? `${opportunity.coverage.toFixed(0)}%` : "—"} />
          </MetricGrid>
          {analysis?.expectations && (
            <div className="mt-3 rounded-lg border border-border/60 bg-muted/10 p-3 text-xs leading-5 text-muted-foreground">
              Modelled WACC {formatRatioPct(analysis.expectations.modelledWacc)} · implied 5y FCFF growth {formatRatioPct(analysis.expectations.impliedFcffGrowth5y)} · historical revenue CAGR {formatRatioPct(analysis.expectations.historicalRevenueCagr)}.
            </div>
          )}
        </SectionCard>

        <SectionCard
          icon={BookOpenCheck}
          eyebrow="Institutional lenses"
          title="Everything the model is checking"
          description="Open each lens to see the actual financial metrics behind the score in normal finance terminology."
        >
          {analysis?.lenses.length ? (
            <div className="space-y-2">
              {analysis.lenses.map((lens) => (
                <details key={lens.key} className="rounded-lg border border-border/60 bg-background/25">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3">
                    <div>
                      <div className="text-sm font-semibold">{lens.label}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{lens.summary}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm font-semibold">{lens.score === null ? "—" : lens.score.toFixed(0)}</div>
                      <div className="text-[10px] text-muted-foreground">{lens.coverage.toFixed(0)}% covered</div>
                    </div>
                  </summary>
                  <div className="border-t border-border/50 p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {lens.metrics.map((metric) => (
                        <div key={metric.id} className="rounded-md border border-border/50 bg-muted/10 p-2.5">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium">{metric.label}</span>
                            <span className="font-mono">{metric.display}</span>
                          </div>
                          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{metric.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <UnavailableState text="The institutional statement model does not yet have enough annual filing evidence for this company." />
          )}
        </SectionCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <SectionCard
          icon={CalendarClock}
          eyebrow="Earnings"
          title="Recent earnings evidence"
          description="Stored earnings dates, estimates and surprises."
        >
          {research.earnings.length ? (
            <div className="space-y-2">
              {research.earnings.slice(0, 5).map((event) => (
                <div key={`${event.scheduledAt}-${event.periodEnd}`} className="flex items-center justify-between gap-3 rounded-lg border border-border/55 bg-muted/10 p-3 text-sm">
                  <div>
                    <div className="font-medium">{formatDate(event.scheduledAt)}</div>
                    <div className="text-xs text-muted-foreground">Period {event.periodEnd ?? "—"}</div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>EPS {formatNumber(event.actualEps)} vs {formatNumber(event.estimateEps)}</div>
                    <div className={cn("mt-0.5 font-semibold", (event.surprisePct ?? 0) >= 0 ? "text-[var(--positive)]" : "text-destructive")}>{formatPct(event.surprisePct)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : <UnavailableState text="No earnings-event history is stored for this company yet." />}
        </SectionCard>

        <SectionCard
          icon={ShieldCheck}
          eyebrow="Advanced"
          title="Data sources & audit"
          description="Provider mappings and timestamps stay available without dominating the investment screen."
        >
          <details className="rounded-lg border border-border/60 bg-muted/10">
            <summary className="cursor-pointer p-3 text-sm font-semibold">Open data and provider audit</summary>
            <div className="border-t border-border/50 p-3 text-xs leading-6 text-muted-foreground">
              <div>Fundamentals as of: {research.fundamentals.asOf ? formatDateTime(research.fundamentals.asOf) : "—"}</div>
              <div>Price as of: {research.price.latestDate ?? "—"}</div>
              <div className="mt-2 space-y-1">
                {research.providerMappings.map((mapping) => (
                  <div key={mapping.provider} className="flex justify-between gap-3">
                    <span>{mapping.provider.toUpperCase()} · {mapping.symbol}</span>
                    <span>{mapping.status}{mapping.lastVerifiedAt ? ` · ${formatDateTime(mapping.lastVerifiedAt)}` : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          </details>
        </SectionCard>
      </section>
    </div>
  );
}

function ResearchSummary({
  opportunity,
  strengths,
  risks,
  nextProof,
}: {
  opportunity: PresentedOpportunity | null;
  strengths: string[];
  risks: string[];
  nextProof: string[];
}) {
  return (
    <SectionCard
      icon={Sparkles}
      eyebrow="Investment snapshot"
      title="Why this company deserves attention"
      description="A concise research thesis first; the detailed evidence follows below."
    >
      <div className="rounded-xl border border-primary/25 bg-primary/[0.05] p-4 text-sm leading-6">
        {opportunity?.discovery.bestRoute?.thesis ?? opportunity?.candidate.narrative.detail ?? "The company is in the managed universe, but the Radar does not yet have enough evidence to form a credible thesis."}
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <PlainList title="What looks attractive" items={strengths} empty="No strong positive evidence is currently established." tone="positive" />
        <PlainList title="What concerns us" items={risks} empty="No major model warning is currently recorded." tone="negative" />
        <PlainList title="What needs proving" items={nextProof} empty="Review the latest filing, guidance and industry conditions." tone="warning" />
      </div>
    </SectionCard>
  );
}

function RecentDevelopmentsPlaceholder({ candidateSummary }: { candidateSummary: string | null }) {
  return (
    <SectionCard
      icon={Activity}
      eyebrow="Recent developments"
      title="Current affairs & AI research brief"
      description="This panel will contain source-linked current developments rather than generic sentiment."
    >
      <div className="rounded-xl border border-border/60 bg-muted/10 p-4 text-sm leading-6 text-muted-foreground">
        <div className="flex items-start gap-2 text-foreground">
          <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-[var(--warning)]" />
          <span className="font-semibold">Live company-news analysis is not connected yet.</span>
        </div>
        <p className="mt-2">
          We will not invent recent catalysts or label generic sentiment as analysis. The next data stage will add verified company news, guidance changes, analyst revisions, competitor developments and an AI brief with source links and timestamps.
        </p>
        {candidateSummary && (
          <div className="mt-3 border-t border-border/50 pt-3">
            <div className="text-xs font-semibold text-foreground">Current quantitative research summary</div>
            <p className="mt-1">{candidateSummary}</p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function PriceContext({
  research,
  range,
  setRange,
}: {
  research: AdvancedSecurityResearch;
  range: ChartRange;
  setRange: (range: ChartRange) => void;
}) {
  const bars = useMemo(
    () => research.price.history.slice(-RANGE_BARS[range]),
    [range, research.price.history],
  );
  return (
    <SectionCard
      icon={LineChart}
      eyebrow="Price context"
      title="What has the share price actually done?"
      description="Adjusted history is used for long-horizon returns so splits and distributions do not create false signals."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat label="1M" value={formatPct(research.price.return1mPct)} />
          <MiniStat label="3M" value={formatPct(research.price.return3mPct)} />
          <MiniStat label="6M" value={formatPct(research.price.return6mPct)} />
          <MiniStat label="12M" value={formatPct(research.price.return12mPct)} />
        </div>
        <div className="flex rounded-lg border border-border/60 bg-background/35 p-1">
          {(Object.keys(RANGE_BARS) as ChartRange[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setRange(item)}
              className={cn(
                "rounded px-2.5 py-1.5 text-xs",
                range === item ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4"><PriceChart bars={bars} /></div>
    </SectionCard>
  );
}

function PriceChart({ bars }: { bars: AdvancedPriceBar[] }) {
  if (bars.length < 2) return <UnavailableState text="Not enough price history is stored to draw this range." />;
  const width = 1200;
  const height = 250;
  const pad = 8;
  const values = bars.map((bar) => bar.adjustedClose);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const step = (width - pad * 2) / Math.max(1, bars.length - 1);
  const path = bars.map((bar, index) => {
    const x = pad + index * step;
    const y = height - pad - ((bar.adjustedClose - min) / spread) * (height - pad * 2);
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const change = ((bars.at(-1)!.adjustedClose / bars[0].adjustedClose) - 1) * 100;
  const stroke = change >= 0 ? "var(--positive)" : "var(--negative)";
  return (
    <div className="rounded-xl border border-border/55 bg-background/30 p-3">
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{bars[0].date} → {bars.at(-1)?.date}</span>
        <span className="font-mono font-semibold" style={{ color: stroke }}>{formatPct(change)}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[250px] w-full" preserveAspectRatio="none">
        <path d={path} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function FinancialHistory({ statements, currency }: { statements: AdvancedStatementPeriod[]; currency: string | null }) {
  return (
    <SectionCard
      icon={BarChart3}
      eyebrow="Financial history"
      title="How the accounts have moved"
      description="The latest annual periods stored from the company's reported statements."
    >
      {statements.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-2 font-medium">Year end</th>
                <th className="px-2 py-2 text-right font-medium">Revenue</th>
                <th className="px-2 py-2 text-right font-medium">Gross profit</th>
                <th className="px-2 py-2 text-right font-medium">EBITDA</th>
                <th className="px-2 py-2 text-right font-medium">Operating profit</th>
                <th className="px-2 py-2 text-right font-medium">Net income</th>
                <th className="px-2 py-2 text-right font-medium">Operating cash flow</th>
                <th className="px-2 py-2 text-right font-medium">Free cash flow</th>
                <th className="px-2 py-2 text-right font-medium">Debt</th>
                <th className="px-2 py-2 text-right font-medium">Shares</th>
              </tr>
            </thead>
            <tbody>
              {statements.map((period) => (
                <tr key={period.periodEnd} className="border-b border-border/40">
                  <td className="px-2 py-2.5 font-medium">{period.periodEnd}</td>
                  <NumberCell value={formatLarge(period.revenue, currency)} />
                  <NumberCell value={formatLarge(period.grossProfit, currency)} />
                  <NumberCell value={formatLarge(period.ebitda, currency)} />
                  <NumberCell value={formatLarge(period.operatingIncome, currency)} />
                  <NumberCell value={formatLarge(period.netIncome, currency)} />
                  <NumberCell value={formatLarge(period.operatingCashFlow, currency)} />
                  <NumberCell value={formatLarge(period.freeCashFlow, currency)} />
                  <NumberCell value={formatLarge(period.totalDebt, currency)} />
                  <NumberCell value={formatLarge(period.dilutedShares, null)} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <UnavailableState text="No annual statement history is stored for this company yet." />}
    </SectionCard>
  );
}

function SectionCard({
  icon: Icon,
  eyebrow,
  title,
  description,
  children,
}: {
  icon: typeof Sparkles;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card/45 p-4 lg:p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg border border-primary/25 bg-primary/[0.06] p-2 text-primary"><Icon className="h-4 w-4" /></div>
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">{eyebrow}</div>
          <h2 className="mt-0.5 text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function MetricGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

function MetricTile({
  label,
  value,
  metric,
  status,
}: {
  label: string;
  value: string;
  metric?: MetricGlossaryKey;
  status?: string;
}) {
  return (
    <div className="rounded-lg border border-border/55 bg-background/30 p-3">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>{metric && <MetricHelp metric={metric} />}
      </div>
      <div className="mt-1 font-mono text-base font-semibold tabular-nums">{value}</div>
      {status && <div className="mt-1 text-[10px] text-muted-foreground">{status}</div>}
    </div>
  );
}

function HeaderMetric({
  label,
  value,
  detail,
  tone = "neutral",
  metric,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "positive" | "warning" | "neutral";
  metric?: MetricGlossaryKey;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/35 p-3">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}{metric && <MetricHelp metric={metric} />}</div>
      <div className={cn("mt-1 font-mono text-xl font-semibold", tone === "positive" ? "text-[var(--positive)]" : tone === "warning" ? "text-[var(--warning)]" : "text-foreground")}>{value}</div>
      <div className="mt-1 text-[10px] text-muted-foreground">{detail}</div>
    </div>
  );
}

function PlainList({
  title,
  items,
  empty,
  tone,
}: {
  title: string;
  items: string[];
  empty: string;
  tone: "positive" | "negative" | "warning";
}) {
  return (
    <div className="rounded-xl border border-border/55 bg-background/25 p-3">
      <div className={cn("text-xs font-semibold", tone === "positive" ? "text-[var(--positive)]" : tone === "negative" ? "text-destructive" : "text-[var(--warning)]")}>{title}</div>
      <div className="mt-2 space-y-2 text-xs leading-5 text-muted-foreground">
        {(items.length ? items : [empty]).map((item, index) => <div key={`${title}-${index}`}>• {item}</div>)}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold">{value}</div>
    </div>
  );
}

function NumberCell({ value }: { value: string }) {
  return <td className="px-2 py-2.5 text-right font-mono text-xs tabular-nums">{value}</td>;
}

function UnavailableState({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-border p-5 text-sm leading-6 text-muted-foreground">{text}</div>;
}

function scoreValue(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : `${value.toFixed(0)} / 100`;
}

function formatMultiple(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}x`;
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function formatRatioPct(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(1)}%`;
}

function formatPct(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatCurrency(value: number | null | undefined, currency: string | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: value < 10 ? 2 : 1,
    }).format(value);
  } catch {
    return value.toFixed(2);
  }
}

function formatLarge(value: number | null | undefined, currency: string | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const scaled = abs >= 1e12 ? value / 1e12 : abs >= 1e9 ? value / 1e9 : abs >= 1e6 ? value / 1e6 : value;
  const suffix = abs >= 1e12 ? "T" : abs >= 1e9 ? "B" : abs >= 1e6 ? "M" : "";
  const prefix = currency ? currencySymbol(currency) : "";
  return `${prefix}${scaled.toFixed(abs >= 1e6 ? 1 : 0)}${suffix}`;
}

function currencySymbol(currency: string): string {
  const code = currency.toUpperCase();
  return code === "GBP" ? "£" : code === "EUR" ? "€" : code === "USD" ? "$" : `${code} `;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
