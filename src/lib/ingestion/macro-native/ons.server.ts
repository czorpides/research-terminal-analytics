/**
 * ONS timeseries client. Series code shape "<dataset>/<timeseries>",
 * e.g. "cpih01/l55o". Uses the classic ONS JSON endpoint.
 */
import type { NativeObs } from "./types";

const CLASSIC = "https://www.ons.gov.uk";

export async function fetchOnsSeries(seriesCode: string): Promise<NativeObs[]> {
  const [dataset, ts] = seriesCode.split("/");
  if (!dataset || !ts) throw new Error(`ONS series must be "<dataset>/<ts>", got ${seriesCode}`);
  const url = `${CLASSIC}/timeseries/${ts.toLowerCase()}/${dataset.toLowerCase()}/data`;

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`ONS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json() as { months?: Array<{ date: string; value: string }> };

  const out: NativeObs[] = [];
  for (const m of body.months ?? []) {
    const iso = parseOnsMonth(m.date);
    const v = Number(m.value);
    if (iso && Number.isFinite(v)) out.push({ date: iso, value: v });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

function parseOnsMonth(s: string): string | null {
  const m = s.match(/^(\d{4})\s+([A-Z]{3}|M\d{2})$/);
  if (!m) return null;
  const map: Record<string, string> = { JAN:"01",FEB:"02",MAR:"03",APR:"04",MAY:"05",JUN:"06",JUL:"07",AUG:"08",SEP:"09",OCT:"10",NOV:"11",DEC:"12" };
  const mm = m[2].startsWith("M") ? m[2].slice(1) : map[m[2]];
  return mm ? `${m[1]}-${mm}-01` : null;
}