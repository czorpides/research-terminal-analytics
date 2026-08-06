import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CircleGauge,
  Crosshair,
  Gauge,
  Gem,
  Search,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { SwingV2EntryState, SwingV2SetupType } from "@/lib/swing/model-v21";
import type {
  SwingV2Workspace,
  SwingV2WorkspaceCandidate,
} from "@/lib/swing/workspace-v2.functions";
import { cn } from "@/lib/utils";

type InstrumentFilter = "all" | "equity" | "commodity";
type EntryFilter = "all" | SwingV2EntryState;
type SetupFilter = "all" | SwingV2SetupType;

const SETUP_OPTIONS: Array<{ value: SwingV2SetupType; label: string }> = [
  { value: "trend_pullback", label: "Trend pullback" },
  { value: "deep_mean_reversion", label: "Deep mean reversion" },
  { value: "sma200_bounce", label: "200SMA bounce" },
  { value: "catalyst_repricing", label: "Catalyst repricing" },
  { value: "base_breakout_retest", label: "Base breakout / retest" },
  { value: "commodity_macro", label: "Commodity macro" },
];

export function SwingTradesV2View({ workspace }: { workspace: SwingV2Workspace }) {
  const [query, setQuery] = useState("");
  const [instrument, setInstrument] = useState<InstrumentFilter>("all");
  const [entryState, setEntryState] = useState<EntryFilter>("all");
  const [setup, setSetup] = useState<SetupFilter>("all");
  const [minRank, setMinRank] = useState(45);
  const [riskBudget, setRiskBudget] = useState(250);

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () => workspace.candidates.filter((candidate) => {
      if (
        needle &&
        !`${candidate.symbol} ${candidate.name} ${candidate.industryName ?? ""} ${candidate.setup.setupLabel}`
          .toLowerCase()
          .includes(needle)
      ) return false;
      if (instrument !== "all" && candidate.assetType !== instrument) return false;
      if (entryState !== "all" && candidate.setup.entryState !== entryState) return false;
      if (setup !== "all" && candidate.setup.setup !== setup) return false;
      if (candidate.setup.rankingScore < minRank) return false;
      return true;
    }),
    [entryState, instrument, minRank, needle, setup, workspace.candidates],
  );

  const metals = workspace.candidates.filter((candidate) => candidate.assetType === "commodity");

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[0.09] via-card/80 to-card/40">
        <div className="grid gap-5 p-5 lg:p-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
                Swing Engine v2.1 · shadow
              </Badge>
              <Badge variant="outline" className="border-amber-500/35 bg-amber-500/[0.08] text-amber-600">
                Calibration collecting
              </Badge>
            </div>
            <h2 className="mt-4 max-w-4xl text-2xl font-semibold tracking-tight">
              Trade the level, trigger and asymmetry — not valuation or a strong chart alone
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
              v2.1 keeps the multi-strategy search but adds explicit tradeability, daily + weekly
              structure, ADX regime, divergence, volume contraction/expansion, rejection triggers,
              first breakout retests and a 2:1 structural reward/risk floor for Actionable entries.
              Long-term valuation no longer earns positive Swing points.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <SmallStat label="Equities screened" value={workspace.universe.scoreScreened.toLocaleString()} />
              <SmallStat label="Deep scanned" value={workspace.universe.equityDeepScanned.toLocaleString()} />
              <SmallStat label="Metals online" value={`${metals.length}/2`} />
              <SmallStat label="Evidence date" value={workspace.asOf} />
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-background/45 p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Entry-state discipline
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <StateCount state="actionable" label="Actionable" count={workspace.universe.actionable} />
              <StateCount state="developing" label="Developing" count={workspace.universe.developing} />
              <StateCount state="event_risk" label="Event risk" count={workspace.universe.eventRisk} />
              <StateCount state="extended" label="Chase risk" count={workspace.universe.extended} />
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              “Actionable” now requires a tradeable instrument, acceptable volatility, a clear
              structural location, trigger evidence and at least <strong>2.0x</strong> modelled
              reward/risk. The thresholds remain shadow hypotheses until outcome calibration.
            </p>
          </div>
        </div>
      </section>

      {workspace.warnings.length > 0 && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div>
              <div className="text-sm font-semibold">v2.1 data-readiness notes</div>
              <ul className="mt-1 space-y-1 text-xs leading-5 text-muted-foreground">
                {workspace.warnings.slice(0, 5).map((warning) => <li key={warning}>• {warning}</li>)}
              </ul>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={Target}
          label="Actionable now"
          value={workspace.universe.actionable.toString()}
          detail="Tradeability + trigger + entry quality + at least 2:1 structural R/R"
        />
        <SummaryCard
          icon={TrendingDown}
          label="Developing setups"
          value={workspace.universe.developing.toString()}
          detail="Interesting location, but one or more execution conditions still need to improve"
        />
        <SummaryCard
          icon={ShieldAlert}
          label="Event / chase holds"
          value={(workspace.universe.eventRisk + workspace.universe.extended).toString()}
          detail="Directional thesis may survive, but entry is deliberately held"
        />
        <SummaryCard
          icon={Gem}
          label="Gold & silver"
          value={metals.length.toString()}
          detail="Price structure + real-yield / dollar / volatility macro context"
        />
      </section>

      <section className="rounded-xl border border-border/70 bg-card/55 p-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(240px,1fr)_150px_175px_195px_140px_180px]">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search ticker, company or setup"
              className="h-10 pl-10"
            />
          </label>
          <Select value={instrument} onChange={(value) => setInstrument(value as InstrumentFilter)}>
            <option value="all">All instruments</option>
            <option value="equity">Equities</option>
            <option value="commodity">Gold & silver</option>
          </Select>
          <Select value={entryState} onChange={(value) => setEntryState(value as EntryFilter)}>
            <option value="all">All entry states</option>
            <option value="actionable">Actionable</option>
            <option value="developing">Developing</option>
            <option value="event_risk">Event risk</option>
            <option value="extended">Chase risk</option>
            <option value="detected">Detected</option>
          </Select>
          <Select value={setup} onChange={(value) => setSetup(value as SetupFilter)}>
            <option value="all">All setup families</option>
            {SETUP_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
          <label className="rounded-md border border-input bg-background px-3 py-2">
            <div className="flex items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              <span>Min rank</span><span>{minRank}</span>
            </div>
            <input
              type="range"
              min={35}
              max={80}
              step={5}
              value={minRank}
              onChange={(event) => setMinRank(Number(event.target.value))}
              className="mt-1 w-full accent-primary"
            />
          </label>
          <label className="rounded-md border border-input bg-background px-3 py-1.5">
            <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Risk budget · listing ccy</div>
            <input
              type="number"
              min={0}
              step={50}
              value={riskBudget}
              onChange={(event) => setRiskBudget(Math.max(0, Number(event.target.value) || 0))}
              className="mt-0.5 w-full bg-transparent text-sm font-semibold outline-none"
            />
          </label>
        </div>
      </section>

      {filtered.length === 0 ? (
        <section className="rounded-xl border border-dashed border-border p-8 text-center">
          <Crosshair className="mx-auto h-6 w-6 text-muted-foreground" />
          <div className="mt-3 text-sm font-semibold">No v2.1 setups match these filters</div>
          <p className="mt-1 text-xs text-muted-foreground">
            This can be healthy. The engine is designed to hold trades that lack location, trigger, liquidity or asymmetry.
          </p>
        </section>
      ) : (
        <section className="grid gap-4 2xl:grid-cols-2">
          {filtered.map((candidate) => (
            <SetupCard
              key={`${candidate.assetId}:${candidate.setup.setup}`}
              candidate={candidate}
              riskBudget={riskBudget}
            />
          ))}
        </section>
      )}

      <details className="group rounded-xl border border-border/65 bg-muted/10">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4">
          <div>
            <div className="text-sm font-semibold">How v2.1 decides whether a setup is tradeable</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Transparent rules while the historical calibration sample builds.
            </p>
          </div>
          <CircleGauge className="h-4 w-4 text-muted-foreground" />
        </summary>
        <div className="grid gap-3 border-t border-border/60 p-4 md:grid-cols-2 xl:grid-cols-4">
          <Explain title="Tradeability & regime" text="Average traded value, ATR%, daily/weekly trend and ADX decide whether the instrument is liquid enough, moving enough and in a regime compatible with the setup family." />
          <Explain title="Location & trigger" text="20/50/200SMA support, range boundaries, first breakout retests, RSI/MACD turns and divergence, rejection candles and volume contraction followed by expansion." />
          <Explain title="Catalyst / macro" text="Equities can use earnings and validated forward EPS/revenue/price-target revisions. Gold and silver instead use real yields, the broad dollar and volatility. Long-term valuation does not add Swing score." />
          <Explain title="Defined trade" text="Hard stop, separate thesis invalidation, real structural target, at least 2:1 R/R for Actionable status and a setup-specific expected holding window/time stop." />
        </div>
      </details>
    </div>
  );
}

function SetupCard({ candidate, riskBudget }: { candidate: SwingV2WorkspaceCandidate; riskBudget: number }) {
  const { setup } = candidate;
  const geometry = setup.geometry;
  const discipline = setup.discipline;
  const riskPlan = discipline.riskPlan;
  const catalystText = candidate.assetType === "commodity"
    ? setup.contextScore >= 60 ? "Macro supportive" : setup.contextScore <= 40 ? "Macro headwind" : "Macro mixed"
    : candidate.catalyst.label ?? (candidate.expectations ? "Analyst evidence available" : "No verified catalyst yet");
  const indicativeShares = candidate.assetType === "equity" && riskPlan.riskPerShare !== null && riskPlan.riskPerShare > 0
    ? Math.floor(riskBudget / riskPlan.riskPerShare)
    : null;

  return (
    <article className={cn(
      "rounded-2xl border bg-card/70 p-4 shadow-sm transition-colors lg:p-5",
      stateBorder(setup.entryState),
    )}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <EntryBadge state={setup.entryState} />
            <Badge variant="outline" className="text-[10px]">{setup.setupLabel}</Badge>
            <DisciplineBadge state={discipline.liquidityState} label={candidate.assetType === "commodity" ? "Spot volume not gated" : "Liquidity"} />
            <DisciplineBadge state={discipline.volatilityState} label="ATR" />
            {candidate.assetType === "commodity" && (
              <Badge variant="outline" className="border-yellow-500/30 bg-yellow-500/[0.06] text-yellow-700">Precious metal</Badge>
            )}
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <h3 className="text-xl font-semibold">{candidate.symbol}</h3>
            <span className="truncate text-sm text-muted-foreground">{candidate.name}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {candidate.assetType === "commodity" ? "Global macro instrument" : `${candidate.countryCode}${candidate.industryName ? ` · ${candidate.industryName}` : ""}`}
            {candidate.exchange ? ` · ${candidate.exchange}` : ""}
          </div>
        </div>
        <div className="shrink-0 text-left sm:text-right">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">v2.1 rank</div>
          <div className="text-3xl font-semibold tabular-nums">{setup.rankingScore.toFixed(0)}</div>
          <div className="text-[10px] text-muted-foreground">not a win probability</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <ScoreCell label="Technical" value={setup.technicalScore} />
        <ScoreCell label="Entry quality" value={setup.entryQuality} emphasis />
        <ScoreCell label={candidate.assetType === "commodity" ? "Macro" : "Catalyst"} value={candidate.assetType === "commodity" ? setup.contextScore : setup.catalystScore} />
        <ScoreCell label="Chase risk" value={setup.chaseRisk} inverse />
        <MetricCell label="RSI 14" value={fmtNumber(setup.metrics.rsi14, 1)} />
        <MetricCell label="R / R" value={riskPlan.rewardRisk !== null ? `${riskPlan.rewardRisk.toFixed(2)}x` : "No clean target"} />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCell label="Weekly trend" value={titleCase(discipline.weeklyTrend)} />
        <MetricCell label="ADX 14" value={discipline.adx14 === null ? "n/a" : `${discipline.adx14.toFixed(1)} · ${discipline.adxState}`} />
        <MetricCell label="ATR %" value={fmtPct(discipline.atrPct)} />
        <MetricCell label="Avg traded value" value={candidate.assetType === "commodity" ? "Spot volume not used" : fmtCompact(discipline.averageNotional20, candidate.currency)} />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCell label="3M high drawdown" value={fmtPct(setup.metrics.drawdown63Pct)} />
        <MetricCell label="6M high drawdown" value={fmtPct(setup.metrics.drawdown126Pct)} />
        <MetricCell label="vs 200SMA" value={fmtPct(setup.metrics.distanceMa200Pct)} />
        <MetricCell
          label="MACD histogram"
          value={setup.metrics.macdHistogram === null ? "n/a" : `${setup.metrics.macdHistogram.toFixed(3)} (${signed(setup.metrics.macdHistogramDelta, 3)})`}
        />
      </div>

      <div className="mt-4 rounded-xl border border-border/60 bg-background/35 p-3">
        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
          Why it is here
        </div>
        <ul className="mt-2 space-y-1.5 text-xs leading-5">
          {setup.reasons.slice(0, 5).map((reason) => <li key={reason}>• {reason}</li>)}
          {!setup.reasons.length && <li className="text-muted-foreground">The setup is quantitative-only at this stage.</li>}
        </ul>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border/60 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Trigger evidence
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {setup.confirmations.length
              ? setup.confirmations.map((item) => <Badge key={item} variant="secondary" className="text-[10px]">{item}</Badge>)
              : <span className="text-xs text-muted-foreground">Waiting for a stronger turn in price, momentum or participation.</span>}
          </div>
        </div>
        <div className="rounded-xl border border-border/60 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Gauge className="h-3.5 w-3.5 text-muted-foreground" /> Catalyst / macro context
          </div>
          <div className="mt-2 text-xs leading-5 text-muted-foreground">{catalystText}</div>
          {candidate.expectations?.targetUpsidePct !== null && candidate.expectations?.targetUpsidePct !== undefined && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              Consensus target gap: {fmtPct(candidate.expectations.targetUpsidePct)} · context only, not a Swing target
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <TradeLevel label="Price" value={setup.metrics.current} currency={candidate.currency} />
        <TradeLevel
          label="Entry zone"
          value={geometry ? `${fmtPrice(geometry.entryLow, candidate.currency)} – ${fmtPrice(geometry.entryHigh, candidate.currency)}` : "n/a"}
        />
        <TradeLevel label="Hard stop" value={fmtPrice(riskPlan.hardStop, candidate.currency)} negative />
        <TradeLevel label="Thesis level" value={fmtPrice(riskPlan.thesisInvalidation, candidate.currency)} negative />
        <TradeLevel label="Target" value={fmtPrice(riskPlan.target, candidate.currency)} positive />
        <TradeLevel
          label={candidate.assetType === "equity" ? `Shares @ risk ${riskBudget}` : "Position size"}
          value={candidate.assetType === "equity" ? (indicativeShares === null ? "n/a" : indicativeShares.toLocaleString()) : "Use contract specs"}
        />
      </div>

      <div className="mt-3 rounded-xl border border-border/60 bg-muted/[0.04] p-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_190px]">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Thesis invalidation</div>
            <p className="mt-1 text-xs leading-5">{riskPlan.thesisInvalidationRule}</p>
          </div>
          <div>
            <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Expected timeline</div>
            <p className="mt-1 text-xs leading-5">
              {riskPlan.expectedHoldingSessions[0]}–{riskPlan.expectedHoldingSessions[1]} sessions · time stop {riskPlan.timeStopSessions} sessions
            </p>
          </div>
        </div>
      </div>

      <details className="group mt-3 rounded-xl border border-border/60 bg-muted/[0.04]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 text-xs font-semibold">
          <span>Advanced technical evidence & risks</span>
          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
        </summary>
        <div className="grid gap-3 border-t border-border/60 p-3 lg:grid-cols-2">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Structure & participation</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <EvidenceMetric label="20SMA" value={fmtPrice(setup.metrics.ma20, candidate.currency)} />
              <EvidenceMetric label="50SMA" value={fmtPrice(setup.metrics.ma50, candidate.currency)} />
              <EvidenceMetric label="200SMA" value={fmtPrice(setup.metrics.ma200, candidate.currency)} />
              <EvidenceMetric label="20WMA" value={fmtPrice(discipline.weeklyMa20, candidate.currency)} />
              <EvidenceMetric label="40WMA" value={fmtPrice(discipline.weeklyMa40, candidate.currency)} />
              <EvidenceMetric label="20d z-score" value={fmtNumber(setup.metrics.zScore20, 2)} />
              <EvidenceMetric label="RSI divergence" value={discipline.bullishRsiDivergence ? "Bullish" : "No"} />
              <EvidenceMetric label="MACD divergence" value={discipline.bullishMacdDivergence ? "Bullish" : "No"} />
              <EvidenceMetric label="Pullback vol / base" value={fmtRatio(discipline.pullbackVolumeRatio)} />
              <EvidenceMetric label="Reversal vol / pullback" value={fmtRatio(discipline.reversalVolumeExpansion)} />
              <EvidenceMetric label="First breakout retest" value={discipline.firstBreakoutRetest ? "Yes" : "No"} />
              <EvidenceMetric label="Middle of range" value={discipline.middleOfRange ? "Yes — penalty" : "No"} />
            </div>
          </div>
          <div>
            <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">What can go wrong</div>
            <ul className="mt-2 space-y-1.5 text-xs leading-5 text-muted-foreground">
              {setup.risks.slice(0, 8).map((risk) => <li key={risk}>• {risk}</li>)}
              {!setup.risks.length && <li>• No additional model risk flag is active, but normal market risk remains.</li>}
            </ul>
          </div>
        </div>
      </details>
    </article>
  );
}

function SummaryCard({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/55 p-4">
      <Icon className="h-4 w-4 text-primary" />
      <div className="mt-3 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs font-semibold">{label}</div>
      <div className="mt-1 text-[11px] leading-4 text-muted-foreground">{detail}</div>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/35 px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function StateCount({ state, label, count }: { state: SwingV2EntryState; label: string; count: number }) {
  return (
    <div className={cn("rounded-lg border px-3 py-2", stateBackground(state))}>
      <div className="text-xl font-semibold tabular-nums">{count}</div>
      <div className="text-[10px] font-medium uppercase tracking-wider">{label}</div>
    </div>
  );
}

function EntryBadge({ state }: { state: SwingV2EntryState }) {
  const labels: Record<SwingV2EntryState, string> = {
    actionable: "Actionable",
    developing: "Developing",
    detected: "Detected",
    event_risk: "Event risk",
    extended: "Extended / chase",
    invalidated: "Invalidated",
  };
  return <Badge className={cn("border text-[10px]", stateBadge(state))}>{labels[state]}</Badge>;
}

function DisciplineBadge({ state, label }: { state: "pass" | "warn" | "fail" | "unavailable"; label: string }) {
  const text = state === "unavailable" ? label : `${label}: ${state}`;
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px]",
        state === "pass" && "border-emerald-500/30 text-emerald-700",
        state === "warn" && "border-amber-500/30 text-amber-700",
        state === "fail" && "border-rose-500/30 text-rose-700",
      )}
    >
      {text}
    </Badge>
  );
}

function ScoreCell({ label, value, emphasis, inverse }: { label: string; value: number; emphasis?: boolean; inverse?: boolean }) {
  const good = inverse ? value <= 35 : value >= 68;
  const bad = inverse ? value >= 62 : value < 45;
  return (
    <div className={cn("rounded-lg border border-border/60 px-3 py-2", emphasis && "bg-primary/[0.04]") }>
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-lg font-semibold tabular-nums", good && "text-emerald-600", bad && "text-amber-600")}>{value.toFixed(0)}</div>
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function TradeLevel({ label, value, currency, negative, positive }: { label: string; value: number | string; currency?: string | null; negative?: boolean; positive?: boolean }) {
  const output = typeof value === "number" ? fmtPrice(value, currency) : value;
  return (
    <div className="rounded-lg border border-border/60 bg-background/25 px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-sm font-semibold tabular-nums", negative && "text-rose-600", positive && "text-emerald-600")}>{output}</div>
    </div>
  );
}

function EvidenceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-muted/25 px-2.5 py-2">
      <span className="text-muted-foreground">{label}</span><span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function Explain({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="text-xs font-semibold">{title}</div>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{text}</p>
    </div>
  );
}

function Select({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
    >
      {children}
    </select>
  );
}

function stateBorder(state: SwingV2EntryState): string {
  if (state === "actionable") return "border-emerald-500/35";
  if (state === "event_risk" || state === "extended") return "border-amber-500/30";
  if (state === "developing") return "border-primary/30";
  return "border-border/70";
}

function stateBackground(state: SwingV2EntryState): string {
  if (state === "actionable") return "border-emerald-500/30 bg-emerald-500/[0.07]";
  if (state === "event_risk" || state === "extended") return "border-amber-500/30 bg-amber-500/[0.07]";
  if (state === "developing") return "border-primary/30 bg-primary/[0.06]";
  return "border-border/60 bg-muted/15";
}

function stateBadge(state: SwingV2EntryState): string {
  if (state === "actionable") return "border-emerald-500/35 bg-emerald-500/[0.09] text-emerald-700";
  if (state === "event_risk" || state === "extended") return "border-amber-500/35 bg-amber-500/[0.08] text-amber-700";
  if (state === "developing") return "border-primary/35 bg-primary/[0.08] text-primary";
  if (state === "invalidated") return "border-rose-500/30 bg-rose-500/[0.07] text-rose-700";
  return "border-border text-muted-foreground";
}

function fmtPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function fmtNumber(value: number | null, digits: number): string {
  return value === null || !Number.isFinite(value) ? "n/a" : value.toFixed(digits);
}

function signed(value: number | null, digits: number): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function fmtRatio(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "n/a" : `${value.toFixed(2)}x`;
}

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function fmtCompact(value: number | null, currency?: string | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  const code = (currency ?? "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: code,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return `${code} ${new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
  }
}

function fmtPrice(value: number | null, currency?: string | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  const code = (currency ?? "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: code,
      maximumFractionDigits: value >= 100 ? 2 : 3,
    }).format(value);
  } catch {
    return `${code} ${value.toFixed(value >= 100 ? 2 : 3)}`;
  }
}
