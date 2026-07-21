import { createServerFn } from "@tanstack/react-start";
import { computeConfidence } from "@/lib/reliability/confidence";
import { stampCalculation } from "@/lib/reliability/version";
import type { PanelData, Evidence, Point, VerifyCheck, Metric } from "./contract";
import { findAnalogs } from "@/lib/history/match.server";
import { FINGERPRINT_VERSION } from "@/lib/history/fingerprint.server";
import { aiCoherenceCheck } from "./undervaluation.functions";

/**
 * Plain-English backgrounds per event category. Rendered in the expanded
 * panel Sheet so opening "Oil shock events" (etc.) explains what the
 * category is, what causes it, and which assets/industries are typically
 * hit — before the user drills into any single event.
 */
const CATEGORY_BACKGROUND: Record<string, NonNullable<PanelData["background"]>> = {
  oil_shock: {
    overview: "Oil shocks are sharp, sustained moves in crude prices — usually spikes driven by supply disruption, sometimes crashes from demand collapse or OPEC price wars. They matter because energy is an input to almost every good and service, so a shock propagates into inflation, consumer spending, corporate margins and central-bank policy within one to two quarters.",
    historicalContext: "The template events are the 1973 OAPEC embargo, the 1979 Iranian revolution shock, the 1990 Gulf War spike, the 2008 super-spike, the 2014–16 shale glut, and the 2020 COVID demand collapse plus 2022 Russia/Ukraine spike. Each one changed Fed policy, sector leadership and the CPI print for at least a year.",
    whatCauses: [
      "Supply shock: embargo, war, sanctions, pipeline/refinery outage, OPEC+ quota cut.",
      "Demand shock: global recession or pandemic collapsing consumption (2008, 2020).",
      "Policy/currency: sharp USD moves reprice all commodities priced in dollars.",
      "Speculative positioning: futures curve dislocations amplify physical moves.",
    ],
    assetsAffected: [
      { label: "Energy equities (XLE, XOP, OIH)", note: "direct beneficiary of price spikes; hurt in crashes" },
      { label: "Airlines, cruise lines, trucking", note: "jet/diesel fuel is 20–35% of operating cost" },
      { label: "Chemicals & materials", note: "naphtha and natural gas feedstock margins compress" },
      { label: "Consumer discretionary", note: "gasoline is a tax on household spending" },
      { label: "Treasuries & rate-sensitive equities", note: "inflation reprice pushes yields up, duration down" },
      { label: "USD, CAD, NOK, RUB", note: "petro-currencies move with crude; USD often inverse" },
    ],
    whatToWatch: [
      "OPEC+ meeting cadence and Saudi/UAE spare-capacity commentary.",
      "US crude and product inventories (EIA weekly), refinery utilisation.",
      "Brent–WTI spread, WTI 1M–12M contango/backwardation.",
      "Break-even inflation (5Y5Y) and Fed pricing (SOFR futures).",
    ],
  },
  financial_stress: {
    overview: "Banking crises are episodes when solvency or liquidity fears force deposit flight, credit contraction and (usually) central-bank intervention. They matter because credit is the transmission belt of the economy — when banks pull back, capex, hiring and asset prices follow within one to three quarters.",
    historicalContext: "The library covers the 1980s S&L crisis, LTCM 1998, the 2008 GFC (Bear/Lehman/AIG), the 2011 European sovereign–bank doom loop, and the 2023 US regional-bank run (SVB/Signature/First Republic). Each triggered emergency Fed/ECB facilities and repriced financials for years.",
    whatCauses: [
      "Duration mismatch: long-dated assets funded by short-dated deposits when rates spike.",
      "Credit losses: real-estate or sovereign-debt writedowns eating through capital.",
      "Liquidity run: uninsured depositors or wholesale funders exit faster than assets can be sold.",
      "Interconnection: derivative or repo exposure to a failing counterparty (LTCM, Lehman).",
    ],
    assetsAffected: [
      { label: "Bank equities (XLF, KRE, KBE)", note: "regional banks usually hit hardest" },
      { label: "Preferred stock & bank subordinated debt", note: "coupon suspension / bail-in risk" },
      { label: "Commercial real estate", note: "credit spigot closes; refinance risk explodes" },
      { label: "Small-cap and high-yield credit", note: "lose access to funding first" },
      { label: "Gold, Treasuries, USD, JPY, CHF", note: "flight-to-quality bid" },
    ],
    whatToWatch: [
      "FDIC uninsured-deposit share, Bank Term Funding Program usage, Fed discount-window balances.",
      "IG and HY credit spreads (LQD, HYG option-adjusted spread).",
      "Bank Tier 1 ratios, CRE loan concentration, held-to-maturity unrealised losses.",
      "SOFR–OIS spread and FRA-OIS as early stress indicators.",
    ],
  },
  tariff: {
    overview: "Tariff rounds are step-changes in cross-border tax on goods, usually announced as trade policy. They matter because they immediately reprice input costs, corporate margins and currency pairs — and because retaliation escalates the impact beyond the initial industry.",
    historicalContext: "The library includes Smoot–Hawley 1930, Reagan's 1980s Japan auto/semiconductor tariffs, Bush 2002 steel tariffs, the 2018–19 US–China Section 301 rounds, and the 2025 reciprocal-tariff regime. Historically, tariffs compress importer margins first and lift domestic-producer share prices — but retaliation and supply-chain reroute costs erode the initial win.",
    whatCauses: [
      "Trade-deficit politics or industrial-policy protection of a strategic sector.",
      "National security invocations (Section 232, export controls).",
      "Retaliation for the counter-party's tariffs, subsidies or currency policy.",
    ],
    assetsAffected: [
      { label: "Importers & retailers (Walmart, Target, apparel, footwear)", note: "cost pass-through rarely full" },
      { label: "Multinational industrials", note: "supply-chain relocation capex + margin hit" },
      { label: "Semiconductors & capital equipment", note: "export controls block end-markets" },
      { label: "Agricultural producers", note: "typical retaliation target (soybeans, pork)" },
      { label: "Steel, aluminium, domestic manufacturers", note: "short-term winners from protection" },
      { label: "USD, CNY, MXN, EUR", note: "tariff pairs move on announcement + retaliation" },
    ],
    whatToWatch: [
      "USTR announcements, Section 232/301 investigations, retaliation lists.",
      "Company margin guidance and inventory pre-buying patterns.",
      "Container throughput at LA/Long Beach and Shanghai; freight rates.",
      "CNY fixings and EM currency reactions on tariff-news days.",
    ],
  },
  rate_shock: {
    overview: "Rate cycles are extended periods of Fed hiking or cutting. They matter because the policy rate anchors every other borrowing cost — mortgages, corporate debt, EM sovereign spreads — and reshapes equity sector leadership through the discount rate and credit channel.",
    historicalContext: "The library covers Volcker's 1979–82 disinflation, the 1994 bond massacre, the 2004–06 measured-pace tightening, the 2015–19 normalisation, and the 2022–23 fastest hiking cycle since Volcker. Each ended when something broke — LTCM, housing, SVB — and pivoted to cuts.",
    whatCauses: [
      "Inflation running above the 2% target (hiking) or growth/employment falling below trend (cutting).",
      "Financial-stability shocks that force emergency cuts (2008, 2020, 2023 regional-bank stress).",
      "Global spillovers: dollar strength or EM stress feeding back into US conditions.",
    ],
    assetsAffected: [
      { label: "Long-duration equities (tech, biotech, unprofitable growth)", note: "most sensitive to discount rate" },
      { label: "Homebuilders, REITs, utilities", note: "rate-driven demand and cap-rate repricing" },
      { label: "Banks & insurers", note: "NIM expands on hikes, credit costs rise late-cycle" },
      { label: "USD & carry trades", note: "rate-differential moves reprice FX" },
      { label: "EM sovereign debt", note: "dollar liquidity tightens hardest at the periphery" },
      { label: "Gold", note: "real yields dominate; falls in fast-hike cycles, rallies on cuts" },
    ],
    whatToWatch: [
      "Fed dot plot, SEP, and Powell press-conference tone shifts.",
      "Core PCE, wage growth (ECI, AHE), unemployment vs SEP path.",
      "2s10s and 3M10Y curves — inversion and re-steepening timing.",
      "SOFR & Fed-funds futures pricing for the next 12 months.",
    ],
  },
  bubble_burst: {
    overview: "Bubbles are periods when asset prices decouple from any reasonable fundamental anchor, sustained by leverage, retail participation and narrative rather than cash flows. They matter because they end — and the unwind is usually violent, multi-year, and drags the real economy with it.",
    historicalContext: "The library covers the Japan asset bubble 1989, the dot-com bubble 1999–2000, the US housing bubble 2005–07, and the 2020–21 SPAC/meme/crypto complex. Common signals: retail margin debt at record highs, IPO/SPAC issuance surging, media saturation, and 'this time is different' valuation frameworks.",
    whatCauses: [
      "Sustained easy monetary policy suppressing the cost of speculation.",
      "New technology or asset class with genuine but hard-to-quantify potential.",
      "Retail-broker frictionless access and leverage (margin, options, crypto perps).",
      "Reflexive price action: rising prices attract more buyers, self-reinforcing.",
    ],
    assetsAffected: [
      { label: "The bubble asset itself", note: "usually 70–90% drawdown from peak" },
      { label: "Broker-dealers, exchanges, retail platforms", note: "revenue collapses post-peak" },
      { label: "Adjacent leveraged plays (SPACs, thematic ETFs)", note: "compound losses" },
      { label: "Banks with underwriting or lending exposure", note: "credit losses in the unwind" },
    ],
    whatToWatch: [
      "Margin debt vs GDP, put/call ratio, retail options volume.",
      "IPO/SPAC issuance pace and first-day pop distribution.",
      "Valuation spreads (top-decile vs median P/S, P/E).",
      "Fed liquidity indicators (RRP, reserves, QT pace).",
    ],
  },
  crash: {
    overview: "Equity crashes are compressed, high-volatility drawdowns — 20%+ in weeks rather than quarters — where liquidity evaporates and correlations across risk assets converge to one. They matter because the speed of the move triggers forced selling (margin, VaR, risk-parity de-leveraging) that overshoots fundamentals and creates the multi-year recovery setup.",
    historicalContext: "The library covers 1929, October 1987 (Black Monday, ~22% in a single session), 2000 dot-com unwind, 2008 (Lehman week), the 2020 COVID crash (fastest bear on record), and shorter vol events like August 2015 and February 2018. Every crash bottomed only after a policy or liquidity backstop was announced.",
    whatCauses: [
      "Leverage unwind: portfolio insurance (1987), quant de-grossing (Aug 2007, Feb 2018), risk-parity vol targeting.",
      "Liquidity shock: dealer balance sheets full, market-makers step back, bid-ask blows out.",
      "Fundamental catalyst on top of extended valuations: earnings shock, credit event, geopolitical surprise.",
      "Reflexive options hedging (gamma): dealer short-gamma forces selling into weakness.",
    ],
    assetsAffected: [
      { label: "High-beta equities, small-caps, unprofitable growth", note: "worst drawdowns; last to recover" },
      { label: "Credit (HY, leveraged loans)", note: "spreads gap 200–400bp in days" },
      { label: "VIX & vol products", note: "spikes 3–5x; short-vol ETPs blow up (XIV 2018)" },
      { label: "Treasuries, gold, USD, JPY, CHF", note: "flight-to-quality bid — with brief liquidation dips" },
      { label: "Crypto & other risk assets", note: "correlation to 1 during the panic phase" },
    ],
    whatToWatch: [
      "VIX term structure inversion, MOVE index, cross-asset vol.",
      "Dealer gamma positioning and 0DTE options flow.",
      "Prime-broker balance / margin-call chatter, HY OAS gapping.",
      "Fed/Treasury liquidity backstop language — the bottom rarely precedes it.",
    ],
  },
  inflation_shock: {
    overview: "Inflation shocks are episodes where the headline or core CPI print jumps meaningfully above trend and stays there long enough to force a central-bank reaction. They matter because they reprice the entire yield curve, compress equity multiples (especially long-duration), and rotate sector leadership toward real assets and cash-generative value.",
    historicalContext: "The library covers the 1970s Great Inflation (two waves, ended by Volcker at 20% Fed funds), the 1988–90 pickup, the 2008 commodity-driven spike, and the 2021–23 post-COVID surge (peak CPI 9.1% in June 2022). Every episode ended only after real policy rates turned decisively positive.",
    whatCauses: [
      "Supply shocks: oil, food, war, pandemic supply-chain disruption.",
      "Excess demand: fiscal transfers, negative real rates, pent-up consumption.",
      "Wage-price feedback: unit labour costs rising faster than productivity.",
      "Currency depreciation importing inflation via traded goods.",
    ],
    assetsAffected: [
      { label: "Long-duration bonds (TLT, EDV)", note: "worst hit — duration risk repriced" },
      { label: "Long-duration equities (unprofitable tech, biotech)", note: "multiple compression on discount rate" },
      { label: "Energy, materials, commodities", note: "direct beneficiaries of the input-cost rise" },
      { label: "Value, financials, defensives with pricing power", note: "outperform growth in high-inflation regimes" },
      { label: "TIPS, floating-rate loans, real estate (initially)", note: "inflation-linked cash flows re-rate" },
      { label: "Gold and hard assets", note: "hedge — but underperforms if real rates rise faster than inflation" },
    ],
    whatToWatch: [
      "Core PCE and core CPI 3m/6m annualised — direction matters more than the level.",
      "5Y5Y inflation break-evens, TIPS real yields.",
      "Wage growth (ECI, AHE), unit labour costs, productivity.",
      "Commodity leading indicators — oil, industrial metals, freight rates.",
    ],
  },
  rate_pivot: {
    overview: "Rate pivots are the moments the Fed shifts from hiking to cutting (or the reverse). They matter because the pivot itself is usually the single most important cross-asset event of a cycle — the yield curve re-steepens, the dollar tops, credit spreads reprice, and equity sector leadership rotates within weeks.",
    historicalContext: "The library covers the 1995 soft-landing pivot, the 1998 emergency LTCM cuts, the 2001 aggressive easing cycle, the 2007 first cut before the GFC, and the 2019 mid-cycle insurance cuts. The pattern: pivots into a soft landing are bullish for risk; pivots into a hard landing precede the biggest drawdowns.",
    whatCauses: [
      "Inflation coming back to target (soft-landing pivot).",
      "Financial-stability shock forcing emergency cuts (LTCM, GFC, COVID, 2023 SVB).",
      "Labour-market deterioration triggering the Fed's dual-mandate reaction function.",
      "Foreign-currency or funding stress (dollar liquidity backstop).",
    ],
    assetsAffected: [
      { label: "Front-end rates (2Y)", note: "prices the pivot first — rallies hardest" },
      { label: "Long-duration equities, gold, EM", note: "typical post-pivot leadership" },
      { label: "USD", note: "usually tops within 3–6 months of the pivot signal" },
      { label: "Banks", note: "NIM headwind — but credit re-rating dominates in soft landings" },
      { label: "High-yield credit", note: "spreads tighten on soft-landing pivot; blow out on hard-landing pivot" },
    ],
    whatToWatch: [
      "Fed dot plot revisions, SEP terminal-rate path, Powell tone shift.",
      "SOFR & Fed-funds futures pricing (number of cuts in the next 12 months).",
      "2s10s re-steepening — the classic pivot confirmation.",
      "Labour market: unemployment vs SEP, jobless claims trend, JOLTS quits rate.",
    ],
  },
};

const REGIME_BACKGROUND: NonNullable<PanelData["background"]> = {
  overview: "This panel matches today's macro fingerprint — a bucketed reading of the rate level and direction, the yield-curve shape, the inflation regime, the oil regime, and the unemployment direction — against a library of past episodes. The goal is not prediction: it is to answer 'when did we last see this configuration, and what happened next?' with an auditable, sourced chain of evidence.",
  historicalContext: "The fingerprint approach follows Ray Dalio's Big Debt Cycles and Bridgewater's regime work, plus academic event-study methodology. It works because monetary + credit + energy regimes recur, and equity/credit sector leadership is highly regime-conditional even when the specific catalyst differs.",
  whatCauses: [
    "Rate & inflation buckets flip when the Fed pivots or an external shock hits.",
    "Curve shape flips (steep → flat → invert → re-steepen) on the cycle stage.",
    "Oil regime flips on OPEC decisions, geopolitics or demand shocks.",
    "Unemployment direction flips 3–6 months after the growth impulse changes.",
  ],
  assetsAffected: [
    { label: "Every asset in the terminal", note: "the fingerprint conditions expected sector leadership and drawdown distributions" },
    { label: "Radar candidates", note: "under/overvaluation cards inherit the closest-analog return distribution" },
    { label: "Watchlist positioning", note: "regime match tells you whether the trade is with or against historical prior" },
  ],
  whatToWatch: [
    "Any dimension flipping bucket (e.g. inflation moving from 'above target' to 'at target').",
    "Coverage falling below 66% — the fingerprint becomes too sparse to trust.",
    "New analog jumping into the top 3 as regime shifts.",
    "Divergence between closest-analog forward return and current radar signals.",
  ],
};

function categoryBackground(cat: string, list: Array<{ code: string; name: string; start_date: string; tags: string[] }>): NonNullable<PanelData["background"]> {
  const base = CATEGORY_BACKGROUND[cat];
  if (!base) {
    return {
      overview: `Seeded ${cat.replace(/_/g, " ")} episodes in the event library. Open each event card for the sourced narrative — causes, mechanism, what happened next, key takeaway — plus the per-sector forward-return table.`,
    };
  }
  return {
    ...base,
    examples: list.slice(0, 6).map((e) => ({
      label: `${new Date(e.start_date).getFullYear()} — ${e.name}`,
      note: e.tags.slice(0, 3).join(", ") || undefined,
    })),
  };
}

/**
 * Historical Event Engine panels — one regime-analog panel plus one panel per
 * seeded event category so the whole library is browsable in the compact grid.
 */
export const getHistoryPanels = createServerFn({ method: "GET" }).handler(async (): Promise<PanelData[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [{ analogs, fingerprint, computedAt }, { data: events }] = await Promise.all([
    findAnalogs({ limit: 6, minMatchPct: 40 }),
    supabaseAdmin.from("historical_events").select("id, code, name, start_date, category, tags, causes, what_happened_next, key_takeaway, narrative_status, narrative_confidence"),
  ]);

  // index narrative by code so we can enrich analog cards
  const narrativeByCode = new Map<string, { causes: string | null; what_happened_next: string | null; key_takeaway: string | null; narrative_status: string; narrative_confidence: number | null }>();
  for (const e of events ?? []) {
    narrativeByCode.set(e.code as string, {
      causes: (e as { causes: string | null }).causes,
      what_happened_next: (e as { what_happened_next: string | null }).what_happened_next,
      key_takeaway: (e as { key_takeaway: string | null }).key_takeaway,
      narrative_status: ((e as { narrative_status: string }).narrative_status) ?? "unverified",
      narrative_confidence: ((e as { narrative_confidence: number | null }).narrative_confidence) ?? null,
    });
  }

  const nowIso = new Date().toISOString();

  // ---------- Regime analog panel ----------
  const fpMetrics: Metric[] = [
    ...(fingerprint.fingerprint.rate_level    ? [{ label: "Rates",       value: `${fingerprint.fingerprint.rate_level} · ${fingerprint.fingerprint.rate_direction ?? "?"}` } as Metric] : []),
    ...(fingerprint.fingerprint.curve         ? [{ label: "Curve",       value: fingerprint.fingerprint.curve } as Metric] : []),
    ...(fingerprint.fingerprint.inflation     ? [{ label: "Inflation",   value: fingerprint.fingerprint.inflation } as Metric] : []),
    ...(fingerprint.fingerprint.oil           ? [{ label: "Oil regime",  value: fingerprint.fingerprint.oil } as Metric] : []),
    ...(fingerprint.fingerprint.unemployment_dir ? [{ label: "Unemployment", value: fingerprint.fingerprint.unemployment_dir } as Metric] : []),
    { label: "Coverage", value: `${(fingerprint.coverage * 100).toFixed(0)}%`, tone: fingerprint.coverage >= 0.66 ? "positive" : "warning" },
  ];

  const positives: Point[] = analogs.slice(0, 5).map((a) => {
    const n = narrativeByCode.get(a.event.code);
    const yr = new Date(a.event.start_date).getFullYear();
    const badge = n?.narrative_status === "verified" ? "✓ AI-verified"
                : n?.narrative_status === "needs_review" ? "⚠ Needs review"
                : "· Unverified narrative";
    const cause = n?.causes ? `Cause: ${n.causes}` : "";
    const next  = n?.what_happened_next ? `What happened next: ${n.what_happened_next}` : "";
    const detail = [
      `${yr} · ${a.event.category} · ${a.dimsMatched}/${a.dimsCompared} dims matched · ${badge}`,
      cause, next,
      `→ open /history/${a.event.code} for citations + forward returns`,
    ].filter(Boolean).join("\n");
    return {
      id: `an-${a.event.code}`,
      label: `${a.event.name} — ${a.matchPct.toFixed(0)}% match`,
      detail,
    };
  });

  const evidence: Evidence[] = [{
    id: "ev-fp", label: `Macro fingerprint (${(fingerprint.coverage * 100).toFixed(0)}% coverage)`,
    sourceName: "FRED + commodity pool", tier: "tier1_official",
    asOf: nowIso, freshness: "fresh", agrees: true,
  }];

  const algoCoverage: VerifyCheck = {
    id: "v-analog-coverage", label: "≥3 analogs above 50% match", verifier: "algo",
    status: analogs.filter((a) => a.matchPct >= 50).length >= 3 ? "pass"
          : fingerprint.coverage < 0.5 ? "unavailable" : "fail",
    detail: `${analogs.length} analogs total, ${analogs.filter((a) => a.matchPct >= 50).length} above 50% match`,
    checkedAt: nowIso,
  };
  const algoFp: VerifyCheck = {
    id: "v-fp-coverage", label: "Fingerprint covers ≥4/6 dimensions", verifier: "algo",
    status: fingerprint.coverage >= 4 / 6 ? "pass" : "fail",
    detail: `${Math.round(fingerprint.coverage * 6)}/6 dimensions populated`,
    checkedAt: nowIso,
  };
  const verifyNext: VerifyCheck[] = [algoCoverage, algoFp, aiCoherenceCheck([algoCoverage, algoFp], `${analogs.length} analog candidates`)];

  const regime: PanelData = {
    id: "hist-regime",
    title: "Current regime — analog library match",
    purpose: "Deterministic macro fingerprint of today's environment matched against the seeded event library.",
    metrics: fpMetrics,
    background: REGIME_BACKGROUND,
    whatChanged: analogs.length > 0
      ? `Top match: ${analogs[0].event.name} (${analogs[0].matchPct.toFixed(0)}%). ${analogs.length} analogs above the threshold.`
      : "No analogs above the 40% match floor — fingerprint may be too sparse to compare.",
    whyItMatters: "History does not repeat, but rate/inflation/oil regimes recur. Analogs answer 'when did we last see this, and what happened next?' with an auditable evidence chain.",
    whyBullets: [
      analogs[0] ? `Closest analog: ${analogs[0].event.name} (${analogs[0].matchPct.toFixed(0)}% fingerprint match).` : "No strong analog — either the fingerprint is thin or the current regime is genuinely novel.",
      analogs[0] && narrativeByCode.get(analogs[0].event.code)?.what_happened_next
        ? `Last time (${new Date(analogs[0].event.start_date).getFullYear()}): ${narrativeByCode.get(analogs[0].event.code)!.what_happened_next}`
        : "Open the closest analog for the sourced narrative and forward returns.",
      "How to read the metrics: hover any dimension for its plain-English meaning. Rate direction and inflation regime carry the highest weight — they're the strongest cross-cycle signals.",
      `Fingerprint coverage ${(fingerprint.coverage * 100).toFixed(0)}% — thicker coverage = higher-confidence match.`,
      `Narratives verified by algo (structure + citation allowlist) → API (link liveness) → AI (coherence). If AI can't verify, the loop rewrites the narrative grounded in the citations and re-checks (max 2 passes) before marking 'needs review'.`,
    ].filter(Boolean) as string[],
    evidence, positives, deductions: [], verifyNext,
    confidence: computeConfidence({ tier: "tier1_official", category: "macro_release", ageSeconds: 0 }),
    calculation: {
      formula: "match = Σ dim_weight × dim_score / Σ dim_weight, ordinal partial-credit 0.5, tag boost +5% per tag",
      ...stampCalculation(FINGERPRINT_VERSION, { coverage: fingerprint.coverage }),
      inputs: fingerprint.inputs,
    },
  };

  // ---------- Category browser panels (one per category) ----------
  const byCat = new Map<string, Array<{ code: string; name: string; start_date: string; tags: string[] }>>();
  for (const e of events ?? []) {
    const cat = e.category as string;
    const arr = byCat.get(cat) ?? [];
    arr.push({ code: e.code as string, name: e.name as string, start_date: e.start_date as string, tags: (e.tags as string[]) ?? [] });
    byCat.set(cat, arr);
  }
  const catPanels: PanelData[] = [...byCat.entries()].sort().map(([cat, list]) => {
    list.sort((a, b) => b.start_date.localeCompare(a.start_date));
    return {
      id: `hist-cat-${cat}`,
      title: `${cat.replace(/_/g, " ")} events (${list.length})`,
      purpose: `Seeded ${cat.replace(/_/g, " ")} episodes in the event library, most recent first.`,
      metrics: [{ label: "Events", value: `${list.length}` }, { label: "Latest", value: new Date(list[0].start_date).getFullYear().toString() }],
      background: categoryBackground(cat, list),
      whatChanged: `${list.length} episodes indexed in this category.`,
      whyItMatters: "Browse the library directly when you want to research a class of regimes rather than the current fingerprint.",
      evidence: [], positives: list.map((e) => ({
        id: e.code, label: `${new Date(e.start_date).getFullYear()} — ${e.name}`,
        detail: e.tags.join(", "),
      })), deductions: [],
      verifyNext: [{ id: "v-manual", label: "Open the event card for evidence and impacts", verifier: "manual", status: "pending" }],
      confidence: computeConfidence({ tier: "tier3_reputable", category: "news", ageSeconds: 0 }),
    };
  });

  return [regime, ...catPanels];
});

/** Full detail for a single event — used by /history/$eventId. */
export const getEventDetail = createServerFn({ method: "GET" })
  .inputValidator((data: { code: string }) => data)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: event } = await supabaseAdmin
      .from("historical_events").select("*").eq("code", data.code).maybeSingle();
    if (!event) return { event: null, impacts: [] as Array<{ scope_type: string; scope_code: string; window_days: number; return_pct: number; note: string | null }> };
    const { data: impacts } = await supabaseAdmin
      .from("event_impacts").select("scope_type, scope_code, window_days, return_pct, note")
      .eq("event_id", event.id).order("scope_type", { ascending: true }).order("return_pct", { ascending: false });
    return { event, impacts: impacts ?? [] };
  });