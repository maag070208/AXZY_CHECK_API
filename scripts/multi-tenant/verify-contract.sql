-- Multicliente, fase 2 cierre: comprobaciones DESPUÉS de la migración de contracción.
-- Toda fila con "esperado" distinto de "real" es un error.
-- Uso: psql "$DATABASE_URL" -f scripts/multi-tenant/verify-contract.sql
WITH checks("comprobacion", "esperado", "real") AS (
  SELECT 'columnas obligatorias', 8, (
    SELECT COUNT(*)::int FROM information_schema.columns
    WHERE table_schema = 'public' AND is_nullable = 'NO' AND (
      ("table_name" = 'User' AND "column_name" = 'organizationId')
      OR ("table_name" = 'Location' AND "column_name" = 'clientId')
      OR ("table_name" = 'RecurringConfiguration' AND "column_name" = 'clientId')
      OR ("table_name" = 'Assignment' AND "column_name" = 'clientId')
      OR ("table_name" = 'Incident' AND "column_name" = 'clientId')
      OR ("table_name" = 'Round' AND "column_name" = 'clientId')
      OR ("table_name" = 'Kardex' AND "column_name" = 'clientId')
      OR ("table_name" = 'Announcement' AND "column_name" = 'clientId')
    )
  )
  UNION ALL SELECT 'Location.name único por cliente', 1, (
    SELECT COUNT(*)::int FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'Location_clientId_name_key'
  )
  UNION ALL SELECT 'Property.identifier único por cliente', 1, (
    SELECT COUNT(*)::int FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'Property_clientId_identifier_key'
  )
  UNION ALL SELECT 'Location.name ya no es único global', 0, (
    SELECT COUNT(*)::int FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'Location_name_key'
  )
  UNION ALL SELECT 'Property.identifier ya no es único global', 0, (
    SELECT COUNT(*)::int FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'Property_identifier_key'
  )
  UNION ALL SELECT 'Property.clientId sigue nullable', 1, (
    SELECT COUNT(*)::int FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Property' AND column_name = 'clientId' AND is_nullable = 'YES'
  )
)
SELECT *, CASE WHEN "esperado" = "real" THEN 'ok' ELSE 'ERROR' END AS "estado" FROM checks;
