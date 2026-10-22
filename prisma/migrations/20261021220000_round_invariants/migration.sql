-- Reglas de integridad para evitar rondas implícitas/duplicadas.
CREATE UNIQUE INDEX "Round_one_active_per_guard"
  ON "Round" ("guardId")
  WHERE "status" = 'IN_PROGRESS';

ALTER TABLE "Round"
  ADD CONSTRAINT "Round_end_after_start"
  CHECK ("endTime" IS NULL OR "endTime" >= "startTime");

ALTER TABLE "Round"
  ADD CONSTRAINT "Round_offline_has_sync"
  CHECK (NOT "createdOffline" OR "syncedAt" IS NOT NULL);

ALTER TABLE "Kardex"
  ADD CONSTRAINT "Kardex_offline_has_sync"
  CHECK (NOT "createdOffline" OR "syncedAt" IS NOT NULL);

ALTER TABLE "Incident"
  ADD CONSTRAINT "Incident_offline_has_sync"
  CHECK (NOT "createdOffline" OR "syncedAt" IS NOT NULL);

ALTER TABLE "Maintenance"
  ADD CONSTRAINT "Maintenance_offline_has_sync"
  CHECK (NOT "createdOffline" OR "syncedAt" IS NOT NULL);
