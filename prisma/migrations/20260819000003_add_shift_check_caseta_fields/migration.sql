-- Campos de caseta en ShiftCheck (ajuste: Número de credenciales,
-- Número de tarjetones, Cuadro de texto para registro de novedades).
ALTER TABLE "ShiftCheck"
    ADD COLUMN "credentialsCount" INTEGER,
    ADD COLUMN "tarjetonesCount" INTEGER,
    ADD COLUMN "novedadesCaseta" TEXT;
