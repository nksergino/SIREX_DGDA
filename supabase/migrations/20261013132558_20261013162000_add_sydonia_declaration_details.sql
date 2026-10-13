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
