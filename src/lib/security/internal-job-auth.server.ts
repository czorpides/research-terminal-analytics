import { timingSafeEqual } from "node:crypto";

/**
 * Administrative HTTP endpoints execute with service-role database access.
 * A Supabase publishable/anon key is public configuration, NOT a secret.
 *
 * INTERNAL_JOB_TOKEN is a dedicated runtime-only credential. Never put it in
 * VITE_ variables, source code, GitHub Actions logs, or browser storage.
 */
export function authorizeInternalJobRequest(request: Request): boolean {
  const secret = process.env.INTERNAL_JOB_TOKEN;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) return false;

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const provided = authorization.slice("Bearer ".length);
  const expectedBytes = Buffer.from(secret, "utf8");
  const providedBytes = Buffer.from(provided, "utf8");
  return expectedBytes.length === providedBytes.length
    && timingSafeEqual(providedBytes, expectedBytes);
}
