-- Módulo 13 fase 2: reapertura de quejas y cierre automático.
-- `byUserId` nullable: null = transición automática del sistema (cierre a los 7 días).
-- Rollback: ALTER TABLE "ComplaintEvent" ALTER COLUMN "byUserId" SET NOT NULL;
--           (no se puede quitar un valor de enum en Postgres sin recrear el tipo)
ALTER TYPE "ComplaintStatus" ADD VALUE IF NOT EXISTS 'REOPENED';
ALTER TABLE "ComplaintEvent" ALTER COLUMN "byUserId" DROP NOT NULL;
ALTER TABLE "ComplaintEvent" DROP CONSTRAINT "ComplaintEvent_byUserId_fkey";
ALTER TABLE "ComplaintEvent" ADD CONSTRAINT "ComplaintEvent_byUserId_fkey" FOREIGN KEY ("byUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Complaint_status_resolvedAt_idx" ON "Complaint"("status", "resolvedAt");
