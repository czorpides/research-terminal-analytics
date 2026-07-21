UPDATE public.economic_indicators
SET provider_series_code = 'IUDSOIA', name = 'UK SONIA (BoE proxy)', frequency = 'daily'
WHERE code = 'UK_BANK_RATE';