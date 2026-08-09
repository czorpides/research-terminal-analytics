import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_assets",
  title: "Search coverage universe",
  description:
    "Search the research terminal's active asset universe by ticker symbol or company name. Returns symbol, name, asset class, exchange and currency.",
  inputSchema: {
    query: z.string().trim().describe("Ticker or part of a company name, e.g. 'AAPL' or 'health'."),
    limit: z.number().int().optional().describe("Maximum rows to return (default 20, max 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Not authenticated");
    const cap = Math.min(Math.max(limit ?? 20, 1), 100);
    const supabase = supabaseForUser(ctx);
    const term = query.replace(/[%,]/g, " ").trim();
    const { data, error } = await supabase
      .from("assets")
      .select("symbol, name, asset_class, exchange, currency")
      .eq("active", true)
      .or(`symbol.ilike.%${term}%,name.ilike.%${term}%`)
      .order("symbol")
      .limit(cap);
    if (error) throw new ToolError(error.message);
    const rows = data ?? [];
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { count: rows.length, assets: rows },
    };
  },
});