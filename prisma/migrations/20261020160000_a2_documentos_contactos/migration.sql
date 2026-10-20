-- AlterTable
ALTER TABLE "MediaFile" ADD COLUMN     "isPrivate" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DocumentKind" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hasBack" BOOLEAN NOT NULL DEFAULT false,
    "expires" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DocumentKind_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonDocument" (
    "id" SERIAL NOT NULL,
    "personId" INTEGER NOT NULL,
    "kindId" INTEGER NOT NULL,
    "mediaFileId" INTEGER NOT NULL,
    "expiresAt" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonContact" (
    "id" SERIAL NOT NULL,
    "personId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "relationship" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentKind_code_key" ON "DocumentKind"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PersonDocument_mediaFileId_key" ON "PersonDocument"("mediaFileId");

-- CreateIndex
CREATE INDEX "PersonDocument_personId_idx" ON "PersonDocument"("personId");

-- CreateIndex
CREATE INDEX "PersonDocument_expiresAt_idx" ON "PersonDocument"("expiresAt");

-- CreateIndex
CREATE INDEX "PersonContact_personId_idx" ON "PersonContact"("personId");

-- AddForeignKey
ALTER TABLE "PersonDocument" ADD CONSTRAINT "PersonDocument_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonDocument" ADD CONSTRAINT "PersonDocument_kindId_fkey" FOREIGN KEY ("kindId") REFERENCES "DocumentKind"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonDocument" ADD CONSTRAINT "PersonDocument_mediaFileId_fkey" FOREIGN KEY ("mediaFileId") REFERENCES "MediaFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonContact" ADD CONSTRAINT "PersonContact_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Tipos de documento (T-A2-07). Administrables.
INSERT INTO "DocumentKind" ("code", "name", "hasBack", "expires", "active", "isSystem", "order") VALUES
  ('INE', 'Identificación oficial (INE)', true, true, true, true, 0),
  ('CONTRACT', 'Contrato de arrendamiento', false, true, true, true, 1),
  ('OTHER', 'Otro documento', false, false, true, true, 2)
ON CONFLICT ("code") DO NOTHING;

-- Permiso de documentos: solo ADMIN (datos sensibles; el guardia no los ve, T-A2-T9).
INSERT INTO "Permission" ("code", "description") VALUES ('documents.view', 'Consultar documentos privados de personas')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r JOIN "Permission" p ON p."code" = 'documents.view'
WHERE r."name" = 'ADMIN'
ON CONFLICT DO NOTHING;
