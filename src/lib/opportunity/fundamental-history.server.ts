import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  STATEMENT_METRICS,
  type AnnualFinancialPeriod,
  type StatementMetricKey,
} from "./fundamental-models";

interface FilingRow {
  id: string;
  asset_id: string;
  period_end: string;
  known_at: string;
  revision_no: number;
  is_restatement: boolean;
}

interface FactRow {
  filing_id: string;
  metric_code: string;
  value_num: number;
}

const KEY_BY_CODE = new Map<string, StatementMetricKey>(
  Object.entries(STATEMENT_METRICS).map(([key, code]) => [code, key as StatementMetricKey]),
);

/**
 * Load the latest known revision for each annual period. Older revisions stay
 * in the database for point-in-time backtests, but the live Radar uses only
 * the newest revision that is known today.
 */
export async function loadAnnualFinancialHistory(
  assetIds: string[],
): Promise<Map<string, AnnualFinancialPeriod[]>> {
  if (assetIds.length === 0) return new Map();
  const filingData: FilingRow[] = [];
  // Keep every response below the common 1,000-row PostgREST ceiling. A
  // single oversized request could otherwise return a valid but silently
  // truncated history for the later assets in the universe.
  for (let start = 0; start < assetIds.length; start += 100) {
    const batch = assetIds.slice(start, start + 100);
    const { data, error } = await supabaseAdmin
      .from("fundamental_filings")
      .select("id,asset_id,period_end,known_at,revision_no,is_restatement")
      .in("asset_id", batch)
      .eq("fiscal_period", "FY")
      .order("period_end", { ascending: false })
      .order("revision_no", { ascending: false })
      .limit(batch.length * 12);
    if (error) throw error;
    filingData.push(...((data ?? []) as FilingRow[]));
  }

  const latestByPeriod = new Map<string, FilingRow>();
  for (const row of filingData) {
    const key = `${row.asset_id}:${row.period_end}`;
    const current = latestByPeriod.get(key);
    if (
      !current ||
      row.known_at > current.known_at ||
      (row.known_at === current.known_at && row.revision_no > current.revision_no)
    ) {
      latestByPeriod.set(key, row);
    }
  }
  const filings = [...latestByPeriod.values()];
  if (filings.length === 0) return new Map();

  const facts: FactRow[] = [];
  const filingIds = filings.map((filing) => filing.id);
  for (let start = 0; start < filingIds.length; start += 75) {
    const batch = filingIds.slice(start, start + 75);
    const { data, error } = await supabaseAdmin
      .from("fundamental_facts")
      .select("filing_id,metric_code,value_num")
      .in("filing_id", batch)
      .limit(batch.length * Object.keys(STATEMENT_METRICS).length);
    if (error) throw error;
    facts.push(...((data ?? []) as FactRow[]));
  }

  const valuesByFiling = new Map<string, AnnualFinancialPeriod["values"]>();
  for (const fact of facts) {
    const key = KEY_BY_CODE.get(fact.metric_code);
    if (!key || fact.value_num === null || !Number.isFinite(Number(fact.value_num))) continue;
    const values = valuesByFiling.get(fact.filing_id) ?? {};
    values[key] = Number(fact.value_num);
    valuesByFiling.set(fact.filing_id, values);
  }

  const histories = new Map<string, AnnualFinancialPeriod[]>();
  for (const filing of filings) {
    histories.set(filing.asset_id, [
      ...(histories.get(filing.asset_id) ?? []),
      {
        periodEnd: filing.period_end,
        knownAt: filing.known_at,
        revision: filing.revision_no,
        isRestatement: filing.is_restatement,
        values: valuesByFiling.get(filing.id) ?? {},
      },
    ]);
  }
  for (const [assetId, periods] of histories) {
    histories.set(
      assetId,
      periods.sort((left, right) => right.periodEnd.localeCompare(left.periodEnd)),
    );
  }
  return histories;
}
