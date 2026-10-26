-- Multa o infracción como tipo de cargo manual.
-- Rollback: no se puede quitar un valor de enum en Postgres sin recrear el tipo.
ALTER TYPE "ChargeCategory" ADD VALUE IF NOT EXISTS 'MULTA';
