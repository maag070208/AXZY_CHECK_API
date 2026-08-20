-- Separa el checklist de uniforme de ShiftCheck a su propia entidad
-- (UniformCheck). El uniforme se aplica por guardia de forma independiente
-- al cambio de turno.

-- 1. Crea el tipo UniformContext (si no existe).
DO $$ BEGIN
    CREATE TYPE "UniformContext" AS ENUM ('SHIFT', 'ROUND', 'SPOT', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Crea la tabla UniformCheck.
CREATE TABLE "UniformCheck" (
    "id" TEXT NOT NULL,
    "clientRef" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "items" JSONB NOT NULL,
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'LEVE',
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "observations" TEXT,
    "checkedById" INTEGER NOT NULL,
    "context" "UniformContext" NOT NULL DEFAULT 'SHIFT',
    "shiftCheckId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UniformCheck_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UniformCheck_clientRef_key" ON "UniformCheck"("clientRef");
CREATE INDEX "UniformCheck_userId_checkedAt_idx" ON "UniformCheck"("userId", "checkedAt");
CREATE INDEX "UniformCheck_shiftCheckId_idx" ON "UniformCheck"("shiftCheckId");
CREATE INDEX "UniformCheck_checkedById_idx" ON "UniformCheck"("checkedById");

ALTER TABLE "UniformCheck" ADD CONSTRAINT "UniformCheck_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UniformCheck" ADD CONSTRAINT "UniformCheck_checkedById_fkey"
    FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UniformCheck" ADD CONSTRAINT "UniformCheck_shiftCheckId_fkey"
    FOREIGN KEY ("shiftCheckId") REFERENCES "ShiftCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Elimina la columna uniformCheck de ShiftCheck (se movió a su propia tabla).
ALTER TABLE "ShiftCheck" DROP COLUMN IF EXISTS "uniformCheck";
