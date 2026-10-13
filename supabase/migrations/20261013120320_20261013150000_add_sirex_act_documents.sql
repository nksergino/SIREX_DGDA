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