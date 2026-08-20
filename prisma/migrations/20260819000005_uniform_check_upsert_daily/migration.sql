-- Rastrea los Incident generados por cada UniformCheck para poder actualizarlos
-- en el upsert diario sin duplicarlos.
ALTER TABLE "UniformCheck" ADD COLUMN "incidentIds" JSONB;
ALTER TABLE "UniformCheck" ALTER COLUMN "checkedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- Upsert por guardia y día: checkedAt se normaliza al inicio del día en el
-- service, así un mismo (userId, checkedAt) identifica el registro del día.
-- Limpia duplicados previos de (userId, checkedAt) conservando el más reciente
-- antes de crear el índice único.
WITH ranked AS (
    SELECT id,
           row_number() OVER (
               PARTITION BY "userId", "checkedAt"
               ORDER BY "updatedAt" DESC
           ) AS rn
    FROM "UniformCheck"
)
DELETE FROM "UniformCheck" WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX "UniformCheck_userId_checkedAt_key"
    ON "UniformCheck" ("userId", "checkedAt");