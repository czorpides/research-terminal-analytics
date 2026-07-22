/**
 * Central navigation + information-architecture registry.
 *
 * Every route the terminal will EVER expose lives here — active routes,
 * shadow-mode models, in-development pages, and planned features. The sidebar
 * and the shared PlannedFeaturePage read this file to render themselves.
 *
 * Activating a route later means changing its `status` to 'active' and
 * (optionally) attaching a real page file at the declared `path`. Paths are
 * treated as stable public URLs — do not rename them once shipped.
 */
import {
  LayoutGrid, Radar, TrendingDown, TrendingUp, Filter, Building2, Bell,
  Activity, Globe2, Gauge, Landmark, Users, LineChart, Waves, ShieldCheck,
  History, BookOpen, Layers, PieChart, FlaskConical, ClipboardCheck,
  Satellite, Sparkles, Search, ShoppingBag, MessageSquare, Truck, CloudSun,
  AlertTriangle, type LucideIcon,
} from "lucide-react";

export type NavGroupKey = "platform" | "macro" | "history" | "altdata";

export type NavStatus =
  | "active"          // real page, live data
  | "shadow"          // model runs behind the scenes, UI hidden or read-only
  | "in_development"  // being built now
  | "awaiting_data"   // page exists conceptually but waits on ingest
  | "planned";        // designed, not started

export type NavStage = 1 | 2 | 3 | 4 | 5;

export interface NavGroup {
  key: NavGroupKey;
  label: string;
  code: string;
  icon: LucideIcon;
  description: string;
  defaultOpen: boolean;
}

export interface RouteEntry {
  id: string;
  path: string;
  name: string;
  group: NavGroupKey;
  icon: LucideIcon;
  stage: NavStage;
  status: NavStatus;
  /** When true and status='active', clicking navigates to the real page.
   *  When false, sidebar shows the item disabled with a tooltip.
   *  When true and status !== 'active', click opens the shared PlannedFeaturePage. */
  enabled: boolean;
  requiredDataSources: string[];
  requiredModels: string[];
  purpose: string;
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "platform", label: "Platform", code: "PF", icon: LayoutGrid,
    description: "Cross-cutting research surfaces and system health.",
    defaultOpen: true,
  },
  {
    key: "macro", label: "Macro", code: "MA", icon: Globe2,
    description: "Regional macro engines — growth, inflation, liquidity, labour, market.",
    defaultOpen: true,
  },
  {
    key: "history", label: "Historical Events", code: "HE", icon: History,
    description: "Analogue matching, event studies, and playbooks.",
    defaultOpen: false,
  },
  {
    key: "altdata", label: "Alternative Data", code: "AD", icon: Satellite,
    description: "Non-official signals — attention, sentiment, positioning, supply chain.",
    defaultOpen: false,
  },
];

export const ROUTES: RouteEntry[] = [
  // ─── Platform ────────────────────────────────────────────────────────────
  { id: "cc",  path: "/",              name: "Command Centre",   group: "platform", icon: LayoutGrid,   stage: 1, status: "active",       enabled: true,  requiredDataSources: [], requiredModels: [], purpose: "Cross-engine daily briefing — regime, risk, focus list." },
  { id: "or",  path: "/radar",         name: "Opportunity Radar",group: "platform", icon: Radar,        stage: 3, status: "active",       enabled: true,  requiredDataSources: ["prices", "fundamentals"], requiredModels: ["composite"], purpose: "Ranks the tracked universe by composite score." },
  { id: "uv",  path: "/undervaluation",name: "Undervaluation",   group: "platform", icon: TrendingUp,   stage: 4, status: "active",       enabled: true,  requiredDataSources: ["prices","fundamentals","commodities","macro"], requiredModels: ["composite","catalysts"], purpose: "Weekly durable candidate list with catalyst pairing." },
  { id: "ov",  path: "/overvaluation", name: "Overvaluation",    group: "platform", icon: TrendingDown, stage: 4, status: "active",       enabled: true,  requiredDataSources: ["prices","fundamentals"], requiredModels: ["risk"], purpose: "Risk-scored radar of stretched valuations." },
  { id: "sc",  path: "/screeners",     name: "Screeners",        group: "platform", icon: Filter,       stage: 3, status: "active",       enabled: true,  requiredDataSources: ["prices","fundamentals"], requiredModels: ["composite"], purpose: "Composable factor filters over the universe." },
  { id: "sm",  path: "/security",      name: "Security Master",  group: "platform", icon: Building2,    stage: 3, status: "active",       enabled: true,  requiredDataSources: ["prices","fundamentals"], requiredModels: ["scoring"], purpose: "Per-asset deep dive with score audit." },
  { id: "al",  path: "/alerts",        name: "Alerts",           group: "platform", icon: Bell,         stage: 1, status: "active",       enabled: true,  requiredDataSources: [], requiredModels: [], purpose: "Rule-driven alerts on freshness, scores, catalysts." },
  { id: "dh",  path: "/data-health",   name: "Data Health",      group: "platform", icon: Activity,     stage: 1, status: "active",       enabled: true,  requiredDataSources: [], requiredModels: [], purpose: "Source freshness, ingestion runs, quality gates." },

  // ─── Macro (region × engine matrix, engine-first) ────────────────────────
  { id: "ma-ov",   path: "/macro",              name: "Overview",         group: "macro", icon: Globe2,       stage: 2, status: "active",         enabled: true,  requiredDataSources: ["fred","ons","ecb","boe","hmrc"], requiredModels: ["ensemble.nowcast"], purpose: "Macro cover page with region tabs and compare view." },
  { id: "ma-gr",   path: "/macro/growth",       name: "Growth Engine",    group: "macro", icon: LineChart,    stage: 1, status: "active",         enabled: true,  requiredDataSources: ["fred","ons","eurostat"], requiredModels: ["kalman.llt"], purpose: "GDP, IP, retail sales, new orders, business survey — modelled as a latent growth factor." },
  { id: "ma-in",   path: "/macro/inflation",    name: "Inflation Engine", group: "macro", icon: Gauge,        stage: 2, status: "active",         enabled: true,  requiredDataSources: ["fred"], requiredModels: ["kalman.llt"], purpose: "CPI, PCE, PPI, wages, shelter, freight and breakevens with an explainable pressure score." },
  { id: "ma-lq",   path: "/macro/liquidity",    name: "Liquidity Engine", group: "macro", icon: Waves,        stage: 2, status: "planned",        enabled: true,  requiredDataSources: ["fred","boe","ecb"], requiredModels: ["pca"], purpose: "Rates, spreads, credit and monetary aggregates as a composite financial conditions index." },
  { id: "ma-lb",   path: "/macro/labour",       name: "Labour Engine",    group: "macro", icon: Users,        stage: 2, status: "planned",        enabled: true,  requiredDataSources: ["bls","ons","eurostat"], requiredModels: ["kalman.llt"], purpose: "Unemployment, claims, wages and participation — trend vs cycle decomposition." },
  { id: "ma-mk",   path: "/macro/market",       name: "Market Engine",    group: "macro", icon: Landmark,     stage: 2, status: "planned",        enabled: true,  requiredDataSources: ["stooq","fmp"], requiredModels: ["pca","hmm"], purpose: "Equity/rates/FX/commodity co-movement compressed into a market-stress factor." },
  { id: "ma-rg",   path: "/macro/regime",       name: "Regime Monitor",   group: "macro", icon: ShieldCheck,  stage: 3, status: "planned",        enabled: true,  requiredDataSources: [], requiredModels: ["hmm"], purpose: "Hidden Markov regime probabilities per region, with confidence bands." },
  { id: "ma-mh",   path: "/macro/model-health", name: "Model Health",     group: "macro", icon: FlaskConical, stage: 1, status: "awaiting_data",  enabled: true,  requiredDataSources: [], requiredModels: ["kalman.llt","pca","hmm"], purpose: "Kalman residuals, PCA loadings, and HMM transition matrices with version stamps." },

  // ─── Historical Events ───────────────────────────────────────────────────
  { id: "he-ov",   path: "/history",                 name: "Overview",             group: "history", icon: History,        stage: 2, status: "active",        enabled: true,  requiredDataSources: [], requiredModels: ["fingerprint","narrative-verify"], purpose: "Live analogue matches for the current regime." },
  { id: "he-lib",  path: "/history/library",         name: "Event Library",        group: "history", icon: BookOpen,       stage: 2, status: "planned",       enabled: true,  requiredDataSources: [], requiredModels: [], purpose: "Curated historical episodes with typed metadata and playbook links." },
  { id: "he-an",   path: "/history/analogues",       name: "Regime Analogues",     group: "history", icon: Layers,         stage: 2, status: "planned",       enabled: true,  requiredDataSources: [], requiredModels: ["fingerprint"], purpose: "Distance ranking of past episodes vs the live macro fingerprint." },
  { id: "he-pb",   path: "/history/playbooks",       name: "Playbooks",            group: "history", icon: ClipboardCheck, stage: 3, status: "planned",       enabled: true,  requiredDataSources: [], requiredModels: [], purpose: "Structured playbooks with pre-registered signals and post-mortems." },
  { id: "he-si",   path: "/history/sector-impacts",  name: "Sector Impact Studies",group: "history", icon: PieChart,       stage: 3, status: "planned",       enabled: true,  requiredDataSources: ["prices","fundamentals"], requiredModels: ["event-study"], purpose: "Per-sector CAR/BHAR windows for each event class." },
  { id: "he-st",   path: "/history/study",           name: "Event Study Runner",   group: "history", icon: LineChart,      stage: 3, status: "planned",       enabled: true,  requiredDataSources: ["prices"], requiredModels: ["event-study"], purpose: "Ad-hoc event study builder over the universe." },
  { id: "he-vf",   path: "/history/verification",    name: "Verification Log",     group: "history", icon: ShieldCheck,    stage: 2, status: "active",        enabled: true,  requiredDataSources: [], requiredModels: ["narrative-verify"], purpose: "Audit trail of narrative and algo verification runs." },
  { id: "he-mh",   path: "/history/model-health",    name: "Model Health",         group: "history", icon: FlaskConical,   stage: 2, status: "awaiting_data", enabled: true,  requiredDataSources: [], requiredModels: ["fingerprint","event-study"], purpose: "Fingerprint stability, coverage, and false-positive audits." },

  // ─── Alternative Data ────────────────────────────────────────────────────
  { id: "ad-ov",   path: "/alt-data",                name: "Overview",             group: "altdata", icon: Satellite,   stage: 2, status: "active",        enabled: true,  requiredDataSources: ["wikipedia_pv"], requiredModels: ["zscore"], purpose: "Retail attention leaderboards from Wikipedia pageviews." },
  { id: "ad-att",  path: "/alt-data/attention",      name: "Attention Signals",    group: "altdata", icon: Sparkles,    stage: 2, status: "active",        enabled: true,  requiredDataSources: ["wikipedia_pv"], requiredModels: ["zscore"], purpose: "Ticker-level attention spikes and fades." },
  { id: "ad-srch", path: "/alt-data/search",         name: "Search Trends",        group: "altdata", icon: Search,      stage: 3, status: "planned",       enabled: true,  requiredDataSources: ["google_trends"], requiredModels: ["zscore","stl"], purpose: "Themed Google Trends baskets with seasonality removal." },
  { id: "ad-pos",  path: "/alt-data/positioning",    name: "Retail Positioning",   group: "altdata", icon: ShoppingBag, stage: 3, status: "planned",       enabled: true,  requiredDataSources: ["cot","ark_flows"], requiredModels: ["zscore"], purpose: "Speculator positioning and retail flow imbalances." },
  { id: "ad-sent", path: "/alt-data/sentiment",      name: "Sentiment Feeds",      group: "altdata", icon: MessageSquare,stage: 3, status: "planned",       enabled: true,  requiredDataSources: ["gdelt","news_api"], requiredModels: ["nlp.finbert"], purpose: "Cross-source news and social sentiment aggregation." },
  { id: "ad-sc",   path: "/alt-data/supply-chain",   name: "Supply Chain",         group: "altdata", icon: Truck,       stage: 4, status: "planned",       enabled: true,  requiredDataSources: ["baltic_dry","us_ports"], requiredModels: ["kalman.llt"], purpose: "Freight rates, port throughput, and inventory proxies." },
  { id: "ad-wx",   path: "/alt-data/weather",        name: "Weather & Commodities",group: "altdata", icon: CloudSun,    stage: 4, status: "planned",       enabled: true,  requiredDataSources: ["noaa","fmp"], requiredModels: ["ensemble"], purpose: "Weather anomaly overlays on commodity price series." },
  { id: "ad-an",   path: "/alt-data/anomalies",      name: "Anomaly Detector",     group: "altdata", icon: AlertTriangle,stage: 3, status: "planned",       enabled: true,  requiredDataSources: [], requiredModels: ["isolation-forest"], purpose: "Cross-feed outlier detection over the alt-data universe." },
  { id: "ad-mh",   path: "/alt-data/model-health",   name: "Model Health",         group: "altdata", icon: FlaskConical,stage: 2, status: "awaiting_data", enabled: true,  requiredDataSources: [], requiredModels: [], purpose: "Freshness, coverage, and z-score stability audits." },
];

/** Look up a route entry by pathname. Supports both the leaf path
 *  ('/macro/growth') and paths captured via a splat fallback. */
export function findRouteByPath(pathname: string): RouteEntry | undefined {
  return ROUTES.find((r) => r.path === pathname);
}

export function routesInGroup(group: NavGroupKey): RouteEntry[] {
  return ROUTES.filter((r) => r.group === group);
}

export const STATUS_META: Record<NavStatus, { label: string; tone: "positive" | "info" | "warning" | "muted" | "danger" }> = {
  active:         { label: "Active",         tone: "positive" },
  shadow:         { label: "Shadow mode",    tone: "info" },
  in_development: { label: "In development", tone: "warning" },
  awaiting_data:  { label: "Awaiting data",  tone: "muted" },
  planned:        { label: "Planned",        tone: "muted" },
};