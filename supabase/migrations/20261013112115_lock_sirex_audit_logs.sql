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
