-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "valueType" TEXT NOT NULL DEFAULT 'string',
    "value" TEXT NOT NULL,
    "group" TEXT NOT NULL DEFAULT 'general',
    "description" TEXT,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);


-- Copia los ajustes existentes de SysConfig (no sobrescribe si ya existen).
INSERT INTO "AppSetting" ("key", "valueType", "value", "group", "description", "isSecret", "updatedAt")
SELECT "key", 'string', "value", 'legacy', NULL, false, now() FROM "SysConfig"
ON CONFLICT ("key") DO NOTHING;
