import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { BandBar, InfoTip, ResearchNarrative } from "@/components/research/ResearchContext";
import {
  getHistoryWorkspace,
  type HistoryWorkspace as Workspace,
} from "@/lib/panels/history.functions";
import { cn } from "@/lib/utils";

export type HistoryWorkspaceMode =
  | "library"
  | "analogues"
  | "playbooks"
  | "sector-impacts"
  | "study"
  | "verification"
  | "model-health";

export const historyWorkspaceQueryOptions = queryOptions({
  queryKey: ["history", "workspace", "v2"],
  queryFn: () => getHistoryWorkspace(),
  staleTime: 5 * 60 * 1000,
});

const COPY: Record<HistoryWorkspaceMode, { code: string; title: string; purpose: string }> = {
  library: {
    code: "HE · Event Library",
    title: "Browse the evidence-backed event library",
    purpose:
      "Search and filter every historical episode, then open its sourced narrative and recorded market impacts.",
  },
  analogues: {
    code: "HE · Current Comparisons",
    title: "Which past environments look most like today?",
    purpose:
      "Ranked comparisons using six plain-English macro conditions, reduced when current-data coverage is incomplete.",
  },
  playbooks: {
    code: "HE · Playbooks",
    title: "What should I investigate in each type of shock?",
    purpose:
      "Repeatable research checklists built from the event library and its recorded forward-return evidence.",
  },
  "sector-impacts": {
    code: "HE · Sector Impacts",
    title: "How did sectors behave after past events?",
    purpose:
      "Average, median, success rate and range across the impacts currently recorded in the library.",
  },
  study: {
    code: "HE · Study Explorer",
    title: "Explore the recorded event-study evidence",
    purpose:
      "Filter by event type, return window and market scope. Results use stored impact observations and never invent missing price history.",
  },
  verification: {
    code: "HE · Verification",
    title: "Can the historical narratives be trusted?",
    purpose:
      "Narrative status, source coverage, AI coherence confidence and review flags for every event.",
  },
  "model-health": {
    code: "HE · Model Health",
    title: "How reliable is the Historical Events engine?",
    purpose:
      "Coverage, comparison density, narrative verification and impact-sample depth in one health view.",
  },
};

export function HistoryWorkspacePage({ mode }: { mode: HistoryWorkspaceMode }) {
  const { data } = useSuspenseQuery(historyWorkspaceQueryOptions);
  const copy = COPY[mode];
  const top = data.current.analogs[0];
  return (
    <AppShell>
      <SectionHeader code={copy.code} title={copy.title} purpose={copy.purpose} />
      <div className="mb-3">
        <ResearchNarrative
          summary={
            top
              ? `${top.name} is the closest recorded comparison to today's environment at ${top.adjustedSimilarity.toFixed(0)}% after allowing for live-data coverage.`
              : "No historical comparison currently clears the evidence threshold."
          }
          detail={`${data.events.length} events, ${data.health.totalImpacts} recorded impacts and ${data.health.verificationRate.toFixed(0)}% narrative verification are currently available. Historical comparison is a research prior, not a forecast.`}
          watch={data.current.conditions
            .map((condition) => `${condition.label}: ${humanise(condition.value)}`)
            .slice(0, 4)}
          asOf={data.computedAt}
          confidence={data.current.coverage * 100}
        />
      </div>
      <HealthStrip data={data} />
      {mode === "library" && <Library data={data} />}
      {mode === "analogues" && <Analogues data={data} />}
      {mode === "playbooks" && <Playbooks data={data} />}
      {mode === "sector-impacts" && <SectorImpacts data={data} />}
      {mode === "study" && <StudyExplorer data={data} />}
      {mode === "verification" && <Verification data={data} />}
      {mode === "model-health" && <ModelHealth data={data} />}
    </AppShell>
  );
}

function HealthStrip({ data }: { data: Workspace }) {
  return (
    <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi
        label="Current-data coverage"
        value={`${(data.current.coverage * 100).toFixed(0)}%`}
        help="The share of the six current economic conditions that are populated with live observations."
      />
      <Kpi
        label="Historical events"
        value={String(data.events.length)}
        help="Curated events currently available for comparison and research."
      />
      <Kpi
        label="Narratives verified"
        value={`${data.health.verificationRate.toFixed(0)}%`}
        help="Events whose narrative passed structure, source-link and AI-coherence checks."
      />
      <Kpi
        label="Impact observations"
        value={String(data.health.totalImpacts)}
        help="Recorded forward-return observations available to the sector and study views."
      />
    </div>
  );
}

function Library({ data }: { data: Workspace }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const categories = [...new Set(data.events.map((event) => event.category))].sort();
  const filtered = useMemo(
    () =>
      data.events.filter((event) => {
        const haystack =
          `${event.name} ${event.summary ?? ""} ${event.tags.join(" ")}`.toLowerCase();
        return (
          (category === "all" || event.category === category) &&
          haystack.includes(search.toLowerCase())
        );
      }),
    [category, data.events, search],
  );
  return (
    <Section
      title="Event library"
      description={`${filtered.length} of ${data.events.length} events shown`}
    >
      <div className="mb-3 grid gap-2 md:grid-cols-[1fr_240px]">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search event, theme or tag…"
          className="h-9 rounded border border-border bg-background px-3 text-sm outline-none focus:border-[var(--primary)]"
        />
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="h-9 rounded border border-border bg-background px-3 text-sm"
        >
          <option value="all">All event types</option>
          {categories.map((item) => (
            <option key={item} value={item}>
              {humanise(item)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((event) => (
          <Link
            key={event.code}
            to="/history/$eventId"
            params={{ eventId: event.code }}
            className="rounded border border-border/70 bg-background/20 p-3 transition-colors hover:border-[var(--primary)]/50"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  {new Date(event.startDate).getFullYear()} · {humanise(event.category)}
                </div>
                <h3 className="mt-0.5 text-sm font-semibold">{event.name}</h3>
              </div>
              <Status value={event.narrativeStatus} />
            </div>
            <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">
              {event.summary ?? "Narrative summary pending."}
            </p>
            <div className="mt-3 flex flex-wrap gap-1">
              {event.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="rounded border border-border/50 px-1.5 py-0.5 text-[9px] text-muted-foreground"
                >
                  {humanise(tag)}
                </span>
              ))}
            </div>
            <div className="mt-3 flex justify-between border-t border-border/40 pt-2 font-mono text-[9px] text-muted-foreground">
              <span>{event.citationCount} sources</span>
              <span>{event.impactCount} impacts</span>
            </div>
          </Link>
        ))}
      </div>
    </Section>
  );
}

function Analogues({ data }: { data: Workspace }) {
  return (
    <div className="grid gap-3 xl:grid-cols-[0.7fr_1.3fr]">
      <Section
        title="Today's environment"
        description="Simple condition labels built from the latest official observations."
      >
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          {data.current.conditions.map((condition) => (
            <div
              key={condition.key}
              className="rounded border border-border/50 bg-background/20 p-2"
            >
              <div className="text-[10px] text-muted-foreground">
                <InfoTip label={condition.label} />
              </div>
              <div className="mt-0.5 text-sm font-semibold capitalize">
                {humanise(condition.value)}
              </div>
              <div className="font-mono text-[9px] text-muted-foreground">
                {condition.asOf
                  ? `Source through ${condition.asOf.slice(0, 10)}`
                  : "Source date unavailable"}
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section
        title="Ranked historical comparisons"
        description="The displayed score is the raw condition match reduced for missing current conditions."
      >
        <div className="space-y-3">
          {data.current.analogs.slice(0, 12).map((analog, index) => (
            <article
              key={analog.code}
              className="rounded border border-border/60 bg-background/20 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-[9px] text-muted-foreground">
                    #{index + 1} · {new Date(analog.startDate).getFullYear()} ·{" "}
                    {humanise(analog.category)}
                  </div>
                  <Link
                    to="/history/$eventId"
                    params={{ eventId: analog.code }}
                    className="text-sm font-semibold hover:text-[var(--primary)]"
                  >
                    {analog.name}
                  </Link>
                </div>
                <span className="font-mono text-sm">{analog.adjustedSimilarity.toFixed(0)}%</span>
              </div>
              <div className="mt-2">
                <BandBar
                  value={analog.adjustedSimilarity}
                  explanation={`${analog.rawSimilarity.toFixed(0)}% raw condition similarity × ${(data.current.coverage * 100).toFixed(0)}% live-data coverage = ${analog.adjustedSimilarity.toFixed(0)}% displayed reliability.`}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {analog.dimensions.map((dimension) => (
                  <span
                    key={dimension.key}
                    title={`${dimension.label}: today ${dimension.current}; historical event ${dimension.historical}. ${dimension.score === 1 ? "Full" : dimension.score === 0.5 ? "Half" : "No"} match.`}
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[9px]",
                      dimension.score === 1
                        ? "border-[var(--positive)]/40 text-[var(--positive)]"
                        : dimension.score === 0.5
                          ? "border-[var(--warning)]/40 text-[var(--warning)]"
                          : "border-[var(--negative)]/30 text-muted-foreground",
                    )}
                  >
                    {dimension.label}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Playbooks({ data }: { data: Workspace }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {data.categoryStats.map((stat) => {
        const events = data.events.filter((event) => event.category === stat.key);
        return (
          <Section
            key={stat.key}
            title={`${humanise(stat.key)} playbook`}
            description={`${events.length} events · ${stat.sampleSize} recorded impacts`}
          >
            <p className="text-xs leading-relaxed text-muted-foreground">
              Start with balance-sheet exposure and earnings sensitivity, then check whether today's
              trigger and policy response match the historical episodes below.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Mini label="Median impact" value={pct(stat.median)} />
              <Mini label="Positive outcomes" value={`${stat.hitRate.toFixed(0)}%`} />
              <Mini label="Typical spread" value={`±${stat.standardDeviation.toFixed(1)}%`} />
            </div>
            <ul className="mt-3 space-y-1 text-[11px] text-muted-foreground">
              <li>› Confirm the current trigger, transmission path and likely policy response.</li>
              <li>› Check the weakest balance sheets before relying on average returns.</li>
              <li>
                › Use the median as the base prior; use the observed range for downside cases.
              </li>
              <li>› Treat fewer than five impact observations as an early sample.</li>
            </ul>
            <div className="mt-3 flex flex-wrap gap-1">
              {events.slice(0, 5).map((event) => (
                <Link
                  key={event.code}
                  to="/history/$eventId"
                  params={{ eventId: event.code }}
                  className="rounded border border-border/50 px-1.5 py-0.5 text-[9px] hover:border-[var(--primary)]"
                >
                  {new Date(event.startDate).getFullYear()} {event.name}
                </Link>
              ))}
            </div>
          </Section>
        );
      })}
    </div>
  );
}

function SectorImpacts({ data }: { data: Workspace }) {
  return (
    <Section
      title="Sector impact evidence"
      description="Green is a positive average return, yellow is close to flat and red is negative. Sample size and dispersion remain visible."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-xs">
          <thead>
            <tr className="border-b border-border/60 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="py-2">Sector</th>
              <th>Sample</th>
              <th>Average</th>
              <th>Median</th>
              <th>Positive</th>
              <th>Range</th>
              <th className="w-48">Average-return zone</th>
            </tr>
          </thead>
          <tbody>
            {data.sectorStats.map((stat) => (
              <tr key={stat.key} className="border-b border-border/30">
                <td className="py-2 font-medium">{stat.label}</td>
                <td>{stat.sampleSize}</td>
                <td className={tone(stat.average)}>{pct(stat.average)}</td>
                <td>{pct(stat.median)}</td>
                <td>{stat.hitRate.toFixed(0)}%</td>
                <td>
                  {pct(stat.minimum)} to {pct(stat.maximum)}
                </td>
                <td>
                  <BandBar value={stat.average} min={-50} max={50} format={pct} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function StudyExplorer({ data }: { data: Workspace }) {
  const [category, setCategory] = useState("all");
  const [window, setWindow] = useState("all");
  const categories = [...new Set(data.impacts.map((impact) => impact.eventCategory))].sort();
  const windows = [...new Set(data.impacts.map((impact) => impact.windowDays))].sort(
    (a, b) => a - b,
  );
  const rows = data.impacts.filter(
    (impact) =>
      (category === "all" || impact.eventCategory === category) &&
      (window === "all" || impact.windowDays === Number(window)),
  );
  const values = rows.map((row) => row.returnPct).sort((a, b) => a - b);
  const avg = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const med = values.length ? values[Math.floor(values.length / 2)] : 0;
  return (
    <Section
      title="Recorded-impact explorer"
      description="This is a transparent explorer over stored impact observations, not a hidden or reconstructed backtest."
    >
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="h-9 rounded border border-border bg-background px-3 text-sm"
        >
          <option value="all">All event types</option>
          {categories.map((item) => (
            <option key={item} value={item}>
              {humanise(item)}
            </option>
          ))}
        </select>
        <select
          value={window}
          onChange={(event) => setWindow(event.target.value)}
          className="h-9 rounded border border-border bg-background px-3 text-sm"
        >
          <option value="all">All forward windows</option>
          {windows.map((item) => (
            <option key={item} value={item}>
              {item} days
            </option>
          ))}
        </select>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Mini label="Observations" value={String(rows.length)} />
        <Mini label="Average" value={pct(avg)} />
        <Mini label="Median" value={pct(med)} />
      </div>
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full min-w-[720px] text-xs">
          <thead>
            <tr className="sticky top-0 border-b border-border bg-card text-left text-[10px] text-muted-foreground">
              <th className="py-2">Event</th>
              <th>Type</th>
              <th>Scope</th>
              <th>Window</th>
              <th>Return</th>
              <th>Evidence note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${row.eventId}-${row.scopeCode}-${row.windowDays}-${index}`}
                className="border-b border-border/30"
              >
                <td className="py-2">
                  <Link
                    to="/history/$eventId"
                    params={{ eventId: row.eventCode }}
                    className="hover:text-[var(--primary)]"
                  >
                    {row.eventName}
                  </Link>
                </td>
                <td>{humanise(row.eventCategory)}</td>
                <td>{row.scopeCode}</td>
                <td>{row.windowDays}d</td>
                <td className={tone(row.returnPct)}>{pct(row.returnPct)}</td>
                <td className="max-w-xs text-muted-foreground">{row.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Verification({ data }: { data: Workspace }) {
  return (
    <Section
      title="Narrative verification log"
      description="Verified means the narrative passed structure, source-link and AI-coherence checks. It does not guarantee the investment conclusion."
    >
      <div className="space-y-2">
        {data.events.map((event) => (
          <div
            key={event.code}
            className="grid gap-2 rounded border border-border/50 bg-background/20 p-3 text-xs md:grid-cols-[1fr_110px_100px_90px]"
          >
            <div>
              <Link
                to="/history/$eventId"
                params={{ eventId: event.code }}
                className="font-medium hover:text-[var(--primary)]"
              >
                {event.name}
              </Link>
              <div className="text-[10px] text-muted-foreground">
                {humanise(event.category)} · {event.citationCount} citations · {event.impactCount}{" "}
                impacts
              </div>
            </div>
            <Status value={event.narrativeStatus} />
            <div className="font-mono">
              {event.narrativeConfidence != null
                ? `${event.narrativeConfidence}/100`
                : "not scored"}
            </div>
            <div className="text-muted-foreground">
              {event.narrativeVerifiedAt
                ? new Date(event.narrativeVerifiedAt).toLocaleDateString()
                : "not checked"}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ModelHealth({ data }: { data: Workspace }) {
  const checks = [
    {
      label: "Current conditions populated",
      value: data.current.coverage * 100,
      target: 80,
      detail: "At least five of six conditions is the preferred operating level.",
    },
    {
      label: "Narratives verified",
      value: data.health.verificationRate,
      target: 80,
      detail: "Verified narratives have passed the platform's evidence and coherence loop.",
    },
    {
      label: "Events with impact evidence",
      value: data.health.impactCoverage,
      target: 70,
      detail:
        "Events without recorded impacts can inform narrative research but not return priors.",
    },
    {
      label: "Strong comparison density",
      value: Math.min(
        100,
        data.current.analogs.filter((item) => item.adjustedSimilarity >= 65).length * 20,
      ),
      target: 60,
      detail: "Several strong comparisons are safer than leaning on one historical episode.",
    },
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {checks.map((check) => (
        <Section key={check.label} title={check.label} description={check.detail}>
          <div className="mb-2 flex items-end justify-between">
            <span className="text-3xl font-semibold">{check.value.toFixed(0)}%</span>
            <span className="text-[10px] text-muted-foreground">preferred ≥ {check.target}%</span>
          </div>
          <BandBar value={check.value} explanation={check.detail} />
        </Section>
      ))}
      <Section
        title="Reliability maths"
        description="The extra safeguards used to stop false precision."
      >
        <ul className="space-y-2 text-xs text-muted-foreground">
          <li>› Displayed comparison = raw condition similarity × current-data coverage.</li>
          <li>
            › Adjacent economic conditions receive half credit instead of being treated as
            identical.
          </li>
          <li>
            › Sector evidence shows median, average, hit rate, range and dispersion, not one
            cherry-picked return.
          </li>
          <li>› Small samples remain visible and are described as early evidence.</li>
          <li>
            › Historical comparisons guide questions and downside cases; they never override current
            company evidence.
          </li>
        </ul>
      </Section>
      <Section
        title="Open health items"
        description="What still needs improvement before institutional-grade use."
      >
        <ul className="space-y-2 text-xs text-muted-foreground">
          <li>› Expand event impacts with reproducible point-in-time price histories.</li>
          <li>› Add out-of-sample false-positive tracking as the live regime changes.</li>
          <li>› Separate policy-response similarity from catalyst similarity.</li>
          <li>› Record survivorship and selection-bias checks for sector samples.</li>
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
function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/50 bg-background/30 p-2">
      <div className="text-[9px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-sm">{value}</div>
    </div>
  );
}
function Status({ value }: { value: string }) {
  const good = value === "verified";
  const warn = value === "needs_review";
  return (
    <span
      className={cn(
        "inline-flex h-fit w-fit rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase",
        good
          ? "border-[var(--positive)]/40 text-[var(--positive)]"
          : warn
            ? "border-[var(--warning)]/40 text-[var(--warning)]"
            : "border-border text-muted-foreground",
      )}
    >
      {humanise(value)}
    </span>
  );
}
function humanise(value: string): string {
  return value.replaceAll("_", " ");
}
function pct(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}
function tone(value: number): string {
  return value > 2
    ? "text-[var(--positive)]"
    : value < -2
      ? "text-[var(--negative)]"
      : "text-[var(--warning)]";
}
