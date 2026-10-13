-- Explicit DGDA habilitations. No existing Auth user is automatically promoted.
CREATE SCHEMA IF NOT EXISTS sirex_private;
REVOKE ALL ON SCHEMA sirex_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA sirex_private TO authenticated;
CREATE TABLE public.sirex_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (length(btrim(full_name)) > 0),
  matricule text UNIQUE,
  role text NOT NULL CHECK (role IN ('super_admin','admin','agent','lecteur')),
  province text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (role IN ('super_admin','admin') OR province IS NOT NULL)
);
ALTER TABLE public.sirex_members ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION sirex_private.can_access(p_province text, p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
   SELECT 1 FROM public.sirex_members m WHERE m.user_id=auth.uid() AND m.active
   AND (NOT p_write OR m.role <> 'lecteur')
   AND (m.role IN ('super_admin','admin') OR m.province=p_province)
 );
$$;
CREATE FUNCTION sirex_private.is_admin(p_super boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.sirex_members
 WHERE user_id=auth.uid() AND active AND (role='super_admin' OR (NOT p_super AND role='admin')));
$$;
REVOKE ALL ON FUNCTION sirex_private.can_access(text,boolean), sirex_private.is_admin(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sirex_private.can_access(text,boolean), sirex_private.is_admin(boolean) TO authenticated;
CREATE POLICY sirex_members_read ON public.sirex_members FOR SELECT TO authenticated
 USING (user_id=auth.uid() OR sirex_private.is_admin());
CREATE POLICY sirex_members_insert ON public.sirex_members FOR INSERT TO authenticated
 WITH CHECK (sirex_private.is_admin() AND (role<>'super_admin' OR sirex_private.is_admin(true)));
CREATE POLICY sirex_members_update ON public.sirex_members FOR UPDATE TO authenticated
 USING (sirex_private.is_admin() AND (role<>'super_admin' OR sirex_private.is_admin(true)))
 WITH CHECK (sirex_private.is_admin() AND (role<>'super_admin' OR sirex_private.is_admin(true)));
-- No client DELETE: suspending an account preserves audit references.
CREATE FUNCTION sirex_private.protect_last_admin() RETURNS trigger LANGUAGE plpgsql
 SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(681309);
 IF OLD.active AND OLD.role='super_admin' AND (TG_OP='DELETE' OR NOT NEW.active OR NEW.role<>'super_admin')
 AND NOT EXISTS(SELECT 1 FROM public.sirex_members WHERE active AND role='super_admin' AND user_id<>OLD.user_id)
 THEN RAISE EXCEPTION 'Le dernier super-administrateur actif ne peut pas être retiré.'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
CREATE TRIGGER protect_last_admin BEFORE UPDATE OR DELETE ON public.sirex_members
 FOR EACH ROW EXECUTE FUNCTION sirex_private.protect_last_admin();

-- Preserve existing data; correct only the historical default currency used for USD item totals.
ALTER TABLE public.sirex_acts ALTER COLUMN currency SET DEFAULT 'USD';
UPDATE public.sirex_acts a SET currency='USD' WHERE currency='XOF'
 AND EXISTS(SELECT 1 FROM public.sirex_act_items i WHERE i.act_id=a.id)
 AND NOT EXISTS(SELECT 1 FROM public.sirex_act_items i WHERE i.act_id=a.id AND i.currency<>'USD')
 AND a.authorized_value=(SELECT sum(i.cif_value) FROM public.sirex_act_items i WHERE i.act_id=a.id);
-- Previous validations had no article controls. Retain records and send them for reassessment.
WITH revised AS (
 UPDATE public.sirex_declarations SET status='a_regulariser' WHERE status='validee'
 RETURNING id,operator_id
)
INSERT INTO public.sirex_audit_logs(action,entity_type,entity_id,details)
SELECT 'REASSESS_LEGACY_VALIDATION','sirex_declarations',r.id,
 jsonb_build_object('province',o.province,'previous_status','validee','status','a_regulariser','reason','Articles absents : validation à refaire après contrôle')
FROM revised r JOIN public.sirex_operators o ON o.id=r.operator_id;
UPDATE public.sirex_acts SET consumed_value=0;

-- NOT VALID keeps anomalous legacy rows available for manual correction, but checks new writes.
ALTER TABLE public.sirex_acts ADD CONSTRAINT sirex_act_dates CHECK(end_date>=start_date) NOT VALID;
ALTER TABLE public.sirex_acts ADD CONSTRAINT sirex_act_amounts CHECK(authorized_value>=0 AND consumed_value>=0) NOT VALID;
ALTER TABLE public.sirex_act_items ADD CONSTRAINT sirex_act_item_amounts CHECK(quantity>0 AND cif_value>=0 AND length(btrim(description))>0) NOT VALID;
ALTER TABLE public.sirex_declarations ADD CONSTRAINT sirex_decl_amount CHECK(declared_value>=0) NOT VALID;
ALTER TABLE public.sirex_act_items ADD COLUMN hs_code text;
CREATE TABLE public.sirex_declaration_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 declaration_id uuid NOT NULL REFERENCES public.sirex_declarations(id) ON DELETE CASCADE,
 description text NOT NULL CHECK(length(btrim(description))>0),
 hs_code text,
 quantity numeric(18,3) NOT NULL CHECK(quantity>0),
 unit text NOT NULL,
 cif_value numeric(18,2) NOT NULL CHECK(cif_value>=0),
 currency text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.sirex_declaration_items(declaration_id);
CREATE INDEX IF NOT EXISTS sirex_declarations_act_id_idx ON public.sirex_declarations(act_id);
ALTER TABLE public.sirex_declaration_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sirex_alerts ADD COLUMN declaration_id uuid REFERENCES public.sirex_declarations(id) ON DELETE CASCADE;
ALTER TABLE public.sirex_alerts ADD COLUMN code text;
CREATE UNIQUE INDEX sirex_alert_per_declaration ON public.sirex_alerts(declaration_id,code);
CREATE FUNCTION sirex_private.normalized(p_text text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT lower(regexp_replace(btrim(coalesce(p_text,'')), '\s+', ' ', 'g'));
$$;
-- Eliminate every inherited permissive policy on SIREX tables only.
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT schemaname,tablename,policyname FROM pg_policies WHERE schemaname='public'
 AND tablename IN ('sirex_operators','sirex_acts','sirex_declarations','sirex_act_items','sirex_act_documents','sirex_alerts','sirex_audit_logs')
 LOOP EXECUTE format('DROP POLICY %I ON %I.%I',p.policyname,p.schemaname,p.tablename); END LOOP;
END $$;
DO $$ DECLARE t text; pred text; BEGIN
 FOREACH t IN ARRAY ARRAY['sirex_operators','sirex_acts','sirex_declarations','sirex_act_items','sirex_act_documents','sirex_declaration_items','sirex_alerts'] LOOP
 pred := CASE
 WHEN t IN ('sirex_operators','sirex_acts','sirex_alerts') THEN 'sirex_private.can_access(province, %s)'
 WHEN t='sirex_declarations' THEN 'EXISTS(SELECT 1 FROM public.sirex_operators o WHERE o.id=operator_id AND sirex_private.can_access(o.province, %s))'
 WHEN t IN ('sirex_act_items','sirex_act_documents') THEN 'EXISTS(SELECT 1 FROM public.sirex_acts a WHERE a.id=act_id AND sirex_private.can_access(a.province, %s))'
 ELSE 'EXISTS(SELECT 1 FROM public.sirex_declarations d JOIN public.sirex_operators o ON o.id=d.operator_id WHERE d.id=declaration_id AND sirex_private.can_access(o.province, %s))' END;
 EXECUTE format('CREATE POLICY sirex_read ON public.%I FOR SELECT TO authenticated USING (%s)',t,format(pred,'false'));
 EXECUTE format('CREATE POLICY sirex_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',t,format(pred,'true'));
 EXECUTE format('CREATE POLICY sirex_update ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',t,format(pred,'true'),format(pred,'true'));
 EXECUTE format('CREATE POLICY sirex_delete ON public.%I FOR DELETE TO authenticated USING (%s)',t,format(pred,'true'));
 EXECUTE format('REVOKE ALL ON public.%I FROM anon',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON public.sirex_members TO authenticated;
REVOKE ALL ON public.sirex_members FROM anon;
REVOKE INSERT,UPDATE,DELETE ON public.sirex_audit_logs FROM authenticated,anon;
GRANT SELECT ON public.sirex_audit_logs TO authenticated;
CREATE POLICY sirex_audit_read ON public.sirex_audit_logs FOR SELECT TO authenticated
 USING(sirex_private.can_access(details->>'province',false));
-- Documents must belong to an existing accessible act and match their act path.
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
 AND policyname LIKE '%SIREX act files%'
 LOOP EXECUTE format('DROP POLICY %I ON storage.objects',p.policyname); END LOOP;
END $$;
CREATE FUNCTION sirex_private.file_access(p_bucket text,p_name text,p_write boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT p_bucket='sirex-documents' AND split_part(p_name,'/',1)='acts'
 AND EXISTS(SELECT 1 FROM public.sirex_acts a WHERE a.id::text=split_part(p_name,'/',2)
 AND sirex_private.can_access(a.province,p_write));
$$;
REVOKE ALL ON FUNCTION sirex_private.file_access(text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION sirex_private.file_access(text,text,boolean) TO authenticated;
CREATE POLICY sirex_file_read ON storage.objects FOR SELECT TO authenticated USING(sirex_private.file_access(bucket_id,name,false));
CREATE POLICY sirex_file_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(sirex_private.file_access(bucket_id,name,true) AND lower(metadata->>'mimetype')='application/pdf');
CREATE POLICY sirex_file_update ON storage.objects FOR UPDATE TO authenticated USING(sirex_private.file_access(bucket_id,name,true)) WITH CHECK(sirex_private.file_access(bucket_id,name,true) AND lower(metadata->>'mimetype')='application/pdf');
CREATE POLICY sirex_file_delete ON storage.objects FOR DELETE TO authenticated USING(sirex_private.file_access(bucket_id,name,true));
-- A restrictive gate also defeats a generic permissive policy for another bucket/application.
CREATE POLICY sirex_bucket_anon_boundary ON storage.objects AS RESTRICTIVE FOR ALL TO anon
 USING(bucket_id<>'sirex-documents') WITH CHECK(bucket_id<>'sirex-documents');
CREATE POLICY sirex_bucket_read_boundary ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
 USING(bucket_id<>'sirex-documents' OR sirex_private.file_access(bucket_id,name,false));
CREATE POLICY sirex_bucket_insert_boundary ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(bucket_id<>'sirex-documents' OR (sirex_private.file_access(bucket_id,name,true) AND lower(metadata->>'mimetype')='application/pdf'));
CREATE POLICY sirex_bucket_update_boundary ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(bucket_id<>'sirex-documents' OR sirex_private.file_access(bucket_id,name,true))
 WITH CHECK(bucket_id<>'sirex-documents' OR (sirex_private.file_access(bucket_id,name,true) AND lower(metadata->>'mimetype')='application/pdf'));
CREATE POLICY sirex_bucket_delete_boundary ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
 USING(bucket_id<>'sirex-documents' OR sirex_private.file_access(bucket_id,name,true));

-- Exact description/unit matching: no fuzzy OCR match silently grants exemption.
CREATE FUNCTION public.sirex_check_declaration(p_declaration_id uuid)
RETURNS TABLE(code text, detail text) LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.sirex_declarations; a public.sirex_acts; i record; authorized public.sirex_act_items;
 matches integer; used_qty numeric; used_cif numeric; total numeric; consumed numeric;
BEGIN
 SELECT * INTO d FROM public.sirex_declarations WHERE id=p_declaration_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Déclaration introuvable ou accès non autorisé.'; END IF;
 IF d.act_id IS NULL THEN RETURN QUERY SELECT 'sans_arrete','Aucun arrêté rattaché.'; RETURN; END IF;
 SELECT * INTO a FROM public.sirex_acts WHERE id=d.act_id;
 IF NOT FOUND THEN RETURN QUERY SELECT 'arrete_inaccessible','Arrêté inaccessible.'; RETURN; END IF;
 IF a.operator_id<>d.operator_id THEN RETURN QUERY SELECT 'beneficiaire','Le bénéficiaire de l’arrêté diffère de celui de la déclaration.'; END IF;
 IF a.status<>'valide' OR d.declared_date<a.start_date OR d.declared_date>a.end_date THEN
 RETURN QUERY SELECT 'validite','L’arrêté n’est pas valide à la date de déclaration.'; END IF;
 IF d.currency IS DISTINCT FROM a.currency THEN RETURN QUERY SELECT 'devise','La devise de la déclaration diffère de celle de l’arrêté. Une conversion documentée est nécessaire.'; END IF;
 SELECT coalesce(sum(cif_value),0) INTO total FROM public.sirex_declaration_items WHERE declaration_id=d.id;
 IF NOT EXISTS(SELECT 1 FROM public.sirex_declaration_items WHERE declaration_id=d.id) THEN
 RETURN QUERY SELECT 'articles_absents','Les articles de la déclaration doivent être enregistrés avant validation.'; RETURN; END IF;
 IF total<>d.declared_value THEN RETURN QUERY SELECT 'total_articles','La somme des valeurs CIF des articles diffère du montant déclaré.'; END IF;
 IF EXISTS(SELECT 1 FROM public.sirex_declaration_items WHERE declaration_id=d.id AND currency IS DISTINCT FROM d.currency) THEN
 RETURN QUERY SELECT 'devise_articles','Tous les articles doivent utiliser la devise de la déclaration.'; END IF;
 FOR i IN SELECT sirex_private.normalized(description) AS normalized, min(description) AS label,
 unit,currency,min(hs_code) AS hs_code,count(DISTINCT coalesce(hs_code,'')) AS hs_count,sum(quantity) AS qty,sum(cif_value) AS cif
 FROM public.sirex_declaration_items WHERE declaration_id=d.id
 GROUP BY sirex_private.normalized(description),unit,currency LOOP
 SELECT count(*) INTO matches FROM public.sirex_act_items ai WHERE ai.act_id=a.id AND sirex_private.normalized(ai.description)=i.normalized AND ai.unit=i.unit;
 IF matches=0 THEN RETURN QUERY SELECT 'bien_non_autorise',format('Bien non autorisé ou unité différente : %s (%s).',i.label,i.unit); CONTINUE; END IF;
 IF matches>1 THEN RETURN QUERY SELECT 'bien_ambigu',format('Plusieurs lignes de l’arrêté correspondent à %s. Clarifiez la liste autorisée.',i.label); CONTINUE; END IF;
 SELECT * INTO authorized FROM public.sirex_act_items ai WHERE ai.act_id=a.id AND sirex_private.normalized(ai.description)=i.normalized AND ai.unit=i.unit;
 IF authorized.currency IS DISTINCT FROM i.currency THEN RETURN QUERY SELECT 'devise_bien',format('Devise incompatible pour %s.',i.label); END IF;
 IF authorized.hs_code IS NOT NULL AND (i.hs_count<>1 OR i.hs_code IS DISTINCT FROM authorized.hs_code) THEN
 RETURN QUERY SELECT 'code_sh',format('Code SH différent ou manquant pour %s.',i.label); END IF;
 SELECT coalesce(sum(di.quantity),0),coalesce(sum(di.cif_value),0) INTO used_qty,used_cif
 FROM public.sirex_declaration_items di JOIN public.sirex_declarations dd ON dd.id=di.declaration_id
 WHERE dd.act_id=a.id AND dd.status='validee' AND dd.id<>d.id AND sirex_private.normalized(di.description)=i.normalized AND di.unit=i.unit;
 IF used_qty+i.qty>authorized.quantity THEN RETURN QUERY SELECT 'quantite_depassee',format('Quantité autorisée dépassée pour %s : %s disponibles, %s déclarés.',i.label,authorized.quantity-used_qty,i.qty); END IF;
 IF used_cif+i.cif>authorized.cif_value THEN RETURN QUERY SELECT 'valeur_bien_depassee',format('Valeur CIF autorisée dépassée pour %s.',i.label); END IF;
 END LOOP;
 SELECT coalesce(sum(declared_value),0) INTO consumed FROM public.sirex_declarations WHERE act_id=a.id AND status='validee' AND id<>d.id;
 IF consumed+d.declared_value>a.authorized_value THEN RETURN QUERY SELECT 'plafond_depasse','Le plafond global de l’arrêté serait dépassé.'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.sirex_check_declaration(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sirex_check_declaration(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION sirex_private.normalized(text) TO authenticated;
REVOKE ALL ON FUNCTION sirex_private.normalized(text) FROM PUBLIC,anon;

-- Shared database enforcement, including direct REST updates. Lock the act to serialize validations.
CREATE FUNCTION sirex_private.guard_declaration() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.sirex_acts; issues text; o public.sirex_operators;
BEGIN
 IF TG_OP='DELETE' THEN
   IF OLD.status='validee' THEN RAISE EXCEPTION 'Annulez la validation avant de supprimer la déclaration.'; END IF;
   PERFORM 1 FROM public.sirex_acts WHERE id=OLD.act_id FOR UPDATE; RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
   PERFORM 1 FROM public.sirex_acts WHERE id IN (OLD.act_id,NEW.act_id) ORDER BY id FOR UPDATE;
   IF OLD.status='validee' AND ((to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status')) THEN RAISE EXCEPTION 'Annulez la validation avant de modifier la déclaration.'; END IF;
 END IF;
 SELECT * INTO o FROM public.sirex_operators WHERE id=NEW.operator_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Opérateur inaccessible.'; END IF;
 IF NEW.act_id IS NOT NULL THEN
   SELECT * INTO a FROM public.sirex_acts WHERE id=NEW.act_id FOR UPDATE;
   IF NOT FOUND OR a.operator_id<>NEW.operator_id OR a.province<>o.province THEN RAISE EXCEPTION 'L’arrêté doit appartenir au même bénéficiaire et à la même province.'; END IF;
 END IF;
 IF NEW.status='validee' THEN
   IF TG_OP='INSERT' THEN RAISE EXCEPTION 'Enregistrez les articles et contrôlez la déclaration avant validation.'; END IF;
   IF (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN RAISE EXCEPTION 'Enregistrez les modifications avant validation.'; END IF;
   SELECT string_agg(detail,' · ') INTO issues FROM public.sirex_check_declaration(NEW.id);
   IF issues IS NOT NULL THEN RAISE EXCEPTION 'Validation bloquée : %',issues; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sirex_guard_declaration BEFORE INSERT OR UPDATE OR DELETE ON public.sirex_declarations FOR EACH ROW EXECUTE FUNCTION sirex_private.guard_declaration();
CREATE FUNCTION sirex_private.guard_items() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE target_id uuid; target public.sirex_declarations; parent_currency text;
BEGIN
 IF TG_TABLE_NAME='sirex_declaration_items' THEN
   IF TG_OP='UPDATE' AND NEW.declaration_id<>OLD.declaration_id THEN RAISE EXCEPTION 'Le rattachement d’un article ne peut pas être modifié.'; END IF;
   target_id:=CASE WHEN TG_OP='DELETE' THEN OLD.declaration_id ELSE NEW.declaration_id END;
   SELECT * INTO target FROM public.sirex_declarations WHERE sirex_declarations.id=target_id FOR UPDATE;
   IF target.status='validee' THEN RAISE EXCEPTION 'Annulez la validation avant de modifier les articles.'; END IF;
   IF target.id IS NOT NULL THEN PERFORM 1 FROM public.sirex_acts WHERE sirex_acts.id=target.act_id FOR UPDATE; END IF;
 ELSE
   IF TG_OP='UPDATE' AND NEW.act_id<>OLD.act_id THEN RAISE EXCEPTION 'Le rattachement du bien ne peut pas être modifié.'; END IF;
   target_id:=CASE WHEN TG_OP='DELETE' THEN OLD.act_id ELSE NEW.act_id END;
   PERFORM 1 FROM public.sirex_acts WHERE sirex_acts.id=target_id FOR UPDATE;
   IF TG_OP<>'DELETE' THEN
     SELECT currency INTO parent_currency FROM public.sirex_acts WHERE sirex_acts.id=target_id;
     IF NEW.currency IS DISTINCT FROM parent_currency THEN RAISE EXCEPTION 'La devise du bien doit correspondre à celle de l’arrêté.'; END IF;
   END IF;
   IF EXISTS(SELECT 1 FROM public.sirex_declarations WHERE act_id=target_id AND status='validee') THEN RAISE EXCEPTION 'L’arrêté possède des déclarations validées. Annulez leur validation avant de modifier ses biens.'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER sirex_guard_items BEFORE INSERT OR UPDATE OR DELETE ON public.sirex_declaration_items FOR EACH ROW EXECUTE FUNCTION sirex_private.guard_items();
CREATE TRIGGER sirex_guard_act_items BEFORE INSERT OR UPDATE OR DELETE ON public.sirex_act_items FOR EACH ROW EXECUTE FUNCTION sirex_private.guard_items();
CREATE FUNCTION sirex_private.guard_act() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE o public.sirex_operators;
BEGIN
 SELECT * INTO o FROM public.sirex_operators WHERE id=NEW.operator_id;
 IF NOT FOUND OR o.province<>NEW.province THEN RAISE EXCEPTION 'La province de l’arrêté doit correspondre à celle de son bénéficiaire.'; END IF;
 IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-'consumed_value'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'consumed_value'-'updated_at'))
 AND EXISTS(SELECT 1 FROM public.sirex_declarations WHERE act_id=NEW.id AND status='validee') THEN
 RAISE EXCEPTION 'Annulez les validations avant de modifier un arrêté consommé.'; END IF;
 IF TG_OP='UPDATE' THEN NEW.authorized_value:=(SELECT coalesce(sum(cif_value),0) FROM public.sirex_act_items WHERE act_id=NEW.id); END IF;
 NEW.consumed_value:=(SELECT coalesce(sum(declared_value),0) FROM public.sirex_declarations WHERE act_id=NEW.id AND status='validee');
 NEW.updated_at:=now(); RETURN NEW;
END $$;
CREATE TRIGGER sirex_guard_act BEFORE INSERT OR UPDATE ON public.sirex_acts FOR EACH ROW EXECUTE FUNCTION sirex_private.guard_act();
CREATE FUNCTION sirex_private.guard_document() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF split_part(NEW.storage_path,'/',1)<>'acts' OR split_part(NEW.storage_path,'/',2)<>NEW.act_id::text OR NEW.mime_type<>'application/pdf' THEN RAISE EXCEPTION 'Le document doit appartenir au dossier et être un PDF.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sirex_guard_document BEFORE INSERT OR UPDATE ON public.sirex_act_documents FOR EACH ROW EXECUTE FUNCTION sirex_private.guard_document();

-- Server-derived audit events. Clients cannot insert fabricated actors/actions.
CREATE FUNCTION sirex_private.audit_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row_data jsonb; p text;
BEGIN
 row_data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 p:=row_data->>'province';
 IF TG_TABLE_NAME='sirex_declarations' THEN SELECT province INTO p FROM public.sirex_operators WHERE id=(row_data->>'operator_id')::uuid;
 ELSIF TG_TABLE_NAME IN ('sirex_act_items','sirex_act_documents') THEN SELECT province INTO p FROM public.sirex_acts WHERE id=(row_data->>'act_id')::uuid;
 ELSIF TG_TABLE_NAME='sirex_declaration_items' THEN SELECT o.province INTO p FROM public.sirex_declarations d JOIN public.sirex_operators o ON o.id=d.operator_id WHERE d.id=(row_data->>'declaration_id')::uuid; END IF;
 INSERT INTO public.sirex_audit_logs(action,entity_type,entity_id,actor_id,details)
 VALUES(TG_OP,TG_TABLE_NAME,coalesce(row_data->>'id',row_data->>'user_id')::uuid,auth.uid(),jsonb_build_object('province',p,'before',CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,'after',CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END));
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['sirex_operators','sirex_acts','sirex_declarations','sirex_act_items','sirex_act_documents','sirex_declaration_items','sirex_alerts','sirex_members'] LOOP
 EXECUTE format('CREATE TRIGGER sirex_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION sirex_private.audit_event()',t);
END LOOP; END $$;
CREATE FUNCTION sirex_private.refresh_alerts(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE issue record; p text;
BEGIN
 SELECT o.province INTO p FROM public.sirex_declarations d JOIN public.sirex_operators o ON o.id=d.operator_id WHERE d.id=p_id;
 IF NOT FOUND THEN RETURN; END IF;
 UPDATE public.sirex_alerts SET status='resolue' WHERE declaration_id=p_id AND status<>'resolue';
 FOR issue IN SELECT code,string_agg(detail,' · ') AS detail FROM public.sirex_check_declaration(p_id) GROUP BY code LOOP
 INSERT INTO public.sirex_alerts(declaration_id,code,severity,title,detail,province,status)
 VALUES(p_id,issue.code,'attention','Contrôle déclaration : '||issue.code,issue.detail,p,'ouverte')
 ON CONFLICT(declaration_id,code) DO UPDATE SET detail=excluded.detail,province=excluded.province,status='ouverte';
 END LOOP;
END $$;
CREATE FUNCTION sirex_private.sync_declaration() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_act uuid; new_act uuid; target uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN old_act:=OLD.act_id; END IF;
 IF TG_OP<>'DELETE' THEN new_act:=NEW.act_id; END IF;
 FOR target IN SELECT DISTINCT v FROM unnest(ARRAY[old_act,new_act]) v WHERE v IS NOT NULL ORDER BY v LOOP
 UPDATE public.sirex_acts SET consumed_value=(SELECT coalesce(sum(declared_value),0) FROM public.sirex_declarations WHERE act_id=target AND status='validee') WHERE id=target;
 END LOOP;
 IF TG_OP<>'DELETE' THEN PERFORM sirex_private.refresh_alerts(NEW.id); RETURN NEW; END IF; RETURN OLD;
END $$;
CREATE TRIGGER sirex_sync AFTER INSERT OR UPDATE OR DELETE ON public.sirex_declarations FOR EACH ROW EXECUTE FUNCTION sirex_private.sync_declaration();
CREATE FUNCTION sirex_private.sync_items() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid;
BEGIN
 target:=CASE WHEN TG_OP='DELETE' THEN OLD.declaration_id ELSE NEW.declaration_id END;
 PERFORM sirex_private.refresh_alerts(target);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER sirex_item_alerts AFTER INSERT OR UPDATE OR DELETE ON public.sirex_declaration_items FOR EACH ROW EXECUTE FUNCTION sirex_private.sync_items();
-- Private trigger functions are not callable from the Data API or client SQL.
REVOKE ALL ON FUNCTION sirex_private.protect_last_admin(), sirex_private.guard_declaration(), sirex_private.guard_items(), sirex_private.guard_act(), sirex_private.guard_document(), sirex_private.audit_event(), sirex_private.refresh_alerts(uuid), sirex_private.sync_declaration(), sirex_private.sync_items() FROM PUBLIC,anon,authenticated;

-- Atomic replacements and creation prevent partially persisted item lists/dossiers.
CREATE FUNCTION public.sirex_save_declaration_items(p_declaration_id uuid,p_items jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.sirex_declarations;
BEGIN
 SELECT * INTO d FROM public.sirex_declarations WHERE id=p_declaration_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Déclaration introuvable ou accès non autorisé.'; END IF;
 IF d.status='validee' THEN RAISE EXCEPTION 'Annulez la validation avant de modifier les articles.'; END IF;
 IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'Au moins un article est requis.'; END IF;
 DELETE FROM public.sirex_declaration_items WHERE declaration_id=p_declaration_id;
 INSERT INTO public.sirex_declaration_items(declaration_id,description,hs_code,quantity,unit,cif_value,currency)
 SELECT p_declaration_id,btrim(x->>'description'),nullif(x->>'hs_code',''),(x->>'quantity')::numeric,x->>'unit',(x->>'cif_value')::numeric,x->>'currency' FROM jsonb_array_elements(p_items) x;
END $$;
CREATE FUNCTION public.sirex_create_dossier(p_act jsonb,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.sirex_acts; total numeric;
BEGIN
 IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'Au moins un bien autorisé est requis.'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) x WHERE x->>'currency' IS DISTINCT FROM p_act->>'currency') THEN RAISE EXCEPTION 'Les biens doivent avoir la même devise que l’arrêté.'; END IF;
 SELECT sum((x->>'cif_value')::numeric) INTO total FROM jsonb_array_elements(p_items) x;
 INSERT INTO public.sirex_acts(operator_id,reference,approval_number,approval_date,act_type,province,start_date,end_date,project_name,project_description,project_location,investment_amount,jobs_created,customs_benefits,tax_benefits,investor_obligations,authorized_value,currency)
 VALUES((p_act->>'operator_id')::uuid,btrim(p_act->>'reference'),p_act->>'approval_number',(p_act->>'approval_date')::date,p_act->>'act_type',p_act->>'province',(p_act->>'start_date')::date,(p_act->>'end_date')::date,p_act->>'project_name',p_act->>'project_description',p_act->>'project_location',(p_act->>'investment_amount')::numeric,(p_act->>'jobs_created')::integer,p_act->>'customs_benefits',p_act->>'tax_benefits',p_act->>'investor_obligations',total,p_act->>'currency') RETURNING * INTO a;
 INSERT INTO public.sirex_act_items(act_id,quantity,unit,description,cif_value,currency,hs_code)
 SELECT a.id,(x->>'quantity')::numeric,x->>'unit',btrim(x->>'description'),(x->>'cif_value')::numeric,x->>'currency',nullif(x->>'hs_code','') FROM jsonb_array_elements(p_items) x;
 RETURN to_jsonb(a)||jsonb_build_object('operator',(SELECT jsonb_build_object('id',id,'company_name',company_name) FROM public.sirex_operators WHERE id=a.operator_id));
END $$;
REVOKE ALL ON FUNCTION public.sirex_save_declaration_items(uuid,jsonb),public.sirex_create_dossier(jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sirex_save_declaration_items(uuid,jsonb),public.sirex_create_dossier(jsonb,jsonb) TO authenticated;

CREATE FUNCTION sirex_private.sync_act_items() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid; d record;
BEGIN
 target:=CASE WHEN TG_OP='DELETE' THEN OLD.act_id ELSE NEW.act_id END;
 UPDATE public.sirex_acts SET authorized_value=(SELECT coalesce(sum(cif_value),0) FROM public.sirex_act_items WHERE act_id=target) WHERE id=target;
 FOR d IN SELECT id FROM public.sirex_declarations WHERE act_id=target LOOP PERFORM sirex_private.refresh_alerts(d.id); END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER sirex_act_item_totals AFTER INSERT OR UPDATE OR DELETE ON public.sirex_act_items FOR EACH ROW EXECUTE FUNCTION sirex_private.sync_act_items();
REVOKE ALL ON FUNCTION sirex_private.sync_act_items() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION sirex_private.guard_operator() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF OLD.province<>NEW.province AND (EXISTS(SELECT 1 FROM public.sirex_acts WHERE operator_id=OLD.id) OR EXISTS(SELECT 1 FROM public.sirex_declarations WHERE operator_id=OLD.id)) THEN RAISE EXCEPTION 'La province d’un opérateur avec des dossiers ne peut pas être modifiée.'; END IF;
 NEW.updated_at:=now(); RETURN NEW;
END $$;
CREATE TRIGGER sirex_guard_operator BEFORE UPDATE ON public.sirex_operators FOR EACH ROW EXECUTE FUNCTION sirex_private.guard_operator();
REVOKE ALL ON FUNCTION sirex_private.guard_operator() FROM PUBLIC,anon,authenticated;
