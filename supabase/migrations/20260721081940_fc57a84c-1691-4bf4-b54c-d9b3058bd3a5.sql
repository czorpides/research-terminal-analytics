
-- Stooq source (Tier 2)
INSERT INTO public.data_sources (name, tier, base_url, api_docs_url, notes, active, provider_code)
VALUES ('Stooq', 'tier2_regulated', 'https://stooq.com', 'https://stooq.com/db/', 'Free daily OHLCV CSV endpoint. No API key.', true, 'stooq')
ON CONFLICT DO NOTHING;

-- Freshness policy for daily prices
INSERT INTO public.source_freshness_policies (data_category, max_age_seconds, warn_age_seconds, notes)
VALUES ('price_daily', 172800, 86400, 'US EOD prices; expect a fresh row by end of next US trading day.')
ON CONFLICT DO NOTHING;

-- Sector industries
INSERT INTO public.industries (code, name) VALUES
  ('SEC_TECH','Technology'),
  ('SEC_FIN','Financials'),
  ('SEC_HC','Health Care'),
  ('SEC_CD','Consumer Discretionary'),
  ('SEC_CS','Consumer Staples'),
  ('SEC_IND','Industrials'),
  ('SEC_ENE','Energy'),
  ('SEC_MAT','Materials'),
  ('SEC_UTL','Utilities'),
  ('SEC_RE','Real Estate'),
  ('SEC_COM','Communication Services'),
  ('SEC_ETF','ETF / Index')
ON CONFLICT (code) DO NOTHING;

-- Assets (curated ~55 large-cap US names + ETFs)
WITH us AS (SELECT id FROM public.countries WHERE iso2='US' LIMIT 1),
     ind AS (SELECT code, id FROM public.industries)
INSERT INTO public.assets (symbol, name, asset_class, country_id, currency, industry_id, exchange, active)
SELECT s.symbol, s.name, s.asset_class::asset_class, (SELECT id FROM us),
       'USD', (SELECT id FROM ind WHERE code = s.industry), s.exchange, true
FROM (VALUES
  -- ETFs / indices
  ('SPY','SPDR S&P 500 ETF','etf','SEC_ETF','ARCX'),
  ('QQQ','Invesco QQQ Trust','etf','SEC_ETF','XNAS'),
  ('IWM','iShares Russell 2000 ETF','etf','SEC_ETF','ARCX'),
  ('DIA','SPDR Dow Jones Industrial Avg','etf','SEC_ETF','ARCX'),
  ('VTI','Vanguard Total Stock Market ETF','etf','SEC_ETF','ARCX'),
  ('EFA','iShares MSCI EAFE ETF','etf','SEC_ETF','ARCX'),
  ('EEM','iShares MSCI Emerging Markets','etf','SEC_ETF','ARCX'),
  ('TLT','iShares 20+ Year Treasury Bond','etf','SEC_ETF','XNAS'),
  ('GLD','SPDR Gold Shares','etf','SEC_ETF','ARCX'),
  ('USO','US Oil Fund','etf','SEC_ETF','ARCX'),
  -- Technology
  ('AAPL','Apple','equity','SEC_TECH','XNAS'),
  ('MSFT','Microsoft','equity','SEC_TECH','XNAS'),
  ('NVDA','NVIDIA','equity','SEC_TECH','XNAS'),
  ('AVGO','Broadcom','equity','SEC_TECH','XNAS'),
  ('ORCL','Oracle','equity','SEC_TECH','XNYS'),
  ('CRM','Salesforce','equity','SEC_TECH','XNYS'),
  ('AMD','Advanced Micro Devices','equity','SEC_TECH','XNAS'),
  ('ADBE','Adobe','equity','SEC_TECH','XNAS'),
  ('INTC','Intel','equity','SEC_TECH','XNAS'),
  ('CSCO','Cisco Systems','equity','SEC_TECH','XNAS'),
  ('QCOM','Qualcomm','equity','SEC_TECH','XNAS'),
  -- Communication Services
  ('GOOGL','Alphabet Class A','equity','SEC_COM','XNAS'),
  ('META','Meta Platforms','equity','SEC_COM','XNAS'),
  ('NFLX','Netflix','equity','SEC_COM','XNAS'),
  ('DIS','Walt Disney','equity','SEC_COM','XNYS'),
  ('T','AT&T','equity','SEC_COM','XNYS'),
  ('VZ','Verizon','equity','SEC_COM','XNYS'),
  -- Consumer Discretionary
  ('AMZN','Amazon','equity','SEC_CD','XNAS'),
  ('TSLA','Tesla','equity','SEC_CD','XNAS'),
  ('HD','Home Depot','equity','SEC_CD','XNYS'),
  ('MCD','McDonald''s','equity','SEC_CD','XNYS'),
  ('NKE','Nike','equity','SEC_CD','XNYS'),
  ('LOW','Lowe''s','equity','SEC_CD','XNYS'),
  ('SBUX','Starbucks','equity','SEC_CD','XNAS'),
  -- Consumer Staples
  ('WMT','Walmart','equity','SEC_CS','XNYS'),
  ('PG','Procter & Gamble','equity','SEC_CS','XNYS'),
  ('KO','Coca-Cola','equity','SEC_CS','XNYS'),
  ('PEP','PepsiCo','equity','SEC_CS','XNAS'),
  ('COST','Costco','equity','SEC_CS','XNAS'),
  -- Financials
  ('JPM','JPMorgan Chase','equity','SEC_FIN','XNYS'),
  ('BAC','Bank of America','equity','SEC_FIN','XNYS'),
  ('WFC','Wells Fargo','equity','SEC_FIN','XNYS'),
  ('GS','Goldman Sachs','equity','SEC_FIN','XNYS'),
  ('MS','Morgan Stanley','equity','SEC_FIN','XNYS'),
  ('BLK','BlackRock','equity','SEC_FIN','XNYS'),
  ('V','Visa','equity','SEC_FIN','XNYS'),
  ('MA','Mastercard','equity','SEC_FIN','XNYS'),
  ('BRK-B','Berkshire Hathaway B','equity','SEC_FIN','XNYS'),
  -- Health Care
  ('UNH','UnitedHealth Group','equity','SEC_HC','XNYS'),
  ('JNJ','Johnson & Johnson','equity','SEC_HC','XNYS'),
  ('LLY','Eli Lilly','equity','SEC_HC','XNYS'),
  ('PFE','Pfizer','equity','SEC_HC','XNYS'),
  ('MRK','Merck','equity','SEC_HC','XNYS'),
  ('ABBV','AbbVie','equity','SEC_HC','XNYS'),
  ('TMO','Thermo Fisher','equity','SEC_HC','XNYS'),
  -- Industrials
  ('BA','Boeing','equity','SEC_IND','XNYS'),
  ('CAT','Caterpillar','equity','SEC_IND','XNYS'),
  ('GE','GE Aerospace','equity','SEC_IND','XNYS'),
  ('HON','Honeywell','equity','SEC_IND','XNAS'),
  ('UPS','United Parcel Service','equity','SEC_IND','XNYS'),
  -- Energy
  ('XOM','ExxonMobil','equity','SEC_ENE','XNYS'),
  ('CVX','Chevron','equity','SEC_ENE','XNYS'),
  ('COP','ConocoPhillips','equity','SEC_ENE','XNYS'),
  -- Materials
  ('LIN','Linde','equity','SEC_MAT','XNYS'),
  ('FCX','Freeport-McMoRan','equity','SEC_MAT','XNYS'),
  -- Utilities
  ('NEE','NextEra Energy','equity','SEC_UTL','XNYS'),
  ('DUK','Duke Energy','equity','SEC_UTL','XNYS'),
  -- Real Estate
  ('AMT','American Tower','equity','SEC_RE','XNYS'),
  ('PLD','Prologis','equity','SEC_RE','XNYS')
) AS s(symbol, name, asset_class, industry, exchange)
ON CONFLICT (symbol, exchange) DO NOTHING;

-- Index for "latest score" queries
CREATE INDEX IF NOT EXISTS scores_subject_type_computed_at_idx
  ON public.scores (subject_type, subject_id, score_type, computed_at DESC);
