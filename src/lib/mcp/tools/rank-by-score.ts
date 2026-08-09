import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "rank_by_score",
  title: "Rank universe by a score type",
  description:
    "Rank the active universe by one score type (e.g. 'momentum', 'trend', 'volatility', 'composite') using the most recent value per asset. Useful for finding current leaders or laggards.",
  inputSchema: {
    score_type: z.string().trim().describe("Score type key, e.g. 'momentum'. Use list_score_types to discover valid keys."),
    direction: z.enum(["top", "bottom"]).optional().describe("'top' for highest values (default), 'bottom' for lowest."),
    limit: z.number().int().optional().describe("How many rows to return (default 10, max 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ score_type, direction, limit }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Not authenticated");
    const cap = Math.min(Math.max(limit ?? 10, 1), 50);
    const supabase = supabaseForUser(ctx);

    const { data: scores, error } = await supabase
      .from("scores")
      .select("subject_id, value, confidence, computed_at")
      .eq("subject_type", "asset")
      .eq("score_type", score_type)
      .order("computed_at", { ascending: false })
      .limit(5000);
    if (error) throw new ToolError(error.message);
    if (!scores || scores.length === 0) throw new ToolError(`No scores found for score type '${score_type}'.`);

    const latest = new Map<string, (typeof scores)[number]>();
    for (const row of scores) if (!latest.has(row.subject_id)) latest.set(row.subject_id, row);

    const ordered = Array.from(latest.values()).sort((a, b) =>
      direction === "bottom" ? Number(a.value) - Number(b.value) : Number(b.value) - Number(a.value),
    );
    const picked = ordered.slice(0, cap);

    const { data: assets, error: assetError } = await supabase
      .from("assets")
      .select("id, symbol, name")
      .in("id", picked.map((r) => r.subject_id));
    if (assetError) throw new ToolError(assetError.message);
    const bySymbol = new Map((assets ?? []).map((a) => [a.id, a]));

    const rows = picked.map((r, i) => ({
      rank: i + 1,
      symbol: bySymbol.get(r.subject_id)?.symbol ?? null,
      name: bySymbol.get(r.subject_id)?.name ?? null,
      value: Number(r.value),
      confidence: r.confidence,
      computed_at: r.computed_at,
    }));

    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { score_type, direction: direction ?? "top", rows },
    };
  },
});