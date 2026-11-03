-- Multicliente, fase 3: comprobaciones DESPUÉS de la migración del rol CLIENT.
-- Uso: psql "$DATABASE_URL" -f scripts/multi-tenant/verify-client-role.sql
WITH checks("comprobacion", "esperado", "real") AS (
  SELECT 'rol CLIENT sembrado', 1, (SELECT COUNT(*)::int FROM "Role" WHERE "name" = 'CLIENT')
  UNION ALL SELECT 'User.clientId existe', 1, (
    SELECT COUNT(*)::int FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'clientId'
  )
  UNION ALL SELECT 'User.clientId es nullable', 1, (
    SELECT COUNT(*)::int FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'clientId' AND is_nullable = 'YES'
  )
  UNION ALL SELECT 'FK User.clientId -> Client', 1, (
    SELECT COUNT(*)::int FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND constraint_name = 'User_clientId_fkey'
  )
  UNION ALL SELECT 'usuarios CLIENT sin cliente', 0, (
    SELECT COUNT(*)::int FROM "User" u JOIN "Role" r ON r."id" = u."roleId"
    WHERE r."name" = 'CLIENT' AND u."clientId" IS NULL
  )
  UNION ALL SELECT 'usuarios no CLIENT con cliente', 0, (
    SELECT COUNT(*)::int FROM "User" u JOIN "Role" r ON r."id" = u."roleId"
    WHERE r."name" <> 'CLIENT' AND u."clientId" IS NOT NULL
  )
)
SELECT *, CASE WHEN "esperado" = "real" THEN 'ok' ELSE 'ERROR' END AS "estado" FROM checks;
