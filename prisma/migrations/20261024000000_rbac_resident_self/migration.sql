-- Autoservicio del residente. No se asigna a ADMIN: sus capacidades de
-- administración ya están cubiertas por los permisos de módulo.
INSERT INTO "Permission" ("code", "description") VALUES
  ('resident.self', 'Consultar mi perfil y mis contactos'),
  ('invitation.view', 'Consultar mis invitaciones'),
  ('invitation.create', 'Generar mis invitaciones'),
  ('invitation.revoke', 'Revocar mis invitaciones')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."code" IN ('resident.self', 'invitation.view', 'invitation.create', 'invitation.revoke')
WHERE r."name" = 'RESDN'
ON CONFLICT DO NOTHING;
