#!/usr/bin/env node
/**
 * Ruta E2E de 8 puntos. Solo se ejecuta con E2E_SEED=1.
 * Uso: E2E_SEED=1 node scripts/seed-e2e-route.mjs
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ROUTE_TITLE = 'E2E RONDA 8 PUNTOS';
const USERNAME = 'marcoh';

const main = async () => {
  if (process.env.E2E_SEED !== '1') {
    console.error('Negado: ejecutá con E2E_SEED=1');
    process.exit(1);
  }

  const guard = await prisma.user.findFirst({
    where: { username: USERNAME, softDelete: false },
  });
  if (!guard) throw new Error(`No existe el guardia ${USERNAME}`);

  const locations = [];
  for (let i = 1; i <= 8; i += 1) {
    const n = String(i).padStart(2, '0');
    const name = `E2E-${n}`;
    const location = await prisma.location.upsert({
      where: { name },
      update: { active: true, softDelete: false },
      create: {
        aisle: 'E2E',
        spot: n,
        number: name,
        name,
        active: true,
        softDelete: false,
      },
    });
    locations.push(location);
  }

  let route = await prisma.recurringConfiguration.findFirst({ where: { title: ROUTE_TITLE } });
  if (!route) {
    route = await prisma.recurringConfiguration.create({
      data: { title: ROUTE_TITLE, description: 'Fixture E2E de 8 puntos', active: true },
    });
  }

  await prisma.recurringConfiguration.update({
    where: { id: route.id },
    data: {
      active: true,
      guards: { connect: [{ id: guard.id }] },
      recurringLocations: {
        deleteMany: {},
        create: locations.map(loc => ({
          locationId: loc.id,
          active: true,
          tasks: {
            create: [{ description: `Verificar ${loc.name}`, reqPhoto: false }],
          },
        })),
      },
    },
  });

  console.log(JSON.stringify({
    routeId: route.id,
    routeTitle: ROUTE_TITLE,
    guardId: guard.id,
    points: locations.map(l => ({ id: l.id, name: l.name })),
  }, null, 2));
};

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
