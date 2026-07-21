
CREATE TABLE public.historical_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  category TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  summary TEXT NOT NULL,
  source_url TEXT,
  fingerprint JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.historical_events TO authenticated;
GRANT ALL ON public.historical_events TO service_role;
ALTER TABLE public.historical_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all_authenticated" ON public.historical_events FOR SELECT TO authenticated USING (true);

CREATE TABLE public.event_impacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.historical_events(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL,
  scope_code TEXT NOT NULL,
  window_days INT NOT NULL DEFAULT 180,
  return_pct NUMERIC(8,2) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX event_impacts_event_idx ON public.event_impacts(event_id);
CREATE INDEX event_impacts_scope_idx ON public.event_impacts(scope_type, scope_code);

GRANT SELECT ON public.event_impacts TO authenticated;
GRANT ALL ON public.event_impacts TO service_role;
ALTER TABLE public.event_impacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all_authenticated" ON public.event_impacts FOR SELECT TO authenticated USING (true);

INSERT INTO public.historical_events (code, name, start_date, end_date, category, tags, summary, source_url, fingerprint) VALUES
('1973_OIL_EMBARGO', '1973 OPEC Oil Embargo', '1973-10-17', '1974-03-18', 'oil_shock', ARRAY['oil_shock','stagflation','recession'], 'OPEC oil embargo quadrupled crude prices, triggering global stagflation and a deep bear market.', 'https://en.wikipedia.org/wiki/1973_oil_crisis', '{"rate_level":"mid","rate_direction":"rising","curve":"flat","inflation":"high","oil":"spike","unemployment_dir":"rising"}'::jsonb),
('1979_VOLCKER', '1979–82 Volcker Disinflation', '1979-10-06', '1982-08-01', 'rate_shock', ARRAY['rate_shock','disinflation','recession'], 'Fed hiked funds to 20% to break double-digit inflation. Curve deeply inverted; 27% equity drawdown.', 'https://www.federalreservehistory.org/essays/anti-inflation-measures', '{"rate_level":"high","rate_direction":"rising","curve":"inverted","inflation":"high","oil":"elevated","unemployment_dir":"rising"}'::jsonb),
('1987_BLACK_MONDAY', '1987 Black Monday', '1987-10-19', '1987-12-04', 'crash', ARRAY['crash','portfolio_insurance'], 'S&P 500 fell 20.5% in a single session; recovered within 2 years. No recession followed.', 'https://en.wikipedia.org/wiki/Black_Monday_(1987)', '{"rate_level":"mid","rate_direction":"rising","curve":"flat","inflation":"moderate","oil":"normal","unemployment_dir":"falling"}'::jsonb),
('1990_KUWAIT', '1990 Kuwait Invasion / Oil Spike', '1990-08-02', '1991-02-28', 'oil_shock', ARRAY['oil_shock','recession','geopolitical'], 'Iraq invaded Kuwait; oil doubled within weeks. Consumer confidence collapsed into the 1990–91 recession.', 'https://en.wikipedia.org/wiki/Invasion_of_Kuwait', '{"rate_level":"mid","rate_direction":"falling","curve":"steep","inflation":"moderate","oil":"spike","unemployment_dir":"rising"}'::jsonb),
('1994_TIGHTENING', '1994 Fed Surprise Tightening', '1994-02-04', '1995-02-01', 'rate_shock', ARRAY['rate_shock','bond_bear'], 'Greenspan doubled funds from 3% to 6% in 12 months. Bonds had worst year in decades; equities finished flat.', 'https://www.federalreserve.gov/monetarypolicy/fomchistorical1994.htm', '{"rate_level":"mid","rate_direction":"rising","curve":"flat","inflation":"moderate","oil":"normal","unemployment_dir":"falling"}'::jsonb),
('1998_LTCM', '1998 LTCM / Russia Default', '1998-08-01', '1998-11-01', 'financial_stress', ARRAY['financial_stress','emerging_markets'], 'Russian default and LTCM collapse froze credit markets; Fed cut 75bp in emergency easing.', 'https://en.wikipedia.org/wiki/Long-Term_Capital_Management', '{"rate_level":"mid","rate_direction":"falling","curve":"flat","inflation":"low","oil":"low","unemployment_dir":"stable"}'::jsonb),
('2000_DOTCOM', '2000–02 Dot-com Bust', '2000-03-24', '2002-10-09', 'bubble_burst', ARRAY['bubble_burst','recession','tech'], 'Nasdaq fell 78% peak-to-trough; S&P −49%. Fed cut aggressively.', 'https://en.wikipedia.org/wiki/Dot-com_bubble', '{"rate_level":"mid","rate_direction":"falling","curve":"steep","inflation":"low","oil":"normal","unemployment_dir":"rising"}'::jsonb),
('2005_HIKES', '2004–06 Bernanke Tightening Cycle', '2004-06-30', '2006-06-29', 'rate_shock', ARRAY['rate_shock','housing'], 'Fed hiked from 1% to 5.25%. Curve inverted mid-2006; housing peaked shortly after.', 'https://www.federalreserve.gov/monetarypolicy/fomchistorical2005.htm', '{"rate_level":"mid","rate_direction":"rising","curve":"inverted","inflation":"moderate","oil":"elevated","unemployment_dir":"falling"}'::jsonb),
('2008_GFC', '2007–09 Global Financial Crisis', '2007-10-09', '2009-03-09', 'financial_stress', ARRAY['financial_stress','recession','housing','banking_stress'], 'Housing collapse cascaded into Lehman failure; S&P −57%. Zero rates and QE1 anchored the bottom.', 'https://en.wikipedia.org/wiki/Financial_crisis_of_2007%E2%80%932008', '{"rate_level":"low","rate_direction":"falling","curve":"steep","inflation":"low","oil":"low","unemployment_dir":"rising"}'::jsonb),
('2011_EU_DEBT', '2011 EU Debt / US Downgrade', '2011-05-01', '2011-10-04', 'financial_stress', ARRAY['financial_stress','sovereign_debt'], 'S&P downgraded US to AA+; EU periphery yields spiked. S&P 500 fell 19% intraday.', 'https://en.wikipedia.org/wiki/2011_United_States_debt-ceiling_crisis', '{"rate_level":"low","rate_direction":"stable","curve":"steep","inflation":"moderate","oil":"elevated","unemployment_dir":"falling"}'::jsonb),
('2013_TAPER', '2013 Taper Tantrum', '2013-05-22', '2013-09-30', 'rate_shock', ARRAY['rate_shock','bond_bear','emerging_markets'], 'Bernanke hinted at QE tapering; 10Y yield doubled from 1.6% to 3%. EM currencies collapsed.', 'https://en.wikipedia.org/wiki/Taper_tantrum', '{"rate_level":"low","rate_direction":"rising","curve":"steep","inflation":"low","oil":"elevated","unemployment_dir":"falling"}'::jsonb),
('2014_OIL_CRASH', '2014–16 Oil Price Crash', '2014-06-20', '2016-02-11', 'oil_shock', ARRAY['oil_shock','deflation','shale'], 'WTI fell from $107 to $26 as OPEC defended market share against US shale.', 'https://en.wikipedia.org/wiki/2010s_oil_glut', '{"rate_level":"low","rate_direction":"stable","curve":"steep","inflation":"low","oil":"low","unemployment_dir":"falling"}'::jsonb),
('2015_CHINA', '2015 China Devaluation / Global Slowdown', '2015-08-11', '2016-02-11', 'financial_stress', ARRAY['financial_stress','emerging_markets','china'], 'PBOC yuan devaluation triggered global risk-off; S&P −13%, EM −25%.', 'https://en.wikipedia.org/wiki/2015%E2%80%9316_stock_market_selloff', '{"rate_level":"low","rate_direction":"stable","curve":"flat","inflation":"low","oil":"low","unemployment_dir":"falling"}'::jsonb),
('2018_TARIFFS', '2018 US–China Tariff Round 1', '2018-03-22', '2019-01-15', 'tariff', ARRAY['tariff','trade_war','geopolitical'], 'Trump imposed tariffs on $250B of Chinese imports; retaliation followed.', 'https://en.wikipedia.org/wiki/China%E2%80%93United_States_trade_war', '{"rate_level":"mid","rate_direction":"rising","curve":"flat","inflation":"moderate","oil":"elevated","unemployment_dir":"falling"}'::jsonb),
('2018_Q4', '2018 Q4 Powell Selloff', '2018-10-03', '2018-12-24', 'rate_shock', ARRAY['rate_shock','pivot','crash'], 'Powell said rates were "long way from neutral"; S&P −19.8% peak-to-trough.', 'https://en.wikipedia.org/wiki/2018_cryptocurrency_crash', '{"rate_level":"mid","rate_direction":"rising","curve":"flat","inflation":"moderate","oil":"elevated","unemployment_dir":"falling"}'::jsonb),
('2019_INVERSION', '2019 Yield Curve Inversion', '2019-05-23', '2019-10-11', 'rate_shock', ARRAY['rate_shock','inversion','recession_signal'], '10Y–2Y inverted for first time since 2007; Fed delivered 3 insurance cuts.', 'https://www.stlouisfed.org/on-the-economy/2019/august/yield-curve-inversions-recessions', '{"rate_level":"mid","rate_direction":"falling","curve":"inverted","inflation":"low","oil":"normal","unemployment_dir":"stable"}'::jsonb),
('2020_COVID', '2020 COVID Crash & Recovery', '2020-02-19', '2020-08-18', 'crash', ARRAY['crash','pandemic','recession','recovery'], 'S&P −34% in 33 days; Fed cut to zero, launched QE-infinity. Fastest bear-to-new-high recovery on record.', 'https://en.wikipedia.org/wiki/2020_stock_market_crash', '{"rate_level":"low","rate_direction":"falling","curve":"steep","inflation":"low","oil":"low","unemployment_dir":"rising"}'::jsonb),
('2021_INFLATION', '2021 Post-COVID Inflation Surge', '2021-04-01', '2022-06-30', 'inflation_shock', ARRAY['inflation_shock','supply_chain','commodities'], 'CPI rose from 2% to 9% on fiscal, supply-chain and energy shocks.', 'https://www.bls.gov/opub/mlr/2022/article/the-cpi-in-2022.htm', '{"rate_level":"low","rate_direction":"rising","curve":"flat","inflation":"high","oil":"elevated","unemployment_dir":"falling"}'::jsonb),
('2022_HIKES', '2022 Fed Hiking Cycle / Bear Market', '2022-01-03', '2022-10-12', 'rate_shock', ARRAY['rate_shock','bear_market','duration'], 'Fed hiked 425bp in 9 months; longest-duration assets fell hardest.', 'https://www.federalreserve.gov/monetarypolicy/fomchistorical2022.htm', '{"rate_level":"mid","rate_direction":"rising","curve":"inverted","inflation":"high","oil":"spike","unemployment_dir":"falling"}'::jsonb),
('2022_UKRAINE', '2022 Russia–Ukraine Energy Shock', '2022-02-24', '2022-06-30', 'oil_shock', ARRAY['oil_shock','geopolitical','energy','commodities'], 'Russia invaded Ukraine; European gas +400%, WTI to $130.', 'https://en.wikipedia.org/wiki/2021%E2%80%932022_global_energy_crisis', '{"rate_level":"mid","rate_direction":"rising","curve":"flat","inflation":"high","oil":"spike","unemployment_dir":"falling"}'::jsonb),
('2023_SVB', '2023 SVB Banking Stress', '2023-03-08', '2023-05-01', 'financial_stress', ARRAY['financial_stress','banking_stress','regional_banks'], 'SVB, Signature and First Republic failed on duration-mismatch losses.', 'https://en.wikipedia.org/wiki/2023_United_States_banking_crisis', '{"rate_level":"high","rate_direction":"rising","curve":"inverted","inflation":"moderate","oil":"normal","unemployment_dir":"stable"}'::jsonb),
('2023_PEAK', '2023 Rate Peak / Higher-for-Longer', '2023-07-26', '2023-10-27', 'rate_shock', ARRAY['rate_shock','duration'], 'Fed reached 5.5% terminal; 10Y yield to 5% on stronger growth.', 'https://www.federalreserve.gov/monetarypolicy/fomchistorical2023.htm', '{"rate_level":"high","rate_direction":"rising","curve":"inverted","inflation":"moderate","oil":"elevated","unemployment_dir":"stable"}'::jsonb),
('2024_CUTS', '2024 Fed Pivot / First Cuts', '2024-09-18', '2024-12-31', 'rate_pivot', ARRAY['rate_pivot','soft_landing'], 'Fed cut 50bp in September, 25bp twice more into year-end.', 'https://www.federalreserve.gov/monetarypolicy/fomchistorical2024.htm', '{"rate_level":"high","rate_direction":"falling","curve":"steep","inflation":"moderate","oil":"normal","unemployment_dir":"rising"}'::jsonb),
('2025_TARIFFS', '2025 Tariff Round 2 (Broad Duties)', '2025-02-01', '2025-06-30', 'tariff', ARRAY['tariff','trade_war','industrials','materials'], 'Second wave of broad-based tariffs on Mexico, Canada, China and EU imports.', 'https://en.wikipedia.org/wiki/Tariffs_in_the_second_Trump_administration', '{"rate_level":"high","rate_direction":"stable","curve":"steep","inflation":"moderate","oil":"normal","unemployment_dir":"rising"}'::jsonb);

INSERT INTO public.event_impacts (event_id, scope_type, scope_code, window_days, return_pct, note)
SELECT e.id, s.scope_type, s.scope_code, s.window_days, s.return_pct, s.note FROM public.historical_events e
JOIN (VALUES
  ('1973_OIL_EMBARGO','sector','SEC_ENE',180, 32.0, 'Upstream energy repriced on quadrupled crude'),
  ('1973_OIL_EMBARGO','sector','SEC_CD', 180,-28.0, 'Autos and discretionary collapsed'),
  ('1973_OIL_EMBARGO','sector','SEC_UTL',180,-18.0, 'Utilities squeezed on fuel costs'),
  ('1973_OIL_EMBARGO','commodity','WTI', 90, 180.0,'Crude 4x within embargo window'),
  ('1979_VOLCKER','sector','SEC_FIN',360,-15.0, 'Banks squeezed by inverted curve and defaults'),
  ('1979_VOLCKER','sector','SEC_RE', 360,-22.0, 'Rate shock crushed REITs and housing'),
  ('1979_VOLCKER','sector','SEC_ENE',360, 12.0, 'Energy relative outperformer through disinflation'),
  ('1987_BLACK_MONDAY','sector','SEC_FIN',90, -25.0, 'Financials hit hardest on liquidity fears'),
  ('1987_BLACK_MONDAY','sector','SEC_CS', 90,  -8.0, 'Staples defensively outperformed'),
  ('1990_KUWAIT','sector','SEC_ENE',180, 18.0, 'Upstream lifted by oil spike'),
  ('1990_KUWAIT','sector','SEC_IND',180,-14.0, 'Industrials pressured by fuel costs and recession'),
  ('1990_KUWAIT','sector','SEC_CD', 180,-20.0, 'Auto demand collapsed'),
  ('1994_TIGHTENING','sector','SEC_RE', 180,-12.0, 'REITs de-rated on rising rates'),
  ('1994_TIGHTENING','sector','SEC_UTL',180,-15.0, 'Bond proxies compressed'),
  ('1994_TIGHTENING','sector','SEC_FIN',180,  5.0, 'Banks initially benefited from steeper front-end'),
  ('1998_LTCM','sector','SEC_FIN',90, -20.0, 'Banks with hedge-fund exposure repriced'),
  ('1998_LTCM','sector','SEC_TECH',90,  22.0, 'Tech rallied on Fed cuts'),
  ('2000_DOTCOM','sector','SEC_TECH',720,-78.0, 'Nasdaq peak-to-trough'),
  ('2000_DOTCOM','sector','SEC_CS',  360, 15.0, 'Staples defended through drawdown'),
  ('2000_DOTCOM','sector','SEC_UTL', 360, 22.0, 'Utilities re-rated as rates fell'),
  ('2000_DOTCOM','sector','SEC_RE',  360, 18.0, 'REITs benefited from lower rates'),
  ('2005_HIKES','sector','SEC_ENE',360, 45.0, 'Energy led on oil to $70'),
  ('2005_HIKES','sector','SEC_RE', 360, 25.0, 'REITs still gained on strong NOI'),
  ('2005_HIKES','sector','SEC_FIN',360, 12.0, 'Banks OK until curve inverted late-cycle'),
  ('2008_GFC','sector','SEC_FIN',360,-55.0, 'Bank stocks decimated by writedowns'),
  ('2008_GFC','sector','SEC_RE', 360,-42.0, 'REITs collapsed on refinancing risk'),
  ('2008_GFC','sector','SEC_CS', 360,-15.0, 'Staples relative outperformer'),
  ('2008_GFC','sector','SEC_UTL',360,-25.0, 'Utilities declined but less than market'),
  ('2008_GFC','commodity','WTI',180,-70.0, 'Crude collapsed from $147 to $32'),
  ('2011_EU_DEBT','sector','SEC_FIN',180,-22.0, 'Banks with EU exposure hit hardest'),
  ('2011_EU_DEBT','sector','SEC_UTL',180, 12.0, 'Utilities strong on flight-to-quality'),
  ('2011_EU_DEBT','sector','SEC_CS', 180,  8.0, 'Staples defensive bid'),
  ('2013_TAPER','sector','SEC_RE', 180,-14.0, 'REITs de-rated on yield spike'),
  ('2013_TAPER','sector','SEC_UTL',180,-10.0, 'Bond proxies compressed'),
  ('2013_TAPER','sector','SEC_FIN',180, 12.0, 'Banks benefited from steeper curve'),
  ('2014_OIL_CRASH','sector','SEC_ENE',360,-60.0, 'Upstream E&P collapsed'),
  ('2014_OIL_CRASH','sector','SEC_CD', 360, 12.0, 'Discretionary benefited from cheap fuel'),
  ('2014_OIL_CRASH','sector','SEC_MAT',360,-25.0, 'Mining and chemicals correlated to crude'),
  ('2014_OIL_CRASH','commodity','WTI',360,-70.0, '$107 → $26'),
  ('2015_CHINA','sector','SEC_MAT',180,-22.0, 'Materials hit hardest on China slowdown'),
  ('2015_CHINA','sector','SEC_IND',180,-14.0, 'Industrials with China exposure de-rated'),
  ('2015_CHINA','sector','SEC_CS', 180,  4.0, 'Staples defensive bid'),
  ('2018_TARIFFS','sector','SEC_IND',270,-12.0, 'Industrials hit on supply-chain re-routing costs'),
  ('2018_TARIFFS','sector','SEC_MAT',270, -8.0, 'Materials mixed — steel gained, chemicals lost'),
  ('2018_TARIFFS','sector','SEC_TECH',270,-15.0, 'Tech supply chains disrupted'),
  ('2018_Q4','sector','SEC_TECH',90, -22.0, 'Growth and duration hit hardest'),
  ('2018_Q4','sector','SEC_FIN', 90, -15.0, 'Banks pressured by flattening curve'),
  ('2018_Q4','sector','SEC_UTL', 90,  5.0, 'Utilities only sector positive in Q4'),
  ('2019_INVERSION','sector','SEC_FIN',180, -5.0, 'Banks lagged on curve inversion'),
  ('2019_INVERSION','sector','SEC_RE', 180, 18.0, 'REITs led on falling long rates'),
  ('2019_INVERSION','sector','SEC_UTL',180, 15.0, 'Utilities rallied on falling rates'),
  ('2020_COVID','sector','SEC_TECH',180, 45.0, 'Work-from-home tech surged'),
  ('2020_COVID','sector','SEC_ENE', 180,-40.0, 'WTI briefly went negative'),
  ('2020_COVID','sector','SEC_FIN', 180,-20.0, 'Zero rates and loan-loss provisions'),
  ('2020_COVID','sector','SEC_CD',  180, 22.0, 'Reopening beneficiaries rebounded'),
  ('2020_COVID','commodity','WTI',   90,-60.0, 'Collapse then rapid recovery'),
  ('2021_INFLATION','sector','SEC_ENE',360, 55.0, 'Energy led S&P by wide margin'),
  ('2021_INFLATION','sector','SEC_MAT',360, 25.0, 'Commodities cycle lifted materials'),
  ('2021_INFLATION','sector','SEC_TECH',360,-12.0, 'Long-duration growth de-rated'),
  ('2021_INFLATION','sector','SEC_RE', 360, 32.0, 'CPI pass-through supported REITs'),
  ('2021_INFLATION','commodity','WTI',360, 65.0, 'Crude to $120'),
  ('2022_HIKES','sector','SEC_TECH',270,-33.0, 'Nasdaq bear market'),
  ('2022_HIKES','sector','SEC_RE', 270,-28.0, 'REITs hit by 10Y spike'),
  ('2022_HIKES','sector','SEC_UTL',270,-12.0, 'Utilities compressed on rate spike'),
  ('2022_HIKES','sector','SEC_ENE', 270, 45.0, 'Energy the only positive sector'),
  ('2022_HIKES','sector','SEC_FIN', 270, -8.0, 'Banks flat until inversion late-cycle'),
  ('2022_UKRAINE','sector','SEC_ENE',120, 30.0, 'Energy re-rated on gas and oil spikes'),
  ('2022_UKRAINE','sector','SEC_MAT',120, 18.0, 'Fertilisers and ag inputs led'),
  ('2022_UKRAINE','sector','SEC_UTL',120,-15.0, 'European utility exposure hit hard'),
  ('2022_UKRAINE','commodity','WTI',   90, 40.0, 'Crude to $130'),
  ('2022_UKRAINE','commodity','NG',    90, 55.0, 'US natgas doubled'),
  ('2023_SVB','sector','SEC_FIN',90, -25.0, 'Regional banks lost 40%+'),
  ('2023_SVB','sector','SEC_TECH',90, 22.0, 'Large-cap tech rallied on cut expectations'),
  ('2023_SVB','sector','SEC_UTL', 90,  5.0, 'Utilities modest bid'),
  ('2023_PEAK','sector','SEC_RE', 90,-15.0, 'REITs de-rated on 10Y to 5%'),
  ('2023_PEAK','sector','SEC_UTL',90,-12.0, 'Utilities compressed'),
  ('2023_PEAK','sector','SEC_TECH',90,-10.0, 'Long-duration growth pulled back'),
  ('2024_CUTS','sector','SEC_RE', 120, 15.0, 'REITs led on falling rates'),
  ('2024_CUTS','sector','SEC_UTL',120, 12.0, 'Utilities re-rated'),
  ('2024_CUTS','sector','SEC_FIN',120,  8.0, 'Banks flat as curve steepened'),
  ('2024_CUTS','sector','SEC_CD', 120, 10.0, 'Discretionary benefited from easing'),
  ('2025_TARIFFS','sector','SEC_IND',150, -12.0, 'Industrials with cross-border supply chains'),
  ('2025_TARIFFS','sector','SEC_CD', 150,-15.0, 'Autos and retail passed costs poorly'),
  ('2025_TARIFFS','sector','SEC_MAT',150,  8.0, 'Domestic steel/aluminium gained pricing power'),
  ('2025_TARIFFS','sector','SEC_TECH',150,-10.0, 'Semis and hardware supply chains disrupted')
) AS s(event_code, scope_type, scope_code, window_days, return_pct, note)
ON e.code = s.event_code;
