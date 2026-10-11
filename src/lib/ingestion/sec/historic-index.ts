/** SEC filings.files metadata is published in the parent submissions JSON.
 * Never trust arbitrary archive paths from query strings or response content.
 * Select at most 4 recent archive files, and only within a 6-year horizon.
 */
export function chooseSecHistoricFiles(
  submissionsInput: unknown,
  cik: number,
  currentYear: number,
  maximum = 4,
): string[] {
  if (!Number.isInteger(cik) || cik <= 0) throw new Error("Invalid SEC CIK");
  if (!Number.isInteger(currentYear) || currentYear < 2000) throw new Error("Invalid year");
  const submissions = submissionsInput as {
    filings?: { files?: Array<{name?: unknown;filingFrom?: unknown;filingTo?: unknown}> };
  };
  const prefix = "CIK" + String(cik).padStart(10, "0") + "-submissions-";
  const recent = (submissions?.filings?.files ?? []).filter((row) => {
    if (!row || typeof row.name !== "string" ||
        !new RegExp("^" + prefix + "[0-9]{3}\\.json$").test(row.name)) return false;
    if (typeof row.filingTo !== "string" || !isValidDate(row.filingTo)) return false;
    return Number(row.filingTo.slice(0, 4)) >= currentYear - 6;
  });
  recent.sort((a,b) => String(b.filingTo).localeCompare(String(a.filingTo)));
  return recent.slice(0, Math.max(0,Math.min(4,maximum))).map(row => String(row.name));
}
function isValidDate(v:string):boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
  const d = new Date(v + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
