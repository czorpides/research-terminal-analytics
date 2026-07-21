
UPDATE public.historical_events
SET citations = jsonb_build_array(
  jsonb_build_object(
    'title', name,
    'url', source_url,
    'publisher',
      CASE
        WHEN source_url ILIKE '%federalreserve.gov%' OR source_url ILIKE '%federalreservehistory.org%' THEN 'Federal Reserve'
        WHEN source_url ILIKE '%bls.gov%' THEN 'BLS'
        WHEN source_url ILIKE '%bea.gov%' THEN 'BEA'
        WHEN source_url ILIKE '%imf.org%' THEN 'IMF'
        WHEN source_url ILIKE '%wikipedia.org%' THEN 'Wikipedia'
        WHEN source_url ILIKE '%reuters.com%' THEN 'Reuters'
        WHEN source_url ILIKE '%ft.com%' THEN 'Financial Times'
        WHEN source_url ILIKE '%wsj.com%' THEN 'Wall Street Journal'
        WHEN source_url ILIKE '%bloomberg.com%' THEN 'Bloomberg'
        ELSE 'Reference'
      END
  )
)
WHERE source_url IS NOT NULL AND (citations IS NULL OR citations = '[]'::jsonb);
