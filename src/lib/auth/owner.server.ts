import { timingSafeEqual } from "node:crypto";

/** Strictly server-side; used only by the one-time owner bootstrap route. */
export const OWNER_EMAIL = "owner@research.local";

export function isConfiguredOwnerPassword(
  supplied: unknown,
  configured: string | undefined,
): supplied is string {
  if (typeof supplied !== "string" || typeof configured !== "string") return false;
  const expected = Buffer.from(configured, "utf8");
  const actual = Buffer.from(supplied, "utf8");
  if (expected.length < 12 || actual.length !== expected.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * Idempotent initial owner creation.
 * No unauthenticated request can reset an existing owner's password.
 * Never expose the Supabase admin client or the env password to the browser.
 */
export async function bootstrapOwnerIfMissing(supplied: unknown): Promise<boolean> {
  const password = process.env.OWNER_PASSWORD;
  if (!isConfiguredOwnerPassword(supplied, password)) return false;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;

  if (data.users.some((user) => user.email === OWNER_EMAIL)) return true;
  if (data.users.length > 0) {
    throw new Error("Owner bootstrap blocked: existing Supabase auth users need review");
  }

  const { error: creationError } = await supabaseAdmin.auth.admin.createUser({
    email: OWNER_EMAIL,
    password,
    email_confirm: true,
  });
  // Another instance can win the bootstrap race; Supabase keeps uniqueness.
  if (creationError && !/already|registered|exists/i.test(creationError.message)) {
    throw creationError;
  }
  return true;
}
