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