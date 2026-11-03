-- Multicliente, fase 2 cierre (contracción): cierra el esquema abierto por `20261102120000_multi_tenant_expand`
-- una vez que todas las escrituras de la API ya asignan organización y cliente.
--   1) Relleno defensivo: si alguna fila quedó sin cliente/organización (API anterior a este despliegue),
--      se asigna a la organización/cliente por defecto de producto 1, con la misma regla que la expansión.
--   2) `NOT NULL` en `User.organizationId` y en los `clientId` obligatorios.
--   3) `Location.name` y `Property.identifier` pasan a ser únicos POR CLIENTE (se cae el único global, que
--      filtraba la existencia de nombres de otro cliente).
-- `Property.clientId` sigue nullable a propósito: solo aplica a residenciales con casas.
-- Verificación posterior: scripts/multi-tenant/verify-contract.sql.
-- Rollback: scripts/multi-tenant/rollback-contract.sql y luego borrar la fila de esta migración.

-- 1) Relleno defensivo de producto 1.
DO $$
DECLARE
  org_id INTEGER;
  default_client_id INTEGER;
  needs_backfill BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM "User" WHERE "organizationId" IS NULL
    UNION ALL SELECT 1 FROM "Location" WHERE "clientId" IS NULL
    UNION ALL SELECT 1 FROM "RecurringConfiguration" WHERE "clientId" IS NULL
    UNION ALL SELECT 1 FROM "Assignment" WHERE "clientId" IS NULL
    UNION ALL SELECT 1 FROM "Incident" WHERE "clientId" IS NULL
    UNION ALL SELECT 1 FROM "Round" WHERE "clientId" IS NULL
    UNION ALL SELECT 1 FROM "Kardex" WHERE "clientId" IS NULL
    UNION ALL SELECT 1 FROM "Announcement" WHERE "clientId" IS NULL
  ) INTO needs_backfill;

  IF NOT needs_backfill THEN
    RETURN;
  END IF;

  SELECT "id" INTO org_id FROM "Organization" WHERE "kind" = 'DIRECT' ORDER BY "id" ASC LIMIT 1;
  IF org_id IS NULL THEN
    INSERT INTO "Organization" ("name", "kind", "updatedAt")
    VALUES ('Residencial actual', 'DIRECT', CURRENT_TIMESTAMP)
    RETURNING "id" INTO org_id;
  END IF;

  SELECT "id" INTO default_client_id FROM "Client" WHERE "organizationId" = org_id ORDER BY "id" ASC LIMIT 1;
  IF default_client_id IS NULL THEN
    INSERT INTO "Client" ("organizationId", "name", "type", "updatedAt")
    VALUES (org_id, 'Residencial actual', 'RESIDENTIAL', CURRENT_TIMESTAMP)
    RETURNING "id" INTO default_client_id;
  END IF;

  UPDATE "User" SET "organizationId" = org_id WHERE "organizationId" IS NULL;
  UPDATE "Location" SET "clientId" = default_client_id WHERE "clientId" IS NULL;
  UPDATE "RecurringConfiguration" SET "clientId" = default_client_id WHERE "clientId" IS NULL;
  UPDATE "Assignment" SET "clientId" = default_client_id WHERE "clientId" IS NULL;
  UPDATE "Incident" SET "clientId" = default_client_id WHERE "clientId" IS NULL;
  UPDATE "Round" SET "clientId" = default_client_id WHERE "clientId" IS NULL;
  UPDATE "Kardex" SET "clientId" = default_client_id WHERE "clientId" IS NULL;
  UPDATE "Announcement" SET "clientId" = default_client_id WHERE "clientId" IS NULL;
END $$;

-- 2) Columnas obligatorias.
ALTER TABLE "User" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Location" ALTER COLUMN "clientId" SET NOT NULL;
ALTER TABLE "RecurringConfiguration" ALTER COLUMN "clientId" SET NOT NULL;
ALTER TABLE "Assignment" ALTER COLUMN "clientId" SET NOT NULL;
ALTER TABLE "Incident" ALTER COLUMN "clientId" SET NOT NULL;
ALTER TABLE "Round" ALTER COLUMN "clientId" SET NOT NULL;
ALTER TABLE "Kardex" ALTER COLUMN "clientId" SET NOT NULL;
ALTER TABLE "Announcement" ALTER COLUMN "clientId" SET NOT NULL;

-- 3) Nombres únicos por cliente (dejan de filtrar la existencia en otro cliente).
DROP INDEX "Location_name_key";
CREATE UNIQUE INDEX "Location_clientId_name_key" ON "Location"("clientId", "name");

DROP INDEX "Property_identifier_key";
CREATE UNIQUE INDEX "Property_clientId_identifier_key" ON "Property"("clientId", "identifier");
