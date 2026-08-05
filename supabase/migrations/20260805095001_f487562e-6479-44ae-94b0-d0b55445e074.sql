REVOKE EXECUTE ON FUNCTION public.refresh_equity_technical_screen() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_equity_technical_screen() TO service_role;