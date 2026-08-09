import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_score_types",
  title: "List available score types",
  description:
    "List the distinct score types currently computed for assets in the research terminal, with how many assets each covers and when it was last computed.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Not authenticated");
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("scores")
      .select("score_type, subject_id, computed_at")
      .eq("subject_type", "asset")
      .order("computed_at", { ascending: false })
      .limit(5000);
    if (error) throw new ToolError(error.message);

    const agg = new Map<string, { subjects: Set<string>; last: string }>();
    for (const row of data ?? []) {
      const entry = agg.get(row.score_type) ?? { subjects: new Set<string>(), last: row.computed_at as string };
      entry.subjects.add(row.subject_id as string);
      agg.set(row.score_type, entry);
    }
    const rows = Array.from(agg.entries()).map(([score_type, v]) => ({
      score_type,
      assets_covered: v.subjects.size,
      last_computed_at: v.last,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { score_types: rows },
    };
  },
});