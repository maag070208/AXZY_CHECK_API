-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "buildingId" INTEGER,
ADD COLUMN     "floor" INTEGER,
ADD COLUMN     "kindId" INTEGER,
ADD COLUMN     "maxResidents" INTEGER,
ADD COLUMN     "occupancyStatusId" INTEGER,
ADD COLUMN     "ownerPersonId" INTEGER,
ADD COLUMN     "residentCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unitNumber" TEXT,
ADD COLUMN     "vehicleQuota" INTEGER;

-- CreateTable
CREATE TABLE "PropertyKind" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isUnitContainer" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PropertyKind_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OccupancyStatus" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isOccupied" BOOLEAN NOT NULL DEFAULT false,
    "allowsResidents" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OccupancyStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OccupancyStatusTransition" (
    "fromId" INTEGER NOT NULL,
    "toId" INTEGER NOT NULL,

    CONSTRAINT "OccupancyStatusTransition_pkey" PRIMARY KEY ("fromId","toId")
);

-- CreateTable
CREATE TABLE "Building" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "floors" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" SERIAL NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OccupancyPeriod" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "statusId" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "tenantPersonId" INTEGER,
    "ownerPersonId" INTEGER,
    "notes" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OccupancyPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnershipChange" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "fromPersonId" INTEGER,
    "toPersonId" INTEGER NOT NULL,
    "changedById" INTEGER,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "OwnershipChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertyKind_code_key" ON "PropertyKind"("code");

-- CreateIndex
CREATE UNIQUE INDEX "OccupancyStatus_code_key" ON "OccupancyStatus"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Building_name_key" ON "Building"("name");

-- CreateIndex
CREATE INDEX "OccupancyPeriod_propertyId_startDate_idx" ON "OccupancyPeriod"("propertyId", "startDate");

-- CreateIndex
CREATE INDEX "OwnershipChange_propertyId_idx" ON "OwnershipChange"("propertyId");

-- CreateIndex
CREATE INDEX "Property_occupancyStatusId_idx" ON "Property"("occupancyStatusId");

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_kindId_fkey" FOREIGN KEY ("kindId") REFERENCES "PropertyKind"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_occupancyStatusId_fkey" FOREIGN KEY ("occupancyStatusId") REFERENCES "OccupancyStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccupancyStatusTransition" ADD CONSTRAINT "OccupancyStatusTransition_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "OccupancyStatus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccupancyStatusTransition" ADD CONSTRAINT "OccupancyStatusTransition_toId_fkey" FOREIGN KEY ("toId") REFERENCES "OccupancyStatus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccupancyPeriod" ADD CONSTRAINT "OccupancyPeriod_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccupancyPeriod" ADD CONSTRAINT "OccupancyPeriod_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "OccupancyStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccupancyPeriod" ADD CONSTRAINT "OccupancyPeriod_tenantPersonId_fkey" FOREIGN KEY ("tenantPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccupancyPeriod" ADD CONSTRAINT "OccupancyPeriod_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipChange" ADD CONSTRAINT "OwnershipChange_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipChange" ADD CONSTRAINT "OwnershipChange_fromPersonId_fkey" FOREIGN KEY ("fromPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipChange" ADD CONSTRAINT "OwnershipChange_toPersonId_fkey" FOREIGN KEY ("toPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===== A1: datos de catálogo, backfill y verificación =====

-- Tipos de unidad (T-A1-01). Administrables: agregar valores no requiere código.
INSERT INTO "PropertyKind" ("code", "name", "isUnitContainer", "active", "isSystem", "order") VALUES
  ('HOUSE', 'Casa', false, true, true, 0),
  ('APARTMENT', 'Departamento', false, true, true, 1),
  ('COMMERCIAL', 'Local', false, true, true, 2),
  ('LOT', 'Terreno', false, true, true, 3),
  ('COMMON', 'Área común', false, true, true, 4)
ON CONFLICT ("code") DO NOTHING;

-- Estados de ocupación (T-A1-01). Reemplazan a PropertyStatus (que no distingue propietario de inquilino).
INSERT INTO "OccupancyStatus" ("code", "name", "isOccupied", "allowsResidents", "active", "isSystem", "order") VALUES
  ('VACANT', 'Vacía', false, false, true, true, 0),
  ('OWNER_OCCUPIED', 'Habitada por propietario', true, true, true, true, 1),
  ('RENTED', 'Rentada', true, true, true, true, 2),
  ('FOR_RENT', 'En renta', false, false, true, true, 3),
  ('FOR_SALE', 'En venta', false, false, true, true, 4),
  ('UNDER_CONSTRUCTION', 'En construcción', false, false, true, true, 5),
  ('BLOCKED', 'Bloqueada', false, false, true, true, 6)
ON CONFLICT ("code") DO NOTHING;

-- Transiciones válidas (datos, no código). Bloqueada puede aplicarse desde cualquier estado.
INSERT INTO "OccupancyStatusTransition" ("fromId", "toId")
SELECT f."id", t."id"
FROM (VALUES
  ('VACANT', 'OWNER_OCCUPIED'), ('VACANT', 'RENTED'), ('VACANT', 'FOR_RENT'), ('VACANT', 'FOR_SALE'),
  ('VACANT', 'UNDER_CONSTRUCTION'), ('VACANT', 'BLOCKED'),
  ('FOR_RENT', 'RENTED'), ('FOR_RENT', 'VACANT'), ('FOR_RENT', 'BLOCKED'),
  ('RENTED', 'VACANT'), ('RENTED', 'OWNER_OCCUPIED'), ('RENTED', 'BLOCKED'),
  ('OWNER_OCCUPIED', 'VACANT'), ('OWNER_OCCUPIED', 'RENTED'), ('OWNER_OCCUPIED', 'BLOCKED'),
  ('FOR_SALE', 'VACANT'), ('FOR_SALE', 'BLOCKED'),
  ('UNDER_CONSTRUCTION', 'VACANT'), ('UNDER_CONSTRUCTION', 'BLOCKED'),
  ('BLOCKED', 'VACANT')
) AS m("fromCode", "toCode")
JOIN "OccupancyStatus" f ON f."code" = m."fromCode"
JOIN "OccupancyStatus" t ON t."code" = m."toCode"
ON CONFLICT DO NOTHING;

-- Backfill (T-A1-06): PropertyType → PropertyKind. Un tipo no mapeado falla la migración.
UPDATE "Property" p
SET "kindId" = k."id"
FROM "PropertyType" pt
JOIN "PropertyKind" k ON k."code" = CASE pt."name"
  WHEN 'CASA' THEN 'HOUSE'
  WHEN 'DEPA' THEN 'APARTMENT'
  WHEN 'TERRE' THEN 'LOT'
END
WHERE pt."id" = p."typeId";

-- Backfill (T-A1-06): PropertyStatus → OccupancyStatus. HABIT se mapea a OWNER_OCCUPIED:
-- el estado anterior no distinguía propietario de inquilino; revisar después de migrar.
UPDATE "Property" p
SET "occupancyStatusId" = o."id"
FROM "PropertyStatus" ps
JOIN "OccupancyStatus" o ON o."code" = CASE ps."name"
  WHEN 'VACNT' THEN 'VACANT'
  WHEN 'HABIT' THEN 'OWNER_OCCUPIED'
  WHEN 'CONST' THEN 'UNDER_CONSTRUCTION'
  WHEN 'BLOCK' THEN 'BLOCKED'
END
WHERE ps."id" = p."statusId";

-- Periodo vigente inicial para cada propiedad existente (T-A1-03).
INSERT INTO "OccupancyPeriod" ("propertyId", "statusId", "startDate", "endDate", "createdAt")
SELECT p."id", p."occupancyStatusId", CURRENT_DATE, NULL, now()
FROM "Property" p
WHERE NOT EXISTS (SELECT 1 FROM "OccupancyPeriod" op WHERE op."propertyId" = p."id");

-- Conteo de residentes: usuarios RESDN activos vinculados a la propiedad (T-A1-06).
UPDATE "Property" p
SET "residentCount" = (
  SELECT COUNT(*)::int FROM "User" u
  JOIN "Role" r ON r."id" = u."roleId"
  WHERE u."propertyId" = p."id" AND u."active" = true AND r."name" = 'RESDN'
);

-- Verificación: ninguna propiedad puede quedar sin tipo u ocupación.
DO $$
DECLARE sin_mapear INT;
BEGIN
  SELECT COUNT(*) INTO sin_mapear FROM "Property" WHERE "kindId" IS NULL OR "occupancyStatusId" IS NULL;
  IF sin_mapear > 0 THEN
    RAISE EXCEPTION 'A1: % propiedades sin tipo u ocupación mapeados; revisar PropertyType/PropertyStatus', sin_mapear;
  END IF;
END $$;

ALTER TABLE "Property" ALTER COLUMN "kindId" SET NOT NULL, ALTER COLUMN "occupancyStatusId" SET NOT NULL;

-- Un solo periodo vigente por propiedad (T-A1-03). Prisma no expresa índices parciales:
-- esta línea vive solo en la migración (ver tests/domain/schema-drift.spec.ts).
CREATE UNIQUE INDEX "OccupancyPeriod_open_key" ON "OccupancyPeriod"("propertyId") WHERE "endDate" IS NULL;

-- Permisos de ocupación (T-A1-07): consulta para ADMIN y jefe de turno; cambio solo ADMIN.
INSERT INTO "Permission" ("code", "description") VALUES
  ('properties.view', 'Consultar propiedades y su ocupación'),
  ('occupancy.change', 'Cambiar la ocupación de una propiedad')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM (VALUES
  ('ADMIN', 'properties.view'), ('ADMIN', 'occupancy.change'),
  ('SHIFT', 'properties.view')
) AS m("role", "code")
JOIN "Role" r ON r."name" = m."role"
JOIN "Permission" p ON p."code" = m."code"
ON CONFLICT DO NOTHING;
