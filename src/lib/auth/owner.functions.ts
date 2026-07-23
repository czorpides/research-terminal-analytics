import { createServerFn } from "@tanstack/react-start";

export const OWNER_EMAIL = "owner@research.local";

export const ensureOwnerAccount = createServerFn({ method: "POST" }).handler(async () => {
  const password = process.env.OWNER_PASSWORD;
  if (!password) throw new Error("OWNER_PASSWORD not configured");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Check existing user
  const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email === OWNER_EMAIL);

  if (!existing) {
    const { error } = await supabaseAdmin.auth.admin.createUser({
      email: OWNER_EMAIL,
      password,
      email_confirm: true,
    });
    if (error && !/already/i.test(error.message)) throw error;
  } else {
    // Keep password in sync in case it was rotated
    const { error } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
  }
  return { ok: true as const, email: OWNER_EMAIL };
});