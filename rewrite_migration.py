import re

new_sql = """-- Rename old Enums to free up the namespace
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "PropertyType" RENAME TO "PropertyType_old";
ALTER TYPE "PropertyStatus" RENAME TO "PropertyStatus_old";
ALTER TYPE "InvitationType" RENAME TO "InvitationType_old";

-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "PropertyType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyStatus" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "PropertyStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvitationType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "InvitationType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResidentRelationship" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResidentRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyType_name_key" ON "PropertyType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyStatus_name_key" ON "PropertyStatus"("name");

-- CreateIndex
CREATE UNIQUE INDEX "InvitationType_name_key" ON "InvitationType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ResidentRelationship_name_key" ON "ResidentRelationship"("name");

-- Seed data for smooth migration
INSERT INTO "Role" (name, value) VALUES ('ADMIN', 'Administrador'), ('GUARD', 'Guardia'), ('SHIFT', 'Jefe de Turno'), ('MAINT', 'Mantenimiento'), ('RESDN', 'Residente');
INSERT INTO "PropertyType" (name, value) VALUES ('CASA', 'Casa Habitación'), ('DEPA', 'Departamento'), ('TERRE', 'Terreno');
INSERT INTO "PropertyStatus" (name, value) VALUES ('VACNT', 'Vacante'), ('HABIT', 'Habitada'), ('CONST', 'En Construcción'), ('BLOCK', 'Bloqueada');
INSERT INTO "InvitationType" (name, value) VALUES ('VISITOR', 'Visita Común'), ('PROVIDER', 'Proveedor / Delivery'), ('SERVICE', 'Servicios Técnicos'), ('RESIDENT', 'Residente'), ('COMMON', 'Áreas Comunes');

-- AlterTable to add new ID columns as nullable first
ALTER TABLE "Invitation" ADD COLUMN "typeId" INTEGER;
ALTER TABLE "Property" ADD COLUMN "statusId" INTEGER;
ALTER TABLE "Property" ADD COLUMN "typeId" INTEGER;
ALTER TABLE "User" ADD COLUMN "roleId" INTEGER;
ALTER TABLE "ResidentContact" ADD COLUMN "relationship" TEXT;

-- Migrate Data safely using explicit castings
UPDATE "User" SET "roleId" = "Role"."id" FROM "Role" WHERE "User"."role"::text = "Role"."name";
UPDATE "Property" SET "typeId" = "PropertyType"."id" FROM "PropertyType" WHERE "Property"."type"::text = "PropertyType"."name";
UPDATE "Property" SET "statusId" = "PropertyStatus"."id" FROM "PropertyStatus" WHERE "Property"."status"::text = "PropertyStatus"."name";
UPDATE "Invitation" SET "typeId" = "InvitationType"."id" FROM "InvitationType" WHERE "Invitation"."type"::text = "InvitationType"."name";

-- Provide fallback for missing matches (to prevent NOT NULL violation)
UPDATE "User" SET "roleId" = (SELECT id FROM "Role" LIMIT 1) WHERE "roleId" IS NULL;
UPDATE "Property" SET "typeId" = (SELECT id FROM "PropertyType" LIMIT 1) WHERE "typeId" IS NULL;
UPDATE "Property" SET "statusId" = (SELECT id FROM "PropertyStatus" LIMIT 1) WHERE "statusId" IS NULL;
UPDATE "Invitation" SET "typeId" = (SELECT id FROM "InvitationType" LIMIT 1) WHERE "typeId" IS NULL;

-- AlterTable Drop old columns and enforce NOT NULL on new columns
ALTER TABLE "Invitation" ALTER COLUMN "typeId" SET NOT NULL, DROP COLUMN "type";
ALTER TABLE "Property" ALTER COLUMN "statusId" SET NOT NULL, ALTER COLUMN "typeId" SET NOT NULL, DROP COLUMN "status", DROP COLUMN "type";
ALTER TABLE "User" ALTER COLUMN "roleId" SET NOT NULL, DROP COLUMN "role";

-- DropEnum
DROP TYPE "InvitationType_old";
DROP TYPE "PropertyStatus_old";
DROP TYPE "PropertyType_old";
DROP TYPE "Role_old";

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "PropertyType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "PropertyStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "InvitationType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
"""

with open("prisma/migrations/20260423063041_update_to_catalogs/migration.sql", "w") as f:
    f.write(new_sql)
