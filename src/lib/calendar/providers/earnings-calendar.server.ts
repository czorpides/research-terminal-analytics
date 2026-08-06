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

type AlphaVantageResponseFormat = "csv" | "json";

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
  const text = await alphaVantageText(url, "csv", "earnings calendar");

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new Error(
      `Alpha Vantage earnings calendar returned no data rows ` +
        `(lines=${lines.length}, chars=${text.length}, preview=${responseDetail(text) ?? "<empty>"})`,
    );
  }

  // Downloadable CSVs can include a UTF-8 BOM before the first header. Strip it
  // before schema matching so a valid `symbol` column cannot become invisible.
  const headerLine = lines[0].replace(/^\uFEFF/, "");
  const headers = parseCsvLine(headerLine).map((header) => header.toLowerCase());
  const indexOf = (name: string) => headers.indexOf(name.toLowerCase());
  const symbolIndex = indexOf("symbol");
  const nameIndex = indexOf("name");
  const reportDateIndex = indexOf("reportDate");
  const fiscalDateIndex = indexOf("fiscalDateEnding");
  const estimateIndex = indexOf("estimate");
  const currencyIndex = indexOf("currency");
  if (symbolIndex < 0 || reportDateIndex < 0) {
    throw new Error(
      `Alpha Vantage earnings calendar returned an unexpected CSV schema ` +
        `(header=${headerLine.slice(0, 320)})`,
    );
  }

  const events = lines
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

  if (!events.length) {
    const firstDataLine = lines[1]?.slice(0, 320) ?? "<none>";
    throw new Error(
      `Alpha Vantage earnings calendar contained ${lines.length - 1} raw data row(s) but 0 usable rows ` +
        `(header=${headerLine.slice(0, 240)}, firstData=${firstDataLine})`,
    );
  }

  return events;
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
  const text = await alphaVantageText(url, "json", "reported earnings");
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

async function alphaVantageText(
  url: URL,
  format: AlphaVantageResponseFormat,
  label: string,
): Promise<string> {
  try {
    // Do not send an explicit Accept header. The earnings-calendar endpoint is
    // CSV-only and the live server runtime was rejected with HTTP 406 when it
    // advertised `Accept: text/csv`, while the same URL succeeds with normal
    // provider defaults outside the app runtime.
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    if (!response.ok) {
      const rateLimited = response.status === 429;
      const detail = responseDetail(text);
      const statusMessage = `${label} HTTP ${response.status}${detail ? `: ${detail}` : ""}`;
      await recordCall(
        "alphavantage",
        rateLimited ? "rate_limit" : "error",
        statusMessage.slice(0, 320),
      );
      throw new Error(`Alpha Vantage ${statusMessage}`);
    }
    if (/^(information|note|error message)/i.test(text.trim())) {
      await recordCall("alphavantage", "rate_limit", text.trim().slice(0, 240));
      throw new Error(`Alpha Vantage ${label}: ${text.trim().slice(0, 240)}`);
    }
    if (format === "json") {
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

function responseDetail(text: string): string | null {
  const detail = text.replace(/\s+/g, " ").trim();
  return detail ? detail.slice(0, 240) : null;
}

function providerNumber(value: string | undefined): number | null {
  if (!value || value === "None" || value === "-") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
import { canUse, getQuota, recordCall } from "@/lib/ingestion/providers/quota.server";
