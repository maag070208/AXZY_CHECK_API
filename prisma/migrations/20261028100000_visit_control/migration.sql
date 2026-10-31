-- Control de visitas (plan 1): placa esperada, visitas sin cita con autorización del residente,
-- tipo de visita que no requiere autorización (repartidores) y permiso de aprobación.
-- Aditiva: no cambia filas existentes (los pases actuales siguen PENDING, no son sin cita y requieren autorización).
-- Rollback:
--   DELETE FROM "RolePermission" WHERE "permissionId" IN (SELECT "id" FROM "Permission" WHERE "code" = 'invitation.approve');
--   DELETE FROM "Permission" WHERE "code" = 'invitation.approve';
--   DELETE FROM "InvitationType" WHERE "name" = 'DELIVERY';
--   DELETE FROM "InvitationStatusCatalog" WHERE "name" = 'PENDING_APPROVAL';
--   DELETE FROM "AppSetting" WHERE "key" = 'visit.maxStayHours';
--   ALTER TABLE "InvitationType" DROP COLUMN "requiresApproval";
--   ALTER TABLE "Invitation" DROP COLUMN "approvedAt", DROP COLUMN "approvedById", DROP COLUMN "walkIn", DROP COLUMN "expectedPlate";
--   (PENDING_APPROVAL no se puede quitar de un enum sin recrearlo; si hay filas en ese estado, pasarlas a CANCELLED antes.)

ALTER TYPE "InvitationStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL' BEFORE 'PENDING';

ALTER TABLE "Invitation"
  ADD COLUMN "expectedPlate" TEXT,
  ADD COLUMN "walkIn" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "approvedById" INTEGER,
  ADD COLUMN "approvedAt" TIMESTAMP(3);

ALTER TABLE "Invitation"
  ADD CONSTRAINT "Invitation_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Invitation_expectedPlate_idx" ON "Invitation"("expectedPlate");

ALTER TABLE "InvitationType" ADD COLUMN "requiresApproval" BOOLEAN NOT NULL DEFAULT true;

INSERT INTO "InvitationType" ("name", "value", "active", "order", "isSystem", "requiresApproval") VALUES
  ('DELIVERY', 'Repartidor / entrega', true, 90, true, false)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "InvitationStatusCatalog" ("name", "value", "order", "active", "isSystem") VALUES
  ('PENDING_APPROVAL', 'Por autorizar', 0, true, true)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "Permission" ("code", "description") VALUES
  ('invitation.approve', 'Autorizar o rechazar visitas sin cita de su propiedad (residente) o escalarlas (jefe, admin)')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."code" = 'invitation.approve'
WHERE r."name" IN ('ADMIN', 'SHIFT', 'RESDN')
ON CONFLICT DO NOTHING;

-- Permanencia máxima dentro (horas) antes de marcar la visita como fuera de tiempo en caseta.
INSERT INTO "AppSetting" ("key", "valueType", "value", "group", "description", "isSecret", "updatedAt") VALUES
  ('visit.maxStayHours', 'int', '12', 'visitas', 'Horas máximas que una visita puede permanecer dentro antes de marcarla fuera de tiempo', false, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
