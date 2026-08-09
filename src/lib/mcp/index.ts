import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchAssets from "./tools/search-assets";
import getAssetScores from "./tools/get-asset-scores";
import rankByScore from "./tools/rank-by-score";
import listScoreTypes from "./tools/list-score-types";

const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "research-terminal-analytics",
  title: "Research Terminal Analytics",
  version: "0.1.0",
  instructions:
    "Read-only access to the Research Terminal's asset universe and deterministic scores. Use `search_assets` to find tickers, `list_score_types` to discover available score keys, `get_asset_scores` for one symbol, and `rank_by_score` for leaders and laggards.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchAssets, listScoreTypes, getAssetScores, rankByScore],
});