-- Multicliente, fase 0 (expandir): Organization, Client y GuardAssignment, y `clientId` / `organizationId`
-- en las tablas de operación. Las columnas nuevas quedan NULLABLE: el NOT NULL va en la migración que cierra
-- la fase 2, cuando todas las escrituras de la API ya asignen el cliente.
-- Relleno (producto 1, sin pérdida): si la base ya tiene usuarios, se crea la organización "Residencial actual"
-- (DIRECT) con su cliente por defecto (RESIDENTIAL), se asignan todas las filas existentes a ese cliente y cada
-- guardia o jefe de turno (GUARD, SHIFT) no borrado recibe una asignación abierta. En una base vacía no se crea nada.
-- No agrega ni quita filas de tablas existentes.
-- Verificación: scripts/multi-tenant/counts.sql (antes y después) y scripts/multi-tenant/verify.sql (después).
-- Rollback: scripts/multi-tenant/rollback-expand.sql, y luego
--   DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261102120000_multi_tenant_expand';

-- CreateEnum
CREATE TYPE "OrganizationKind" AS ENUM ('DIRECT', 'COMPANY');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('RESIDENTIAL', 'MAQUILA', 'PLAZA');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "organizationId" INTEGER;

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "clientId" INTEGER;

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "clientId" INTEGER;

-- AlterTable
ALTER TABLE "Kardex" ADD COLUMN     "clientId" INTEGER;

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "clientId" INTEGER;

-- AlterTable
ALTER TABLE "RecurringConfiguration" ADD COLUMN     "clientId" INTEGER;

-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "clientId" INTEGER;

-- AlterTable
ALTER TABLE "Round" ADD COLUMN     "clientId" INTEGER;

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "clientId" INTEGER;

-- CreateTable
CREATE TABLE "Organization" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "OrganizationKind" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ClientType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardAssignment" (
    "id" SERIAL NOT NULL,
    "guardId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_organizationId_name_key" ON "Client"("organizationId", "name");

-- CreateIndex
CREATE INDEX "GuardAssignment_guardId_idx" ON "GuardAssignment"("guardId");

-- CreateIndex
CREATE INDEX "GuardAssignment_clientId_endsAt_idx" ON "GuardAssignment"("clientId", "endsAt");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "Property_clientId_idx" ON "Property"("clientId");

-- CreateIndex
CREATE INDEX "Location_clientId_idx" ON "Location"("clientId");

-- CreateIndex
CREATE INDEX "Kardex_clientId_timestamp_idx" ON "Kardex"("clientId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "Assignment_clientId_idx" ON "Assignment"("clientId");

-- CreateIndex
CREATE INDEX "RecurringConfiguration_clientId_idx" ON "RecurringConfiguration"("clientId");

-- CreateIndex
CREATE INDEX "Incident_clientId_createdAt_idx" ON "Incident"("clientId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Round_clientId_startTime_idx" ON "Round"("clientId", "startTime" DESC);

-- CreateIndex
CREATE INDEX "Announcement_clientId_sentAt_idx" ON "Announcement"("clientId", "sentAt" DESC);

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardAssignment" ADD CONSTRAINT "GuardAssignment_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardAssignment" ADD CONSTRAINT "GuardAssignment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kardex" ADD CONSTRAINT "Kardex_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringConfiguration" ADD CONSTRAINT "RecurringConfiguration_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Un guardia solo puede tener una asignación abierta. Prisma no declara índices parciales ni CHECK:
-- están solo aquí (ver comentario de GuardAssignment en schema.prisma).
CREATE UNIQUE INDEX "GuardAssignment_guardId_open_key" ON "GuardAssignment"("guardId") WHERE "endsAt" IS NULL;
ALTER TABLE "GuardAssignment" ADD CONSTRAINT "GuardAssignment_dates_check" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt");

-- Relleno de producto 1.
DO $$
DECLARE
  org_id INTEGER;
  default_client_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "User") THEN
    RETURN;
  END IF;

  INSERT INTO "Organization" ("name", "kind", "updatedAt")
  VALUES ('Residencial actual', 'DIRECT', CURRENT_TIMESTAMP)
  RETURNING "id" INTO org_id;

  INSERT INTO "Client" ("organizationId", "name", "type", "updatedAt")
  VALUES (org_id, 'Residencial actual', 'RESIDENTIAL', CURRENT_TIMESTAMP)
  RETURNING "id" INTO default_client_id;

  UPDATE "User" SET "organizationId" = org_id;
  UPDATE "Property" SET "clientId" = default_client_id;
  UPDATE "Location" SET "clientId" = default_client_id;
  UPDATE "RecurringConfiguration" SET "clientId" = default_client_id;
  UPDATE "Assignment" SET "clientId" = default_client_id;
  UPDATE "Incident" SET "clientId" = default_client_id;
  UPDATE "Round" SET "clientId" = default_client_id;
  UPDATE "Kardex" SET "clientId" = default_client_id;
  UPDATE "Announcement" SET "clientId" = default_client_id;

  INSERT INTO "GuardAssignment" ("guardId", "clientId", "startsAt")
  SELECT u."id", default_client_id, u."createdAt"
  FROM "User" u
  JOIN "Role" r ON r."id" = u."roleId"
  WHERE r."name" IN ('GUARD', 'SHIFT') AND u."softDelete" = false;
END $$;
