# Project memory

## Product intent & audience

- SIREX web application under active development.
- Internal/administrative system with role-based access; includes a super-administrator role.
- Authentication uses a "matricule" (numeric ID) + password scheme.

## Brand personality & voice

- Not yet explicitly defined; production-quality, polished presentation expected per global instructions.

## Visual design & UX direction

- Stack: Vite + React (JSX), Tailwind CSS, Lucide React icons.
- Path alias `@/` maps to `src/`.
- No UI theme/icon packages beyond Lucide React unless explicitly requested.
- No design tokens or component patterns established yet.

## Decisions, constraints & rationale

- Super-admin account seeded via SQL migration; matricule `907001` with existing password.
- Migration files are plain SQL; stored in a migrations directory.
- Fixed double `.sql.sql` extension on three migration filenames for cleanliness.
- Project builds successfully after cleanup.

## Open questions & assumptions

- Full SIREX feature scope beyond admin/auth not yet captured.
- Database engine and migration runner not identified from context.
- No confirmation of additional user roles beyond super admin.
- UI/UX direction still to be inferred from PDF spec or future requests.