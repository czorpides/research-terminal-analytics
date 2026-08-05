import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type MetricGlossaryKey =
  | "marketCap"
  | "enterpriseValue"
  | "pe"
  | "forwardPe"
  | "pb"
  | "ps"
  | "evEbitda"
  | "fcfYield"
  | "roe"
  | "roic"
  | "roicWacc"
  | "grossMargin"
  | "operatingMargin"
  | "netMargin"
  | "fcfMargin"
  | "debtEquity"
  | "netDebtEbitda"
  | "currentRatio"
  | "interestCoverage"
  | "beta"
  | "revenueGrowth"
  | "epsGrowth"
  | "priceTarget"
  | "targetUpside"
  | "radarScore"
  | "valuationScore"
  | "qualityScore"
  | "priceDislocation"
  | "recoveryScore"
  | "evidenceCoverage";

const GLOSSARY: Record<MetricGlossaryKey, { title: string; body: string }> = {
  marketCap: {
    title: "Market capitalisation",
    body: "The market value of the company's equity: share price multiplied by shares outstanding. It tells you the size of the quoted equity, not the value of the whole operating business.",
  },
  enterpriseValue: {
    title: "Enterprise value",
    body: "A rough value of the whole operating business: equity value plus net debt and similar claims. It is useful when comparing companies with different financing structures.",
  },
  pe: {
    title: "Price / Earnings (P/E)",
    body: "How much investors are paying for £1 or $1 of annual earnings. A 15x P/E means the shares cost roughly 15 times current earnings. Lower can mean cheaper, but only if the earnings are sustainable.",
  },
  forwardPe: {
    title: "Forward P/E",
    body: "The share price divided by analysts' expected earnings for the next financial year. It is often more useful than historical P/E when profits are changing quickly, but it depends on forecast accuracy.",
  },
  pb: {
    title: "Price / Book",
    body: "Share price relative to accounting book value per share. It can be useful for banks and asset-heavy businesses, but it is less informative for companies whose value comes mainly from brands, software or other intangibles.",
  },
  ps: {
    title: "Price / Sales",
    body: "Equity value relative to annual revenue. It can help compare businesses with low or temporarily depressed profits, but it says nothing by itself about margins or cash generation.",
  },
  evEbitda: {
    title: "EV / EBITDA",
    body: "Enterprise value divided by EBITDA. It values the whole business against operating earnings before interest, tax and major non-cash charges, making it useful for companies with different debt levels.",
  },
  fcfYield: {
    title: "Free cash flow yield",
    body: "Free cash flow generated relative to market value. A 7% yield means the business is producing roughly £7 or $7 of free cash flow for every 100 of equity value. Higher is usually more attractive, all else equal.",
  },
  roe: {
    title: "Return on equity (ROE)",
    body: "Net profit relative to shareholders' equity. It shows how effectively the company earns on the accounting capital belonging to shareholders, although high leverage can artificially boost it.",
  },
  roic: {
    title: "Return on invested capital (ROIC)",
    body: "How efficiently the business turns the capital invested in its operations into after-tax operating profit. Consistently high ROIC is often a sign of a strong business model or competitive advantage.",
  },
  roicWacc: {
    title: "ROIC minus WACC",
    body: "The spread between the return earned on invested capital and the estimated cost of financing that capital. A positive spread suggests the company is creating economic value; a negative spread suggests it may be destroying it.",
  },
  grossMargin: {
    title: "Gross margin",
    body: "Gross profit as a percentage of revenue. It shows how much of each sales pound or dollar remains after direct product or service costs, before overheads, interest and tax.",
  },
  operatingMargin: {
    title: "Operating margin",
    body: "Operating profit as a percentage of revenue. It shows how profitable the core business is after normal operating costs but before interest and tax.",
  },
  netMargin: {
    title: "Net margin",
    body: "Net income as a percentage of revenue. It is the proportion of sales left for shareholders after operating costs, interest, tax and other below-the-line items.",
  },
  fcfMargin: {
    title: "Free cash flow margin",
    body: "Free cash flow as a percentage of revenue. It shows how much of each sales pound or dollar ultimately turns into cash that can be reinvested, used to reduce debt, repurchase shares or be returned to shareholders.",
  },
  debtEquity: {
    title: "Debt / Equity",
    body: "Total debt relative to shareholders' equity. It gives a quick view of financial leverage, but sensible levels vary significantly by sector and accounting structure.",
  },
  netDebtEbitda: {
    title: "Net debt / EBITDA",
    body: "Net debt relative to annual EBITDA. A 2.0x ratio means net debt is about twice annual EBITDA. Lower is normally safer, but acceptable leverage depends heavily on cash-flow stability and the sector.",
  },
  currentRatio: {
    title: "Current ratio",
    body: "Current assets divided by current liabilities. It is a basic measure of short-term liquidity. A figure below 1.0x can indicate tighter working-capital headroom, although normal levels vary by business model.",
  },
  interestCoverage: {
    title: "Interest coverage",
    body: "Operating profit relative to interest expense. It indicates how comfortably the business can service its borrowing costs from operating earnings. Higher generally means more financial headroom.",
  },
  beta: {
    title: "Beta",
    body: "A measure of how the share price has tended to move relative to the wider equity market. Above 1.0 has historically meant more market sensitivity; below 1.0 means less. It is not a forecast of future volatility.",
  },
  revenueGrowth: {
    title: "Revenue growth",
    body: "The percentage change in sales from one period to another. Growth is more valuable when it is durable, profitable and does not require excessive capital or dilution.",
  },
  epsGrowth: {
    title: "EPS growth",
    body: "The change in earnings per share. It captures profit growth on a per-share basis, so it also reflects the impact of share issuance or buybacks.",
  },
  priceTarget: {
    title: "Consensus price target",
    body: "The average or consensus 12-month share-price target published by covering analysts. It is useful as a view of market expectations, not as an intrinsic valuation or guarantee of where the shares will trade.",
  },
  targetUpside: {
    title: "Implied target upside",
    body: "The percentage difference between the current share price and the consensus analyst target. It shows how optimistic or pessimistic consensus is relative to today's price, but it inherits all of the assumptions in analyst forecasts.",
  },
  radarScore: {
    title: "Radar score",
    body: "The platform's combined research-priority score. It brings together the visible opportunity route, valuation, business quality, price dislocation and institutional evidence. It prioritises what to research; it is not a buy signal or price target.",
  },
  valuationScore: {
    title: "Valuation score",
    body: "A 0–100 measure of how attractive the company's observed valuation looks relative to available peers and valuation evidence. Higher means cheaper or more attractive on the measures we can verify; it is not an intrinsic value estimate.",
  },
  qualityScore: {
    title: "Quality score",
    body: "A 0–100 summary of profitability, returns, margins and financial quality evidence. Higher generally means a stronger underlying business, but sector-specific economics still matter.",
  },
  priceDislocation: {
    title: "Price dislocation",
    body: "A measure of whether the share-price decline appears larger than the deterioration visible in the business and peer context. A high score can highlight an opportunity, but it does not prove the market is wrong.",
  },
  recoveryScore: {
    title: "Recovery score",
    body: "A measure of whether price and fundamental evidence are beginning to confirm that conditions are improving. A low score can simply mean the recovery has not yet been proven.",
  },
  evidenceCoverage: {
    title: "Evidence coverage",
    body: "How much of the model's required evidence is actually available and current. Higher coverage means the ranking rests on more verified inputs. Low coverage should reduce conviction rather than be treated as a negative company signal.",
  },
};

export function MetricHelp({ metric }: { metric: MetricGlossaryKey }) {
  const item = GLOSSARY[metric];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`Explain ${item.title}`}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[360px] p-3 text-xs leading-5">
        <div className="font-semibold text-foreground">{item.title}</div>
        <div className="mt-1 text-muted-foreground">{item.body}</div>
      </TooltipContent>
    </Tooltip>
  );
}
