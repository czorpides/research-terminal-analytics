import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  deriveProviderSymbol,
  type AssetProviderIdentity,
  type ProviderSymbolMap,
} from "./asset-symbols";
import type { ProviderCode } from "./types";

export type { AssetProviderIdentity, ProviderSymbolMap } from "./asset-symbols";
export { deriveProviderSymbol } from "./asset-symbols";

export async function providerSymbolForAsset(
  asset: AssetProviderIdentity,
  provider: ProviderCode,
): Promise<string | null> {
  // The mapping table is introduced by the evidence-integrity migration. Use a
  // loose client so application deploys remain fail-soft if code lands first.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  try {
    const { data, error } = await db
      .from("asset_provider_symbols")
      .select("provider_symbol,mapping_status")
      .eq("asset_id", asset.id)
      .eq("provider_code", provider)
      .maybeSingle();
    if (!error && data?.provider_symbol && data.mapping_status !== "failed") {
      return String(data.provider_symbol);
    }
  } catch {
    // Fall through to a deterministic derived mapping while the migration is
    // being deployed. The internal asset id remains the canonical identity.
  }

  return deriveProviderSymbol(provider, asset.symbol, asset.exchange);
}

export async function providerSymbolsForAsset(
  asset: AssetProviderIdentity,
): Promise<ProviderSymbolMap> {
  const providers: ProviderCode[] = ["tiingo", "twelvedata", "fmp", "alphavantage", "eodhd"];
  const resolved = await Promise.all(
    providers.map(async (provider) => [provider, await providerSymbolForAsset(asset, provider)] as const),
  );
  return Object.fromEntries(resolved) as ProviderSymbolMap;
}

export async function markProviderSymbolVerified(
  asset: AssetProviderIdentity,
  provider: ProviderCode,
  providerSymbol: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  try {
    await db.from("asset_provider_symbols").upsert(
      {
        asset_id: asset.id,
        provider_code: provider,
        provider_symbol: providerSymbol,
        exchange_code: asset.exchange,
        mapping_status: "verified",
        last_verified_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "asset_id,provider_code", ignoreDuplicates: false },
    );
  } catch {
    // Mapping telemetry must never turn an otherwise valid provider response
    // into an ingestion failure.
  }
}

export async function markProviderSymbolFailed(
  asset: AssetProviderIdentity,
  provider: ProviderCode,
  providerSymbol: string,
  error: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  try {
    await db.from("asset_provider_symbols").upsert(
      {
        asset_id: asset.id,
        provider_code: provider,
        provider_symbol: providerSymbol,
        exchange_code: asset.exchange,
        mapping_status: "failed",
        last_error: error.slice(0, 1000),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "asset_id,provider_code", ignoreDuplicates: false },
    );
  } catch {
    // Best-effort telemetry only.
  }
}
