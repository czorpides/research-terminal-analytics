import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ProviderCode } from "./types";

function today(): string { return new Date().toISOString().slice(0, 10); }

export interface QuotaRow {
  provider_code: string;
  quota_date: string;
  calls_made: number;
  daily_limit: number;
  last_call_at: string | null;
  last_status: string | null;
  last_error: string | null;
  disabled_until: string | null;
}

export async function getQuota(code: ProviderCode): Promise<QuotaRow | null> {
  const { data } = await supabaseAdmin
    .from("provider_quotas")
    .select("*")
    .eq("provider_code", code)
    .eq("quota_date", today())
    .maybeSingle();
  return (data as unknown as QuotaRow) ?? null;
}

export async function ensureQuota(code: ProviderCode, dailyLimit: number): Promise<QuotaRow> {
  const existing = await getQuota(code);
  if (existing) return existing;
  const { data, error } = await supabaseAdmin
    .from("provider_quotas")
    .insert({ provider_code: code, quota_date: today(), daily_limit: dailyLimit, calls_made: 0 })
    .select("*").single();
  if (error) throw error;
  return data as unknown as QuotaRow;
}

export async function recordCall(code: ProviderCode, status: "ok" | "rate_limit" | "auth" | "error", detail?: string): Promise<void> {
  const row = await getQuota(code);
  if (!row) return;
  const disabled_until =
    status === "rate_limit" ? new Date(Date.now() + 60 * 60_000).toISOString() :
    status === "auth" ? new Date(Date.now() + 3600_000).toISOString() : row.disabled_until;
  await supabaseAdmin.from("provider_quotas").update({
    calls_made: row.calls_made + 1,
    last_call_at: new Date().toISOString(),
    last_status: status,
    last_error: detail ?? null,
    disabled_until,
  }).eq("provider_code", code).eq("quota_date", today());
}

export async function canUse(code: ProviderCode, dailyLimit: number, reserve = 1): Promise<{ ok: boolean; reason?: string }> {
  const row = await ensureQuota(code, dailyLimit);
  if (row.disabled_until && new Date(row.disabled_until) > new Date()) return { ok: false, reason: `disabled_until ${row.disabled_until}` };
  if (row.calls_made + reserve > row.daily_limit) return { ok: false, reason: `quota exhausted ${row.calls_made}/${row.daily_limit}` };
  return { ok: true };
}