-- Categorías de incidente sembradas: valores del sistema (no se renombran ni borran; solo se desactivan).
UPDATE "IncidentCategory"
SET "isSystem" = true
WHERE "name" IN ('SEGURIDAD', 'SERVICIOS', 'CASA_CLUB', 'PLOMERIA', 'ELECTRICIDAD', 'ESTRUCTURA');
