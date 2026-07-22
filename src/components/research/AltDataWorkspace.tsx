import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import {
  BandBar,
  InfoTip,
  ResearchNarrative,
  StatisticalSparkline,
} from "@/components/research/ResearchContext";
import {
  getAltDataWorkspace,
  type AltDataWorkspace as Workspace,
} from "@/lib/panels/alt-data.functions";
import { cn } from "@/lib/utils";

export type AltDataMode = "attention" | "anomalies" | "model-health";

export const altDataWorkspaceQueryOptions = queryOptions({
  queryKey: ["alt-data", "workspace", "v2"],
  queryFn: () => getAltDataWorkspace(),
  staleTime: 5 * 60 * 1000,
  refetchInterval: 30 * 60 * 1000,
  refetchOnWindowFocus: true,
});

const COPY: Record<AltDataMode, { code: string; title: string; purpose: string }> = {
  attention: {
    code: "AD · Attention",
    title: "Which companies are attracting unusual attention?",
    purpose:
      "Wikipedia article views compared with each company's own recent baseline, with outlier-resistant checks and visible reliability.",
  },
  anomalies: {
    code: "AD · Anomalies",
    title: "Which alternative-data readings are genuinely unusual?",
    purpose:
      "Ranks the largest attention departures after comparing conventional and outlier-resistant methods.",
  },
  "model-health": {
    code: "AD · Model Health",
    title: "How reliable is the Alternative Data engine?",
    purpose:
      "Feed freshness, universe coverage, method agreement and persistence checks without hiding Tier 4 limitations.",
  },
};

export function AltDataWorkspacePage({ mode }: { mode: AltDataMode }) {
  const { data } = useSuspenseQuery(altDataWorkspaceQueryOptions);
  const copy = COPY[mode];
  const top = data.rows[0];
  return (
    <AppShell>
      <SectionHeader code={copy.code} title={copy.title} purpose={copy.purpose} />
      <div className="mb-3">
        <ResearchNarrative
          summary={
            top?.combinedScore != null
              ? `${top.symbol} has the largest current attention departure at ${signed(top.combinedScore)} times its normal variation. ${data.spikeCount} names are in spike territory and ${data.fadeCount} are in attention fade.`
              : "No reliable attention anomaly is available yet."
          }
          detail="The headline reading averages a conventional comparison with an outlier-resistant comparison. Agreement, freshness and baseline depth determine the reliability shown for each name."
          watch={data.rows
            .slice(0, 4)
            .map(
              (row) => `${row.symbol}: ${stateLabel(row.state)} · ${row.reliability}% reliability`,
            )}
          asOf={data.latestSignalDate}
          confidence={
            data.rows.length
              ? data.rows.reduce((sum, row) => sum + row.reliability, 0) / data.rows.length
              : 0
          }
        />
      </div>
      <Summary data={data} />
      {mode === "attention" && <Attention data={data} />}
      {mode === "anomalies" && <Anomalies data={data} />}
      {mode === "model-health" && <ModelHealth data={data} />}
    </AppShell>
  );
}

function Summary({ data }: { data: Workspace }) {
  return (
    <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi
        label="Universe covered"
        value={`${data.coveredAssets}/${data.trackedAssets}`}
        help="Tracked companies with enough raw daily pageviews to calculate the current signal."
      />
      <Kpi
        label="Attention spikes"
        value={String(data.spikeCount)}
        help="Combined attention score at or above +2, meaning views are unusually high relative to the company's own baseline."
      />
      <Kpi
        label="Attention fades"
        value={String(data.fadeCount)}
        help="Combined score at or below −1.5, meaning attention is unusually low relative to the recent baseline."
      />
      <Kpi
        label="Latest signal"
        value={data.latestSignalDate ?? "—"}
        help="Most recent source date in the current attention dataset. Wikimedia usually trails real time by about two days."
      />
    </div>
  );
}

function Attention({ data }: { data: Workspace }) {
  const [search, setSearch] = useState("");
  const rows = useMemo(
    () =>
      data.rows.filter((row) =>
        `${row.symbol} ${row.name}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [data.rows, search],
  );
  return (
    <Section
      title="Company attention monitor"
      description="Charts use green for the recent normal range, yellow for unusual readings and red for exceptional readings. Colours describe unusualness, not whether the company is attractive."
    >
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search company or ticker…"
        className="mb-3 h-9 w-full rounded border border-border bg-background px-3 text-sm outline-none focus:border-[var(--primary)]"
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <AttentionCard key={row.symbol} row={row} />
        ))}
      </div>
    </Section>
  );
}

function AttentionCard({ row }: { row: Workspace["rows"][number] }) {
  return (
    <article className="rounded border border-border/60 bg-background/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[9px] text-muted-foreground">
            {row.symbol} · {row.latestDate ?? "no date"}
          </div>
          <h3 className="text-sm font-semibold">{row.name}</h3>
        </div>
        <State value={row.state} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Mini
          label="Attention gap"
          value={row.combinedScore == null ? "—" : signed(row.combinedScore)}
          help="Average of the conventional and outlier-resistant comparisons. Around zero is normal; ±2 is unusual."
        />
        <Mini
          label="Views"
          value={row.latestViews?.toLocaleString() ?? "—"}
          help={`Recent baseline ${row.baselineMean?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "—"} views.`}
        />
        <Mini
          label="Persistent"
          value={`${row.persistenceDays}d`}
          help="Consecutive recent days where attention remained at least one normal variation away from baseline."
        />
      </div>
      <StatisticalSparkline points={row.history} title={`${row.symbol} Wikipedia pageviews`} />
      <div className="mt-2">
        <div className="mb-1 flex justify-between text-[9px] text-muted-foreground">
          <span>
            <InfoTip label="Signal reliability" />
          </span>
          <span>{row.reliability}%</span>
        </div>
        <BandBar
          value={row.reliability}
          explanation="Combines baseline depth, agreement between two methods and source freshness."
        />
      </div>
    </article>
  );
}

function Anomalies({ data }: { data: Workspace }) {
  return (
    <Section
      title="Anomaly ranking"
      description="Large readings only earn high reliability when the normal and outlier-resistant methods agree."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-xs">
          <thead>
            <tr className="border-b border-border/60 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="py-2">Company</th>
              <th>State</th>
              <th>
                <InfoTip label="Normal comparison" />
              </th>
              <th>
                <InfoTip label="Outlier-resistant comparison" />
              </th>
              <th>Combined</th>
              <th>Persistent</th>
              <th className="w-48">Reliability</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.symbol} className="border-b border-border/30">
                <td className="py-2">
                  <div className="font-medium">{row.symbol}</div>
                  <div className="text-[10px] text-muted-foreground">{row.name}</div>
                </td>
                <td>
                  <State value={row.state} />
                </td>
                <td>{row.conventionalScore == null ? "—" : signed(row.conventionalScore)}</td>
                <td>{row.robustScore == null ? "—" : signed(row.robustScore)}</td>
                <td className={scoreTone(row.combinedScore)}>
                  {row.combinedScore == null ? "—" : signed(row.combinedScore)}
                </td>
                <td>{row.persistenceDays}d</td>
                <td>
                  <BandBar value={row.reliability} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function ModelHealth({ data }: { data: Workspace }) {
  const avgAgreement = data.rows.length
    ? data.rows.reduce(
        (sum, row) => sum + methodAgreement(row.conventionalScore, row.robustScore),
        0,
      ) / data.rows.length
    : 0;
  const runSuccess = data.provider.recentRuns
    ? (data.provider.successfulRuns / data.provider.recentRuns) * 100
    : 0;
  const freshnessScore =
    data.provider.freshnessHours == null
      ? 0
      : Math.max(0, 100 - Math.max(0, data.provider.freshnessHours - 30) * 2);
  const checks = [
    {
      label: "Universe coverage",
      value: data.coverage,
      detail: "Share of active tracked assets with enough daily history.",
    },
    {
      label: "Method agreement",
      value: avgAgreement,
      detail: "Agreement between the normal and outlier-resistant comparisons.",
    },
    {
      label: "Recent run success",
      value: runSuccess,
      detail: "Successful Wikipedia ingestion runs in the latest recorded sample.",
    },
    {
      label: "Feed freshness",
      value: freshnessScore,
      detail: data.provider.lastRunAt
        ? `Last provider run ${new Date(data.provider.lastRunAt).toLocaleString()}.`
        : "No provider run recorded.",
    },
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {checks.map((check) => (
        <Section key={check.label} title={check.label} description={check.detail}>
          <div className="mb-2 text-3xl font-semibold">{check.value.toFixed(0)}%</div>
          <BandBar value={check.value} explanation={check.detail} />
        </Section>
      ))}
      <Section
        title="Reliability maths"
        description="Why the signal is harder to fool than a one-method spike test."
      >
        <ul className="space-y-2 text-xs text-muted-foreground">
          <li>› Normal comparison measures distance from the 60-day mean.</li>
          <li>
            › Outlier-resistant comparison uses the median and median absolute deviation, so one
            viral day cannot distort the baseline as easily.
          </li>
          <li>› The displayed signal averages both methods.</li>
          <li>
            › Reliability falls when the methods disagree, history is thin or the feed is stale.
          </li>
          <li>› Persistence distinguishes one-day noise from a signal that lasts.</li>
        </ul>
      </Section>
      <Section title="Important limits" description="Alternative data remains Tier 4 evidence.">
        <ul className="space-y-2 text-xs text-muted-foreground">
          <li>› Attention is a research-priority signal, not proof of improving fundamentals.</li>
          <li>› Wikipedia can be affected by media cycles, bots and article naming.</li>
          <li>
            › The feed trails real time and should be corroborated against filings, news and price
            action.
          </li>
          <li>
            › Search, positioning, sentiment, supply-chain and weather pages remain disabled until
            real providers are connected. No placeholder values are manufactured.
          </li>
        </ul>
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded border border-border bg-card p-3">
      <div className="mb-3 border-b border-border/50 pb-2">
        <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em]">{title}</h2>
        {description && <p className="mt-0.5 text-[10px] text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
function Kpi({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="rounded border border-border bg-card p-3">
      <div className="font-mono text-[9px] uppercase text-muted-foreground">
        <InfoTip label={label} explanation={help} />
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
function Mini({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="rounded border border-border/50 bg-background/30 p-2">
      <div className="text-[9px] uppercase text-muted-foreground">
        <InfoTip label={label} explanation={help} />
      </div>
      <div className="mt-0.5 font-mono text-sm">{value}</div>
    </div>
  );
}
function State({ value }: { value: Workspace["rows"][number]["state"] }) {
  return (
    <span
      className={cn(
        "inline-flex rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase",
        value === "normal"
          ? "border-[var(--positive)]/40 text-[var(--positive)]"
          : value === "insufficient"
            ? "border-border text-muted-foreground"
            : value === "spike"
              ? "border-[var(--negative)]/40 text-[var(--negative)]"
              : "border-[var(--warning)]/40 text-[var(--warning)]",
      )}
    >
      {stateLabel(value)}
    </span>
  );
}
function stateLabel(value: Workspace["rows"][number]["state"]): string {
  return value === "spike" ? "attention spike" : value === "fade" ? "attention fade" : value;
}
function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}×`;
}
function scoreTone(value: number | null): string {
  return value == null
    ? "text-muted-foreground"
    : Math.abs(value) >= 2
      ? "text-[var(--negative)]"
      : Math.abs(value) >= 1
        ? "text-[var(--warning)]"
        : "text-[var(--positive)]";
}
function methodAgreement(first: number | null, second: number | null): number {
  if (first == null || second == null) return 0;
  return Math.max(0, 100 - Math.min(100, (Math.abs(first - second) / 3) * 100));
}
