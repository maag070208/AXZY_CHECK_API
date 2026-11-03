-- Multicliente, fase 5 (contracción): relleno + NOT NULL en los `clientId` de Person, Maintenance, ChatMessage,
-- ShiftHandover (antes resueltos por vínculos) y AccessPin/Vehicle (antes por su propiedad).
-- Relleno:
--   • AccessPin/Vehicle → cliente de su propiedad.
--   • Person → primer vínculo con una propiedad que tenga cliente (residente, periodo, propietario, autorización,
--     acceso, cuenta de APP); si no tiene ninguno, cliente por defecto de producto 1.
--   • Maintenance/ChatMessage/ShiftHandover → cliente por defecto de producto 1 (sus filas previas a esta fase son
--     de instalaciones de un solo cliente).
-- Verificación posterior: scripts/multi-tenant/verify-phase5.sql. Rollback: rollback-phase5-contract.sql.
DO $$
DECLARE
  org_id INTEGER;
  default_client_id INTEGER;
  needs_backfill BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM "Person" WHERE "clientId" IS NULL
    UNION ALL SELECT 1 FROM "Maintenance" WHERE "clientId" IS NULL
    UNION ALL SELECT 1 FROM "AccessPin" WHERE "clientId" IS NULL
    UNION ALL SELECT 1 FROM "Vehicle" WHERE "clientId" IS NULL
    UNION ALL SELECT 1 FROM "ChatMessage" WHERE "clientId" IS NULL
    UNION ALL SELECT 1 FROM "ShiftHandover" WHERE "clientId" IS NULL
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

  -- AccessPin y Vehicle: manda la propiedad (aunque no sea del cliente por defecto).
  UPDATE "AccessPin" a SET "clientId" = p."clientId"
  FROM "Property" p
  WHERE a."propertyId" = p."id" AND a."clientId" IS NULL AND p."clientId" IS NOT NULL;

  UPDATE "Vehicle" v SET "clientId" = p."clientId"
  FROM "Property" p
  WHERE v."propertyId" = p."id" AND v."clientId" IS NULL AND p."clientId" IS NOT NULL;

  -- Person: primer vínculo con propiedad que tenga cliente.
  UPDATE "Person" per SET "clientId" = links."clientId"
  FROM (
    SELECT DISTINCT ON ("personId") "personId", "clientId"
    FROM (
      SELECT r."personId", p."clientId"
      FROM "Resident" r JOIN "Property" p ON p."id" = r."propertyId"
      WHERE p."clientId" IS NOT NULL
      UNION ALL
      SELECT o."ownerPersonId", p."clientId"
      FROM "OccupancyPeriod" o JOIN "Property" p ON p."id" = o."propertyId"
      WHERE o."ownerPersonId" IS NOT NULL AND p."clientId" IS NOT NULL
      UNION ALL
      SELECT o."tenantPersonId", p."clientId"
      FROM "OccupancyPeriod" o JOIN "Property" p ON p."id" = o."propertyId"
      WHERE o."tenantPersonId" IS NOT NULL AND p."clientId" IS NOT NULL
      UNION ALL
      SELECT pr."ownerPersonId", pr."clientId"
      FROM "Property" pr
      WHERE pr."ownerPersonId" IS NOT NULL AND pr."clientId" IS NOT NULL
      UNION ALL
      SELECT oc."fromPersonId", p."clientId"
      FROM "OwnershipChange" oc JOIN "Property" p ON p."id" = oc."propertyId"
      WHERE oc."fromPersonId" IS NOT NULL AND p."clientId" IS NOT NULL
      UNION ALL
      SELECT oc."toPersonId", p."clientId"
      FROM "OwnershipChange" oc JOIN "Property" p ON p."id" = oc."propertyId"
      WHERE p."clientId" IS NOT NULL
      UNION ALL
      SELECT pa."personId", p."clientId"
      FROM "PropertyAuthorization" pa JOIN "Property" p ON p."id" = pa."propertyId"
      WHERE p."clientId" IS NOT NULL
      UNION ALL
      SELECT ae."personId", p."clientId"
      FROM "AccessEvent" ae JOIN "Property" p ON p."id" = ae."propertyId"
      WHERE ae."personId" IS NOT NULL AND p."clientId" IS NOT NULL
      UNION ALL
      SELECT per2."id", p."clientId"
      FROM "Person" per2 JOIN "User" u ON u."id" = per2."userId" JOIN "Property" p ON p."id" = u."propertyId"
      WHERE p."clientId" IS NOT NULL
    ) all_links
    ORDER BY "personId", "clientId"
  ) links
  WHERE per."id" = links."personId" AND per."clientId" IS NULL;

  -- Resto (instalaciones de un solo cliente): cliente por defecto.
  UPDATE "Person" SET "clientId" = default_client_id WHERE "clientId" IS NULL;
  UPDATE "Maintenance" SET "clientId" = default_client_id WHERE "clientId" IS NULL;
  UPDATE "ChatMessage" SET "clientId" = default_client_id WHERE "clientId" IS NULL;
  UPDATE "ShiftHandover" SET "clientId" = default_client_id WHERE "clientId" IS NULL;
END $$;

ALTER TABLE "Person" ALTER COLUMN "clientId" SET NOT NULL;
ALTER TABLE "Maintenance" ALTER COLUMN "clientId" SET NOT NULL;
ALTER TABLE "AccessPin" ALTER COLUMN "clientId" SET NOT NULL;
ALTER TABLE "Vehicle" ALTER COLUMN "clientId" SET NOT NULL;
ALTER TABLE "ChatMessage" ALTER COLUMN "clientId" SET NOT NULL;
ALTER TABLE "ShiftHandover" ALTER COLUMN "clientId" SET NOT NULL;
