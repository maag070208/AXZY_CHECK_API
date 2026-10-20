-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "statusId" INTEGER;

-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "statusId" INTEGER;

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "statusId" INTEGER;

-- AlterTable
ALTER TABLE "Kardex" ADD COLUMN     "scanTypeId" INTEGER;

-- AlterTable
ALTER TABLE "Maintenance" ADD COLUMN     "statusId" INTEGER;

-- AlterTable
ALTER TABLE "Round" ADD COLUMN     "statusId" INTEGER;

-- CreateTable
CREATE TABLE "AssignmentStatusCatalog" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AssignmentStatusCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvitationStatusCatalog" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "InvitationStatusCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanTypeCatalog" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ScanTypeCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentStatusCatalog" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "IncidentStatusCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundStatusCatalog" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RoundStatusCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceStatusCatalog" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MaintenanceStatusCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentStatusCatalog_name_key" ON "AssignmentStatusCatalog"("name");

-- CreateIndex
CREATE UNIQUE INDEX "InvitationStatusCatalog_name_key" ON "InvitationStatusCatalog"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ScanTypeCatalog_name_key" ON "ScanTypeCatalog"("name");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentStatusCatalog_name_key" ON "IncidentStatusCatalog"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RoundStatusCatalog_name_key" ON "RoundStatusCatalog"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceStatusCatalog_name_key" ON "MaintenanceStatusCatalog"("name");

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "InvitationStatusCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kardex" ADD CONSTRAINT "Kardex_scanTypeId_fkey" FOREIGN KEY ("scanTypeId") REFERENCES "ScanTypeCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "AssignmentStatusCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "IncidentStatusCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "RoundStatusCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "MaintenanceStatusCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Catálogos sembrados desde los valores del enum (T-F0-13).
INSERT INTO "AssignmentStatusCatalog" ("name", "value", "order", "active", "isSystem")
VALUES
  ('PENDING', 'Pendiente', 0, true, true),
  ('CHECKING', 'En revisión', 1, true, true),
  ('UNDER_REVIEW', 'Bajo revisión', 2, true, true),
  ('REVIEWED', 'Revisada', 3, true, true),
  ('ANOMALY', 'Anomalía', 4, true, true)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "InvitationStatusCatalog" ("name", "value", "order", "active", "isSystem")
VALUES
  ('PENDING', 'Pendiente', 0, true, true),
  ('ENTERED', 'Ingresó', 1, true, true),
  ('EXITED', 'Salió', 2, true, true),
  ('EXPIRED', 'Vencida', 3, true, true),
  ('CANCELLED', 'Cancelada', 4, true, true)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "ScanTypeCatalog" ("name", "value", "order", "active", "isSystem")
VALUES
  ('ASSIGNMENT', 'Asignación', 0, true, true),
  ('RECURRING', 'Recurrente', 1, true, true),
  ('FREE', 'Libre', 2, true, true)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "IncidentStatusCatalog" ("name", "value", "order", "active", "isSystem")
VALUES
  ('PENDING', 'Pendiente', 0, true, true),
  ('ATTENDED', 'Atendido', 1, true, true)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "RoundStatusCatalog" ("name", "value", "order", "active", "isSystem")
VALUES
  ('IN_PROGRESS', 'En curso', 0, true, true),
  ('COMPLETED', 'Completada', 1, true, true)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "MaintenanceStatusCatalog" ("name", "value", "order", "active", "isSystem")
VALUES
  ('PENDING', 'Pendiente', 0, true, true),
  ('ATTENDED', 'Atendido', 1, true, true)
ON CONFLICT ("name") DO NOTHING;

-- Backfill: llena la FK desde la columna enum existente.
UPDATE "Assignment" t SET "statusId" = c."id" FROM "AssignmentStatusCatalog" c WHERE c."name" = t."status"::text AND t."statusId" IS NULL;
UPDATE "Invitation" t SET "statusId" = c."id" FROM "InvitationStatusCatalog" c WHERE c."name" = t."status"::text AND t."statusId" IS NULL;
UPDATE "Kardex" t SET "scanTypeId" = c."id" FROM "ScanTypeCatalog" c WHERE c."name" = t."scanType"::text AND t."scanTypeId" IS NULL;
UPDATE "Incident" t SET "statusId" = c."id" FROM "IncidentStatusCatalog" c WHERE c."name" = t."status"::text AND t."statusId" IS NULL;
UPDATE "Round" t SET "statusId" = c."id" FROM "RoundStatusCatalog" c WHERE c."name" = t."status"::text AND t."statusId" IS NULL;
UPDATE "Maintenance" t SET "statusId" = c."id" FROM "MaintenanceStatusCatalog" c WHERE c."name" = t."status"::text AND t."statusId" IS NULL;

-- Verificación: si queda una fila sin mapear, la migración falla (no se avanza con datos inconsistentes).
DO $$
DECLARE sin_mapear INT;
BEGIN
  SELECT COUNT(*) INTO sin_mapear FROM "Assignment" t
  LEFT JOIN "AssignmentStatusCatalog" c ON c."name" = t."status"::text
  WHERE t."statusId" IS DISTINCT FROM c."id";
  IF sin_mapear > 0 THEN
    RAISE EXCEPTION 'Backfill Assignment.statusId: % filas sin mapear', sin_mapear;
  END IF;
END $$;
DO $$
DECLARE sin_mapear INT;
BEGIN
  SELECT COUNT(*) INTO sin_mapear FROM "Invitation" t
  LEFT JOIN "InvitationStatusCatalog" c ON c."name" = t."status"::text
  WHERE t."statusId" IS DISTINCT FROM c."id";
  IF sin_mapear > 0 THEN
    RAISE EXCEPTION 'Backfill Invitation.statusId: % filas sin mapear', sin_mapear;
  END IF;
END $$;
DO $$
DECLARE sin_mapear INT;
BEGIN
  SELECT COUNT(*) INTO sin_mapear FROM "Kardex" t
  LEFT JOIN "ScanTypeCatalog" c ON c."name" = t."scanType"::text
  WHERE t."scanTypeId" IS DISTINCT FROM c."id";
  IF sin_mapear > 0 THEN
    RAISE EXCEPTION 'Backfill Kardex.scanTypeId: % filas sin mapear', sin_mapear;
  END IF;
END $$;
DO $$
DECLARE sin_mapear INT;
BEGIN
  SELECT COUNT(*) INTO sin_mapear FROM "Incident" t
  LEFT JOIN "IncidentStatusCatalog" c ON c."name" = t."status"::text
  WHERE t."statusId" IS DISTINCT FROM c."id";
  IF sin_mapear > 0 THEN
    RAISE EXCEPTION 'Backfill Incident.statusId: % filas sin mapear', sin_mapear;
  END IF;
END $$;
DO $$
DECLARE sin_mapear INT;
BEGIN
  SELECT COUNT(*) INTO sin_mapear FROM "Round" t
  LEFT JOIN "RoundStatusCatalog" c ON c."name" = t."status"::text
  WHERE t."statusId" IS DISTINCT FROM c."id";
  IF sin_mapear > 0 THEN
    RAISE EXCEPTION 'Backfill Round.statusId: % filas sin mapear', sin_mapear;
  END IF;
END $$;
DO $$
DECLARE sin_mapear INT;
BEGIN
  SELECT COUNT(*) INTO sin_mapear FROM "Maintenance" t
  LEFT JOIN "MaintenanceStatusCatalog" c ON c."name" = t."status"::text
  WHERE t."statusId" IS DISTINCT FROM c."id";
  IF sin_mapear > 0 THEN
    RAISE EXCEPTION 'Backfill Maintenance.statusId: % filas sin mapear', sin_mapear;
  END IF;
END $$;

-- Doble escritura: cada INSERT/UPDATE de la columna enum fija también la FK.
CREATE OR REPLACE FUNCTION sync_assignment_status_catalog() RETURNS trigger AS $$
BEGIN
  NEW."statusId" := (SELECT c."id" FROM "AssignmentStatusCatalog" c WHERE c."name" = NEW."status"::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_assignment_status_catalog_trg BEFORE INSERT OR UPDATE OF "status" ON "Assignment"
  FOR EACH ROW EXECUTE FUNCTION sync_assignment_status_catalog();
CREATE OR REPLACE FUNCTION sync_invitation_status_catalog() RETURNS trigger AS $$
BEGIN
  NEW."statusId" := (SELECT c."id" FROM "InvitationStatusCatalog" c WHERE c."name" = NEW."status"::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_invitation_status_catalog_trg BEFORE INSERT OR UPDATE OF "status" ON "Invitation"
  FOR EACH ROW EXECUTE FUNCTION sync_invitation_status_catalog();
CREATE OR REPLACE FUNCTION sync_kardex_scantype_catalog() RETURNS trigger AS $$
BEGIN
  NEW."scanTypeId" := (SELECT c."id" FROM "ScanTypeCatalog" c WHERE c."name" = NEW."scanType"::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_kardex_scantype_catalog_trg BEFORE INSERT OR UPDATE OF "scanType" ON "Kardex"
  FOR EACH ROW EXECUTE FUNCTION sync_kardex_scantype_catalog();
CREATE OR REPLACE FUNCTION sync_incident_status_catalog() RETURNS trigger AS $$
BEGIN
  NEW."statusId" := (SELECT c."id" FROM "IncidentStatusCatalog" c WHERE c."name" = NEW."status"::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_incident_status_catalog_trg BEFORE INSERT OR UPDATE OF "status" ON "Incident"
  FOR EACH ROW EXECUTE FUNCTION sync_incident_status_catalog();
CREATE OR REPLACE FUNCTION sync_round_status_catalog() RETURNS trigger AS $$
BEGIN
  NEW."statusId" := (SELECT c."id" FROM "RoundStatusCatalog" c WHERE c."name" = NEW."status"::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_round_status_catalog_trg BEFORE INSERT OR UPDATE OF "status" ON "Round"
  FOR EACH ROW EXECUTE FUNCTION sync_round_status_catalog();
CREATE OR REPLACE FUNCTION sync_maintenance_status_catalog() RETURNS trigger AS $$
BEGIN
  NEW."statusId" := (SELECT c."id" FROM "MaintenanceStatusCatalog" c WHERE c."name" = NEW."status"::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_maintenance_status_catalog_trg BEFORE INSERT OR UPDATE OF "status" ON "Maintenance"
  FOR EACH ROW EXECUTE FUNCTION sync_maintenance_status_catalog();
