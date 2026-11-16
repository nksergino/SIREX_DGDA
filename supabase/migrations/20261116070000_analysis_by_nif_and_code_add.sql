-- NIF-centred analysis: every aggregate is filtered when an economic operator is selected.
CREATE OR REPLACE FUNCTION public.sirex_apurement_analytics_by_nif(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_granularity text DEFAULT 'month',
  p_nif text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; normalized_nif text:=nullif(btrim(p_nif),'');
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise.'; END IF;
 IF p_granularity NOT IN ('week','month') THEN RAISE EXCEPTION 'La fréquence doit être hebdomadaire ou mensuelle.'; END IF;
 IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>p_to THEN RAISE EXCEPTION 'Période invalide.'; END IF;
 WITH scoped AS (
   SELECT r.*,b.province,b.period FROM public.sirex_sydonia_rows r
   JOIN public.sirex_monthly_apurements b ON b.id=r.apurement_id
   WHERE sirex_private.can_access(b.province,false)
   AND (p_from IS NULL OR b.period>=date_trunc('month',p_from)::date)
   AND (p_to IS NULL OR b.period<=date_trunc('month',p_to)::date)
   AND (normalized_nif IS NULL OR r.nif=normalized_nif)
 ), totals AS (
   SELECT count(*) rows,count(*) FILTER(WHERE match_status='conforme') conformes,count(*) FILTER(WHERE match_status<>'conforme') anomalies,
   count(*) FILTER(WHERE match_status='operateur_introuvable') operators_unknown,count(*) FILTER(WHERE match_status='arrete_introuvable') acts_unknown,
   count(*) FILTER(WHERE match_status='arrete_expire') acts_expired,count(*) FILTER(WHERE match_status='article_non_autorise') articles_outside,
   count(*) FILTER(WHERE match_status='quantite_depassee') quantities_exceeded,coalesce(sum(total_taxes) FILTER(WHERE match_status<>'conforme'),0) recovery_potential FROM scoped
 )
 SELECT jsonb_build_object(
   'nif',normalized_nif,
   'operator_name',(SELECT max(operator_name) FROM scoped),
   'kpis',jsonb_build_object('rows',rows,'conformes',conformes,'anomalies',anomalies,'taux_conformite',CASE WHEN rows=0 THEN 0 ELSE round(100.0*conformes/rows,2) END,'operators_unknown',operators_unknown,'acts_unknown',acts_unknown,'acts_expired',acts_expired,'articles_outside',articles_outside,'quantities_exceeded',quantities_exceeded,'recovery_potential',recovery_potential),
   'by_period',(SELECT coalesce(jsonb_agg(jsonb_build_object('period',period,'rows',rows,'conformes',conformes,'anomalies',anomalies,'recovery_potential',recovery) ORDER BY period),'[]'::jsonb) FROM (SELECT date_trunc(p_granularity,declaration_date)::date period,count(*) rows,count(*) FILTER(WHERE match_status='conforme') conformes,count(*) FILTER(WHERE match_status<>'conforme') anomalies,coalesce(sum(total_taxes) FILTER(WHERE match_status<>'conforme'),0) recovery FROM scoped GROUP BY date_trunc(p_granularity,declaration_date)::date) x),
   'codes_add',(SELECT coalesce(jsonb_agg(jsonb_build_object('act_reference',act_reference,'declarations',declarations,'lines',lines,'conformes',conformes,'anomalies',anomalies,'net_weight',net_weight,'recovery_potential',recovery) ORDER BY recovery DESC,lines DESC),'[]'::jsonb) FROM (SELECT act_reference,count(DISTINCT declaration_number) declarations,count(*) lines,count(*) FILTER(WHERE match_status='conforme') conformes,count(*) FILTER(WHERE match_status<>'conforme') anomalies,coalesce(sum(net_weight),0) net_weight,coalesce(sum(total_taxes) FILTER(WHERE match_status<>'conforme'),0) recovery FROM scoped GROUP BY act_reference) x),
   'goods',(SELECT coalesce(jsonb_agg(jsonb_build_object('hs_code',hs_code,'description',description,'lines',lines,'net_weight',net_weight,'anomalies',anomalies,'recovery_potential',recovery) ORDER BY recovery DESC,lines DESC),'[]'::jsonb) FROM (SELECT hs_code,max(description) description,count(*) lines,coalesce(sum(net_weight),0) net_weight,count(*) FILTER(WHERE match_status<>'conforme') anomalies,coalesce(sum(total_taxes) FILTER(WHERE match_status<>'conforme'),0) recovery FROM scoped GROUP BY hs_code) x),
   'by_bureau',(SELECT coalesce(jsonb_agg(jsonb_build_object('office_code',office_code,'office_name',office_name,'province',province,'rows',rows,'anomalies',anomalies,'recovery_potential',recovery) ORDER BY anomalies DESC),'[]'::jsonb) FROM (SELECT office_code,max(office_name) office_name,max(province) province,count(*) rows,count(*) FILTER(WHERE match_status<>'conforme') anomalies,coalesce(sum(total_taxes) FILTER(WHERE match_status<>'conforme'),0) recovery FROM scoped GROUP BY office_code) x),
   'by_operator',(SELECT coalesce(jsonb_agg(jsonb_build_object('nif',nif,'operator_name',operator_name,'rows',rows,'anomalies',anomalies,'recovery_potential',recovery) ORDER BY recovery DESC),'[]'::jsonb) FROM (SELECT nif,max(operator_name) operator_name,count(*) rows,count(*) FILTER(WHERE match_status<>'conforme') anomalies,coalesce(sum(total_taxes) FILTER(WHERE match_status<>'conforme'),0) recovery FROM scoped GROUP BY nif) x)
 ) INTO result FROM totals;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.sirex_apurement_analytics_by_nif(date,date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sirex_apurement_analytics_by_nif(date,date,text,text) TO authenticated;