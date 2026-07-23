export type ScheduledEventType = "macro_release" | "earnings" | "safety_refresh";
export type ScheduledEventStatus =
  "scheduled" | "refreshing" | "waiting" | "verified" | "delayed" | "failed" | "cancelled";

export interface ScheduledDataEvent {
  id: string;
  eventKey: string;
  eventType: ScheduledEventType;
  providerCode: string;
  providerEventId: string | null;
  title: string;
  regionCode: string | null;
  symbol: string | null;
  assetId: string | null;
  scheduledAt: string;
  status: ScheduledEventStatus;
  seriesCodes: string[];
  engines: string[];
  attemptCount: number;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  verifiedAt: string | null;
  lastError: string | null;
  metadata: Record<string, unknown>;
}

export interface CalendarSyncSummary {
  startedAt: string;
  finishedAt: string;
  fred: {
    status: "success" | "failed";
    mappings: number;
    eventsUpserted: number;
    error?: string;
  };
  earnings: {
    status: "success" | "skipped" | "failed";
    providerRows: number;
    trackedEventsUpserted: number;
    error?: string;
  };
  safetyEventsUpserted: number;
}

export interface CalendarRunResult {
  eventKey: string;
  title: string;
  type: ScheduledEventType;
  status: ScheduledEventStatus;
  changed: number;
  revisions: number;
  detail: string;
}
