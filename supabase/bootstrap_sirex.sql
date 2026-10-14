-- Initialisation uniquement sur un NOUVEAU projet SIREX_DGDA vide.
BEGIN;
/*
# Create SIREX core tracking schema

1. New Tables
- `sirex_operators`: economic operators and territorial assignment.
- `sirex_acts`: preferential decisions and their validity periods.
- `sirex_declarations`: import declarations linked to an operator and act.
- `sirex_alerts`: operational alerts requiring review.
- `sirex_audit_logs`: immutable-style activity records for traceability.

2. Data model
- Operators can have many acts and declarations.
- Acts can have many declarations.
- Dashboard totals are derived from these records and statuses.

3. Security
- Row level security is enabled on every table.
- Access is restricted to authenticated DGDA users.
- Each table has separate SELECT, INSERT, UPDATE and DELETE policies.

4. Important notes
- This first release uses a shared authenticated DGDA workspace; territorial filtering can be layered onto the existing province columns.
- No destructive changes are made.
*/

CREATE TABLE IF NOT EXISTS public.sirex_operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  registration_number text NOT NULL UNIQUE,
  tax_id text,
  province text NOT NULL,
  sector text,
  status text NOT NULL DEFAULT 'actif' CHECK (status IN ('actif', 'suspendu', 'cloture')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sirex_acts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.sirex_operators(id) ON DELETE RESTRICT,
  reference text NOT NULL UNIQUE,
  act_type text NOT NULL,
  province text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'valide' CHECK (status IN ('brouillon', 'en_attente', 'valide', 'expire', 'suspendu', 'cloture')),
  authorized_value numeric(18,2) NOT NULL DEFAULT 0,
  consumed_value numeric(18,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'XOF',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sirex_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.sirex_operators(id) ON DELETE RESTRICT,
  act_id uuid REFERENCES public.sirex_acts(id) ON DELETE SET NULL,
  declaration_number text NOT NULL UNIQUE,
  office text NOT NULL,
  declared_date date NOT NULL,
  hs_code text,
  designation text,
  declared_value numeric(18,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'en_attente' CHECK (status IN ('en_attente', 'rapprochee', 'validee', 'a_regulariser', 'rejetee')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sirex_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity text NOT NULL CHECK (severity IN ('critique', 'attention', 'information')),
  title text NOT NULL,
  detail text NOT NULL,
  province text,
  status text NOT NULL DEFAULT 'ouverte' CHECK (status IN ('ouverte', 'en_cours', 'resolue')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sirex_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sirex_acts_operator_id_idx ON public.sirex_acts(operator_id);
CREATE INDEX IF NOT EXISTS sirex_acts_status_idx ON public.sirex_acts(status);
CREATE INDEX IF NOT EXISTS sirex_declarations_operator_id_idx ON public.sirex_declarations(operator_id);
CREATE INDEX IF NOT EXISTS sirex_declarations_status_idx ON public.sirex_declarations(status);
CREATE INDEX IF NOT EXISTS sirex_alerts_status_idx ON public.sirex_alerts(status);

ALTER TABLE public.sirex_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sirex_acts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sirex_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sirex_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sirex_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view operators" ON public.sirex_operators;
CREATE POLICY "Authenticated users can view operators" ON public.sirex_operators FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can create operators" ON public.sirex_operators;
CREATE POLICY "Authenticated users can create operators" ON public.sirex_operators FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update operators" ON public.sirex_operators;
CREATE POLICY "Authenticated users can update operators" ON public.sirex_operators FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can delete operators" ON public.sirex_operators;
CREATE POLICY "Authenticated users can delete operators" ON public.sirex_operators FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can view acts" ON public.sirex_acts;
CREATE POLICY "Authenticated users can view acts" ON public.sirex_acts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can create acts" ON public.sirex_acts;
CREATE POLICY "Authenticated users can create acts" ON public.sirex_acts FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update acts" ON public.sirex_acts;
CREATE POLICY "Authenticated users can update acts" ON public.sirex_acts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can delete acts" ON public.sirex_acts;
CREATE POLICY "Authenticated users can delete acts" ON public.sirex_acts FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can view declarations" ON public.sirex_declarations;
CREATE POLICY "Authenticated users can view declarations" ON public.sirex_declarations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can create declarations" ON public.sirex_declarations;
CREATE POLICY "Authenticated users can create declarations" ON public.sirex_declarations FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update declarations" ON public.sirex_declarations;
CREATE POLICY "Authenticated users can update declarations" ON public.sirex_declarations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can delete declarations" ON public.sirex_declarations;
CREATE POLICY "Authenticated users can delete declarations" ON public.sirex_declarations FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can view alerts" ON public.sirex_alerts;
CREATE POLICY "Authenticated users can view alerts" ON public.sirex_alerts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can create alerts" ON public.sirex_alerts;
CREATE POLICY "Authenticated users can create alerts" ON public.sirex_alerts FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update alerts" ON public.sirex_alerts;
CREATE POLICY "Authenticated users can update alerts" ON public.sirex_alerts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can delete alerts" ON public.sirex_alerts;
CREATE POLICY "Authenticated users can delete alerts" ON public.sirex_alerts FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can view audit logs" ON public.sirex_audit_logs;
CREATE POLICY "Authenticated users can view audit logs" ON public.sirex_audit_logs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can create audit logs" ON public.sirex_audit_logs;
CREATE POLICY "Authenticated users can create audit logs" ON public.sirex_audit_logs FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update audit logs" ON public.sirex_audit_logs;
CREATE POLICY "Authenticated users can update audit logs" ON public.sirex_audit_logs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can delete audit logs" ON public.sirex_audit_logs;
CREATE POLICY "Authenticated users can delete audit logs" ON public.sirex_audit_logs FOR DELETE TO authenticated USING (true);

/*
# Lock SIREX audit history

1. Security change
- Remove authenticated UPDATE and DELETE policies from `sirex_audit_logs`.
- Audit entries remain readable and append-only for authenticated DGDA users.

2. Important notes
- Existing audit records are not changed or deleted.
- New audit entries can still be inserted for traceability.
*/

DROP POLICY IF EXISTS "Authenticated users can update audit logs" ON public.sirex_audit_logs;
DROP POLICY IF EXISTS "Authenticated users can delete audit logs" ON public.sirex_audit_logs;

/*
# Enrichir les dossiers d'exonération selon le modèle d'agrément

1. Modifications de `sirex_acts`
- Ajoute les informations administratives de l'agrément et du projet d'investissement.
- Ajoute la description du projet, les emplois prévus et les avantages accordés.
- Ajoute les obligations de l'investisseur et les signataires de l'acte.

2. Nouvelle table `sirex_act_items`
- Enregistre chaque bien importable autorisé par un arrêté.
- Conserve la quantité, l'unité, la désignation et la valeur CIF en devise.
- Relie chaque ligne à son arrêté et supprime les lignes si l'arrêté est supprimé.

3. Sécurité
- Active RLS sur la nouvelle table.
- Autorise les utilisateurs authentifiés de l'espace DGDA partagé à gérer les dossiers et leurs lignes.
- Les quatre opérations CRUD disposent de politiques distinctes.

4. Compatibilité
- Aucune colonne ni donnée existante n'est supprimée ou renommée.
- Toutes les nouvelles colonnes sont facultatives pour préserver les dossiers déjà créés.
*/

ALTER TABLE public.sirex_acts
  ADD COLUMN IF NOT EXISTS approval_number text,
  ADD COLUMN IF NOT EXISTS approval_date date,
  ADD COLUMN IF NOT EXISTS project_name text,
  ADD COLUMN IF NOT EXISTS project_description text,
  ADD COLUMN IF NOT EXISTS investment_amount numeric(18,2),
  ADD COLUMN IF NOT EXISTS investment_currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS project_location text,
  ADD COLUMN IF NOT EXISTS jobs_created integer,
  ADD COLUMN IF NOT EXISTS customs_benefits text,
  ADD COLUMN IF NOT EXISTS tax_benefits text,
  ADD COLUMN IF NOT EXISTS investor_obligations text,
  ADD COLUMN IF NOT EXISTS restriction_notes text,
  ADD COLUMN IF NOT EXISTS issuing_authority text,
  ADD COLUMN IF NOT EXISTS signed_by text;

CREATE TABLE IF NOT EXISTS public.sirex_act_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  act_id uuid NOT NULL REFERENCES public.sirex_acts(id) ON DELETE CASCADE,
  quantity numeric(18,3) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'PCS',
  description text NOT NULL,
  cif_value numeric(18,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sirex_act_items_act_id_idx ON public.sirex_act_items(act_id);

ALTER TABLE public.sirex_act_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view act items" ON public.sirex_act_items;
CREATE POLICY "Authenticated users can view act items" ON public.sirex_act_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can create act items" ON public.sirex_act_items;
CREATE POLICY "Authenticated users can create act items" ON public.sirex_act_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update act items" ON public.sirex_act_items;
CREATE POLICY "Authenticated users can update act items" ON public.sirex_act_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can delete act items" ON public.sirex_act_items;
CREATE POLICY "Authenticated users can delete act items" ON public.sirex_act_items FOR DELETE TO authenticated USING (true);
/*
# Ajouter les documents PDF aux dossiers d'exonération

1. Stockage
- Crée le bucket privé `sirex-documents`.
- Limite les fichiers à 10 Mo et au type PDF.
- Les fichiers ne sont jamais publiés par une URL publique.

2. Nouvelle table `sirex_act_documents`
- Relie un document à un arrêté existant.
- Conserve le nom d'origine, le chemin privé, le type MIME et la taille.
- Permet d'afficher le document source depuis la fiche de l'arrêté.

3. Sécurité
- Active RLS sur `sirex_act_documents`.
- Autorise uniquement les utilisateurs authentifiés de l'espace DGDA partagé.
- Les objets du bucket privé sont limités au préfixe `acts/` et aux arrêtés existants.
- Quatre politiques distinctes couvrent la lecture, l'ajout, la modification et la suppression.

4. Compatibilité
- Aucune table ou donnée existante n'est supprimée.
- Les documents déjà présents dans le projet ne sont pas affectés.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('sirex-documents', 'sirex-documents', false, 10485760, ARRAY['application/pdf']::text[])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760, allowed_mime_types = ARRAY['application/pdf']::text[];

CREATE TABLE IF NOT EXISTS public.sirex_act_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  act_id uuid NOT NULL REFERENCES public.sirex_acts(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL DEFAULT 'application/pdf',
  file_size bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sirex_act_documents_act_id_idx ON public.sirex_act_documents(act_id);

ALTER TABLE public.sirex_act_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view act documents" ON public.sirex_act_documents;
CREATE POLICY "Authenticated users can view act documents" ON public.sirex_act_documents FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can create act documents" ON public.sirex_act_documents;
CREATE POLICY "Authenticated users can create act documents" ON public.sirex_act_documents FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update act documents" ON public.sirex_act_documents;
CREATE POLICY "Authenticated users can update act documents" ON public.sirex_act_documents FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can delete act documents" ON public.sirex_act_documents;
CREATE POLICY "Authenticated users can delete act documents" ON public.sirex_act_documents FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can view SIREX act files" ON storage.objects;
CREATE POLICY "Authenticated users can view SIREX act files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'sirex-documents' AND (storage.foldername(name))[1] = 'acts');
DROP POLICY IF EXISTS "Authenticated users can upload SIREX act files" ON storage.objects;
CREATE POLICY "Authenticated users can upload SIREX act files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'sirex-documents' AND (storage.foldername(name))[1] = 'acts' AND lower(coalesce(metadata->>'mimetype', '')) = 'application/pdf');
DROP POLICY IF EXISTS "Authenticated users can update SIREX act files" ON storage.objects;
CREATE POLICY "Authenticated users can update SIREX act files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'sirex-documents' AND (storage.foldername(name))[1] = 'acts') WITH CHECK (bucket_id = 'sirex-documents' AND (storage.foldername(name))[1] = 'acts' AND lower(coalesce(metadata->>'mimetype', '')) = 'application/pdf');
DROP POLICY IF EXISTS "Authenticated users can delete SIREX act files" ON storage.objects;
CREATE POLICY "Authenticated users can delete SIREX act files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'sirex-documents' AND (storage.foldername(name))[1] = 'acts');
/*
# Add detailed Sydonia declaration fields

1. Purpose
- Store the administrative, transport, origin, valuation, weight and tax details visible on a Sydonia import declaration.
- Preserve every existing declaration and keep all additions optional for compatibility.

2. Modified table: `public.sirex_declarations`
- `exporter_name`, `exporter_address`: exporter identity from the declaration.
- `declarant_name`: declarant or representative identity.
- `customs_regime`: Sydonia procedure code such as IM 4.
- `destination_reference`: reference of the destination file or dossier.
- `financial_responsible`, `financial_responsible_address`: responsible financial party.
- `shipment_country`, `origin_country`, `destination_country`: trade-route countries.
- `preference_code`: preference or quota code shown on Sydonia.
- `currency`: declaration currency.
- `invoice_value`: total invoice value.
- `exchange_rate`: exchange rate used by Sydonia.
- `tax_base`: taxable base.
- `total_taxes`: total duties and taxes.
- `taxes_detail`: readable breakdown of duties and taxes.
- `package_count`: number of packages or units declared.
- `gross_weight`, `net_weight`: declared gross and net weights.
- `transport_mode`, `vehicle_reference`: transport information.

3. Security
- No new table is created.
- Existing authenticated CRUD policies on `sirex_declarations` continue to protect the added fields.

4. Compatibility and safety
- No existing columns or rows are removed, renamed, or changed in type.
- All new fields are nullable so existing declarations remain valid.
*/

ALTER TABLE public.sirex_declarations
  ADD COLUMN IF NOT EXISTS exporter_name text,
  ADD COLUMN IF NOT EXISTS exporter_address text,
  ADD COLUMN IF NOT EXISTS declarant_name text,
  ADD COLUMN IF NOT EXISTS customs_regime text,
  ADD COLUMN IF NOT EXISTS destination_reference text,
  ADD COLUMN IF NOT EXISTS financial_responsible text,
  ADD COLUMN IF NOT EXISTS financial_responsible_address text,
  ADD COLUMN IF NOT EXISTS shipment_country text,
  ADD COLUMN IF NOT EXISTS origin_country text,
  ADD COLUMN IF NOT EXISTS destination_country text,
  ADD COLUMN IF NOT EXISTS preference_code text,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS invoice_value numeric(18,2),
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(18,6),
  ADD COLUMN IF NOT EXISTS tax_base numeric(18,2),
  ADD COLUMN IF NOT EXISTS total_taxes numeric(18,2),
  ADD COLUMN IF NOT EXISTS taxes_detail text,
  ADD COLUMN IF NOT EXISTS package_count numeric(18,3),
  ADD COLUMN IF NOT EXISTS gross_weight numeric(18,3),
  ADD COLUMN IF NOT EXISTS net_weight numeric(18,3),
  ADD COLUMN IF NOT EXISTS transport_mode text,
  ADD COLUMN IF NOT EXISTS vehicle_reference text;

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

COMMIT;
