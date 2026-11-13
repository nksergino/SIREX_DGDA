-- Interval analytics: preserves provincial RLS and adds weekly or monthly evolution.
CREATE OR REPLACE FUNCTION public.sirex_apurement_analytics_interval(p_from date DEFAULT NULL,p_to date DEFAULT NULL,p_granularity text DEFAULT 'month')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE base jsonb; periods jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise.'; END IF;
 IF p_granularity NOT IN ('week','month') THEN RAISE EXCEPTION 'La fréquence doit être hebdomadaire ou mensuelle.'; END IF;
 base:=public.sirex_apurement_analytics(p_from,p_to);
 WITH scoped AS (
   SELECT r.*,b.period,b.province FROM public.sirex_sydonia_rows r JOIN public.sirex_monthly_apurements b ON b.id=r.apurement_id
   WHERE sirex_private.can_access(b.province,false)
   AND (p_from IS NULL OR b.period>=date_trunc('month',p_from)::date)
   AND (p_to IS NULL OR b.period<=date_trunc('month',p_to)::date)
 ), grouped AS (
   SELECT date_trunc(p_granularity,declaration_date)::date period,count(*) rows,count(*) FILTER(WHERE match_status='conforme') conformes,count(*) FILTER(WHERE match_status<>'conforme') anomalies,coalesce(sum(total_taxes) FILTER(WHERE match_status<>'conforme'),0) recovery
   FROM scoped GROUP BY date_trunc(p_granularity,declaration_date)::date
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('period',period,'rows',rows,'conformes',conformes,'anomalies',anomalies,'recovery_potential',recovery) ORDER BY period),'[]'::jsonb) INTO periods FROM grouped;
 RETURN base||jsonb_build_object('granularity',p_granularity,'by_period',periods);
END $$;
REVOKE ALL ON FUNCTION public.sirex_apurement_analytics_interval(date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sirex_apurement_analytics_interval(date,date,text) TO authenticated;