/** Official SEC submissions.filings.files archive metadata provides filing
 * date ranges. A high-volume issuer may have dozens of recent archive shards:
 * blindly fetching the four newest cannot reach original 10-K filings from
 * earlier years. Use the latest known original 10-K filed date to prioritize
 * the anniversaries of missing historical reports, capped at four shards.
 * URLs remain strictly same-CIK and parent-metadata allowlisted.
 */
interface SecArchiveMetadata {
  name: string;
  filingFrom?: unknown;
  filingTo?: unknown;
}
interface ArchiveRange {
  name: string;
  from: string | null;
  to: string;
}
export function chooseSecHistoricFiles(
  submissionsInput: unknown,
  cik: number,
  currentYear: number,
  maximum = 4,
  referenceFiledDate?: string,
): string[] {
  if (!Number.isInteger(cik) || cik <= 0) throw new Error("Invalid SEC CIK");
  if (!Number.isInteger(currentYear) || currentYear < 2000) throw new Error("Invalid year");
  const limit = Math.max(0, Math.min(4, Number.isInteger(maximum) ? maximum : 0));
  if (!limit) return [];
  const submissions = submissionsInput as {
    filings?: { files?: SecArchiveMetadata[] };
  } | null;
  const prefix = "CIK" + String(cik).padStart(10, "0") + "-submissions-";
  const approvedPattern = new RegExp("^" + prefix + "[0-9]{3}\\.json$");
  const archives: ArchiveRange[] = [];
  for (const row of submissions?.filings?.files ?? []) {
    if (!row || typeof row.name !== "string" ||
        !approvedPattern.test(row.name) || typeof row.filingTo !== "string" ||
        !validDate(row.filingTo)) continue;
    const from = typeof row.filingFrom === "string" && validDate(row.filingFrom)
      ? row.filingFrom : null;
    if (from && from > row.filingTo) continue;
    if (Number(row.filingTo.slice(0, 4)) < currentYear - 6) continue;
    archives.push({name:row.name,from,to:row.filingTo});
  }
  archives.sort((a,b) => b.to.localeCompare(a.to));
  if (!referenceFiledDate || !validDate(referenceFiledDate)) {
    return archives.slice(0,limit).map(a => a.name);
  }
  const targets = [1,2].map(yearsAgo => {
    const target=new Date(referenceFiledDate + "T00:00:00Z");
    target.setUTCFullYear(target.getUTCFullYear()-yearsAgo);
    return target.getTime();
  });
  function distance(target:number, range:ArchiveRange):number {
    const end=Date.parse(range.to+"T00:00:00Z");
    if (!range.from) return Math.abs(target-end)+365*86_400_000;
    const start=Date.parse(range.from+"T00:00:00Z");
    return target<start ? start-target : target>end ? target-end : 0;
  }
  const selected: string[]=[];
  // Two independent candidates per historical year avoids spending all four
  // requests on shards near only the most recent missing filing.
  for(let round=0;round<2 && selected.length<limit;round++) {
    for(const target of targets) {
      if(selected.length>=limit)break;
      const nearest=archives
        .filter(a=>!selected.includes(a.name))
        .sort((a,b)=>distance(target,a)-distance(target,b) ||
          b.to.localeCompare(a.to))[0];
      if(nearest)selected.push(nearest.name);
    }
  }
  // If the archive list is small, fill the remaining allowance deterministically.
  for(const archive of archives) {
    if(selected.length>=limit)break;
    if(!selected.includes(archive.name))selected.push(archive.name);
  }
  return selected;
}
function validDate(v:string):boolean {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(v))return false;
  const date=new Date(v+"T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10)===v;
}
