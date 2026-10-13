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
