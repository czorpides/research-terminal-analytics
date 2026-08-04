import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Crosshair,
  Gauge,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  WifiOff,
  type LucideIcon,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  empiricalOverlayForSignal,
  type SwingEmpiricalOverlay,
} from "@/lib/swing/learning";
import {
  applyRegimeContext,
  regimeScoreForLabel,
  type SwingSetupStatus,
  type SwingSetupType,
  type SwingTradeCandidate,
} from "@/lib/swing/model";
import type { RegimeMonitorPayload } from "@/lib/panels/regime.functions";
import type {
  SwingTrackerRow,
  SwingTrackerWorkspace,
} from "@/lib/swing/tracker.functions";
import type {
  SwingTradesWorkspace,
  SwingWorkspaceCandidate,
} from "@/lib/swing/workspace.functions";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | SwingSetupStatus | "high_conviction";
type SetupFilter = "all" | SwingSetupType;
type MarketFilter = "all" | "US" | "UK" | "EU";
type DisplayCandidate = Omit<SwingWorkspaceCandidate, "trade"> & { trade: SwingTradeCandidate };
type RankedCandidate = DisplayCandidate & {
  empirical: SwingEmpiricalOverlay;
  rankScore: number;
  trackerRow: SwingTrackerRow | null;
  priorTrackerRow: SwingTrackerRow | null;
};

const SETUP_OPTIONS: Array<{ value: SwingSetupType; label: string }> = [
  { value: "pullback_uptrend", label: "Pullback" },
  { value: "oversold_reversal", label: "Oversold reversal" },
  { value: "breakout", label: "Breakout" },
  { value: "momentum_continuation", label: "Momentum continuation" },
  { value: "recovery_repricing", label: "Recovery / repricing" },
];

const HEADER_HELP = {
  security: "Ticker and company name for the security being ranked.",
  setup:
    "The best-matching setup archetype from pullback, oversold reversal, breakout, momentum continuation or recovery/repricing.",
  state:
    "Confirmed means the required price-action trigger has already occurred. Developing is close but incomplete. Watch Trigger still needs the key trigger. Too Extended means the risk/reward has deteriorated after a strong move.",
  score:
    "Raw 0-100 deterministic Setup Score. It combines momentum, RSI, location, volume, volatility, confirmation, regime and catalyst evidence. If enough historical outcomes exist, ordering can receive a separate capped empirical adjustment of at most +/-5 points without rewriting this raw score.",
  rsi:
    "14-session Relative Strength Index. Roughly, lower readings show weaker/oversold momentum and higher readings show stronger/overbought momentum. The model interprets RSI differently for each setup type rather than using one universal threshold.",
  momentum:
    "0-100 momentum component using recent returns and whether momentum is accelerating or fading. Higher is more supportive for the specific setup archetype.",
  relativeVolume:
    "Latest session volume divided by the prior 20-session average. 1.00x is normal, 1.50x means volume is about 50% above normal. Strong participation can confirm a move, while thin volume weakens it.",
  location:
    "0-100 score for where price sits relative to nearby support, resistance, moving averages and the broader trading range. A good location offers room to the target without sitting too far from invalidation.",
  confirmation:
    "0-100 price-action confirmation score. It uses evidence such as a higher low, resistance break, MA20 reclaim and bullish closing behaviour. This is one of the hard gates for High Conviction.",
  rewardRisk:
    "Estimated upside from the entry zone to the target divided by downside to the technical invalidation level. 2.0x means the modelled upside is twice the modelled downside.",
  regime:
    "Macro/market backdrop contribution. US names use the live regime engine. UK and EU names remain neutral until a validated regional regime is available rather than being guessed.",
  tracker:
    "Point-in-time outcome tracker for this exact setup/date. It freezes the original entry, target and invalidation, then records whether the target, stop, near miss or expiry occurred. Intraday quotes are supplemental; completed daily OHLC bars remain authoritative for final classification.",
};

export function SwingTradesIntegratedView({
  workspace,
  regime,
  tracker,
  trackerLoading,
  trackerError,
  refreshing,
  refreshError,
  onRefresh,
}: {
  workspace: SwingTradesWorkspace;
  regime: RegimeMonitorPayload;
  tracker: SwingTrackerWorkspace | null;
  trackerLoading: boolean;
  trackerError: string | null;
  refreshing: boolean;
  refreshError: string | null;
  onRefresh: () => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [setup, setSetup] = useState<SetupFilter>("all");
  const [market, setMarket] = useState<MarketFilter>("all");
  const [minScore, setMinScore] = useState(60);
  const [fundamentalOnly, setFundamentalOnly] = useState(false);

  const trackerMaps = useMemo(() => {
    const exact = new Map<string, SwingTrackerRow>();
    const latest = new Map<string, SwingTrackerRow>();
    for (const row of tracker?.rows ?? []) {
      const exactKey = `${row.assetId}:${row.setupType}:${row.priceAsOf}`;
      if (!exact.has(exactKey)) exact.set(exactKey, row);
      const latestKey = `${row.assetId}:${row.setupType}`;
      if (!latest.has(latestKey)) latest.set(latestKey, row);
    }
    return { exact, latest };
  }, [tracker?.rows]);

  const contextual = useMemo(() => {
    const usRegimeAvailable = regime.current.label !== "insufficient";
    const usScore = regimeScoreForLabel(regime.current.label);
    return workspace.candidates
      .map<RankedCandidate>((candidate) => {
        const trade =
          candidate.countryCode === "US"
            ? applyRegimeContext(candidate.trade, usScore, regime.current.label, usRegimeAvailable)
            : applyRegimeContext(candidate.trade, 50, "regional regime unavailable", false);
        const empirical = empiricalOverlayForSignal(
          {
            setupType: trade.setup,
            setupScore: trade.setupScore,
            highConviction: trade.highConviction,
            components: trade.components,
            metrics: { ...trade.metrics },
          },
          tracker?.learning.patterns ?? [],
          tracker?.learning.baselineHitRate ?? null,
        );
        const exactKey = `${candidate.assetId}:${trade.setup}:${candidate.priceAsOf}`;
        const latestKey = `${candidate.assetId}:${trade.setup}`;
        const trackerRow = trackerMaps.exact.get(exactKey) ?? null;
        const latestRow = trackerMaps.latest.get(latestKey) ?? null;
        return {
          ...candidate,
          trade,
          empirical,
          rankScore: empirical.rankScore,
          trackerRow,
          priorTrackerRow:
            latestRow && latestRow.id !== trackerRow?.id ? latestRow : null,
        };
      })
      .sort(compareCandidates);
  }, [regime.current.label, tracker, trackerMaps, workspace.candidates]);

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      contextual.filter((candidate) => {
        const trade = candidate.trade;
        if (
          needle &&
          !`${candidate.symbol} ${candidate.name} ${candidate.industryName ?? ""}`
            .toLowerCase()
            .includes(needle)
        )
          return false;
        if (market !== "all" && marketFor(candidate.countryCode) !== market) return false;
        if (setup !== "all" && trade.setup !== setup) return false;
        if (status === "high_conviction" && !trade.highConviction) return false;
        if (status !== "all" && status !== "high_conviction" && trade.status !== status) return false;
        if (trade.setupScore < minScore) return false;
        if (fundamentalOnly && (trade.metrics.fundamentalSupport ?? 0) < 60) return false;
        return true;
      }),
    [contextual, fundamentalOnly, market, minScore, needle, setup, status],
  );

  const highConviction = contextual.filter((candidate) => candidate.trade.highConviction);
  const confirmed = contextual.filter(
    (candidate) => candidate.trade.status === "confirmed" && candidate.trade.setupScore >= 65,
  );
  const active = contextual.filter(
    (candidate) =>
      ["confirmed", "developing"].includes(candidate.trade.status) &&
      candidate.trade.setupScore >= 65,
  );
  const medianRewardRisk = median(
    confirmed
      .map((candidate) => candidate.trade.geometry?.rewardRisk ?? null)
      .filter(isNumber),
  );
  const latestTrackedQuote = useMemo(
    () =>
      (tracker?.rows ?? [])
        .map((row) => row.latestObservedAt)
        .filter(isString)
        .sort()
        .at(-1) ?? null,
    [tracker?.rows],
  );
  const validatedPatterns = tracker?.learning.patterns.filter((pattern) => pattern.validated).length ?? 0;

  return (
    <TooltipProvider delayDuration={120}>
      <div className="space-y-5">
        <section className="rounded-xl border border-primary/30 bg-primary/[0.06] p-4 lg:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <Crosshair className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
                  SW · Swing Trade Radar
                </div>
                <h2 className="mt-1 text-lg font-semibold">
                  Rank the setup, monitor the trade, then learn from the outcome
                </h2>
                <p className="mt-1 max-w-5xl text-sm leading-6 text-muted-foreground">
                  The setup engine and outcome tracker now sit in one workflow. The raw technical
                  score remains auditable, while validated historical patterns can add a small
                  empirical ranking overlay only after enough resolved examples exist.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusPill label={`${workspace.universe.scoreScreened.toLocaleString()} score-screened`} />
                  <StatusPill label={`${workspace.universe.deepScanned.toLocaleString()} deep-scanned`} />
                  <StatusPill label={`${workspace.candidates.length} surfaced`} />
                  <StatusPill
                    label={
                      validatedPatterns
                        ? `${validatedPatterns} validated empirical patterns`
                        : "Empirical overlay still collecting"
                    }
                    warning={!validatedPatterns}
                  />
                </div>
              </div>
            </div>

            <div className="min-w-[270px] rounded-lg border border-border/70 bg-background/35 p-3">
              <div className="grid gap-1.5 text-xs">
                <FreshnessLine label="Setup bars" value={formatDateOnly(workspace.asOf)} />
                <FreshnessLine
                  label="Latest tracked price"
                  value={latestTrackedQuote ? formatTimestamp(latestTrackedQuote) : "No intraday quote yet"}
                />
                <FreshnessLine
                  label="Tracker"
                  value={
                    trackerError
                      ? "Unavailable"
                      : trackerLoading
                        ? "Loading"
                        : tracker
                          ? `${tracker.totals.tracked} frozen setups`
                          : "No data"
                  }
                />
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="mt-3 w-full"
                    variant="outline"
                    disabled={refreshing}
                    onClick={() => void onRefresh()}
                  >
                    <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
                    {refreshing ? "Refreshing…" : "Refresh prices & tracker"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-sm border border-border bg-popover text-popover-foreground">
                  Re-runs the setup capture and the quota-aware intraday monitor. The live tracker
                  can update immediately, while the core technical setup stays anchored to the
                  latest completed daily OHLCV bar so a partial candle cannot distort the model.
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </section>

        {(trackerError || refreshError) && (
          <section className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
            <div className="flex items-start gap-3">
              <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div>
                <div className="text-sm font-semibold">Outcome tracking is not fully available</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  The Swing setup screen remains usable. The tracker now reports its failure instead
                  of sitting on an endless loading state. If the database error mentions a missing
                  swing tracking table, the merged tracking migration still needs to be applied by
                  the deployed app/database environment.
                </p>
                <div className="mt-2 font-mono text-[11px] text-amber-600">
                  {refreshError ?? trackerError}
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Activity}
            label="Active setups"
            value={active.length.toString()}
            detail="Score 65+ and confirmed/developing"
          />
          <MetricCard
            icon={Sparkles}
            label="High conviction"
            value={highConviction.length.toString()}
            detail="80+ raw score plus hard gates"
          />
          <MetricCard
            icon={CheckCircle2}
            label="Confirmed"
            value={confirmed.length.toString()}
            detail="Observed trigger, not a forecast"
          />
          <MetricCard
            icon={Target}
            label="Median reward/risk"
            value={medianRewardRisk === null ? "n/a" : `${medianRewardRisk.toFixed(1)}x`}
            detail="Confirmed setups with trade geometry"
          />
        </section>

        <section className="rounded-xl border border-border/70 bg-card/55 p-4 lg:p-5">
          <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_160px_190px_160px_150px_auto]">
            <label className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search ticker, company or industry"
                className="h-10 pl-10 text-sm"
              />
            </label>
            <select
              value={market}
              onChange={(event) => setMarket(event.target.value as MarketFilter)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All markets</option>
              <option value="US">US</option>
              <option value="UK">UK</option>
              <option value="EU">EU</option>
            </select>
            <select
              value={setup}
              onChange={(event) => setSetup(event.target.value as SetupFilter)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All setups</option>
              {SETUP_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as StatusFilter)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All states</option>
              <option value="high_conviction">High conviction</option>
              <option value="confirmed">Confirmed</option>
              <option value="developing">Developing</option>
              <option value="watch_trigger">Watch trigger</option>
              <option value="extended">Too extended</option>
            </select>
            <select
              value={minScore}
              onChange={(event) => setMinScore(Number(event.target.value))}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value={50}>Score 50+</option>
              <option value={60}>Score 60+</option>
              <option value={70}>Score 70+</option>
              <option value={80}>Score 80+</option>
            </select>
            <Button
              variant={fundamentalOnly ? "default" : "outline"}
              onClick={() => setFundamentalOnly((value) => !value)}
              className="h-10 whitespace-nowrap"
            >
              <ShieldCheck className="mr-2 h-4 w-4" /> Fundamental support
            </Button>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {filtered.length} setups match. Fundamental support requires the available
            quality/valuation evidence to average at least 60/100. US names use the live
            rules-based regime ({regime.current.label.replaceAll("_", " ")}); UK/EU regime is
            held neutral and visibly marked unavailable rather than guessed.
          </p>
        </section>

        <section className="overflow-hidden rounded-xl border border-border/70 bg-card/55">
          <div className="flex flex-col gap-2 border-b border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
                Ranked setup queue
              </div>
              <h3 className="mt-1 text-base font-semibold">Best current swing structures</h3>
            </div>
            <div className="text-xs text-muted-foreground">
              Setup data {formatDateOnly(workspace.asOf)} · {workspace.modelVersion}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No current setups clear these filters. Lower the score threshold or broaden the
              setup/state filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1380px] text-left text-sm">
                <thead className="border-b border-border/70 bg-background/35 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <MetricHeader label="Security" help={HEADER_HELP.security} />
                    <MetricHeader label="Setup" help={HEADER_HELP.setup} />
                    <MetricHeader label="State" help={HEADER_HELP.state} />
                    <MetricHeader label="Score" help={HEADER_HELP.score} align="right" />
                    <MetricHeader label="RSI" help={HEADER_HELP.rsi} align="right" />
                    <MetricHeader label="Momentum" help={HEADER_HELP.momentum} align="right" />
                    <MetricHeader label="Rel vol" help={HEADER_HELP.relativeVolume} align="right" />
                    <MetricHeader label="Location" help={HEADER_HELP.location} align="right" />
                    <MetricHeader label="Confirm" help={HEADER_HELP.confirmation} align="right" />
                    <MetricHeader label="R:R" help={HEADER_HELP.rewardRisk} align="right" />
                    <MetricHeader label="Regime" help={HEADER_HELP.regime} />
                    <MetricHeader label="Tracker" help={HEADER_HELP.tracker} />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((candidate, index) => (
                    <SwingRow key={candidate.assetId} candidate={candidate} rank={index + 1} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-border/70 bg-card/55 p-4">
            <div className="flex items-center gap-2 font-semibold">
              <BarChart3 className="h-4 w-4 text-primary" /> How the score works
            </div>
            <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              <Weight label="Momentum" value="15%" />
              <Weight label="RSI" value="10%" />
              <Weight label="Location" value="15%" />
              <Weight label="Volume" value="12.5%" />
              <Weight label="Volatility" value="10%" />
              <Weight label="Confirmation" value="15%" />
              <Weight label="Regime" value="10%" />
              <Weight label="Catalyst" value="12.5%" />
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Each setup archetype interprets those same eight components differently. A breakout
              therefore wants different RSI, location and confirmation behaviour from an oversold
              reversal.
            </p>
          </div>
          <div className="rounded-xl border border-primary/25 bg-primary/[0.04] p-4">
            <div className="flex items-center gap-2 font-semibold">
              <BrainCircuit className="h-4 w-4 text-primary" /> Conviction strengthened by outcomes
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {tracker?.learning.note ??
                "The empirical layer is unavailable until the tracker can read its point-in-time outcome history."}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              The historical overlay is deliberately capped at +/-5 ranking points and shrunk
              toward the overall hit rate. This makes real outcomes matter without allowing a small
              or lucky sample to rewrite the technical model.
            </p>
          </div>
        </section>
      </div>
    </TooltipProvider>
  );
}

function SwingRow({ candidate, rank }: { candidate: RankedCandidate; rank: number }) {
  const trade = candidate.trade;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <tr className="cursor-pointer border-b border-border/50 transition-colors hover:bg-primary/[0.04]">
          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{rank}</td>
          <td className="px-3 py-3">
            <div className="font-semibold">{candidate.symbol}</div>
            <div className="max-w-[180px] truncate text-xs text-muted-foreground">
              {candidate.name}
            </div>
          </td>
          <td className="px-3 py-3"><span className="text-xs font-medium">{trade.setupLabel}</span></td>
          <td className="px-3 py-3"><StatusBadge trade={trade} /></td>
          <td className="px-3 py-3 text-right">
            <Score value={trade.setupScore} />
            {candidate.empirical.active && (
              <div className="mt-0.5 font-mono text-[9px] text-primary">
                rank {candidate.rankScore.toFixed(1)} · {signed(candidate.empirical.adjustment)}
              </div>
            )}
          </td>
          <td className="px-3 py-3 text-right font-mono text-xs">{formatNumber(trade.metrics.rsi14, 1)}</td>
          <td className="px-3 py-3 text-right"><MiniScore value={trade.components.momentum.score} /></td>
          <td className="px-3 py-3 text-right font-mono text-xs">
            {trade.metrics.relativeVolume20 === null ? "n/a" : `${trade.metrics.relativeVolume20.toFixed(2)}x`}
          </td>
          <td className="px-3 py-3 text-right"><MiniScore value={trade.components.location.score} /></td>
          <td className="px-3 py-3 text-right"><MiniScore value={trade.components.confirmation.score} /></td>
          <td className="px-3 py-3 text-right font-mono font-semibold">
            {trade.geometry ? `${trade.geometry.rewardRisk.toFixed(2)}x` : "n/a"}
          </td>
          <td className="px-3 py-3 text-xs capitalize text-muted-foreground">
            {trade.components.regime.value}
          </td>
          <td className="px-3 py-3"><TrackerCell candidate={candidate} /></td>
        </tr>
      </DialogTrigger>
      <TradeDetail candidate={candidate} />
    </Dialog>
  );
}

function TradeDetail({ candidate }: { candidate: RankedCandidate }) {
  const trade = candidate.trade;
  const geometry = trade.geometry;
  return (
    <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2 pr-8">
          <DialogTitle>{candidate.symbol} · {trade.setupLabel}</DialogTitle>
          <StatusBadge trade={trade} />
          {trade.highConviction && <Badge>High Conviction</Badge>}
        </div>
        <DialogDescription>
          {candidate.name} · {candidate.exchange ?? candidate.countryCode} · Setup bar {candidate.priceAsOf}
          {candidate.trackerRow?.latestObservedAt
            ? ` · Latest tracked price ${formatTimestamp(candidate.trackerRow.latestObservedAt)}`
            : ""}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <DetailMetric label="Setup score" value={`${trade.setupScore.toFixed(1)}/100`} />
        <DetailMetric
          label="Conviction rank"
          value={`${candidate.rankScore.toFixed(1)}/100`}
          detail={candidate.empirical.active ? `${signed(candidate.empirical.adjustment)} empirical` : "No empirical overlay yet"}
        />
        <DetailMetric label="Evidence" value={`${trade.evidenceCoverage.toFixed(0)}%`} />
        <DetailMetric
          label="Entry zone"
          value={
            geometry
              ? `${price(geometry.entryLow, candidate.currency)} – ${price(geometry.entryHigh, candidate.currency)}`
              : "n/a"
          }
        />
        <DetailMetric
          label="Invalidation"
          value={geometry ? price(geometry.invalidation, candidate.currency) : "n/a"}
        />
        <DetailMetric
          label="Target / R:R"
          value={
            geometry
              ? `${price(geometry.target, candidate.currency)} · ${geometry.rewardRisk.toFixed(2)}x`
              : "n/a"
          }
        />
      </div>

      <TrackerDetail candidate={candidate} />

      {candidate.empirical.active && (
        <div className="rounded-lg border border-primary/25 bg-primary/[0.04] p-4">
          <div className="flex items-center gap-2 font-semibold">
            <BrainCircuit className="h-4 w-4 text-primary" /> Empirical confirmation
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Historical outcomes changed the ranking by {signed(candidate.empirical.adjustment)} points.
            The raw Setup Score above is unchanged.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {candidate.empirical.matchedPatterns.map((pattern) => (
              <Badge key={pattern} variant="outline" className="text-[10px]">{pattern}</Badge>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          Object.entries(trade.components) as Array<
            [keyof typeof trade.components, (typeof trade.components)[keyof typeof trade.components]]
          >
        ).map(([key, value]) => (
          <div key={key} className="rounded-lg border border-border/70 bg-background/35 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold capitalize">{key}</span>
              <MiniScore value={value.score} />
            </div>
            <div className="mt-1 text-xs font-medium">{value.value}</div>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{value.detail}</p>
            {!value.available && (
              <div className="mt-1 text-[10px] uppercase tracking-wide text-amber-500">
                Missing · neutral score used
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] p-4">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Why it qualifies
          </div>
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
            {trade.reasons.length ? (
              trade.reasons.map((reason) => <li key={reason}>• {reason}</li>)
            ) : (
              <li>• The setup is still waiting for stronger confirmation.</li>
            )}
          </ul>
        </div>
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.04] p-4">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Risks / invalidators
          </div>
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
            {trade.risks.length ? (
              trade.risks.map((risk) => <li key={risk}>• {risk}</li>)
            ) : (
              <li>• No additional model warning is currently active. The invalidation level still defines the trade risk.</li>
            )}
          </ul>
        </div>
      </div>

      <div className="rounded-lg border border-border/70 bg-background/35 p-4">
        <div className="flex items-center gap-2 font-semibold">
          <Gauge className="h-4 w-4 text-primary" /> Setup diagnostics
        </div>
        <div className="mt-3 grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <Diagnostic label="RSI 14" value={formatNumber(trade.metrics.rsi14, 1)} />
          <Diagnostic label="5d return" value={formatPct(trade.metrics.return5dPct)} />
          <Diagnostic label="20d return" value={formatPct(trade.metrics.return20dPct)} />
          <Diagnostic label="Momentum acceleration" value={formatPct(trade.metrics.momentumAccelerationPct)} />
          <Diagnostic
            label="Relative volume"
            value={
              trade.metrics.relativeVolume20 === null
                ? "n/a"
                : `${trade.metrics.relativeVolume20.toFixed(2)}x`
            }
          />
          <Diagnostic label="ATR / price" value={formatPct(trade.metrics.atrPct)} />
          <Diagnostic label="Drawdown from high" value={formatPct(trade.metrics.drawdown52Pct)} />
          <Diagnostic
            label="Fundamental support"
            value={formatNumber(trade.metrics.fundamentalSupport, 0)}
          />
        </div>
        {geometry && (
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Target basis: {geometry.targetBasis}. Entry, invalidation and target are research
            geometry, not an execution instruction.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-3">
        <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
          Setup Score is the raw technical evidence ranking. Conviction Rank may add a small,
          separately disclosed empirical adjustment only after validated point-in-time outcomes exist.
        </p>
        <Button asChild variant="outline">
          <Link to="/security/$symbol" params={{ symbol: candidate.symbol }}>
            Open security <ArrowUpRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </DialogContent>
  );
}

function TrackerCell({ candidate }: { candidate: RankedCandidate }) {
  const row = candidate.trackerRow;
  if (!row) {
    const eligible =
      ["confirmed", "developing"].includes(candidate.trade.status) && candidate.trade.setupScore >= 65;
    return (
      <div className="min-w-[120px] text-xs text-muted-foreground">
        <div>{eligible ? "Awaiting capture" : "Not tracked"}</div>
        {candidate.priorTrackerRow && (
          <div className="mt-0.5 text-[10px]">Prior: {trackerStatusLabel(candidate.priorTrackerRow)}</div>
        )}
      </div>
    );
  }
  return (
    <div className="min-w-[135px]">
      <TrackerBadge row={row} />
      <div className="mt-1 font-mono text-[10px] text-muted-foreground">
        {row.latestObservedPrice === null
          ? formatPct(row.latestReturnPct)
          : `${formatPrice(row.latestObservedPrice)} · ${formatPct(row.latestReturnPct)}`}
      </div>
      <div className="text-[9px] text-muted-foreground">
        {row.latestObservedAt ? formatTimestamp(row.latestObservedAt) : `${row.sessionsObserved} sessions`}
      </div>
    </div>
  );
}

function TrackerDetail({ candidate }: { candidate: RankedCandidate }) {
  const row = candidate.trackerRow;
  if (!row) {
    const eligible =
      ["confirmed", "developing"].includes(candidate.trade.status) && candidate.trade.setupScore >= 65;
    return (
      <div className="rounded-lg border border-border/70 bg-background/35 p-4">
        <div className="flex items-center gap-2 font-semibold">
          <Clock3 className="h-4 w-4 text-primary" /> Outcome tracker
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {eligible
            ? "This exact setup/date has not been frozen into the ledger yet. The hourly monitor or the Refresh button will attempt to capture it, subject to the tracking tables being available."
            : "This setup is not currently eligible for point-in-time tracking. The ledger freezes confirmed/developing setups scoring 65+ with valid entry, target and invalidation geometry."}
        </p>
        {candidate.priorTrackerRow && (
          <div className="mt-3 rounded-md border border-border/60 bg-card/40 px-3 py-2 text-xs">
            Previous {candidate.trade.setupLabel} signal: {candidate.priorTrackerRow.priceAsOf} · {trackerStatusLabel(candidate.priorTrackerRow)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/70 bg-background/35 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold">
          <Clock3 className="h-4 w-4 text-primary" /> Outcome tracker
        </div>
        <TrackerBadge row={row} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <DetailMetric label="Frozen entry" value={price(row.entry, candidate.currency)} />
        <DetailMetric label="Target" value={price(row.target, candidate.currency)} />
        <DetailMetric label="Invalidation" value={price(row.invalidation, candidate.currency)} />
        <DetailMetric label="Latest return" value={formatPct(row.latestReturnPct)} />
        <DetailMetric label="Best move" value={formatPct(row.maxFavourablePct)} />
        <DetailMetric label="Worst move" value={formatPct(row.maxAdversePct)} />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span>Signal frozen {formatTimestamp(row.signalAt)}</span>
        <span>{row.sessionsObserved} completed sessions observed</span>
        <span>
          Latest price {row.latestObservedPrice === null ? "daily bar only" : formatPrice(row.latestObservedPrice)}
          {row.latestObservedAt ? ` at ${formatTimestamp(row.latestObservedAt)}` : ""}
        </span>
      </div>
    </div>
  );
}

function MetricHeader({
  label,
  help,
  align = "left",
}: {
  label: string;
  help: string;
  align?: "left" | "right";
}) {
  return (
    <th className={cn("px-3 py-3", align === "right" && "text-right")}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 border-b border-dotted border-muted-foreground/40 hover:text-foreground",
              align === "right" && "justify-end",
            )}
          >
            {label}
            <CircleHelp className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[340px] border border-border bg-popover px-3 py-2 text-xs leading-5 text-popover-foreground shadow-lg"
        >
          {help}
        </TooltipContent>
      </Tooltip>
    </th>
  );
}

function TrackerBadge({ row }: { row: SwingTrackerRow }) {
  const classes =
    row.outcomeStatus === "target_hit"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
      : row.outcomeStatus === "stop_hit"
        ? "border-red-500/30 bg-red-500/10 text-red-600"
        : row.outcomeStatus === "near_miss"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
          : row.outcomeStatus === "ambiguous_same_bar"
            ? "border-violet-500/30 bg-violet-500/10 text-violet-600"
            : "border-border bg-background/40 text-muted-foreground";
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap text-[10px]", classes)}>
      {trackerStatusLabel(row)}
    </Badge>
  );
}

function trackerStatusLabel(row: SwingTrackerRow): string {
  if (row.outcomeStatus === "target_hit" && row.targetBehaviour === "exceeded") return "Target exceeded";
  if (row.outcomeStatus === "target_hit") return "Target hit";
  if (row.outcomeStatus === "stop_hit") return "Stop hit first";
  if (row.outcomeStatus === "near_miss") return "Near miss";
  if (row.outcomeStatus === "expired") return "Expired";
  if (row.outcomeStatus === "ambiguous_same_bar") return "Target + stop same day";
  return "Active";
}

function StatusBadge({ trade }: { trade: SwingTradeCandidate }) {
  if (trade.highConviction) return <Badge className="whitespace-nowrap">High Conviction</Badge>;
  const classes: Record<SwingSetupStatus, string> = {
    confirmed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
    developing: "border-sky-500/30 bg-sky-500/10 text-sky-600",
    watch_trigger: "border-amber-500/30 bg-amber-500/10 text-amber-600",
    extended: "border-rose-500/30 bg-rose-500/10 text-rose-600",
    failed: "border-muted bg-muted/20 text-muted-foreground",
  };
  const labels: Record<SwingSetupStatus, string> = {
    confirmed: "Confirmed",
    developing: "Developing",
    watch_trigger: "Watch Trigger",
    extended: "Too Extended",
    failed: "Failed",
  };
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", classes[trade.status])}>
      {labels[trade.status]}
    </Badge>
  );
}

function Score({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "font-mono text-sm font-bold",
        value >= 80
          ? "text-emerald-500"
          : value >= 70
            ? "text-primary"
            : value < 55
              ? "text-muted-foreground"
              : "text-foreground",
      )}
    >
      {value.toFixed(1)}
    </span>
  );
}

function MiniScore({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "font-mono text-xs",
        value >= 75 ? "text-emerald-500" : value >= 60 ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {value.toFixed(0)}
    </span>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/55 p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function StatusPill({ label, warning = false }: { label: string; warning?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs",
        warning
          ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
          : "border-primary/20 bg-background/40 text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function FreshnessLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/40 pb-1.5 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-[11px] text-foreground">{value}</span>
    </div>
  );
}

function Weight({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/35 px-3 py-2">
      <span>{label}</span>
      <span className="font-mono text-xs text-foreground">{value}</span>
    </div>
  );
}

function DetailMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/35 p-3">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
      {detail && <div className="mt-0.5 text-[10px] text-muted-foreground">{detail}</div>}
    </div>
  );
}

function Diagnostic({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  );
}

function compareCandidates(left: RankedCandidate, right: RankedCandidate): number {
  return (
    Number(right.trade.highConviction) - Number(left.trade.highConviction) ||
    statusRank(left.trade.status) - statusRank(right.trade.status) ||
    right.rankScore - left.rankScore ||
    (right.trade.geometry?.rewardRisk ?? 0) - (left.trade.geometry?.rewardRisk ?? 0)
  );
}

function statusRank(status: SwingSetupStatus): number {
  return status === "confirmed"
    ? 0
    : status === "developing"
      ? 1
      : status === "watch_trigger"
        ? 2
        : status === "extended"
          ? 3
          : 4;
}

function marketFor(countryCode: string): MarketFilter {
  if (countryCode === "US") return "US";
  if (["UK", "GB"].includes(countryCode)) return "UK";
  return "EU";
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function isNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function isString(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}

function formatNumber(value: number | null, digits: number): string {
  return value === null ? "n/a" : value.toFixed(digits);
}

function formatPct(value: number | null): string {
  return value === null ? "n/a" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function price(value: number, currency: string | null): string {
  const prefix = currency === "GBP" ? "£" : currency === "EUR" ? "€" : currency === "USD" ? "$" : "";
  return `${prefix}${value.toFixed(value >= 100 ? 2 : 3)}`;
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  return value.toFixed(value >= 100 ? 2 : 3);
}

function formatDateOnly(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
