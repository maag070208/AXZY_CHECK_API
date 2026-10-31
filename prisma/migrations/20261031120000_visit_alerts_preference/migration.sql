-- Preferencia del residente: recibir o no avisos cuando sus visitas entran o salen. Aditiva.
-- Rollback: ALTER TABLE "User" DROP COLUMN "visitAlertsEnabled";
ALTER TABLE "User" ADD COLUMN "visitAlertsEnabled" BOOLEAN NOT NULL DEFAULT true;
