-- Multicliente, fase 5: comprobaciones DESPUÉS de la contracción.
-- Uso: psql "$DATABASE_URL" -f scripts/multi-tenant/verify-phase5.sql
WITH checks("comprobacion", "esperado", "real") AS (
  SELECT 'columnas clientId obligatorias (fase 5)', 6, (
    SELECT COUNT(*)::int FROM information_schema.columns
    WHERE table_schema = 'public' AND is_nullable = 'NO' AND column_name = 'clientId'
      AND table_name IN ('Person', 'Maintenance', 'AccessPin', 'Vehicle', 'ChatMessage', 'ShiftHandover')
  )
  UNION ALL SELECT 'filas sin cliente (fase 5)', 0, (
    (SELECT COUNT(*)::int FROM "Person" WHERE "clientId" IS NULL)
    + (SELECT COUNT(*)::int FROM "Maintenance" WHERE "clientId" IS NULL)
    + (SELECT COUNT(*)::int FROM "AccessPin" WHERE "clientId" IS NULL)
    + (SELECT COUNT(*)::int FROM "Vehicle" WHERE "clientId" IS NULL)
    + (SELECT COUNT(*)::int FROM "ChatMessage" WHERE "clientId" IS NULL)
    + (SELECT COUNT(*)::int FROM "ShiftHandover" WHERE "clientId" IS NULL)
  )
  UNION ALL SELECT 'AccessPin único por cliente', 1, (
    SELECT COUNT(*)::int FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'AccessPin_clientId_pinHash_key'
  )
  UNION ALL SELECT 'Vehicle tag único por cliente', 1, (
    SELECT COUNT(*)::int FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'Vehicle_clientId_tagCode_key'
  )
  UNION ALL SELECT 'ShiftHandover único por cliente', 1, (
    SELECT COUNT(*)::int FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ShiftHandover_clientId_shiftType_handoverDate_key'
  )
  UNION ALL SELECT 'sin únicos globales de PIN/tag/turno (fase 5)', 0, (
    SELECT COUNT(*)::int FROM pg_indexes WHERE schemaname = 'public'
      AND indexname IN ('AccessPin_pinHash_key', 'Vehicle_tagCode_key', 'ShiftHandover_shiftType_handoverDate_key')
  )
)
SELECT *, CASE WHEN "esperado" = "real" THEN 'ok' ELSE 'ERROR' END AS "estado" FROM checks;
