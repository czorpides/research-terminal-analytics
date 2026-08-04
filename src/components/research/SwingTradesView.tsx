import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Crosshair,
  Gauge,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
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
  applyRegimeContext,
  regimeScoreForLabel,
  type SwingSetupStatus,
  type SwingSetupType,
  type SwingTradeCandidate,
} from "@/lib/swing/model";
import type {
  SwingTradesWorkspace,
  SwingWorkspaceCandidate,
} from "@/lib/swing/workspace.functions";
import type { RegimeMonitorPayload } from "@/lib/panels/regime.functions";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | SwingSetupStatus | "high_conviction";
type SetupFilter = "all" | SwingSetupType;
type MarketFilter = "all" | "US" | "UK" | "EU";
type DisplayCandidate = Omit<SwingWorkspaceCandidate, "trade"> & { trade: SwingTradeCandidate };

const SETUP_OPTIONS: Array<{ value: SwingSetupType; label: string }> = [
  { value: "pullback_uptrend", label: "Pullback" },
  { value: "oversold_reversal", label: "Oversold reversal" },
  { value: "breakout", label: "Breakout" },
  { value: "momentum_continuation", label: "Momentum continuation" },
  { value: "recovery_repricing", label: "Recovery / repricing" },
];

export function SwingTradesView({
  workspace,
  regime,
}: {
  workspace: SwingTradesWorkspace;
  regime: RegimeMonitorPayload;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [setup, setSetup] = useState<SetupFilter>("all");
  const [market, setMarket] = useState<MarketFilter>("all");
  const [minScore, setMinScore] = useState(60);
  const [fundamentalOnly, setFundamentalOnly] = useState(false);

  const contextual = useMemo(() => {
    const usRegimeAvailable = regime.current.label !== "insufficient";
    const usScore = regimeScoreForLabel(regime.current.label);
    return workspace.candidates
      .map<DisplayCandidate>((candidate) => ({
        ...candidate,
        trade:
          candidate.countryCode === "US"
            ? applyRegimeContext(candidate.trade, usScore, regime.current.label, usRegimeAvailable)
            : applyRegimeContext(candidate.trade, 50, "regional regime unavailable", false),
      }))
      .sort(compareCandidates);
  }, [regime.current.label, workspace.candidates]);

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

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-primary/30 bg-primary/[0.06] p-4 lg:p-5">
        <div className="flex items-start gap-3">
          <Crosshair className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
              SW · Swing Trade Radar
            </div>
            <h2 className="mt-1 text-lg font-semibold">
              Rank the setup, the trigger and the downside before taking the trade
            </h2>
            <p className="mt-1 max-w-5xl text-sm leading-6 text-muted-foreground">
              The engine combines RSI, short-term momentum, location, relative volume,
              volatility, confirmation, market regime and verified catalyst evidence. Five
              setup archetypes compete for each stock, and the best setup is only labelled
              High Conviction when the price trigger, evidence coverage and reward/risk all
              clear hard gates.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusPill label={`${workspace.universe.scoreScreened.toLocaleString()} score-screened`} />
              <StatusPill label={`${workspace.universe.deepScanned.toLocaleString()} deep-scanned`} />
              <StatusPill label={`${workspace.candidates.length} surfaced`} />
              <StatusPill label="No claimed win rate until calibrated" warning />
            </div>
          </div>
        </div>
      </section>

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
          detail="80+ score plus hard gates"
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
          detail="Confirmed setups with geometry"
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
            As of {workspace.asOf} · {workspace.modelVersion}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No current setups clear these filters. Lower the score threshold or broaden the
            setup/state filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="border-b border-border/70 bg-background/35 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-3 py-3">Security</th>
                  <th className="px-3 py-3">Setup</th>
                  <th className="px-3 py-3">State</th>
                  <th className="px-3 py-3 text-right">Score</th>
                  <th className="px-3 py-3 text-right">RSI</th>
                  <th className="px-3 py-3 text-right">Momentum</th>
                  <th className="px-3 py-3 text-right">Rel vol</th>
                  <th className="px-3 py-3 text-right">Location</th>
                  <th className="px-3 py-3 text-right">Confirm</th>
                  <th className="px-3 py-3 text-right">R:R</th>
                  <th className="px-3 py-3">Regime</th>
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
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-4">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Calibration boundary
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {workspace.calibration.note}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            High Conviction currently means strong deterministic evidence plus confirmation,
            minimum 1.8x reward/risk, at least 75% evidence coverage, fresh prices and no earnings
            event inside three days. It does not mean an 80% chance of making money.
          </p>
        </div>
      </section>
    </div>
  );
}

function SwingRow({ candidate, rank }: { candidate: DisplayCandidate; rank: number }) {
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
          <td className="px-3 py-3 text-right"><Score value={trade.setupScore} /></td>
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
        </tr>
      </DialogTrigger>
      <TradeDetail candidate={candidate} />
    </Dialog>
  );
}

function TradeDetail({ candidate }: { candidate: DisplayCandidate }) {
  const trade = candidate.trade;
  const geometry = trade.geometry;
  return (
    <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2 pr-8">
          <DialogTitle>{candidate.symbol} · {trade.setupLabel}</DialogTitle>
          <StatusBadge trade={trade} />
          {trade.highConviction && <Badge>High Conviction</Badge>}
        </div>
        <DialogDescription>
          {candidate.name} · {candidate.exchange ?? candidate.countryCode} · Price data {candidate.priceAsOf}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <DetailMetric label="Setup score" value={`${trade.setupScore.toFixed(1)}/100`} />
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
          Setup Score is an evidence ranking. Historical hit rates will only be shown after
          point-in-time calibration across 5, 10, 20 and 40 trading-day outcomes.
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
  icon: typeof TrendingUp;
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

function Weight({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/35 px-3 py-2">
      <span>{label}</span>
      <span className="font-mono text-xs text-foreground">{value}</span>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/35 p-3">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
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

function compareCandidates(left: DisplayCandidate, right: DisplayCandidate): number {
  return (
    Number(right.trade.highConviction) - Number(left.trade.highConviction) ||
    statusRank(left.trade.status) - statusRank(right.trade.status) ||
    right.trade.setupScore - left.trade.setupScore ||
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

function formatNumber(value: number | null, digits: number): string {
  return value === null ? "n/a" : value.toFixed(digits);
}

function formatPct(value: number | null): string {
  return value === null ? "n/a" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function price(value: number, currency: string | null): string {
  const prefix = currency === "GBP" ? "£" : currency === "EUR" ? "€" : currency === "USD" ? "$" : "";
  return `${prefix}${value.toFixed(value >= 100 ? 2 : 3)}`;
}
