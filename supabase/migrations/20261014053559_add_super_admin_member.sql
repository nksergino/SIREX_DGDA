INSERT INTO public.sirex_members (user_id, full_name, matricule, role, province, active)
VALUES ('d1572c64-acba-4ad2-b998-06bae65e72e2', 'Super Administrateur', '907001', 'super_admin', NULL, true)
ON CONFLICT (user_id) DO UPDATE SET role='super_admin', active=true;