-- Additive modules: controlled file imports and balances. Existing data is preserved.
CREATE TABLE public.sirex_import_batches (
 id uuid PRIMARY KEY,
 operator_id uuid NOT NULL REFERENCES public.sirex_operators(id) ON DELETE RESTRICT,
 province text NOT NULL,
 source_name text NOT NULL CHECK(length(btrim(source_name)) BETWEEN 1 AND 240),
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sirex_import_operator_idx ON public.sirex_import_batches(operator_id);
CREATE INDEX sirex_import_actor_idx ON public.sirex_import_batches(created_by);
CREATE INDEX sirex_import_province_date_idx ON public.sirex_import_batches(province,created_at DESC);
ALTER TABLE public.sirex_import_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sirex_import_batches FROM anon;
GRANT SELECT,INSERT ON public.sirex_import_batches TO authenticated;
CREATE POLICY sirex_import_read ON public.sirex_import_batches FOR SELECT TO authenticated
 USING(sirex_private.can_access(province,false));
CREATE POLICY sirex_import_insert ON public.sirex_import_batches FOR INSERT TO authenticated
 WITH CHECK(created_by=auth.uid() AND sirex_private.can_access(province,true)
 AND EXISTS(SELECT 1 FROM public.sirex_operators o WHERE o.id=operator_id AND o.province=sirex_import_batches.province));
-- Import receipts are immutable; current counts are computed from linked declarations/items.
CREATE TRIGGER sirex_audit AFTER INSERT ON public.sirex_import_batches FOR EACH ROW EXECUTE FUNCTION sirex_private.audit_event();
ALTER TABLE public.sirex_declarations ADD COLUMN source_import_id uuid REFERENCES public.sirex_import_batches(id) ON DELETE RESTRICT;
ALTER TABLE public.sirex_declaration_items ADD COLUMN source_line integer CHECK(source_line IS NULL OR source_line>0);
CREATE INDEX sirex_declarations_import_idx ON public.sirex_declarations(source_import_id);
CREATE FUNCTION sirex_private.guard_import_link() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE b public.sirex_import_batches;
BEGIN
 IF TG_OP='UPDATE' AND NEW.source_import_id IS DISTINCT FROM OLD.source_import_id THEN RAISE EXCEPTION 'La provenance d’une déclaration ne peut pas être modifiée.'; END IF;
 IF NEW.source_import_id IS NOT NULL THEN
   SELECT * INTO b FROM public.sirex_import_batches WHERE id=NEW.source_import_id;
   IF NOT FOUND OR b.operator_id<>NEW.operator_id THEN RAISE EXCEPTION 'Lot d’import inaccessible ou bénéficiaire différent.'; END IF;
   IF TG_OP='INSERT' AND b.created_by<>auth.uid() THEN RAISE EXCEPTION 'Une nouvelle déclaration ne peut pas être ajoutée au lot d’un autre utilisateur.'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sirex_private.guard_import_link() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sirex_import_link BEFORE INSERT OR UPDATE ON public.sirex_declarations FOR EACH ROW EXECUTE FUNCTION sirex_private.guard_import_link();

-- Bulk imports reconcile each declaration once, after all of its item rows are present.
DROP TRIGGER sirex_item_alerts ON public.sirex_declaration_items;
CREATE FUNCTION sirex_private.refresh_items_statement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d record;
BEGIN
 IF TG_OP='DELETE' THEN
   FOR d IN SELECT DISTINCT declaration_id FROM sirex_old_items LOOP PERFORM sirex_private.refresh_alerts(d.declaration_id); END LOOP;
 ELSE
   FOR d IN SELECT DISTINCT declaration_id FROM sirex_new_items LOOP PERFORM sirex_private.refresh_alerts(d.declaration_id); END LOOP;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION sirex_private.refresh_items_statement() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sirex_items_insert_alerts AFTER INSERT ON public.sirex_declaration_items REFERENCING NEW TABLE AS sirex_new_items FOR EACH STATEMENT EXECUTE FUNCTION sirex_private.refresh_items_statement();
CREATE TRIGGER sirex_items_update_alerts AFTER UPDATE ON public.sirex_declaration_items REFERENCING NEW TABLE AS sirex_new_items FOR EACH STATEMENT EXECUTE FUNCTION sirex_private.refresh_items_statement();
CREATE TRIGGER sirex_items_delete_alerts AFTER DELETE ON public.sirex_declaration_items REFERENCING OLD TABLE AS sirex_old_items FOR EACH STATEMENT EXECUTE FUNCTION sirex_private.refresh_items_statement();

CREATE FUNCTION public.sirex_import_declarations(p_batch_id uuid,p_source_name text,p_source_sha256 text,p_declarations jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE b public.sirex_import_batches; o public.sirex_operators; entry jsonb; item jsonb; d_id uuid;
 payload_hash text; op_id uuid; line_count integer:=0; declaration_count integer; quantity numeric; amount numeric; total numeric; declared numeric; source_lines integer[]:=ARRAY[]::integer[];
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise.'; END IF;
 IF p_batch_id IS NULL OR p_source_sha256 IS NULL OR p_source_name IS NULL THEN RAISE EXCEPTION 'Informations du fichier source manquantes.'; END IF;
 IF jsonb_typeof(p_declarations) IS DISTINCT FROM 'array' OR jsonb_array_length(p_declarations) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Import limité à 1 à 200 déclarations.'; END IF;
 op_id:=(p_declarations->0->>'operator_id')::uuid;
 SELECT * INTO o FROM public.sirex_operators WHERE id=op_id;
 IF NOT FOUND OR o.status<>'actif' OR NOT sirex_private.can_access(o.province,true) THEN RAISE EXCEPTION 'Bénéficiaire inactif ou droits d’import insuffisants.'; END IF;
 payload_hash:=encode(sha256(convert_to(p_declarations::text,'UTF8')),'hex');
 -- The same receipt is safe to retry after a network error; no second insert occurs.
 PERFORM pg_advisory_xact_lock(hashtext(p_batch_id::text));
 SELECT * INTO b FROM public.sirex_import_batches WHERE id=p_batch_id;
 IF FOUND THEN
   IF b.created_by<>auth.uid() OR b.operator_id<>op_id OR b.payload_sha256<>payload_hash OR b.source_sha256<>p_source_sha256 OR b.source_name<>p_source_name THEN RAISE EXCEPTION 'Cet identifiant d’import correspond à un autre contenu ou utilisateur.'; END IF;
   RETURN jsonb_build_object('batch_id',b.id,'declarations',(SELECT count(*) FROM public.sirex_declarations WHERE source_import_id=b.id),'articles',(SELECT count(*) FROM public.sirex_declaration_items i JOIN public.sirex_declarations d ON d.id=i.declaration_id WHERE d.source_import_id=b.id),'already_imported',true);
 END IF;
 INSERT INTO public.sirex_import_batches(id,operator_id,province,source_name,source_sha256,payload_sha256,created_by)
 VALUES(p_batch_id,op_id,o.province,btrim(p_source_name),p_source_sha256,payload_hash,auth.uid());
 declaration_count:=jsonb_array_length(p_declarations);
 FOR entry IN SELECT value FROM jsonb_array_elements(p_declarations) LOOP
   IF (entry->>'operator_id')::uuid IS DISTINCT FROM op_id THEN RAISE EXCEPTION 'Toutes les déclarations du lot doivent appartenir au même bénéficiaire.'; END IF;
   IF coalesce(length(btrim(entry->>'declaration_number')),0) NOT BETWEEN 1 AND 120 OR coalesce(length(btrim(entry->>'office')),0)=0 THEN RAISE EXCEPTION 'Référence de déclaration ou bureau manquant.'; END IF;
   IF entry ? 'status' AND entry->>'status' IS DISTINCT FROM 'en_attente' THEN RAISE EXCEPTION 'Un import ne peut pas valider automatiquement une déclaration.'; END IF;
   IF entry->>'currency' IS NULL OR entry->>'currency' NOT IN ('USD','CDF','EUR','JPY') THEN RAISE EXCEPTION 'Devise de déclaration invalide.'; END IF;
   IF entry->>'declared_date' IS NULL OR entry->>'declared_date' !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Date de déclaration invalide.'; END IF;
   IF jsonb_typeof(entry->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(entry->'items')=0 THEN RAISE EXCEPTION 'Chaque déclaration doit contenir des articles.'; END IF;
   line_count:=line_count+jsonb_array_length(entry->'items');IF line_count>2000 THEN RAISE EXCEPTION 'Import limité à 2 000 articles.'; END IF;
   IF entry->>'declared_value' IS NULL OR entry->>'declared_value' !~ '^[0-9]+(\.[0-9]{1,2})?$' THEN RAISE EXCEPTION 'Montant de déclaration invalide.'; END IF;
   declared:=(entry->>'declared_value')::numeric;
   IF declared IS NULL OR declared<0 OR declared*100<>trunc(declared*100) THEN RAISE EXCEPTION 'Montant de déclaration invalide.'; END IF;
   total:=0;
   FOR item IN SELECT value FROM jsonb_array_elements(entry->'items') LOOP
     IF item->>'quantity' IS NULL OR item->>'quantity' !~ '^[0-9]+(\.[0-9]{1,3})?$' OR item->>'cif_value' IS NULL OR item->>'cif_value' !~ '^[0-9]+(\.[0-9]{1,2})?$' THEN RAISE EXCEPTION 'Quantité ou valeur CIF d’article invalide.'; END IF;
     quantity:=(item->>'quantity')::numeric;amount:=(item->>'cif_value')::numeric;
     IF quantity IS NULL OR quantity<=0 OR quantity*1000<>trunc(quantity*1000) OR amount IS NULL OR amount<0 OR amount*100<>trunc(amount*100) THEN RAISE EXCEPTION 'Quantité ou valeur CIF d’article invalide.'; END IF;
     IF coalesce(length(btrim(item->>'description')),0)=0 OR item->>'unit' IS NULL OR item->>'unit' NOT IN ('PCS','UN','KG','TONNE','LOT') THEN RAISE EXCEPTION 'Désignation ou unité d’article invalide.'; END IF;
     IF item->>'currency' IS DISTINCT FROM entry->>'currency' THEN RAISE EXCEPTION 'Les articles doivent utiliser la devise de leur déclaration.'; END IF;
     IF nullif(item->>'hs_code','') IS NOT NULL AND item->>'hs_code' !~ '^\d{4,10}$' THEN RAISE EXCEPTION 'Code SH invalide.'; END IF;
     IF item->>'source_line' IS NULL OR (item->>'source_line')::integer<=0 THEN RAISE EXCEPTION 'Numéro de ligne source manquant.'; END IF;
     IF (item->>'source_line')::integer=ANY(source_lines) THEN RAISE EXCEPTION 'Une ligne du fichier source est utilisée plusieurs fois.'; END IF;
     source_lines:=array_append(source_lines,(item->>'source_line')::integer);
     total:=total+amount;
   END LOOP;
   IF total<>declared THEN RAISE EXCEPTION 'La somme CIF des articles diffère du montant déclaré pour %.',entry->>'declaration_number'; END IF;
   INSERT INTO public.sirex_declarations(operator_id,act_id,declaration_number,office,declared_date,declared_value,currency,status,customs_regime,exporter_name,origin_country,shipment_country,source_import_id)
   VALUES(op_id,nullif(entry->>'act_id','')::uuid,btrim(entry->>'declaration_number'),btrim(entry->>'office'),(entry->>'declared_date')::date,declared,entry->>'currency','en_attente',entry->>'customs_regime',entry->>'exporter_name',entry->>'origin_country',entry->>'shipment_country',p_batch_id)
   RETURNING id INTO d_id;
   INSERT INTO public.sirex_declaration_items(declaration_id,description,hs_code,quantity,unit,cif_value,currency,source_line)
   SELECT d_id,btrim(x->>'description'),nullif(x->>'hs_code',''),(x->>'quantity')::numeric,x->>'unit',(x->>'cif_value')::numeric,x->>'currency',(x->>'source_line')::integer FROM jsonb_array_elements(entry->'items') x;
 END LOOP;
 RETURN jsonb_build_object('batch_id',p_batch_id,'declarations',declaration_count,'articles',line_count,'already_imported',false);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Une déclaration ou une référence est déjà enregistrée. L’import entier a été annulé ; aucun remplacement automatique.';
END $$;
REVOKE ALL ON FUNCTION public.sirex_import_declarations(uuid,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sirex_import_declarations(uuid,text,text,jsonb) TO authenticated;

CREATE FUNCTION public.sirex_import_history()
RETURNS TABLE(id uuid,source_name text,created_at timestamptz,province text,declarations bigint,articles bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT b.id,b.source_name,b.created_at,b.province,
 (SELECT count(*) FROM public.sirex_declarations d WHERE d.source_import_id=b.id),
 (SELECT count(*) FROM public.sirex_declaration_items i JOIN public.sirex_declarations d ON d.id=i.declaration_id WHERE d.source_import_id=b.id)
 FROM public.sirex_import_batches b ORDER BY b.created_at DESC,b.id LIMIT 50;
$$;
REVOKE ALL ON FUNCTION public.sirex_import_history() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sirex_import_history() TO authenticated;

CREATE FUNCTION public.sirex_act_balances(p_act_id uuid)
RETURNS TABLE(item_id uuid,description text,hs_code text,unit text,currency text,authorized_quantity numeric,imported_quantity numeric,remaining_quantity numeric,authorized_value numeric,imported_value numeric,remaining_value numeric,ambiguous boolean)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.sirex_acts WHERE id=p_act_id) THEN RAISE EXCEPTION 'Arrêté introuvable ou accès non autorisé.'; END IF;
 RETURN QUERY SELECT i.id,i.description,i.hs_code,i.unit,i.currency,i.quantity,
 CASE WHEN duplicates.n>1 THEN NULL ELSE coalesce(m.qty,0) END,
 CASE WHEN duplicates.n>1 THEN NULL ELSE i.quantity-coalesce(m.qty,0) END,
 i.cif_value,CASE WHEN duplicates.n>1 THEN NULL ELSE coalesce(m.cif,0) END,
 CASE WHEN duplicates.n>1 THEN NULL ELSE i.cif_value-coalesce(m.cif,0) END,duplicates.n>1
 FROM public.sirex_act_items i
 CROSS JOIN LATERAL (SELECT count(*) n FROM public.sirex_act_items ai WHERE ai.act_id=i.act_id AND ai.unit=i.unit AND sirex_private.normalized(ai.description)=sirex_private.normalized(i.description)) duplicates
 LEFT JOIN LATERAL (SELECT sum(di.quantity) qty,sum(di.cif_value) cif FROM public.sirex_declaration_items di JOIN public.sirex_declarations d ON d.id=di.declaration_id
 WHERE d.act_id=i.act_id AND d.status='validee' AND d.currency=i.currency AND di.currency=i.currency AND di.unit=i.unit AND sirex_private.normalized(di.description)=sirex_private.normalized(i.description)) m ON true
 WHERE i.act_id=p_act_id ORDER BY i.created_at,i.id;
END $$;
REVOKE ALL ON FUNCTION public.sirex_act_balances(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sirex_act_balances(uuid) TO authenticated;
