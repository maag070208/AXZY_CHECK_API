/**
 * Regresión de esquema: schema.prisma y las migraciones deben coincidir.
 * Si alguien agrega un campo al modelo sin migración (o al revés), esta prueba
 * falla antes de llegar a producción.
 */
import { execSync } from "child_process";
import path from "path";
import { TEST_DATABASE_URL_DEFAULT } from "../setup/safety";

it("las migraciones producen exactamente el schema.prisma (sin deriva)", () => {
  const root = path.resolve(__dirname, "..", "..");
  const url = process.env.TEST_DATABASE_URL ?? TEST_DATABASE_URL_DEFAULT;
  const out = execSync(
    `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "${url}" --script`,
    { cwd: root, env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: "1" }, encoding: "utf-8" },
  );
  // Índices parciales (un periodo vigente, un titular, un vínculo activo): Prisma no los modela,
  // así que viven solo en la migración y el diff los reporta como eliminados. Son los únicos casos permitidos.
  const sinIndiceParcial = out
    .split("\n")
    .filter((linea) => !["OccupancyPeriod_open_key", "Resident_primary_active_key", "Resident_person_property_active_key"].some((nombre) => linea.includes(nombre)))
    .join("\n")
    .trim();
  expect(sinIndiceParcial).toBe("-- This is an empty migration.");
}, 120000);
