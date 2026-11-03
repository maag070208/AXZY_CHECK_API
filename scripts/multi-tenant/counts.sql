-- Multicliente, fase 0: filas de las tablas que toca la migración. Correr ANTES y DESPUÉS; deben coincidir.
-- Uso: psql "$DATABASE_URL" -f scripts/multi-tenant/counts.sql
SELECT 'User' AS "tabla", COUNT(*) AS "filas" FROM "User"
UNION ALL SELECT 'Property', COUNT(*) FROM "Property"
UNION ALL SELECT 'Location', COUNT(*) FROM "Location"
UNION ALL SELECT 'RecurringConfiguration', COUNT(*) FROM "RecurringConfiguration"
UNION ALL SELECT 'Assignment', COUNT(*) FROM "Assignment"
UNION ALL SELECT 'Incident', COUNT(*) FROM "Incident"
UNION ALL SELECT 'Round', COUNT(*) FROM "Round"
UNION ALL SELECT 'Kardex', COUNT(*) FROM "Kardex"
UNION ALL SELECT 'Announcement', COUNT(*) FROM "Announcement"
ORDER BY 1;
