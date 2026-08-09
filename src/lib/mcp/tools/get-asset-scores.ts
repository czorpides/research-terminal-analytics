import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_asset_scores",
  title: "Get latest scores for a symbol",
  description:
    "Return the latest deterministic scores (momentum, trend, volatility, valuation, composite, etc.) computed by the research terminal for one ticker symbol, with confidence, calc version and computed timestamp.",
  inputSchema: {
    symbol: z.string().trim().describe("Ticker symbol exactly as held in the universe, e.g. 'AAPL'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ symbol }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Not authenticated");
    const supabase = supabaseForUser(ctx);
    const upper = symbol.toUpperCase();
    const { data: asset, error: assetError } = await supabase
      .from("assets")
      .select("id, symbol, name, asset_class, exchange, currency")
      .eq("symbol", upper)
      .maybeSingle();
    if (assetError) throw new ToolError(assetError.message);
    if (!asset) throw new ToolError(`No asset found for symbol ${upper}`);

    const { data: scores, error: scoreError } = await supabase
      .from("scores")
      .select("score_type, value, confidence, calc_version, computed_at")
      .eq("subject_type", "asset")
      .eq("subject_id", asset.id)
      .order("computed_at", { ascending: false })
      .limit(200);
    if (scoreError) throw new ToolError(scoreError.message);

    const latest = new Map<string, (typeof scores)[number]>();
    for (const row of scores ?? []) if (!latest.has(row.score_type)) latest.set(row.score_type, row);
    const result = { asset, scores: Array.from(latest.values()) };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
});