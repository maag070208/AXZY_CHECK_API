-- RBAC por acción: permisos granulares de ronda.
-- Se mantienen los permisos de módulo (recurring.operate, etc.) para no romper
-- endpoints que todavía no se migran; estos códigos ya quedan en la matriz DB.

INSERT INTO "Permission" ("code", "description") VALUES
  ('round.view', 'Consultar rondas y su detalle'),
  ('round.start', 'Iniciar una ronda'),
  ('round.end', 'Terminar una ronda'),
  ('round.scan', 'Escanear puntos y registrar kardex')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."code" IN ('round.view', 'round.start', 'round.end', 'round.scan')
WHERE r."name" IN ('ADMIN', 'SHIFT', 'GUARD', 'MAINT')
ON CONFLICT DO NOTHING;
