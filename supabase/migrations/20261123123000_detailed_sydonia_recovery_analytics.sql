-- Detailed SYDONIA control and recovery-analysis dataset.
CREATE OR REPLACE FUNCTION public.sirex_apurement_detailed_analytics(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_granularity text DEFAULT 'month',
  p_nif text DEFAULT NULL,
  p_limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
  normalized_nif text := nullif(btrim(p_nif), '');
  candidate_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise.'; END IF;
  IF p_granularity NOT IN ('week','month') THEN RAISE EXCEPTION 'La fréquence doit être hebdomadaire ou mensuelle.'; END IF;
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN RAISE EXCEPTION 'Période invalide.'; END IF;

  WITH scoped AS (
    SELECT r.*, b.province, b.period AS import_period
    FROM public.sirex_sydonia_rows r
    JOIN public.sirex_monthly_apurements b ON b.id = r.apurement_id
    WHERE sirex_private.can_access(b.province, false)
      AND (p_from IS NULL OR r.declaration_date >= p_from)
      AND (p_to IS NULL OR r.declaration_date < (date_trunc('month', p_to)::date + interval '1 month')::date)
      AND (normalized_nif IS NULL OR r.nif = normalized_nif)
  ), totals AS (
    SELECT
      count(*) AS rows,
      count(DISTINCT declaration_number) AS declarations,
      count(DISTINCT nif) AS operators,
      count(*) FILTER (WHERE match_status = 'conforme') AS conformes,
      count(*) FILTER (WHERE match_status <> 'conforme') AS anomalies,
      coalesce(sum(total_taxes) FILTER (WHERE match_status <> 'conforme'), 0) AS amount_to_verify,
      coalesce(sum(cif_value), 0) AS cif_total,
      coalesce(sum(net_weight), 0) AS net_weight_total
    FROM scoped
  )
  SELECT jsonb_build_object(
    'nif', normalized_nif,
    'operator_name', (SELECT max(operator_name) FROM scoped),
    'kpis', jsonb_build_object(
      'rows', rows, 'declarations', declarations, 'operators', operators,
      'conformes', conformes, 'anomalies', anomalies,
      'taux_conformite', CASE WHEN rows = 0 THEN 0 ELSE round(100.0 * conformes / rows, 2) END,
      'amount_to_verify', amount_to_verify, 'cif_total', cif_total, 'net_weight_total', net_weight_total
    ),
    'by_status', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'status', match_status, 'lines', lines, 'declarations', declarations,
        'amount_to_verify', amount_to_verify
      ) ORDER BY amount_to_verify DESC, lines DESC), '[]'::jsonb)
      FROM (
        SELECT match_status, count(*) AS lines, count(DISTINCT declaration_number) AS declarations,
               coalesce(sum(total_taxes),0) AS amount_to_verify
        FROM scoped GROUP BY match_status
      ) x
    ),
    'by_period', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'period', period, 'lines', lines, 'declarations', declarations,
        'conformes', conformes, 'anomalies', anomalies, 'amount_to_verify', amount_to_verify
      ) ORDER BY period), '[]'::jsonb)
      FROM (
        SELECT date_trunc(p_granularity, declaration_date)::date AS period,
               count(*) AS lines, count(DISTINCT declaration_number) AS declarations,
               count(*) FILTER (WHERE match_status='conforme') AS conformes,
               count(*) FILTER (WHERE match_status<>'conforme') AS anomalies,
               coalesce(sum(total_taxes) FILTER (WHERE match_status<>'conforme'),0) AS amount_to_verify
        FROM scoped GROUP BY date_trunc(p_granularity, declaration_date)::date
      ) x
    ),
    'by_code_add', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'code_add', act_reference, 'lines', lines, 'declarations', declarations,
        'operators', operators, 'anomalies', anomalies, 'net_weight', net_weight,
        'amount_to_verify', amount_to_verify
      ) ORDER BY amount_to_verify DESC, anomalies DESC), '[]'::jsonb)
      FROM (
        SELECT act_reference, count(*) AS lines, count(DISTINCT declaration_number) AS declarations,
               count(DISTINCT nif) AS operators, count(*) FILTER (WHERE match_status<>'conforme') AS anomalies,
               coalesce(sum(net_weight),0) AS net_weight,
               coalesce(sum(total_taxes) FILTER (WHERE match_status<>'conforme'),0) AS amount_to_verify
        FROM scoped GROUP BY act_reference
      ) x
    ),
    'by_bureau', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'office_code', office_code, 'office_name', office_name, 'province', province,
        'lines', lines, 'declarations', declarations, 'anomalies', anomalies,
        'amount_to_verify', amount_to_verify
      ) ORDER BY amount_to_verify DESC, anomalies DESC), '[]'::jsonb)
      FROM (
        SELECT office_code, max(office_name) AS office_name, max(province) AS province,
               count(*) AS lines, count(DISTINCT declaration_number) AS declarations,
               count(*) FILTER (WHERE match_status<>'conforme') AS anomalies,
               coalesce(sum(total_taxes) FILTER (WHERE match_status<>'conforme'),0) AS amount_to_verify
        FROM scoped GROUP BY office_code
      ) x
    ),
    'by_declarant', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'declarant_code', declarant_code, 'declarant_name', declarant_name,
        'lines', lines, 'declarations', declarations, 'anomalies', anomalies,
        'amount_to_verify', amount_to_verify
      ) ORDER BY amount_to_verify DESC, anomalies DESC), '[]'::jsonb)
      FROM (
        SELECT coalesce(declarant_code,'Non renseigné') AS declarant_code,
               max(coalesce(declarant_name,'Non renseigné')) AS declarant_name,
               count(*) AS lines, count(DISTINCT declaration_number) AS declarations,
               count(*) FILTER (WHERE match_status<>'conforme') AS anomalies,
               coalesce(sum(total_taxes) FILTER (WHERE match_status<>'conforme'),0) AS amount_to_verify
        FROM scoped GROUP BY coalesce(declarant_code,'Non renseigné')
      ) x
    ),
    'by_operator', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'nif', nif, 'operator_name', operator_name, 'lines', lines,
        'declarations', declarations, 'codes_add', codes_add, 'anomalies', anomalies,
        'amount_to_verify', amount_to_verify
      ) ORDER BY amount_to_verify DESC, anomalies DESC), '[]'::jsonb)
      FROM (
        SELECT nif, max(operator_name) AS operator_name, count(*) AS lines,
               count(DISTINCT declaration_number) AS declarations,
               count(DISTINCT act_reference) AS codes_add,
               count(*) FILTER (WHERE match_status<>'conforme') AS anomalies,
               coalesce(sum(total_taxes) FILTER (WHERE match_status<>'conforme'),0) AS amount_to_verify
        FROM scoped GROUP BY nif
      ) x
    ),
    'goods', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'hs_code', hs_code, 'description', description, 'lines', lines,
        'net_weight', net_weight, 'anomalies', anomalies, 'amount_to_verify', amount_to_verify
      ) ORDER BY amount_to_verify DESC, anomalies DESC), '[]'::jsonb)
      FROM (
        SELECT hs_code, max(description) AS description, count(*) AS lines,
               coalesce(sum(net_weight),0) AS net_weight,
               count(*) FILTER (WHERE match_status<>'conforme') AS anomalies,
               coalesce(sum(total_taxes) FILTER (WHERE match_status<>'conforme'),0) AS amount_to_verify
        FROM scoped GROUP BY hs_code
      ) x
    ),
    'data_quality', jsonb_build_object(
      'missing_nif', (SELECT count(*) FROM scoped WHERE nif LIKE 'SANS-NIF-LIGNE-%'),
      'missing_code_add', (SELECT count(*) FROM scoped WHERE nullif(btrim(act_reference),'') IS NULL),
      'duplicate_declaration_articles', (
        SELECT coalesce(sum(lines - 1),0) FROM (
          SELECT count(*) AS lines FROM scoped
          GROUP BY declaration_number, coalesce(article_number,''), nif, act_reference
          HAVING count(*) > 1
        ) duplicates
      )
    ),
    'candidates', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'declaration_number', declaration_number, 'declaration_date', declaration_date,
        'office_code', office_code, 'office_name', office_name, 'nif', nif,
        'operator_name', operator_name, 'code_add', act_reference, 'hs_code', hs_code,
        'description', description, 'net_weight', net_weight, 'cif_value', cif_value,
        'currency', currency, 'total_taxes', total_taxes, 'status', match_status,
        'detail', match_detail
      ) ORDER BY coalesce(total_taxes,0) DESC, declaration_date DESC), '[]'::jsonb)
      FROM (
        SELECT * FROM scoped
        WHERE match_status <> 'conforme'
        ORDER BY coalesce(total_taxes,0) DESC, declaration_date DESC
        LIMIT candidate_limit
      ) x
    )
  ) INTO result
  FROM totals;

  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.sirex_apurement_detailed_analytics(date,date,text,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sirex_apurement_detailed_analytics(date,date,text,text,integer) TO authenticated;