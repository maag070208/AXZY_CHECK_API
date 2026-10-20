-- CreateEnum
CREATE TYPE "AuthorizationScope" AS ENUM ('PEDESTRIAN', 'VEHICLE', 'BOTH');

-- CreateTable
CREATE TABLE "PropertyAuthorization" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "personId" INTEGER NOT NULL,
    "scope" "AuthorizationScope" NOT NULL DEFAULT 'PEDESTRIAN',
    "days" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "validUntil" DATE,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PropertyAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PropertyAuthorization_propertyId_personId_idx" ON "PropertyAuthorization"("propertyId", "personId");

-- AddForeignKey
ALTER TABLE "PropertyAuthorization" ADD CONSTRAINT "PropertyAuthorization_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyAuthorization" ADD CONSTRAINT "PropertyAuthorization_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Permiso de consulta de acceso para la caseta (guardias incluidos).
INSERT INTO "Permission" ("code", "description") VALUES ('access.check', 'Consultar si una persona puede entrar a una propiedad')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM (VALUES ('ADMIN', 'access.check'), ('SHIFT', 'access.check'), ('GUARD', 'access.check')) AS m("role", "code")
JOIN "Role" r ON r."name" = m."role"
JOIN "Permission" p ON p."code" = m."code"
ON CONFLICT DO NOTHING;
