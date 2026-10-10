/**
 * Server-only, owner-only authorization. No shared secret in browser or DB.
 * A bearer token is accepted only after Supabase Auth verifies it and the
 * authenticated account matches the Research Terminal owner identity.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { extractBearerToken, isOwnerAuthEmail } from "./owner-bearer";

export async function checkOwnerAccess(request: Request): Promise<
  { ok: true; userId: string } |
  { ok: false; status: 401 | 403; error: string }
> {
  const token = extractBearerToken(request.headers.get("Authorization"));
  if (!token) return { ok: false, status: 401, error: "Authenticated owner session required" };
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return { ok: false, status: 401, error: "Owner session is invalid or expired" };
  if (!isOwnerAuthEmail(data.user.email))
    return { ok: false, status: 403, error: "Owner access only" };
  return { ok: true, userId: data.user.id };
}
