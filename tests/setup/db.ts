/**
 * Utilidades de base de datos para las pruebas.
 *
 * - `resetDatabase()` vacía todas las tablas de negocio y vuelve a sembrar el
 *   catálogo base (roles, tipos). Úsalo en `beforeEach` para aislar pruebas.
 * - Las pruebas se ejecutan en serie (maxWorkers: 1 en jest.config.js) porque
 *   comparten una sola base.
 */
import { prismaClient } from "@src/core/config/database";
import { catalogsSeed } from "../../prisma/seeds/catalogs";

export const prisma = prismaClient;

export async function resetDatabase(): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (rows.length > 0) {
    const tables = rows.map((r) => `"${r.tablename}"`).join(", ");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
  }
  // El seed imprime mucho en consola; lo silenciamos solo mientras corre.
  const log = console.log;
  console.log = () => {};
  try {
    await catalogsSeed(prisma);
  } finally {
    console.log = log;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
