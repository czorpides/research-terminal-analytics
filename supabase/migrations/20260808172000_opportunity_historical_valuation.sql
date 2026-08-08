-- Opportunity Radar v2: observed historical self-valuation from stored filings + prices.
-- One row per latest annual filing revision, using the nearest prior traded close
-- within ten calendar days of the fiscal period end. Historical close is used
-- with historical diluted shares so stock splits do not distort market value.

create or replace function public.get_opportunity_historical_valuation(
  p_asset_ids uuid[],
  p_max_periods integer default 10
)
returns table (
  asset_id uuid,
  period_end date,
  price_date date,
  market_cap numeric,
  ev_ebitda numeric,
  fcf_yield numeric,
  ev_revenue numeric,
  ptbv numeric
)
language sql
stable
set search_path = public
as $$
with latest_revision as (
  select
    f.*,
    row_number() over (
      partition by f.asset_id, f.period_end
      order by f.revision_no desc, f.known_at desc, f.id desc
    ) as revision_rank
  from public.fundamental_filings f
  where f.asset_id = any(p_asset_ids)
    and f.fiscal_period = 'FY'
), ranked_periods as (
  select
    f.*,
    row_number() over (
      partition by f.asset_id
      order by f.period_end desc
    ) as period_rank
  from latest_revision f
  where f.revision_rank = 1
), parsed as (
  select
    f.asset_id,
    f.period_end,
    coalesce(
      nullif(f.raw #>> '{income,weightedAverageShsOutDil}', '')::numeric,
      nullif(f.raw #>> '{income,weightedAverageShsOut}', '')::numeric
    ) as shares,
    nullif(f.raw #>> '{income,revenue}', '')::numeric as revenue,
    coalesce(
      nullif(f.raw #>> '{income,ebitda}', '')::numeric,
      nullif(f.raw #>> '{income,ebit}', '')::numeric
        + coalesce(nullif(f.raw #>> '{cashFlow,depreciationAndAmortization}', '')::numeric, 0)
    ) as ebitda,
    coalesce(
      nullif(f.raw #>> '{cashFlow,freeCashFlow}', '')::numeric,
      nullif(f.raw #>> '{cashFlow,operatingCashFlow}', '')::numeric
        - abs(coalesce(nullif(f.raw #>> '{cashFlow,capitalExpenditure}', '')::numeric, 0))
    ) as free_cash_flow,
    coalesce(
      nullif(f.raw #>> '{balance,totalDebt}', '')::numeric,
      nullif(f.raw #>> '{balance,longTermDebt}', '')::numeric,
      nullif(f.raw #>> '{balance,totalNonCurrentDebt}', '')::numeric,
      0
    ) as total_debt,
    coalesce(
      nullif(f.raw #>> '{balance,cashAndShortTermInvestments}', '')::numeric,
      nullif(f.raw #>> '{balance,cashAndCashEquivalents}', '')::numeric,
      0
    ) as cash,
    coalesce(
      nullif(f.raw #>> '{balance,totalStockholdersEquity}', '')::numeric,
      nullif(f.raw #>> '{balance,totalEquity}', '')::numeric
    ) as total_equity,
    coalesce(nullif(f.raw #>> '{balance,goodwill}', '')::numeric, 0) as goodwill,
    coalesce(
      nullif(f.raw #>> '{balance,intangibleAssets}', '')::numeric,
      nullif(f.raw #>> '{balance,goodwillAndIntangibleAssets}', '')::numeric
        - coalesce(nullif(f.raw #>> '{balance,goodwill}', '')::numeric, 0),
      0
    ) as intangible_assets
  from ranked_periods f
  where f.period_rank <= greatest(1, least(coalesce(p_max_periods, 10), 12))
), priced as (
  select
    x.*,
    p.trade_date as price_date,
    p.close as historical_close,
    case
      when x.shares > 0 and p.close > 0 then x.shares * p.close
      else null
    end as market_cap
  from parsed x
  left join lateral (
    select pd.trade_date, pd.close
    from public.prices_daily pd
    where pd.asset_id = x.asset_id
      and pd.trade_date <= x.period_end
      and pd.trade_date >= x.period_end - 10
      and pd.close is not null
      and pd.close > 0
    order by pd.trade_date desc
    limit 1
  ) p on true
)
select
  x.asset_id,
  x.period_end,
  x.price_date,
  x.market_cap,
  case
    when x.market_cap > 0 and x.ebitda > 0
      then (x.market_cap + x.total_debt - x.cash) / x.ebitda
    else null
  end as ev_ebitda,
  case
    when x.market_cap > 0 and x.free_cash_flow is not null
      then x.free_cash_flow / x.market_cap
    else null
  end as fcf_yield,
  case
    when x.market_cap > 0 and x.revenue > 0
      then (x.market_cap + x.total_debt - x.cash) / x.revenue
    else null
  end as ev_revenue,
  case
    when x.market_cap > 0
      and x.total_equity is not null
      and (x.total_equity - x.goodwill - x.intangible_assets) > 0
      then x.market_cap / (x.total_equity - x.goodwill - x.intangible_assets)
    else null
  end as ptbv
from priced x
where x.market_cap is not null
order by x.asset_id, x.period_end desc;
$$;

comment on function public.get_opportunity_historical_valuation(uuid[], integer) is
  'Observed annual valuation history for Opportunity Radar. Joins latest stored FY filing revisions to the nearest prior raw close and never synthesizes missing valuation points.';

grant execute on function public.get_opportunity_historical_valuation(uuid[], integer) to authenticated, service_role;
