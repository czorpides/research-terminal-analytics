export interface ProviderEarningsEvent {
  symbol: string;
  name: string;
  reportDate: string;
  fiscalDateEnding: string | null;
  estimate: number | null;
  currency: string | null;
}

export interface ProviderReportedEarnings {
  symbol: string;
  fiscalDateEnding: string;
  reportedDate: string;
  reportedEps: number | null;
  estimatedEps: number | null;
  surprisePercent: number | null;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  values.push(current.trim());
  return values;
}

function numberOrNull(value: string | undefined): number | null {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) ? parsed : null;
}

/**
 * Alpha Vantage's official earnings-calendar endpoint returns CSV. One
 * three-month request covers the full provider universe; we filter it to the
 * terminal's tracked assets before persisting anything.
 */
export async function fetchAlphaVantageEarningsCalendar(
  horizon: "3month" | "6month" | "12month" = "3month",
): Promise<ProviderEarningsEvent[]> {
  const apiKey = process.env.ALPHAVANTAGE_API_KEY;
  if (!apiKey) throw new Error("ALPHAVANTAGE_API_KEY is not configured");

  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "EARNINGS_CALENDAR");
  url.searchParams.set("horizon", horizon);
  url.searchParams.set("apikey", apiKey);

  await reserveAlphaVantageCall();
  const text = await alphaVantageText(url, "text/csv", "earnings calendar");

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
  const indexOf = (name: string) => headers.indexOf(name.toLowerCase());
  const symbolIndex = indexOf("symbol");
  const nameIndex = indexOf("name");
  const reportDateIndex = indexOf("reportDate");
  const fiscalDateIndex = indexOf("fiscalDateEnding");
  const estimateIndex = indexOf("estimate");
  const currencyIndex = indexOf("currency");
  if (symbolIndex < 0 || reportDateIndex < 0) {
    throw new Error("Alpha Vantage earnings calendar returned an unexpected CSV schema");
  }

  return lines
    .slice(1)
    .map(parseCsvLine)
    .map((values): ProviderEarningsEvent => ({
      symbol: values[symbolIndex]?.toUpperCase() ?? "",
      name: values[nameIndex] ?? values[symbolIndex] ?? "",
      reportDate: values[reportDateIndex] ?? "",
      fiscalDateEnding: values[fiscalDateIndex] || null,
      estimate: numberOrNull(values[estimateIndex]),
      currency: values[currencyIndex] || null,
    }))
    .filter(
      (event) =>
        Boolean(event.symbol) &&
        /^\d{4}-\d{2}-\d{2}$/.test(event.reportDate) &&
        Number.isFinite(new Date(`${event.reportDate}T00:00:00Z`).getTime()),
    );
}

/**
 * Fetch reported quarterly EPS for one tracked company. This is called only
 * after a scheduled earnings event, so the calendar worker does not spend
 * provider quota polling every company every day.
 */
export async function fetchAlphaVantageReportedEarnings(
  symbol: string,
): Promise<ProviderReportedEarnings[]> {
  const apiKey = process.env.ALPHAVANTAGE_API_KEY;
  if (!apiKey) throw new Error("ALPHAVANTAGE_API_KEY is not configured");

  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "EARNINGS");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", apiKey);

  await reserveAlphaVantageCall();
  const text = await alphaVantageText(url, "application/json", "reported earnings");
  const payload = JSON.parse(text) as {
    symbol?: string;
    quarterlyEarnings?: Array<Record<string, string | undefined>>;
    Information?: string;
    Note?: string;
    "Error Message"?: string;
  };
  const providerMessage = payload.Information ?? payload.Note ?? payload["Error Message"];
  if (providerMessage) {
    throw new Error(`Alpha Vantage reported earnings: ${providerMessage.slice(0, 240)}`);
  }

  return (payload.quarterlyEarnings ?? []).flatMap((row) => {
    const fiscalDateEnding = row.fiscalDateEnding ?? "";
    const reportedDate = row.reportedDate ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fiscalDateEnding) || !/^\d{4}-\d{2}-\d{2}$/.test(reportedDate))
      return [];
    return [
      {
        symbol: (payload.symbol ?? symbol).toUpperCase(),
        fiscalDateEnding,
        reportedDate,
        reportedEps: providerNumber(row.reportedEPS),
        estimatedEps: providerNumber(row.estimatedEPS),
        surprisePercent: providerNumber(row.surprisePercentage),
      },
    ];
  });
}

async function reserveAlphaVantageCall(): Promise<void> {
  const gate = await canUse("alphavantage", 25);
  if (!gate.ok) throw new Error(`Alpha Vantage quota unavailable: ${gate.reason}`);
  const quota = await getQuota("alphavantage");
  if (!quota?.last_call_at) return;
  const waitMs = 15_000 - (Date.now() - new Date(quota.last_call_at).getTime());
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
}

async function alphaVantageText(url: URL, accept: string, label: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: { Accept: accept },
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    if (!response.ok) {
      const rateLimited = response.status === 429;
      await recordCall(
        "alphavantage",
        rateLimited ? "rate_limit" : "error",
        `${label} HTTP ${response.status}`,
      );
      throw new Error(`Alpha Vantage ${label} HTTP ${response.status}`);
    }
    if (/^(information|note|error message)/i.test(text.trim())) {
      await recordCall("alphavantage", "rate_limit", text.trim().slice(0, 240));
      throw new Error(`Alpha Vantage ${label}: ${text.trim().slice(0, 240)}`);
    }
    if (accept.includes("json")) {
      try {
        const messagePayload = JSON.parse(text) as {
          Information?: string;
          Note?: string;
          "Error Message"?: string;
        };
        const message =
          messagePayload.Information ?? messagePayload.Note ?? messagePayload["Error Message"];
        if (message) {
          await recordCall("alphavantage", "rate_limit", message.slice(0, 240));
          throw new Error(`Alpha Vantage ${label}: ${message.slice(0, 240)}`);
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Alpha Vantage")) throw error;
        await recordCall("alphavantage", "error", `${label} returned invalid JSON`);
        throw new Error(`Alpha Vantage ${label} returned invalid JSON`);
      }
    }
    await recordCall("alphavantage", "ok");
    return text;
  } catch (error) {
    if (!(error instanceof Error) || !/Alpha Vantage/.test(error.message)) {
      await recordCall(
        "alphavantage",
        "error",
        error instanceof Error ? error.message : `${label} request failed`,
      );
    }
    throw error;
  }
}

function providerNumber(value: string | undefined): number | null {
  if (!value || value === "None" || value === "-") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
import { canUse, getQuota, recordCall } from "@/lib/ingestion/providers/quota.server";
