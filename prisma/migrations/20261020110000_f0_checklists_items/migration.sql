-- CreateTable
CREATE TABLE "UniformItem" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UniformItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniformCheckItem" (
    "uniformCheckId" INTEGER NOT NULL,
    "uniformItemId" INTEGER NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UniformCheckItem_pkey" PRIMARY KEY ("uniformCheckId","uniformItemId")
);

-- CreateTable
CREATE TABLE "HandoverChecklistItem" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "HandoverChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftHandoverCheck" (
    "shiftHandoverId" INTEGER NOT NULL,
    "handoverChecklistItemId" INTEGER NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ShiftHandoverCheck_pkey" PRIMARY KEY ("shiftHandoverId","handoverChecklistItemId")
);

-- CreateIndex
CREATE UNIQUE INDEX "UniformItem_name_key" ON "UniformItem"("name");

-- CreateIndex
CREATE UNIQUE INDEX "HandoverChecklistItem_name_key" ON "HandoverChecklistItem"("name");

-- AddForeignKey
ALTER TABLE "UniformCheckItem" ADD CONSTRAINT "UniformCheckItem_uniformCheckId_fkey" FOREIGN KEY ("uniformCheckId") REFERENCES "UniformCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniformCheckItem" ADD CONSTRAINT "UniformCheckItem_uniformItemId_fkey" FOREIGN KEY ("uniformItemId") REFERENCES "UniformItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftHandoverCheck" ADD CONSTRAINT "ShiftHandoverCheck_shiftHandoverId_fkey" FOREIGN KEY ("shiftHandoverId") REFERENCES "ShiftHandover"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftHandoverCheck" ADD CONSTRAINT "ShiftHandoverCheck_handoverChecklistItemId_fkey" FOREIGN KEY ("handoverChecklistItemId") REFERENCES "HandoverChecklistItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ítems de checklist sembrados (T-F0-14).
INSERT INTO "UniformItem" ("name", "value", "order", "active", "isSystem")
VALUES
  ('PANTALON', 'Pantalón', 0, true, true),
  ('BOTAS', 'Botas', 1, true, true),
  ('CINTURON', 'Cinturón', 2, true, true),
  ('CAMISA', 'Camisa', 3, true, true),
  ('PLUMA', 'Pluma', 4, true, true),
  ('GORRA', 'Gorra', 5, true, true),
  ('UNAS', 'Uñas', 6, true, true),
  ('OREJAS', 'Orejas', 7, true, true),
  ('DESODORANTE', 'Desodorante', 8, true, true),
  ('AFEITADO', 'Afeitado', 9, true, true),
  ('PEINADO', 'Peinado', 10, true, true)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "HandoverChecklistItem" ("name", "value", "order", "active", "isSystem")
VALUES
  ('PHONES', 'Teléfonos', 0, true, true),
  ('TABLET', 'Tableta', 1, true, true),
  ('RADIOS', 'Radios', 2, true, true),
  ('KEYS', 'Llaves', 3, true, true),
  ('LOGBOOK', 'Bitácora', 4, true, true),
  ('CONSIGNAS', 'Consignas', 5, true, true),
  ('REPORTED_TO_ADMIN', 'Reportado a administración', 6, true, true)
ON CONFLICT ("name") DO NOTHING;

-- Backfill (T-F0-14): una fila por revisión e ítem.
INSERT INTO "UniformCheckItem" ("uniformCheckId", "uniformItemId", "checked")
SELECT uc."id", i."id", CASE i."name"
      WHEN 'PANTALON' THEN uc."pantalon"
      WHEN 'BOTAS' THEN uc."botas"
      WHEN 'CINTURON' THEN uc."cinturon"
      WHEN 'CAMISA' THEN uc."camisa"
      WHEN 'PLUMA' THEN uc."pluma"
      WHEN 'GORRA' THEN uc."gorra"
      WHEN 'UNAS' THEN uc."unas"
      WHEN 'OREJAS' THEN uc."orejas"
      WHEN 'DESODORANTE' THEN uc."desodorante"
      WHEN 'AFEITADO' THEN uc."afeitado"
      WHEN 'PEINADO' THEN uc."peinado"
    END
FROM "UniformCheck" uc CROSS JOIN "UniformItem" i
ON CONFLICT ("uniformCheckId", "uniformItemId") DO NOTHING;
INSERT INTO "ShiftHandoverCheck" ("shiftHandoverId", "handoverChecklistItemId", "checked")
SELECT sh."id", i."id", CASE i."name"
      WHEN 'PHONES' THEN sh."checklistPhones"
      WHEN 'TABLET' THEN sh."checklistTablet"
      WHEN 'RADIOS' THEN sh."checklistRadios"
      WHEN 'KEYS' THEN sh."checklistKeys"
      WHEN 'LOGBOOK' THEN sh."checklistLogbook"
      WHEN 'CONSIGNAS' THEN sh."checklistConsignas"
      WHEN 'REPORTED_TO_ADMIN' THEN sh."reportedToAdmin"
    END
FROM "ShiftHandover" sh CROSS JOIN "HandoverChecklistItem" i
ON CONFLICT ("shiftHandoverId", "handoverChecklistItemId") DO NOTHING;

-- Verificación: el número de filas y de marcas debe coincidir con las columnas booleanas.
DO $$
DECLARE esperadas INT; reales INT; marcas_esperadas INT; marcas_reales INT;
BEGIN
  SELECT COUNT(*) * 11 INTO esperadas FROM "UniformCheck";
  SELECT COUNT(*) INTO reales FROM "UniformCheckItem";
  SELECT COALESCE(SUM((pantalon::int + botas::int + cinturon::int + camisa::int + pluma::int + gorra::int + unas::int + orejas::int + desodorante::int + afeitado::int + peinado::int)), 0) INTO marcas_esperadas FROM "UniformCheck";
  SELECT COUNT(*) INTO marcas_reales FROM "UniformCheckItem" WHERE "checked";
  IF esperadas <> reales OR marcas_esperadas <> marcas_reales THEN
    RAISE EXCEPTION 'Backfill uniforme: filas % vs %, marcas % vs %', reales, esperadas, marcas_reales, marcas_esperadas;
  END IF;
END $$;

DO $$
DECLARE esperadas INT; reales INT; marcas_esperadas INT; marcas_reales INT;
BEGIN
  SELECT COUNT(*) * 7 INTO esperadas FROM "ShiftHandover";
  SELECT COUNT(*) INTO reales FROM "ShiftHandoverCheck";
  SELECT COALESCE(SUM(("checklistPhones"::int + "checklistTablet"::int + "checklistRadios"::int + "checklistKeys"::int + "checklistLogbook"::int + "checklistConsignas"::int + "reportedToAdmin"::int)), 0) INTO marcas_esperadas FROM "ShiftHandover";
  SELECT COUNT(*) INTO marcas_reales FROM "ShiftHandoverCheck" WHERE "checked";
  IF esperadas <> reales OR marcas_esperadas <> marcas_reales THEN
    RAISE EXCEPTION 'Backfill entrega de turno: filas % vs %, marcas % vs %', reales, esperadas, marcas_reales, marcas_esperadas;
  END IF;
END $$;


-- Doble escritura: cada INSERT/UPDATE de la fila reescribe sus ítems.
CREATE OR REPLACE FUNCTION sync_uniform_check_items() RETURNS trigger AS $$
BEGIN
  INSERT INTO "UniformCheckItem" ("uniformCheckId", "uniformItemId", "checked")
  SELECT NEW."id", i."id", CASE i."name"
      WHEN 'PANTALON' THEN NEW."pantalon"
      WHEN 'BOTAS' THEN NEW."botas"
      WHEN 'CINTURON' THEN NEW."cinturon"
      WHEN 'CAMISA' THEN NEW."camisa"
      WHEN 'PLUMA' THEN NEW."pluma"
      WHEN 'GORRA' THEN NEW."gorra"
      WHEN 'UNAS' THEN NEW."unas"
      WHEN 'OREJAS' THEN NEW."orejas"
      WHEN 'DESODORANTE' THEN NEW."desodorante"
      WHEN 'AFEITADO' THEN NEW."afeitado"
      WHEN 'PEINADO' THEN NEW."peinado"
    END
  FROM "UniformItem" i
  ON CONFLICT ("uniformCheckId", "uniformItemId") DO UPDATE SET "checked" = EXCLUDED."checked";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_uniform_check_items_trg AFTER INSERT OR UPDATE ON "UniformCheck"
  FOR EACH ROW EXECUTE FUNCTION sync_uniform_check_items();
CREATE OR REPLACE FUNCTION sync_shift_handover_checks() RETURNS trigger AS $$
BEGIN
  INSERT INTO "ShiftHandoverCheck" ("shiftHandoverId", "handoverChecklistItemId", "checked")
  SELECT NEW."id", i."id", CASE i."name"
      WHEN 'PHONES' THEN NEW."checklistPhones"
      WHEN 'TABLET' THEN NEW."checklistTablet"
      WHEN 'RADIOS' THEN NEW."checklistRadios"
      WHEN 'KEYS' THEN NEW."checklistKeys"
      WHEN 'LOGBOOK' THEN NEW."checklistLogbook"
      WHEN 'CONSIGNAS' THEN NEW."checklistConsignas"
      WHEN 'REPORTED_TO_ADMIN' THEN NEW."reportedToAdmin"
    END
  FROM "HandoverChecklistItem" i
  ON CONFLICT ("shiftHandoverId", "handoverChecklistItemId") DO UPDATE SET "checked" = EXCLUDED."checked";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_shift_handover_checks_trg AFTER INSERT OR UPDATE ON "ShiftHandover"
  FOR EACH ROW EXECUTE FUNCTION sync_shift_handover_checks();
