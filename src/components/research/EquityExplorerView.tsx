import { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  Globe2,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getEquityExplorer,
  type EquityExplorerInput,
  type EquityExplorerMode,
  type EquityExplorerRow,
  type EquitySortKey,
} from "@/lib/equities/explorer.functions";
import { cn } from "@/lib/utils";

const PAGE_SIZES = [25, 50, 100, 200];
const MARKET_OPTIONS = ["US", "UK", "EU"] as const;

const MODE_COPY: Record<
  EquityExplorerMode,
  { label: string; note: string; setupLabel: string; defaultSort: EquitySortKey }
> = {
  master: {
    label: "Global security master",
    note: "Reference view across every active equity. Missing scores remain visible rather than being silently excluded.",
    setupLabel: "Composite",
    defaultSort: "composite",
  },
  screener: {
    label: "Cross-market screener",
    note: "Every filter is evaluated server-side across the full active universe before pagination.",
    setupLabel: "Composite",
    defaultSort: "composite",
  },
  undervalued: {
    label: "Undervaluation research queue",
    note: "Default gate: valuation at least 60 and quality at least 45. This is a research queue, not a recommendation list.",
    setupLabel: "Value setup",
    defaultSort: "valueSetup",
  },
  overvalued: {
    label: "Overvaluation risk queue",
    note: "Default gate: valuation at most 40. Risk setup combines expensive valuation with weak quality, trend, momentum and volatility evidence.",
    setupLabel: "Risk setup",
    defaultSort: "riskSetup",
  },
};

interface FilterState {
  search: string;
  markets: Array<"US" | "UK" | "EU" | "Other">;
  country: string;
  industry: string;
  coverage: EquityExplorerInput["coverage"];
  minMomentum: string;
  maxMomentum: string;
  minTrend: string;
  maxTrend: string;
  minValuation: string;
  maxValuation: string;
  minQuality: string;
  maxQuality: string;
  minComposite: string;
  maxComposite: string;
  sort: EquitySortKey;
  direction: "asc" | "desc";
  pageSize: number;
}

export function EquityExplorerView({ mode }: { mode: EquityExplorerMode }) {
  const copy = MODE_COPY[mode];
  const load = useServerFn(getEquityExplorer);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<FilterState>(() => initialFilters(mode));
  const deferredSearch = useDeferredValue(filters.search);

  const input = useMemo<EquityExplorerInput>(
    () => ({
      mode,
      page,
      pageSize: filters.pageSize,
      search: deferredSearch || undefined,
      markets: filters.markets.length ? filters.markets : undefined,
      countries: filters.country ? [filters.country] : undefined,
      industries: filters.industry ? [filters.industry] : undefined,
      coverage: filters.coverage,
      minMomentum: numberOrUndefined(filters.minMomentum),
      maxMomentum: numberOrUndefined(filters.maxMomentum),
      minTrend: numberOrUndefined(filters.minTrend),
      maxTrend: numberOrUndefined(filters.maxTrend),
      minValuation: numberOrUndefined(filters.minValuation),
      maxValuation: numberOrUndefined(filters.maxValuation),
      minQuality: numberOrUndefined(filters.minQuality),
      maxQuality: numberOrUndefined(filters.maxQuality),
      minComposite: numberOrUndefined(filters.minComposite),
      maxComposite: numberOrUndefined(filters.maxComposite),
      sort: filters.sort,
      direction: filters.direction,
    }),
    [deferredSearch, filters, mode, page],
  );

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["equity-explorer", input],
    queryFn: () => load({ data: input }),
    staleTime: 2 * 60 * 1000,
    placeholderData: (previous) => previous,
  });

  const update = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const toggleMarket = (market: (typeof MARKET_OPTIONS)[number]) => {
    const next = filters.markets.includes(market)
      ? filters.markets.filter((value) => value !== market)
      : [...filters.markets, market];
    update("markets", next);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border/70 bg-card/45 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Globe2 className="h-4 w-4 text-[var(--info)]" />
              {copy.label}
            </div>
            <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-muted-foreground">
              {copy.note}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-[9px]">
              {data ? `${data.total.toLocaleString()} matched` : "Loading"}
            </Badge>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[10px]" onClick={() => refetch()}>
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} /> Refresh
            </Button>
          </div>
        </div>
      </div>

      {data && <CoverageSummary data={data} />}

      <div className="rounded-md border border-border/70 bg-card/35 p-3">
        <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filters and ranking
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <label className="relative xl:col-span-2">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.search}
              onChange={(event) => update("search", event.target.value)}
              placeholder="Search ticker, company, country or industry"
              className="h-9 pl-8 text-xs"
            />
          </label>
          <SelectField
            value={filters.country}
            onChange={(value) => update("country", value)}
            options={(data?.facets.countries ?? []).map((item) => ({
              value: item.code,
              label: `${item.name} (${item.count})`,
            }))}
            placeholder="All countries"
          />
          <SelectField
            value={filters.industry}
            onChange={(value) => update("industry", value)}
            options={(data?.facets.industries ?? []).map((item) => ({
              value: item.code,
              label: `${item.name} (${item.count})`,
            }))}
            placeholder="All sectors"
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {MARKET_OPTIONS.map((market) => (
            <button
              key={market}
              type="button"
              onClick={() => toggleMarket(market)}
              className={cn(
                "rounded border px-2.5 py-1 text-[10px] transition-colors",
                filters.markets.includes(market)
                  ? "border-[var(--info)]/60 bg-[var(--info)]/10 text-foreground"
                  : "border-border/70 text-muted-foreground hover:text-foreground",
              )}
            >
              {market}
            </button>
          ))}
          <select
            value={filters.coverage}
            onChange={(event) => update("coverage", event.target.value as FilterState["coverage"])}
            className="h-7 rounded border border-border/70 bg-background px-2 text-[10px]"
          >
            <option value="all">All coverage</option>
            <option value="technical">Has technicals</option>
            <option value="fundamental">Has fundamentals</option>
            <option value="complete">Fully scored</option>
            <option value="missing">Missing evidence</option>
          </select>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <ScoreRange
            label="Momentum"
            minimum={filters.minMomentum}
            maximum={filters.maxMomentum}
            onMinimum={(value) => update("minMomentum", value)}
            onMaximum={(value) => update("maxMomentum", value)}
          />
          <ScoreRange
            label="Trend"
            minimum={filters.minTrend}
            maximum={filters.maxTrend}
            onMinimum={(value) => update("minTrend", value)}
            onMaximum={(value) => update("maxTrend", value)}
          />
          <ScoreRange
            label="Valuation"
            minimum={filters.minValuation}
            maximum={filters.maxValuation}
            onMinimum={(value) => update("minValuation", value)}
            onMaximum={(value) => update("maxValuation", value)}
          />
          <ScoreRange
            label="Quality"
            minimum={filters.minQuality}
            maximum={filters.maxQuality}
            onMinimum={(value) => update("minQuality", value)}
            onMaximum={(value) => update("maxQuality", value)}
          />
          <ScoreRange
            label="Composite"
            minimum={filters.minComposite}
            maximum={filters.maxComposite}
            onMinimum={(value) => update("minComposite", value)}
            onMaximum={(value) => update("maxComposite", value)}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Rank by</span>
            <select
              value={filters.sort}
              onChange={(event) => update("sort", event.target.value as EquitySortKey)}
              className="h-8 rounded border border-border/70 bg-background px-2 text-[10px]"
            >
              <option value="composite">Composite</option>
              <option value="valueSetup">Value setup</option>
              <option value="riskSetup">Risk setup</option>
              <option value="valuation">Valuation</option>
              <option value="quality">Quality</option>
              <option value="momentum">Momentum</option>
              <option value="trend">Trend</option>
              <option value="confidence">Confidence</option>
              <option value="symbol">Ticker</option>
              <option value="country">Country</option>
            </select>
            <button
              type="button"
              onClick={() => update("direction", filters.direction === "desc" ? "asc" : "desc")}
              className="h-8 rounded border border-border/70 px-2 text-[10px] text-muted-foreground hover:text-foreground"
            >
              {filters.direction === "desc" ? "High → low" : "Low → high"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setFilters(initialFilters(mode));
              setPage(1);
            }}
            className="text-[10px] text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
          >
            Reset filters
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-[var(--negative)]/40 bg-[var(--negative)]/5 p-3 text-xs text-[var(--negative)]">
          Explorer unavailable: {(error as Error).message}
        </div>
      )}
      {isLoading && !data && (
        <div className="rounded-md border border-border/70 p-8 text-center text-xs text-muted-foreground">
          Loading the global equity universe…
        </div>
      )}
      {data && <EquityTable rows={data.rows} mode={mode} setupLabel={copy.setupLabel} />}
      {data && (
        <Pagination
          page={data.page}
          totalPages={data.totalPages}
          pageSize={filters.pageSize}
          total={data.total}
          onPage={setPage}
          onPageSize={(value) => update("pageSize", value)}
        />
      )}
    </div>
  );
}

function CoverageSummary({ data }: { data: NonNullable<ReturnType<typeof useQuery>["data"]> }) {
  const items = [
    { label: "Active universe", value: data.universeSize, detail: `${data.summary.us} US · ${data.summary.uk} UK · ${data.summary.eu} EU`, icon: Globe2 },
    { label: "Technical coverage", value: data.summary.technicalCoverage, detail: pct(data.summary.technicalCoverage, data.universeSize), icon: Database },
    { label: "Fundamental coverage", value: data.summary.fundamentalCoverage, detail: pct(data.summary.fundamentalCoverage, data.universeSize), icon: Database },
    { label: "Fully scored", value: data.summary.fullyScored, detail: pct(data.summary.fullyScored, data.universeSize), icon: CheckCircle2 },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-md border border-border/70 bg-card/35 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.label}</span>
            <item.icon className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{item.value.toLocaleString()}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">{item.detail}</div>
        </div>
      ))}
    </div>
  );
}

function EquityTable({
  rows,
  mode,
  setupLabel,
}: {
  rows: EquityExplorerRow[];
  mode: EquityExplorerMode;
  setupLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-10 text-center text-xs text-muted-foreground">
        No equities match the current filters.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border/70 bg-card/30">
      <table className="w-full min-w-[1320px] border-collapse text-left text-[11px]">
        <thead>
          <tr className="border-b border-border/70 bg-muted/20 text-[9px] uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2 font-medium">Company</th>
            <th className="px-2 py-2 font-medium">Market</th>
            <th className="px-2 py-2 font-medium">Sector</th>
            <th className="px-2 py-2 text-right font-medium">Last</th>
            <th className="px-2 py-2 text-right font-medium">Momentum</th>
            <th className="px-2 py-2 text-right font-medium">Trend</th>
            <th className="px-2 py-2 text-right font-medium">Volatility</th>
            <th className="px-2 py-2 text-right font-medium">Valuation</th>
            <th className="px-2 py-2 text-right font-medium">Quality</th>
            <th className="px-2 py-2 text-right font-medium">{setupLabel}</th>
            <th className="px-2 py-2 text-right font-medium">Confidence</th>
            <th className="px-3 py-2 font-medium">Coverage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const setup = mode === "undervalued" ? row.valueSetup : mode === "overvalued" ? row.riskSetup : row.composite;
            return (
              <tr key={row.assetId} className="border-b border-border/55 transition-colors last:border-b-0 hover:bg-muted/30">
                <td className="px-3 py-2">
                  <Link to="/security/$symbol" params={{ symbol: row.symbol }} className="font-semibold hover:underline">
                    {row.symbol}
                  </Link>
                  <div className="max-w-64 truncate text-[9px] text-muted-foreground">{row.name}</div>
                </td>
                <td className="px-2 py-2">
                  <div className="font-medium">{row.market}</div>
                  <div className="text-[9px] text-muted-foreground">{row.countryCode} · {row.exchange ?? "—"}</div>
                </td>
                <td className="max-w-44 truncate px-2 py-2 text-muted-foreground">{row.industry ?? "Unmapped"}</td>
                <td className="px-2 py-2 text-right font-mono tabular-nums">{money(row.lastClose, row.currency)}</td>
                <ScoreCell value={row.momentum} />
                <ScoreCell value={row.trend} />
                <ScoreCell value={row.volatility} />
                <ScoreCell value={row.valuation} />
                <ScoreCell value={row.quality} />
                <ScoreCell value={setup} emphasize />
                <td className="px-2 py-2 text-right font-mono tabular-nums">{row.confidence.toFixed(0)}%</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline" className={cn("px-1.5 py-0 text-[8px]", row.technicalCoverage && "border-[var(--positive)]/40")}>T</Badge>
                    <Badge variant="outline" className={cn("px-1.5 py-0 text-[8px]", row.fundamentalCoverage && "border-[var(--positive)]/40")}>F</Badge>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ScoreCell({ value, emphasize = false }: { value: number | null; emphasize?: boolean }) {
  return (
    <td className={cn("px-2 py-2 text-right font-mono tabular-nums", tone(value), emphasize && "font-semibold")}>
      {value?.toFixed(0) ?? "—"}
    </td>
  );
}

function Pagination({
  page,
  totalPages,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/70 bg-card/30 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-[10px] text-muted-foreground">Showing {start.toLocaleString()}–{end.toLocaleString()} of {total.toLocaleString()}</div>
      <div className="flex items-center gap-2">
        <select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))} className="h-8 rounded border border-border/70 bg-background px-2 text-[10px]">
          {PAGE_SIZES.map((size) => <option key={size} value={size}>{size} per page</option>)}
        </select>
        <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="min-w-24 text-center font-mono text-[10px]">Page {page} / {totalPages}</span>
        <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ScoreRange({
  label,
  minimum,
  maximum,
  onMinimum,
  onMaximum,
}: {
  label: string;
  minimum: string;
  maximum: string;
  onMinimum: (value: string) => void;
  onMaximum: (value: string) => void;
}) {
  return (
    <div className="rounded border border-border/60 bg-background/40 p-2">
      <div className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="grid grid-cols-2 gap-1">
        <input value={minimum} onChange={(event) => onMinimum(event.target.value)} inputMode="numeric" placeholder="Min" className="h-7 min-w-0 rounded border border-border/70 bg-background px-2 text-[10px]" />
        <input value={maximum} onChange={(event) => onMaximum(event.target.value)} inputMode="numeric" placeholder="Max" className="h-7 min-w-0 rounded border border-border/70 bg-background px-2 text-[10px]" />
      </div>
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-xs">
      <option value="">{placeholder}</option>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function initialFilters(mode: EquityExplorerMode): FilterState {
  return {
    search: "",
    markets: ["US", "UK", "EU"],
    country: "",
    industry: "",
    coverage: "all",
    minMomentum: "",
    maxMomentum: "",
    minTrend: "",
    maxTrend: "",
    minValuation: mode === "undervalued" ? "60" : "",
    maxValuation: mode === "overvalued" ? "40" : "",
    minQuality: mode === "undervalued" ? "45" : "",
    maxQuality: "",
    minComposite: "",
    maxComposite: "",
    sort: MODE_COPY[mode].defaultSort,
    direction: "desc",
    pageSize: 50,
  };
}

function tone(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  if (value >= 65) return "text-[var(--positive)]";
  if (value <= 35) return "text-[var(--negative)]";
  return "text-foreground";
}

function money(value: number | null, currency: string | null): string {
  if (value === null) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: value >= 100 ? 0 : 2,
    }).format(value);
  } catch {
    return value.toFixed(2);
  }
}

function pct(value: number, total: number): string {
  return total > 0 ? `${((value / total) * 100).toFixed(1)}% of universe` : "No active equities";
}

function numberOrUndefined(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : undefined;
}
