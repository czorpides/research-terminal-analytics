/**
 * Minimal ECB Statistical Data Warehouse (SDW) client.
 *
 * Docs: https://data.ecb.europa.eu/help/api/overview
 * Endpoint pattern:
 *   https://data-api.ecb.europa.eu/service/data/{flowRef}/{key}?format=jsondata
 *
 * The series code in our registry is stored as `FLOW.KEY.PARTS...` — we
 * split on the first dot into flow + key so callers stay unaware of the
 * SDW's slightly quirky URL shape.
 */
import type { NativeObs } from "./types";

const BASE = "https://data-api.ecb.europa.eu/service/data";

export async function fetchEcbSeries(seriesCode: string, opts: { startPeriod?: string } = {}): Promise<NativeObs[]> {
  const dot = seriesCode.indexOf(".");
  if (dot < 0) throw new Error(`ECB SDW series code must be FLOW.KEY; got ${seriesCode}`);
  const flow = seriesCode.slice(0, dot);
  const key  = seriesCode.slice(dot + 1);
  const url = new URL(`${BASE}/${flow}/${key}`);
  url.searchParams.set("format", "jsondata");
  if (opts.startPeriod) url.searchParams.set("startPeriod", opts.startPeriod);

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`ECB SDW ${res.status}: ${await safeText(res)}`);
  const body = await res.json() as EcbResponse;

  const obs = body?.dataSets?.[0]?.series?.["0:0:0:0:0:0:0"]?.observations
           ?? body?.dataSets?.[0]?.series?.["0:0:0:0:0:0"]?.observations
           ?? body?.dataSets?.[0]?.series?.["0:0:0"]?.observations
           ?? firstSeries(body);
  const timeVals: string[] = body?.structure?.dimensions?.observation?.[0]?.values?.map((v) => v.id) ?? [];
  if (!obs || timeVals.length === 0) return [];

  const out: NativeObs[] = [];
  Object.entries(obs).forEach(([idx, arr]) => {
    const t = timeVals[Number(idx)];
    const v = Array.isArray(arr) ? arr[0] : null;
    if (t && typeof v === "number" && Number.isFinite(v)) {
      out.push({ date: normalisePeriod(t), value: v });
    }
  });
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

function firstSeries(body: EcbResponse): Record<string, unknown[]> | null {
  const series = body?.dataSets?.[0]?.series;
  if (!series) return null;
  const first = Object.values(series)[0];
  return (first?.observations ?? null) as Record<string, unknown[]> | null;
}

function normalisePeriod(p: string): string {
  // ECB periods: YYYY, YYYY-Qn, YYYY-Mn, YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
  if (/^\d{4}-\d{2}$/.test(p))      return `${p}-01`;
  if (/^\d{4}$/.test(p))            return `${p}-01-01`;
  const q = p.match(/^(\d{4})-Q([1-4])$/);
  if (q) return `${q[1]}-${String((Number(q[2]) - 1) * 3 + 1).padStart(2, "0")}-01`;
  return p;
}

async function safeText(res: Response): Promise<string> {
  try { return (await res.text()).slice(0, 300); } catch { return ""; }
}

interface EcbResponse {
  dataSets?: Array<{ series?: Record<string, { observations?: Record<string, unknown[]> }> }>;
  structure?: { dimensions?: { observation?: Array<{ values?: Array<{ id: string }> }> } };
}