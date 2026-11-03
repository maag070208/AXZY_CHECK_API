-- Multicliente, fase 3: rol CLIENT (administrador del cliente: residencial, plaza o maquila).
-- El usuario CLIENT queda ligado directamente a su cliente; el alcance de su token sale de esa liga y no
-- puede elegir otro cliente. Los guardias siguen llegando al cliente por GuardAssignment y los residentes
-- por su propiedad, así que la columna es NULLABLE y solo la usan los usuarios CLIENT.
-- Verificación: scripts/multi-tenant/verify-client-role.sql.
-- Rollback: scripts/multi-tenant/rollback-client-role.sql y luego borrar la fila de esta migración.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "clientId" INTEGER;

-- CreateIndex
CREATE INDEX "User_clientId_idx" ON "User"("clientId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
