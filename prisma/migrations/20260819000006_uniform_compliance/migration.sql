-- Cambia la semántica de UniformCheck.severity: pasa de severidad
-- disciplinaria (LEVE/REINCIDENTE/GRAVE) a cumplimiento por ítems cumplidos
-- (EXCELENTE 7-9, MEDIO 4-6, MALO 0-3).

-- 1. Crea el enum UniformCompliance.
DO $$
BEGIN
    CREATE TYPE "UniformCompliance" AS ENUM ('EXCELENTE', 'MEDIO', 'MALO');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Elimina el default del enum fuente y convierte la columna a texto.
ALTER TABLE "UniformCheck" ALTER COLUMN "severity" DROP DEFAULT;
ALTER TABLE "UniformCheck" ALTER COLUMN "severity" TYPE TEXT;

-- 4. Asigna cumplimiento desde failedCount (regla de negocio).
UPDATE "UniformCheck" SET "severity" = CASE
    WHEN "failedCount" >= 6 THEN 'MALO'
    WHEN "failedCount" >= 3 THEN 'MEDIO'
    ELSE 'EXCELENTE'
END;

-- 5. Convierte al nuevo enum.
ALTER TABLE "UniformCheck" ALTER COLUMN "severity" TYPE "UniformCompliance" USING ("severity"::"UniformCompliance");
ALTER TABLE "UniformCheck" ALTER COLUMN "severity" SET DEFAULT 'EXCELENTE';
ALTER TABLE "UniformCheck" ALTER COLUMN "severity" SET NOT NULL;