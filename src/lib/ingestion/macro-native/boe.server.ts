/**
 * Bank of England IADB CSV client. Reads any BoE Interactive Statistical
 * Database series (Bank Rate, gilt yields, SONIA, etc.) via the public
 * CSV endpoint — no API key required.
 */
import type { NativeObs } from "./types";

const BASE = "https://www.bankofengland.co.uk/boeapps/iadb/fromshowcolumns.asp";

export async function fetchBoeSeries(seriesCode: string, opts: { startDate?: string } = {}): Promise<NativeObs[]> {
  const url = new URL(BASE);
  url.searchParams.set("csv.x", "yes");
  url.searchParams.set("Datefrom", boeDate(opts.startDate ?? yearsAgo(5)));
  url.searchParams.set("Dateto", boeDate(new Date().toISOString().slice(0, 10)));
  url.searchParams.set("SeriesCodes", seriesCode);
  url.searchParams.set("UsingCodes", "Y");
  url.searchParams.set("VPD", "Y");
  url.searchParams.set("VFD", "N");

  const res = await fetch(url.toString(), { headers: { Accept: "text/csv" } });
  if (!res.ok) throw new Error(`BoE IADB ${res.status}`);
  return parseCsv(await res.text());
}

function parseCsv(text: string): NativeObs[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const out: NativeObs[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",").map((p) => p.replace(/^"|"$/g, "").trim());
    const iso = parseBoeDate(parts[0] ?? "");
    const num = Number(parts[1]);
    if (iso && Number.isFinite(num)) out.push({ date: iso, value: num });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

function parseBoeDate(s: string): string | null {
  const m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!m) return null;
  const months: Record<string, string> = { Jan:"01",Feb:"02",Mar:"03",Apr:"04",May:"05",Jun:"06",Jul:"07",Aug:"08",Sep:"09",Oct:"10",Nov:"11",Dec:"12" };
  const mm = months[m[2]]; if (!mm) return null;
  return `${m[3]}-${mm}-${m[1].padStart(2, "0")}`;
}

function boeDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d}/${months[Number(m) - 1]}/${y}`;
}

function yearsAgo(n: number): string {
  return new Date(Date.now() - 365 * n * 86400_000).toISOString().slice(0, 10);
}