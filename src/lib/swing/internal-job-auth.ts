import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Server-only auth guard for privileged, write-capable market ingestion.
 * A Supabase publishable/anon key is public and MUST NOT grant ingestion.
 * Never log, return or serialize the expected token.
 */
export function authorizedInternalSwingJob(
  headers: Pick<Headers, "get">,
  configuredToken: string | undefined,
): boolean {
  if (!configuredToken || configuredToken.length < 24) return false;
  const bearer = headers.get("authorization");
  const candidate = headers.get("x-internal-job-token") ??
    (bearer?.startsWith("Bearer ") ? bearer.slice(7) : null);
  if (!candidate || candidate.length < 24 || candidate.length > 4096) return false;
  const hash = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(hash(candidate), hash(configuredToken));
}
