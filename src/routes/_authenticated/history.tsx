import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  FlaskConical,
  History,
  Layers,
  PieChart,
  ShieldCheck,
} from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { BandBar } from "@/components/research/ResearchContext";
import { historyWorkspaceQueryOptions } from "@/components/research/HistoryWorkspace";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Historical Events — Research Terminal" },
      {
        name: "description",
        content:
          "Historical regime comparisons, event library, sector impacts, playbooks, verification and model health.",
      },
    ],
  }),
  component: HistoryRoute,
});

function HistoryRoute() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const root = pathname === "/history" || pathname === "/history/";
  return root ? <HistoryOverview /> : <Outlet />;
}

function HistoryOverview() {
  const { data } = useSuspenseQuery(historyWorkspaceQueryOptions);
  const topAnalogs = data.current.analogs.slice(0, 5);
  const latestEvents = [...data.events]
    .sort((left, right) => right.startDate.localeCompare(left.startDate))
    .slice(0, 6);

  return (
    <AppShell>
      <SectionHeader
        code="HE · Historical Events"
        title="What happened in comparable environments, and how reliable is the comparison?"
        purpose="Start with today's condition fingerprint, inspect ranked historical analogues, then move into event narratives, sector studies, playbooks and verification. Historical evidence is presented as a research prior rather than a forecast."
      />

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Current-data coverage" value={`${(data.current.coverage * 100).toFixed(0)}%`} detail="Conditions populated from live observations" />
        <Kpi label="Historical episodes" value={String(data.events.length)} detail="Sourced events available for comparison" />
        <Kpi label="Recorded impacts" value={String(data.health.totalImpacts)} detail="Sector and market return observations" />
        <Kpi label="Narratives verified" value={`${data.health.verificationRate.toFixed(0)}%`} detail="Structure, sources and coherence checks" />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]">
        <section className="rounded-md border border-border/70 bg-card/40 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Current environment</div>
              <h2 className="mt-0.5 text-sm font-semibold">Closest historical comparisons</h2>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                Similarity is reduced when today's live-data fingerprint is incomplete.
              </p>
            </div>
            <Link to="/history/analogues" className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
              Full comparison <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {topAnalogs.length ? topAnalogs.map((analog, index) => (
              <Link
                key={analog.code}
                to="/history/$eventId"
                params={{ eventId: analog.code }}
                className="block rounded border border-border/55 bg-background/25 p-2.5 transition-colors hover:border-[var(--primary)]/45"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-[9px] text-muted-foreground">#{index + 1} · {new Date(analog.startDate).getFullYear()} · {humanise(analog.category)}</div>
                    <div className="truncate text-xs font-semibold">{analog.name}</div>
                  </div>
                  <div className="font-mono text-sm font-semibold">{analog.adjustedSimilarity.toFixed(0)}%</div>
                </div>
                <div className="mt-2"><BandBar value={analog.adjustedSimilarity} /></div>
              </Link>
            )) : <Empty text="No historical comparison currently clears the evidence threshold." />}
          </div>
        </section>

        <section className="rounded-md border border-border/70 bg-card/40 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Library pulse</div>
              <h2 className="mt-0.5 text-sm font-semibold">Most recent recorded episodes</h2>
            </div>
            <Link to="/history/library" className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
              Event library <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="mt-3 divide-y divide-border/50">
            {latestEvents.map((event) => (
              <Link key={event.code} to="/history/$eventId" params={{ eventId: event.code }} className="flex items-center justify-between gap-3 py-2 hover:text-[var(--primary)]">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium">{event.name}</div>
                  <div className="font-mono text-[9px] text-muted-foreground">{event.startDate.slice(0, 4)} · {humanise(event.category)} · {event.impactCount} impacts</div>
                </div>
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HubCard to="/history/library" icon={BookOpen} title="Event Library" detail="Search sourced episodes by shock, cycle, policy response and tag." />
        <HubCard to="/history/analogues" icon={Layers} title="Regime Analogues" detail="Inspect today's condition fingerprint against ranked past environments." />
        <HubCard to="/history/playbooks" icon={ClipboardCheck} title="Playbooks" detail="Use repeatable research checklists grounded in recorded episodes." />
        <HubCard to="/history/sector-impacts" icon={PieChart} title="Sector Impacts" detail="Compare median, range, hit rate and dispersion across sectors." />
        <HubCard to="/history/study" icon={BarChart3} title="Study Explorer" detail="Filter individual event-impact observations and return windows." />
        <HubCard to="/history/verification" icon={ShieldCheck} title="Verification Log" detail="Review narrative status, source coverage and coherence checks." />
        <HubCard to="/history/model-health" icon={FlaskConical} title="Model Health" detail="Audit coverage, sample depth, verification and comparison density." />
        <div className="rounded-md border border-border/70 bg-card/30 p-3">
          <History className="h-4 w-4 text-[var(--primary)]" />
          <div className="mt-2 text-xs font-semibold">How to use history</div>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Use analogues to form questions, not conclusions. Confirm trigger, transmission path and policy response before applying a past playbook.</p>
        </div>
      </div>
    </AppShell>
  );
}

function HubCard({ to, icon: Icon, title, detail }: { to: string; icon: typeof History; title: string; detail: string }) {
  return (
    <Link to={to} className="group rounded-md border border-border/70 bg-card/35 p-3 transition-colors hover:border-[var(--primary)]/45">
      <div className="flex items-start justify-between gap-2">
        <Icon className="h-4 w-4 text-[var(--primary)]" />
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="mt-2 text-xs font-semibold">{title}</div>
      <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{detail}</p>
    </Link>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-md border border-border/70 bg-card/35 p-3"><div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 font-mono text-2xl font-semibold">{value}</div><div className="mt-1 text-[10px] text-muted-foreground">{detail}</div></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded border border-dashed border-border p-6 text-center text-xs text-muted-foreground">{text}</div>;
}

function humanise(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
