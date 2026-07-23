import { Link } from "@tanstack/react-router";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { DashboardGrid, DashboardPanel } from "@/components/research/DashboardPanel";
import { InfoTip, ResearchNarrative } from "@/components/research/ResearchContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  ReleaseCalendarDashboard,
  ReleaseCalendarEventView,
} from "@/lib/panels/release-calendar.functions";
import { cn } from "@/lib/utils";

export function ReleaseCalendarView({ data }: { data: ReleaseCalendarDashboard }) {
  const riskCount = data.counts.waiting + data.counts.delayed + data.counts.failed;
  return (
    <>
      <SectionHeader
        code="PF · Release Calendar"
        title="What is due, and did the data actually arrive?"
        purpose="Official macro release dates and tracked-company earnings dates drive targeted refreshes. Each event stays visible until the terminal verifies new data or raises a delay."
        right={
          <div className="text-right font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            <div>Page checked {dateTime(data.generatedAt)}</div>
            <div>Calendar synced {relativeDate(data.calendarUpdatedAt)}</div>
          </div>
        }
      />

      <DashboardGrid columns={4} className="mb-3">
        <CalendarKpi
          label="Next 7 days"
          value={String(data.counts.nextSevenDays)}
          note="Macro, earnings and safety checks"
          explanation="Events whose scheduled refresh time falls within the next seven days."
        />
        <CalendarKpi
          label="Macro releases"
          value={String(data.counts.macro)}
          note="Official FRED calendar"
          explanation="Upcoming dates mapped from FRED releases to the exact series used by the terminal."
        />
        <CalendarKpi
          label="Tracked earnings"
          value={String(data.counts.earnings)}
          note="Alpha Vantage calendar"
          explanation="Upcoming reports for companies already in the terminal's active universe."
        />
        <CalendarKpi
          label="Needs attention"
          value={String(riskCount)}
          note={
            riskCount
              ? `${data.counts.waiting} retrying · ${data.counts.delayed} delayed`
              : "No unresolved release checks"
          }
          explanation="Events still retrying, beyond their expected publication window, or failed."
          tone={riskCount ? "warning" : "positive"}
        />
      </DashboardGrid>

      <div className="mb-3">
        <ResearchNarrative
          summary={calendarSummary(data)}
          detail="A future date only tells the terminal when to start checking. After that time, the worker refreshes the mapped data, compares the result with the stored observation, and only marks the event verified when a new or revised value is present. Daily and weekly safety passes catch late postings and calendar mismatches."
          watch={[
            "Waiting means the release window is still open and another targeted retry is scheduled.",
            "Delayed means the official date passed without a new tracked observation; it is an alert, not a fabricated value.",
            "Source dates on charts remain the economic observation dates. The page-check time only shows when this screen last reloaded.",
          ]}
          asOf={data.lastWorkerAttemptAt ?? data.calendarUpdatedAt}
          confidence={riskCount ? 82 : 96}
        />
      </div>

      <div className="grid auto-rows-fr gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.55fr)]">
        <DashboardPanel
          title="Upcoming release queue"
          eyebrow="Automatic"
          description="Provider dates, mapped refresh scope and current verification state."
          bodyClassName="p-0"
          expandedChildren={<EventTable events={data.upcoming} expanded />}
        >
          <EventTable events={data.upcoming.slice(0, 14)} />
        </DashboardPanel>
        <DashboardPanel
          title="How refresh works"
          eyebrow="Reliability"
          description="The guardrails behind the calendar."
          expandedChildren={<RefreshMethod expanded />}
        >
          <RefreshMethod />
        </DashboardPanel>
        <DashboardPanel
          title="Recent release checks"
          eyebrow="Audit trail"
          description="What the worker verified, retried or flagged."
          bodyClassName="p-0"
          className="xl:col-span-2"
          expandedChildren={<EventTable events={data.recent} expanded />}
        >
          <EventTable events={data.recent.slice(0, 10)} />
        </DashboardPanel>
      </div>
    </>
  );
}

export function ReleaseCalendarStrip({ data }: { data: ReleaseCalendarDashboard }) {
  const events = data.upcoming.slice(0, 5);
  return (
    <DashboardPanel
      title="Next releases and refreshes"
      eyebrow="Release-aware data"
      description="The terminal starts targeted checks on these dates and verifies that new data landed."
      className="mb-3"
      expandedChildren={<EventTable events={data.upcoming} expanded />}
      actions={
        <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-[10px]">
          <Link to="/calendar">Full calendar</Link>
        </Button>
      }
    >
      <div className="grid gap-2 md:grid-cols-5">
        {events.length ? (
          events.map((event) => <MiniEvent key={event.id} event={event} />)
        ) : (
          <div className="col-span-full py-4 text-xs text-muted-foreground">
            No upcoming mapped releases are currently stored. The nightly calendar sync will
            repopulate this queue.
          </div>
        )}
      </div>
    </DashboardPanel>
  );
}

function CalendarKpi({
  label,
  value,
  note,
  explanation,
  tone = "neutral",
}: {
  label: string;
  value: string;
  note: string;
  explanation: string;
  tone?: "neutral" | "positive" | "warning";
}) {
  return (
    <div className="h-full rounded-md border border-border/70 bg-card/70 p-3">
      <InfoTip label={label} explanation={explanation}>
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </InfoTip>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "positive" && "text-[var(--positive)]",
          tone === "warning" && "text-[var(--warning)]",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">{note}</div>
    </div>
  );
}

function MiniEvent({ event }: { event: ReleaseCalendarEventView }) {
  return (
    <div className="min-w-0 rounded border border-border/60 bg-background/35 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--primary)]">
          {event.type === "earnings" ? event.symbol : (event.region ?? "Global")}
        </span>
        <StatusBadge status={event.status} />
      </div>
      <div className="mt-1 truncate text-xs font-medium">{event.title}</div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        {shortDateTime(event.scheduledAt)}
      </div>
    </div>
  );
}

function EventTable({
  events,
  expanded = false,
}: {
  events: ReleaseCalendarEventView[];
  expanded?: boolean;
}) {
  if (!events.length)
    return <div className="p-4 text-xs text-muted-foreground">No events in this window.</div>;
  return (
    <div className={cn("divide-y divide-border/55", expanded && "rounded border border-border/60")}>
      {events.map((event) => (
        <div
          key={event.id}
          className={cn(
            "grid gap-2 px-3 py-2.5 sm:grid-cols-[130px_minmax(0,1fr)_120px_110px] sm:items-center",
            expanded && "sm:grid-cols-[155px_minmax(0,1fr)_170px_130px]",
          )}
        >
          <div>
            <div className="text-xs font-medium tabular-nums">
              {shortDateTime(event.scheduledAt)}
            </div>
            <div className="font-mono text-[9px] uppercase text-muted-foreground">
              {event.provider} · {event.type.replaceAll("_", " ")}
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <span className="truncate">{event.title}</span>
              {event.sourceLink && (
                <a
                  href={event.sourceLink}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open source for ${event.title}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <div className={cn("text-[10px] text-muted-foreground", !expanded && "line-clamp-1")}>
              {event.explanation}
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground">
            <div>{event.engines.join(" · ") || "Tracked asset"}</div>
            <div>
              {event.seriesCount
                ? `${event.seriesCount} mapped series`
                : event.symbol
                  ? `${event.symbol} evidence`
                  : "Catch-up scope"}
            </div>
          </div>
          <div className="flex items-center gap-2 sm:justify-end">
            <StatusBadge status={event.status} />
            {event.attemptCount > 0 && (
              <span className="font-mono text-[9px] text-muted-foreground">
                {event.attemptCount}×
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: ReleaseCalendarEventView["status"] }) {
  const style: Record<ReleaseCalendarEventView["status"], string> = {
    scheduled: "border-border text-muted-foreground",
    refreshing: "border-[var(--primary)]/50 text-[var(--primary)]",
    waiting: "border-[var(--warning)]/50 text-[var(--warning)]",
    verified: "border-[var(--positive)]/50 text-[var(--positive)]",
    delayed: "border-[var(--warning)]/50 bg-[var(--warning)]/10 text-[var(--warning)]",
    failed: "border-[var(--negative)]/50 bg-[var(--negative)]/10 text-[var(--negative)]",
    cancelled: "border-border text-muted-foreground line-through",
  };
  return (
    <Badge variant="outline" className={cn("h-5 px-1.5 text-[9px] uppercase", style[status])}>
      {status}
    </Badge>
  );
}

function RefreshMethod({ expanded = false }: { expanded?: boolean }) {
  const steps = [
    {
      icon: CalendarClock,
      title: "1. Know the date",
      text: "FRED supplies official macro dates; Alpha Vantage supplies earnings dates for tracked companies.",
    },
    {
      icon: RefreshCw,
      title: "2. Refresh the right data",
      text: "Only the mapped engines and series run after a release. Safety passes still catch revisions and late postings.",
    },
    {
      icon: CheckCircle2,
      title: "3. Verify the result",
      text: "A macro event is verified only after a new or revised observation is stored. Earnings require reported EPS.",
    },
    {
      icon: ShieldAlert,
      title: "4. Flag uncertainty",
      text: "Missing releases retry during the expected window, then become delayed or failed instead of showing stale data as current.",
    },
  ];
  return (
    <div className={cn("space-y-3", expanded && "grid gap-3 space-y-0 md:grid-cols-2")}>
      {steps.map((step) => (
        <div key={step.title} className="flex gap-2.5 rounded border border-border/55 p-2.5">
          <step.icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
          <div>
            <div className="text-xs font-medium">{step.title}</div>
            <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{step.text}</p>
          </div>
        </div>
      ))}
      <div className="flex gap-2.5 rounded border border-border/55 p-2.5">
        <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
        <div>
          <div className="text-xs font-medium">Two timestamps, two meanings</div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
            The source date is when the economic value applies. The page-check time is when this
            screen last asked the database for updates.
          </p>
        </div>
      </div>
    </div>
  );
}

function calendarSummary(data: ReleaseCalendarDashboard): string {
  const attention = data.counts.waiting + data.counts.delayed + data.counts.failed;
  if (!data.upcoming.length)
    return "The release queue is empty. The next nightly provider sync is expected to repopulate it.";
  return `${data.counts.nextSevenDays} automated release checks are due in the next seven days. ${
    attention
      ? `${attention} recent event${attention === 1 ? " needs" : "s need"} attention.`
      : "No recent event is unresolved."
  }`;
}

function shortDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function relativeDate(value: string | null): string {
  if (!value) return "awaiting first sync";
  const hours = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 3_600_000));
  if (hours < 1) return "within the last hour";
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
