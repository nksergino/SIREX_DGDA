-- Operational analytics and recovery workbench for monthly SYDONIA apurement.
CREATE OR REPLACE FUNCTION public.sirex_apurement_analytics(p_from date DEFAULT NULL,p_to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise.'; END IF;
 IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>p_to THEN RAISE EXCEPTION 'Période invalide.'; END IF;
 WITH scoped AS (
   SELECT r.*,b.province,b.period FROM public.sirex_sydonia_rows r JOIN public.sirex_monthly_apurements b ON b.id=r.apurement_id
   WHERE sirex_private.can_access(b.province,false)
   AND (p_from IS NULL OR b.period>=date_trunc('month',p_from)::date)
   AND (p_to IS NULL OR b.period<=date_trunc('month',p_to)::date)
 ), totals AS (
   SELECT count(*) rows,count(*) FILTER(WHERE match_status='conforme') conformes,count(*) FILTER(WHERE match_status<>'conforme') anomalies,
   count(*) FILTER(WHERE match_status='operateur_introuvable') operators_unknown,count(*) FILTER(WHERE match_status='arrete_introuvable') acts_unknown,
   count(*) FILTER(WHERE match_status='arrete_expire') acts_expired,count(*) FILTER(WHERE match_status='article_non_autorise') articles_outside,
   count(*) FILTER(WHERE match_status='quantite_depassee') quantities_exceeded,coalesce(sum(total_taxes) FILTER(WHERE match_status<>'conforme'),0) recovery_potential FROM scoped
 )
 SELECT jsonb_build_object(
   'kpis',jsonb_build_object('rows',rows,'conformes',conformes,'anomalies',anomalies,'taux_conformite',CASE WHEN rows=0 THEN 0 ELSE round(100.0*conformes/rows,2) END,'operators_unknown',operators_unknown,'acts_unknown',acts_unknown,'acts_expired',acts_expired,'articles_outside',articles_outside,'quantities_exceeded',quantities_exceeded,'recovery_potential',recovery_potential),
   'by_status',(SELECT coalesce(jsonb_agg(jsonb_build_object('status',match_status,'count',count) ORDER BY count DESC),'[]'::jsonb) FROM (SELECT match_status,count(*) FROM scoped GROUP BY match_status) x),
   'by_province',(SELECT coalesce(jsonb_agg(jsonb_build_object('province',province,'rows',rows,'anomalies',anomalies,'recovery_potential',recovery) ORDER BY anomalies DESC),'[]'::jsonb) FROM (SELECT province,count(*) rows,count(*) FILTER(WHERE match_status<>'conforme') anomalies,coalesce(sum(total_taxes) FILTER(WHERE match_status<>'conforme'),0) recovery FROM scoped GROUP BY province) x),
   'by_bureau',(SELECT coalesce(jsonb_agg(jsonb_build_object('office_code',office_code,'office_name',office_name,'province',province,'rows',rows,'anomalies',anomalies,'recovery_potential',recovery) ORDER BY anomalies DESC),'[]'::jsonb) FROM (SELECT office_code,max(office_name) office_name,max(province) province,count(*) rows,count(*) FILTER(WHERE match_status<>'conforme') anomalies,coalesce(sum(total_taxes) FILTER(WHERE match_status<>'conforme'),0) recovery FROM scoped GROUP BY office_code) x),
   'by_operator',(SELECT coalesce(jsonb_agg(jsonb_build_object('nif',nif,'operator_name',operator_name,'rows',rows,'anomalies',anomalies,'recovery_potential',recovery) ORDER BY recovery DESC),'[]'::jsonb) FROM (SELECT nif,max(operator_name) operator_name,count(*) rows,count(*) FILTER(WHERE match_status<>'conforme') anomalies,coalesce(sum(total_taxes) FILTER(WHERE match_status<>'conforme'),0) recovery FROM scoped GROUP BY nif) x),
   'by_month',(SELECT coalesce(jsonb_agg(jsonb_build_object('period',period,'rows',rows,'conformes',conformes,'anomalies',anomalies,'recovery_potential',recovery) ORDER BY period),'[]'::jsonb) FROM (SELECT period,count(*) rows,count(*) FILTER(WHERE match_status='conforme') conformes,count(*) FILTER(WHERE match_status<>'conforme') anomalies,coalesce(sum(total_taxes) FILTER(WHERE match_status<>'conforme'),0) recovery FROM scoped GROUP BY period) x)
 ) INTO result FROM totals;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.sirex_apurement_analytics(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sirex_apurement_analytics(date,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.sirex_recouvrement_candidates(p_limit integer DEFAULT 500)
RETURNS TABLE(id uuid,province text,period date,declaration_number text,declaration_date date,office_code text,office_name text,nif text,operator_name text,act_reference text,hs_code text,description text,net_weight numeric,cif_value numeric,currency text,total_taxes numeric,match_status text,match_detail text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT r.id,b.province,b.period,r.declaration_number,r.declaration_date,r.office_code,r.office_name,r.nif,r.operator_name,r.act_reference,r.hs_code,r.description,r.net_weight,r.cif_value,r.currency,r.total_taxes,r.match_status,r.match_detail
 FROM public.sirex_sydonia_rows r JOIN public.sirex_monthly_apurements b ON b.id=r.apurement_id
 WHERE sirex_private.can_access(b.province,false) AND r.match_status<>'conforme'
 ORDER BY coalesce(r.total_taxes,0) DESC,r.declaration_date DESC LIMIT greatest(1,least(coalesce(p_limit,500),2000));
$$;
REVOKE ALL ON FUNCTION public.sirex_recouvrement_candidates(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sirex_recouvrement_candidates(integer) TO authenticated;