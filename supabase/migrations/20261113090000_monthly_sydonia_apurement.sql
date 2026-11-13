-- Monthly SYDONIA apurement: raw import, automatic matching, and province-scoped review.
ALTER TABLE public.sirex_operators ADD COLUMN IF NOT EXISTS nif text;
CREATE UNIQUE INDEX IF NOT EXISTS sirex_operator_nif_unique ON public.sirex_operators(nif) WHERE nif IS NOT NULL AND btrim(nif)<>'';

CREATE TABLE public.sirex_customs_offices (
  code text PRIMARY KEY,
  label text NOT NULL,
  province text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(code))>0 AND length(btrim(label))>0)
);
ALTER TABLE public.sirex_customs_offices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sirex_customs_offices FROM anon;
GRANT SELECT ON public.sirex_customs_offices TO authenticated;
GRANT INSERT,UPDATE,DELETE ON public.sirex_customs_offices TO authenticated;
CREATE POLICY sirex_offices_read ON public.sirex_customs_offices FOR SELECT TO authenticated USING(sirex_private.can_access(province,false));
CREATE POLICY sirex_offices_write ON public.sirex_customs_offices FOR ALL TO authenticated USING(sirex_private.is_admin()) WITH CHECK(sirex_private.is_admin());

CREATE TABLE public.sirex_monthly_apurements (
  id uuid PRIMARY KEY,
  province text NOT NULL,
  period date NOT NULL CHECK(period=date_trunc('month',period)::date),
  source_name text NOT NULL CHECK(length(btrim(source_name)) BETWEEN 1 AND 240),
  source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
  payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'controle' CHECK(status IN ('brouillon','controle','valide','transmis_recouvrement')),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  validated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  validated_at timestamptz
);
CREATE INDEX sirex_monthly_apurements_scope_idx ON public.sirex_monthly_apurements(province,period DESC);
ALTER TABLE public.sirex_monthly_apurements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sirex_monthly_apurements FROM anon;
GRANT SELECT,INSERT,UPDATE ON public.sirex_monthly_apurements TO authenticated;
CREATE POLICY sirex_monthly_apurements_read ON public.sirex_monthly_apurements FOR SELECT TO authenticated USING(sirex_private.can_access(province,false));
CREATE POLICY sirex_monthly_apurements_insert ON public.sirex_monthly_apurements FOR INSERT TO authenticated WITH CHECK(created_by=auth.uid() AND sirex_private.can_access(province,true));
CREATE POLICY sirex_monthly_apurements_update ON public.sirex_monthly_apurements FOR UPDATE TO authenticated USING(sirex_private.can_access(province,true)) WITH CHECK(sirex_private.can_access(province,true));

CREATE TABLE public.sirex_sydonia_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apurement_id uuid NOT NULL REFERENCES public.sirex_monthly_apurements(id) ON DELETE RESTRICT,
  source_line integer NOT NULL CHECK(source_line>0),
  declaration_number text NOT NULL,
  declaration_date date NOT NULL,
  declaration_year integer NOT NULL CHECK(declaration_year BETWEEN 2000 AND 2100),
  office_code text NOT NULL REFERENCES public.sirex_customs_offices(code),
  office_name text NOT NULL,
  declarant_code text,
  declarant_name text,
  nif text NOT NULL,
  operator_name text NOT NULL,
  act_reference text NOT NULL,
  article_number text,
  hs_code text NOT NULL,
  description text NOT NULL,
  net_weight numeric(18,3) NOT NULL CHECK(net_weight>=0),
  cif_value numeric(18,2),
  currency text,
  exchange_rate numeric(18,6),
  total_taxes numeric(18,2),
  operator_id uuid REFERENCES public.sirex_operators(id) ON DELETE RESTRICT,
  act_id uuid REFERENCES public.sirex_acts(id) ON DELETE RESTRICT,
  act_item_id uuid REFERENCES public.sirex_act_items(id) ON DELETE RESTRICT,
  match_status text NOT NULL CHECK(match_status IN ('conforme','operateur_introuvable','arrete_introuvable','arrete_expire','article_non_autorise','unite_incompatible','quantite_depassee','a_controler')),
  match_detail text,
  source_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(apurement_id,source_line)
);
CREATE INDEX sirex_sydonia_rows_apurement_idx ON public.sirex_sydonia_rows(apurement_id,match_status);
CREATE INDEX sirex_sydonia_rows_act_item_idx ON public.sirex_sydonia_rows(act_item_id);
ALTER TABLE public.sirex_sydonia_rows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sirex_sydonia_rows FROM anon;
GRANT SELECT ON public.sirex_sydonia_rows TO authenticated;
CREATE POLICY sirex_sydonia_rows_read ON public.sirex_sydonia_rows FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.sirex_monthly_apurements b WHERE b.id=apurement_id AND sirex_private.can_access(b.province,false)));

CREATE OR REPLACE FUNCTION public.sirex_import_sydonia_month(p_batch_id uuid,p_period date,p_source_name text,p_source_sha256 text,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $
DECLARE office record; batch public.sirex_monthly_apurements; item jsonb; payload text; first_province text; row_count integer:=0; current_operator uuid; current_act uuid; current_item uuid; current_status text; current_detail text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise.'; END IF;
 IF p_batch_id IS NULL OR p_period IS NULL OR p_period<>date_trunc('month',p_period)::date OR p_source_sha256 !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Paramètres de période ou de fichier invalides.'; END IF;
 IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 20000 THEN RAISE EXCEPTION 'Le fichier doit contenir entre 1 et 20 000 lignes.'; END IF;
 SELECT co.province INTO first_province FROM jsonb_array_elements(p_rows) x JOIN public.sirex_customs_offices co ON co.code=btrim(x->>'office_code') AND co.active LIMIT 1;
 IF first_province IS NULL OR NOT sirex_private.can_access(first_province,true) THEN RAISE EXCEPTION 'Bureau inconnu ou hors de votre ressort provincial. Configurez d’abord le bureau douanier.'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) x LEFT JOIN public.sirex_customs_offices co ON co.code=btrim(x->>'office_code') AND co.active WHERE co.code IS NULL OR co.province<>first_province) THEN RAISE EXCEPTION 'Un même import doit contenir des bureaux connus d’une seule province.'; END IF;
 payload:=encode(sha256(convert_to(p_rows::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtext(p_batch_id::text));
 SELECT * INTO batch FROM public.sirex_monthly_apurements WHERE id=p_batch_id;
 IF FOUND THEN
   IF batch.created_by<>auth.uid() OR batch.payload_sha256<>payload OR batch.source_sha256<>p_source_sha256 THEN RAISE EXCEPTION 'Cet identifiant d’import correspond à un autre fichier.'; END IF;
   RETURN jsonb_build_object('batch_id',batch.id,'rows',(SELECT count(*) FROM public.sirex_sydonia_rows WHERE apurement_id=batch.id),'conforme',(SELECT count(*) FROM public.sirex_sydonia_rows WHERE apurement_id=batch.id AND match_status='conforme'),'anomalies',(SELECT count(*) FROM public.sirex_sydonia_rows WHERE apurement_id=batch.id AND match_status<>'conforme'),'already_imported',true);
 END IF;
 INSERT INTO public.sirex_monthly_apurements(id,province,period,source_name,source_sha256,payload_sha256,created_by) VALUES(p_batch_id,first_province,p_period,btrim(p_source_name),p_source_sha256,payload,auth.uid());
 FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
   row_count:=row_count+1; current_operator:=NULL; current_act:=NULL; current_item:=NULL; current_status:='a_controler'; current_detail:=NULL;
   SELECT id INTO current_operator FROM public.sirex_operators WHERE nif=btrim(item->>'nif') AND status='actif';
   IF current_operator IS NULL THEN current_status:='operateur_introuvable'; current_detail:='NIF absent du registre SIREX.'; ELSE
     SELECT id INTO current_act FROM public.sirex_acts WHERE operator_id=current_operator AND reference=btrim(item->>'act_reference') ORDER BY created_at DESC LIMIT 1;
     IF current_act IS NULL THEN current_status:='arrete_introuvable'; current_detail:='Code ADD non trouvé pour cet opérateur.'; ELSE
       IF NOT EXISTS(SELECT 1 FROM public.sirex_acts WHERE id=current_act AND status='valide' AND (item->>'declaration_date')::date BETWEEN start_date AND end_date) THEN current_status:='arrete_expire'; current_detail:='Arrêté non valide à la date d’enregistrement.'; ELSE
         SELECT id INTO current_item FROM public.sirex_act_items WHERE act_id=current_act AND hs_code=regexp_replace(coalesce(item->>'hs_code',''),'[.[:space:]]','','g') ORDER BY created_at LIMIT 1;
         IF current_item IS NULL THEN current_status:='article_non_autorise'; current_detail:='Code marchandise absent de la liste exonérée.'; ELSE current_status:='conforme'; END IF;
       END IF;
     END IF;
   END IF;
   INSERT INTO public.sirex_sydonia_rows(apurement_id,source_line,declaration_number,declaration_date,declaration_year,office_code,office_name,declarant_code,declarant_name,nif,operator_name,act_reference,article_number,hs_code,description,net_weight,cif_value,currency,exchange_rate,total_taxes,operator_id,act_id,act_item_id,match_status,match_detail,source_key)
   VALUES(p_batch_id,(item->>'source_line')::integer,btrim(item->>'declaration_number'),(item->>'declaration_date')::date,(item->>'declaration_year')::integer,btrim(item->>'office_code'),btrim(item->>'office_name'),nullif(btrim(item->>'declarant_code'),''),nullif(btrim(item->>'declarant_name'),''),btrim(item->>'nif'),btrim(item->>'operator_name'),btrim(item->>'act_reference'),nullif(btrim(item->>'article_number'),''),regexp_replace(coalesce(item->>'hs_code',''),'[.[:space:]]','','g'),btrim(item->>'description'),(item->>'net_weight')::numeric,nullif(item->>'cif_value','')::numeric,nullif(item->>'currency',''),nullif(item->>'exchange_rate','')::numeric,nullif(item->>'total_taxes','')::numeric,current_operator,current_act,current_item,current_status,current_detail,encode(sha256(convert_to(concat_ws('|',btrim(item->>'declaration_number'),btrim(item->>'article_number'),btrim(item->>'nif'),btrim(item->>'act_reference')),'UTF8')),'hex'));
 END LOOP;
 UPDATE public.sirex_sydonia_rows r SET match_status='quantite_depassee',match_detail='P_NET cumulé supérieur à la quantité autorisée.' FROM public.sirex_act_items ai WHERE r.apurement_id=p_batch_id AND r.act_item_id=ai.id AND r.match_status='conforme' AND (SELECT sum(net_weight) FROM public.sirex_sydonia_rows s WHERE s.act_item_id=ai.id AND s.match_status IN ('conforme','quantite_depassee'))>ai.quantity;
 RETURN jsonb_build_object('batch_id',p_batch_id,'rows',row_count,'conforme',(SELECT count(*) FROM public.sirex_sydonia_rows WHERE apurement_id=p_batch_id AND match_status='conforme'),'anomalies',(SELECT count(*) FROM public.sirex_sydonia_rows WHERE apurement_id=p_batch_id AND match_status<>'conforme'));
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Une déclaration/article a déjà été importé : aucun doublon n’est compté.';
END $$;
REVOKE ALL ON FUNCTION public.sirex_import_sydonia_month(uuid,date,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sirex_import_sydonia_month(uuid,date,text,text,jsonb) TO authenticated;