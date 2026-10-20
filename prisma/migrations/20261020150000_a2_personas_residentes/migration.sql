-- CreateEnum
CREATE TYPE "ResidentStatus" AS ENUM ('ACTIVE', 'MOVED_OUT');

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "birthDate" DATE,
ADD COLUMN     "userId" INTEGER;

-- CreateTable
CREATE TABLE "ResidentKind" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isHouseholdMember" BOOLEAN NOT NULL DEFAULT false,
    "canAuthorizeVisits" BOOLEAN NOT NULL DEFAULT false,
    "canHaveVehicle" BOOLEAN NOT NULL DEFAULT false,
    "hasAppAccess" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ResidentKind_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resident" (
    "id" SERIAL NOT NULL,
    "personId" INTEGER NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "kindId" INTEGER NOT NULL,
    "status" "ResidentStatus" NOT NULL DEFAULT 'ACTIVE',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "canAuthorizeVisits" BOOLEAN NOT NULL DEFAULT false,
    "hasAppAccess" BOOLEAN NOT NULL DEFAULT false,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResidentKind_code_key" ON "ResidentKind"("code");

-- CreateIndex
CREATE INDEX "Resident_propertyId_status_idx" ON "Resident"("propertyId", "status");

-- CreateIndex
CREATE INDEX "Resident_personId_idx" ON "Resident"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "Person_userId_key" ON "Person"("userId");

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_kindId_fkey" FOREIGN KEY ("kindId") REFERENCES "ResidentKind"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ===== A2: tipos de residente, copia verificada y reglas =====

-- Tipos de residente (T-A2-01). isHouseholdMember decide si suma al conteo del hogar.
INSERT INTO "ResidentKind" ("code", "name", "isHouseholdMember", "canAuthorizeVisits", "canHaveVehicle", "hasAppAccess", "active", "isSystem", "order") VALUES
  ('OWNER', 'Propietario', true, true, true, true, true, true, 0),
  ('TENANT', 'Inquilino', true, true, true, true, true, true, 1),
  ('FAMILY', 'Familiar', true, false, true, false, true, true, 2),
  ('DOMESTIC', 'Empleado doméstico', false, false, false, false, true, true, 3),
  ('AUTHORIZED', 'Persona autorizada permanente', false, false, false, false, true, true, 4),
  ('CAREGIVER', 'Cuidador/a', false, false, false, false, true, true, 5)
ON CONFLICT ("code") DO NOTHING;

-- Edad mínima para tener cuenta de APP (supuesto: 18; configurable).
INSERT INTO "AppSetting" ("key", "valueType", "value", "group", "description", "isSecret", "updatedAt")
VALUES ('resident.minAgeForAccount', 'int', '18', 'residentes', 'Edad mínima para tener cuenta de APP', false, now())
ON CONFLICT ("key") DO NOTHING;

-- Copia (T-A2-09): cada residente activo (RESDN con propiedad) → Person + Resident OWNER.
-- Titular: el usuario de menor id por propiedad. Revisar en la operación.
INSERT INTO "Person" ("firstName", "lastName", "phone", "email", "userId", "createdAt", "updatedAt")
SELECT u."name", u."lastName", rp."phoneNumber", rp."email", u."id", now(), now()
FROM "User" u
JOIN "Role" r ON r."id" = u."roleId" AND r."name" = 'RESDN'
LEFT JOIN "ResidentProfile" rp ON rp."userId" = u."id"
WHERE u."propertyId" IS NOT NULL AND u."active" = true
  AND NOT EXISTS (SELECT 1 FROM "Person" p WHERE p."userId" = u."id");

INSERT INTO "Resident" ("personId", "propertyId", "kindId", "status", "isPrimary", "canAuthorizeVisits", "hasAppAccess", "startDate", "createdAt")
SELECT p."id", u."propertyId", k."id", 'ACTIVE',
  u."id" = MIN(u."id") OVER (PARTITION BY u."propertyId"),
  k."canAuthorizeVisits", true, u."createdAt"::date, now()
FROM "User" u
JOIN "Role" r ON r."id" = u."roleId" AND r."name" = 'RESDN'
JOIN "Person" p ON p."userId" = u."id"
JOIN "ResidentKind" k ON k."code" = 'OWNER'
WHERE u."propertyId" IS NOT NULL AND u."active" = true
  AND NOT EXISTS (SELECT 1 FROM "Resident" x WHERE x."personId" = p."id" AND x."propertyId" = u."propertyId" AND x."status" = 'ACTIVE');

-- Verificación (conteos antes = después): residentes activos = usuarios RESDN activos con propiedad.
DO $$
DECLARE esperados INT; reales INT; sin_titular INT;
BEGIN
  SELECT COUNT(*) INTO esperados FROM "User" u JOIN "Role" r ON r."id" = u."roleId"
    WHERE r."name" = 'RESDN' AND u."active" = true AND u."propertyId" IS NOT NULL;
  SELECT COUNT(*) INTO reales FROM "Resident" WHERE "status" = 'ACTIVE';
  IF esperados <> reales THEN
    RAISE EXCEPTION 'A2: residentes activos % vs usuarios RESDN activos %', reales, esperados;
  END IF;
  SELECT COUNT(*) INTO sin_titular FROM (
    SELECT "propertyId" FROM "Resident" WHERE "status" = 'ACTIVE'
    GROUP BY "propertyId" HAVING SUM(CASE WHEN "isPrimary" THEN 1 ELSE 0 END) <> 1
  ) x;
  IF sin_titular > 0 THEN
    RAISE EXCEPTION 'A2: % propiedades sin exactamente un titular', sin_titular;
  END IF;
END $$;

-- Reglas en base de datos (T-A2-T1, un vínculo activo por persona y propiedad). Índices parciales:
-- Prisma no los modela; se excluyen del diff por nombre en tests/domain/schema-drift.spec.ts.
CREATE UNIQUE INDEX "Resident_primary_active_key" ON "Resident"("propertyId") WHERE "isPrimary" AND "status" = 'ACTIVE';
CREATE UNIQUE INDEX "Resident_person_property_active_key" ON "Resident"("personId", "propertyId") WHERE "status" = 'ACTIVE';
