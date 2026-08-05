import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CircleDollarSign,
  Eye,
  Search,
  ShieldAlert,
  Sparkles,
  Target,
  Telescope,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { InstitutionalOpportunityWorkspace } from "@/lib/opportunity/institutional.functions";
import type { InstitutionalTier } from "@/lib/opportunity/institutional-model";
import {
  presentOpportunityCandidate,
  type PresentedOpportunity,
} from "@/lib/opportunity/presentation";
import type { OpportunityRadarWorkspace } from "@/lib/opportunity/workspace.functions";
import { cn } from "@/lib/utils";

type TierFilter = "researchable" | InstitutionalTier | "all";
type MarketFilter = "all" | "US" | "UK" | "EU";

const TIER_ORDER: Record<InstitutionalTier, number> = {
  priority: 0,
  qualified: 1,
  watch: 2,
  insufficient: 3,
  avoid: 4,
};

export function OpportunityRadarDefinitiveView({
  workspace,
  institutionalWorkspace,
}: {
  workspace: OpportunityRadarWorkspace;
  institutionalWorkspace: InstitutionalOpportunityWorkspace;
}) {
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<TierFilter>("researchable");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("all");
  const [opportunityFilter, setOpportunityFilter] = useState("all");

  const analysisByAsset = useMemo(
    () => new Map(institutionalWorkspace.analyses.map((analysis) => [analysis.assetId, analysis])),
    [institutionalWorkspace.analyses],
  );

  const rows = useMemo(
    () =>
      workspace.candidates
        .map((candidate) =>
          presentOpportunityCandidate(candidate, analysisByAsset.get(candidate.assetId) ?? null),
        )
        .sort(
          (left, right) =>
            TIER_ORDER[left.tier] - TIER_ORDER[right.tier] ||
            right.score - left.score ||
            right.discovery.routeScore - left.discovery.routeScore,
        ),
    [analysisByAsset, workspace.candidates],
  );

  const opportunityTypes = useMemo(
    () =>
      [...new Set(rows.map((row) => row.discovery.bestRoute?.label).filter((value): value is string => Boolean(value)))]
        .sort(),
    [rows],
  );

  const needle = query.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (
      needle &&
      !`${row.candidate.symbol} ${row.candidate.name} ${row.candidate.industryName ?? ""}`
        .toLowerCase()
        .includes(needle)
    ) {
      return false;
    }
    if (needle) return true;
    if (!matchesMarket(row.candidate.countryCode, marketFilter)) return false;
    if (opportunityFilter !== "all" && row.discovery.bestRoute?.label !== opportunityFilter) return false;
    if (tierFilter === "all") return true;
    if (tierFilter === "researchable") {
      return ["priority", "qualified", "watch"].includes(row.tier);
    }
    return row.tier === tierFilter;
  });

  const counts = countTiers(rows);
  const visible = filtered.slice(0, 90);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.08] via-card/60 to-card/30 p-5 lg:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
              <Sparkles className="h-4 w-4" /> Definitive research queue
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Find the companies worth opening.</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              This page stays deliberately simple. It tells you why a company deserves attention, what the
              main unresolved question is and how strong the current evidence looks. Detailed valuation,
              financial statements, forecasts and model evidence live on the company research screen.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:min-w-[560px]">
            <QueueCount label="Priority" value={counts.priority} tone="positive" />
            <QueueCount label="Qualified" value={counts.qualified} tone="positive" />
            <QueueCount label="Watch" value={counts.watch} tone="warning" />
            <QueueCount label="Insufficient" value={counts.insufficient} tone="muted" />
            <QueueCount label="Avoid" value={counts.avoid} tone="negative" />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border/70 bg-card/50 p-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(300px,1fr)_190px_230px_240px]">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search company, ticker or industry"
              className="h-10 pl-10"
            />
          </label>
          <select
            value={tierFilter}
            onChange={(event) => setTierFilter(event.target.value as TierFilter)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="researchable">Researchable</option>
            <option value="priority">Priority</option>
            <option value="qualified">Qualified</option>
            <option value="watch">Watch</option>
            <option value="insufficient">Insufficient</option>
            <option value="avoid">Avoid</option>
            <option value="all">All tiers</option>
          </select>
          <select
            value={opportunityFilter}
            onChange={(event) => setOpportunityFilter(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">All opportunity types</option>
            {opportunityTypes.map((label) => (
              <option key={label} value={label}>{label}</option>
            ))}
          </select>
          <div className="grid grid-cols-4 gap-1 rounded-md border border-border/70 bg-background/40 p-1">
            {(["all", "US", "UK", "EU"] as MarketFilter[]).map((market) => (
              <button
                key={market}
                type="button"
                onClick={() => setMarketFilter(market)}
                className={cn(
                  "rounded px-2 py-1.5 text-xs font-medium",
                  marketFilter === market
                    ? "bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
                )}
              >
                {market === "all" ? "ALL" : market}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{filtered.length.toLocaleString()} companies match the current view.</span>
          <span>{workspace.universe.loaded.toLocaleString()} companies assessed across the managed universe.</span>
        </div>
      </section>

      {visible.length ? (
        <section className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {visible.map((row) => <OpportunityCard key={row.candidate.assetId} row={row} />)}
        </section>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No company matches the current filters. Search a ticker directly to diagnose its current evidence.
        </div>
      )}

      {filtered.length > visible.length && (
        <div className="rounded-lg border border-border/60 bg-muted/10 p-3 text-center text-xs text-muted-foreground">
          Showing the first {visible.length} of {filtered.length.toLocaleString()} matches. Narrow the filters or search a company directly.
        </div>
      )}
    </div>
  );
}

function OpportunityCard({ row }: { row: PresentedOpportunity }) {
  const candidate = row.candidate;
  const route = row.discovery.bestRoute;
  const risk = row.hardRisks[0] ?? row.warnings[0] ?? candidate.narrative.watch[0] ?? "No major model warning is currently recorded.";
  const thesis = route?.thesis ?? candidate.narrative.summary;
  const nextProof = route?.nextProof ?? candidate.narrative.watch[0] ?? "Review the latest filing and management guidance.";

  return (
    <article className={cn(
      "group flex min-h-[330px] flex-col rounded-2xl border bg-card/45 p-5 transition-all hover:-translate-y-0.5 hover:bg-card/70 hover:shadow-lg",
      row.tier === "priority"
        ? "border-[var(--positive)]/45"
        : row.tier === "qualified"
          ? "border-primary/40"
          : row.tier === "watch"
            ? "border-[var(--warning)]/35"
            : "border-border/70",
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-semibold tracking-tight">{candidate.symbol}</span>
            <span className="truncate text-sm text-muted-foreground">{candidate.name}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {[candidate.industryName, marketLabel(candidate.countryCode)].filter(Boolean).join(" · ")}
          </div>
        </div>
        <TierBadge tier={row.tier} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/35 p-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Opportunity</div>
          <div className="mt-1 text-sm font-semibold">{route?.label ?? "Evidence still forming"}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-2xl font-semibold tabular-nums">{row.score.toFixed(0)}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Radar score</div>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-foreground/90">{thesis}</p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <EvidenceChip label="Valuation" value={candidate.evidence.valuationCompression?.value} />
        <EvidenceChip label="Quality" value={candidate.evidence.fundamentalResilience?.value} />
        <EvidenceChip label="Dislocation" value={candidate.evidence.priceDislocation?.value} />
      </div>

      <div className="mt-4 space-y-2 text-xs leading-5 text-muted-foreground">
        <div><span className="font-semibold text-foreground">What needs to happen: </span>{nextProof}</div>
        <div><span className="font-semibold text-foreground">Main risk: </span>{risk}</div>
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-border/50 pt-4">
        <div className="text-xs text-muted-foreground">
          {candidate.price === null ? "Price unavailable" : `${formatPrice(candidate.price, candidate.currency)} · ${formatPct(candidate.drawdownPct)} from 52w context`}
          <div className="mt-0.5">Evidence coverage {row.coverage.toFixed(0)}%</div>
        </div>
        <Link
          to="/research/$assetId"
          params={{ assetId: candidate.assetId }}
          className="inline-flex items-center gap-2 rounded-lg border border-primary/35 bg-primary/10 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-primary/15"
        >
          Open advanced research <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}

function EvidenceChip({ label, value }: { label: string; value: number | null | undefined }) {
  const state = evidenceState(value);
  return (
    <div className="rounded-lg border border-border/55 bg-muted/10 p-2.5">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn(
        "mt-1 text-xs font-semibold",
        state === "Strong" ? "text-[var(--positive)]" : state === "Weak" ? "text-destructive" : "text-foreground",
      )}>
        {state}
      </div>
    </div>
  );
}

function evidenceState(value: number | null | undefined): "Strong" | "Mixed" | "Weak" | "Missing" {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Missing";
  if (value >= 62) return "Strong";
  if (value < 38) return "Weak";
  return "Mixed";
}

function QueueCount({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "positive" | "warning" | "negative" | "muted";
}) {
  const Icon = label === "Priority" ? Telescope : label === "Qualified" ? Target : label === "Watch" ? Eye : label === "Avoid" ? ShieldAlert : CircleDollarSign;
  return (
    <div className="rounded-xl border border-border/60 bg-background/35 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={cn(
        "mt-1 font-mono text-xl font-semibold tabular-nums",
        tone === "positive" ? "text-[var(--positive)]" : tone === "warning" ? "text-[var(--warning)]" : tone === "negative" ? "text-destructive" : "text-foreground",
      )}>
        {value}
      </div>
    </div>
  );
}

function TierBadge({ tier }: { tier: InstitutionalTier }) {
  const label = tier === "priority" ? "Priority" : tier === "qualified" ? "Qualified" : tier === "watch" ? "Watch" : tier === "avoid" ? "Avoid" : "Insufficient";
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0",
        tier === "priority" || tier === "qualified"
          ? "border-[var(--positive)]/45 text-[var(--positive)]"
          : tier === "watch"
            ? "border-[var(--warning)]/45 text-[var(--warning)]"
            : tier === "avoid"
              ? "border-destructive/45 text-destructive"
              : "text-muted-foreground",
      )}
    >
      {label}
    </Badge>
  );
}

function countTiers(rows: PresentedOpportunity[]) {
  return {
    priority: rows.filter((row) => row.tier === "priority").length,
    qualified: rows.filter((row) => row.tier === "qualified").length,
    watch: rows.filter((row) => row.tier === "watch").length,
    insufficient: rows.filter((row) => row.tier === "insufficient").length,
    avoid: rows.filter((row) => row.tier === "avoid").length,
  };
}

function matchesMarket(countryCode: string, market: MarketFilter): boolean {
  if (market === "all") return true;
  const code = countryCode.toUpperCase();
  if (market === "US") return code === "US";
  if (market === "UK") return code === "GB" || code === "UK";
  return ["DE", "FR", "NL"].includes(code);
}

function marketLabel(countryCode: string): string {
  const code = countryCode.toUpperCase();
  if (code === "US") return "United States";
  if (code === "GB" || code === "UK") return "United Kingdom";
  if (code === "DE") return "Germany";
  if (code === "FR") return "France";
  if (code === "NL") return "Netherlands";
  return countryCode;
}

function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatPrice(value: number, currency: string | null): string {
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
