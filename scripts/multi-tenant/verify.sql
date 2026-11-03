-- Multicliente, fase 0: comprobaciones DESPUÉS de la migración. Toda fila con "esperado" distinto de "real" es un error.
-- Uso: psql "$DATABASE_URL" -f scripts/multi-tenant/verify.sql
WITH guards AS (
  SELECT u."id" FROM "User" u JOIN "Role" r ON r."id" = u."roleId"
  WHERE r."name" IN ('GUARD', 'SHIFT') AND u."softDelete" = false
),
checks("comprobacion", "esperado", "real") AS (
  SELECT 'organizaciones', CASE WHEN EXISTS (SELECT 1 FROM "User") THEN 1 ELSE 0 END, (SELECT COUNT(*)::int FROM "Organization")
  UNION ALL SELECT 'clientes', CASE WHEN EXISTS (SELECT 1 FROM "User") THEN 1 ELSE 0 END, (SELECT COUNT(*)::int FROM "Client")
  UNION ALL SELECT 'User sin organizationId', 0, (SELECT COUNT(*)::int FROM "User" WHERE "organizationId" IS NULL)
  UNION ALL SELECT 'Property sin clientId', 0, (SELECT COUNT(*)::int FROM "Property" WHERE "clientId" IS NULL)
  UNION ALL SELECT 'Location sin clientId', 0, (SELECT COUNT(*)::int FROM "Location" WHERE "clientId" IS NULL)
  UNION ALL SELECT 'RecurringConfiguration sin clientId', 0, (SELECT COUNT(*)::int FROM "RecurringConfiguration" WHERE "clientId" IS NULL)
  UNION ALL SELECT 'Assignment sin clientId', 0, (SELECT COUNT(*)::int FROM "Assignment" WHERE "clientId" IS NULL)
  UNION ALL SELECT 'Incident sin clientId', 0, (SELECT COUNT(*)::int FROM "Incident" WHERE "clientId" IS NULL)
  UNION ALL SELECT 'Round sin clientId', 0, (SELECT COUNT(*)::int FROM "Round" WHERE "clientId" IS NULL)
  UNION ALL SELECT 'Kardex sin clientId', 0, (SELECT COUNT(*)::int FROM "Kardex" WHERE "clientId" IS NULL)
  UNION ALL SELECT 'Announcement sin clientId', 0, (SELECT COUNT(*)::int FROM "Announcement" WHERE "clientId" IS NULL)
  UNION ALL SELECT 'guardias sin asignación abierta', 0,
    (SELECT COUNT(*)::int FROM guards g WHERE NOT EXISTS (SELECT 1 FROM "GuardAssignment" a WHERE a."guardId" = g."id" AND a."endsAt" IS NULL))
  UNION ALL SELECT 'asignaciones abiertas de no guardias', 0,
    (SELECT COUNT(*)::int FROM "GuardAssignment" a WHERE a."endsAt" IS NULL AND a."guardId" NOT IN (SELECT "id" FROM guards))
  UNION ALL SELECT 'guardias con más de una asignación abierta', 0,
    (SELECT COUNT(*)::int FROM (SELECT "guardId" FROM "GuardAssignment" WHERE "endsAt" IS NULL GROUP BY 1 HAVING COUNT(*) > 1) d)
)
SELECT *, CASE WHEN "esperado" = "real" THEN 'ok' ELSE 'ERROR' END AS "estado" FROM checks;
