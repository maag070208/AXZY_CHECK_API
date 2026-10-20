import { PrismaClient } from "@prisma/client";
import { hackerLog } from "../base/logger";

const GUESTS = [
  "Juan Pérez", "Sofía Ramírez", "Diego Torres", "Valeria Cruz", "Miguel Ángel Ortiz",
  "Lucía Mendoza", "Andrés Vega", "Paola Reyes", "Hugo Salinas", "Renata Ibarra",
];

/**
 * Invitaciones de ejemplo: cada residente demo tiene una invitación en cada estado.
 * Códigos fijos (DEMO-…) y upsert sin actualizar: correrlo otra vez no duplica nada.
 */
export const invitationsSeed = async (prisma: PrismaClient) => {
  hackerLog.info("INVITATION", "Creating demo invitations");

  const visitor = await prisma.invitationType.findUnique({ where: { name: "VISITOR" } });
  const provider = await prisma.invitationType.findUnique({ where: { name: "PROVIDER" } });
  if (!visitor || !provider) {
    hackerLog.error("INVITATION", "Invitation types not found, seed base catalogs first");
    return;
  }

  const residents = await prisma.user.findMany({
    where: { username: { startsWith: "residente" }, propertyId: { not: null } },
    orderBy: { id: "asc" },
    select: { id: true, propertyId: true },
  });

  const now = new Date();
  const hours = (h: number) => new Date(now.getTime() + h * 3600_000);
  const states = [
    { status: "PENDING" as const, validFrom: hours(-1), validUntil: hours(24), entryTime: null, exitTime: null },
    { status: "ENTERED" as const, validFrom: hours(-3), validUntil: hours(24), entryTime: hours(-1), exitTime: null },
    { status: "EXITED" as const, validFrom: hours(-26), validUntil: hours(24), entryTime: hours(-25), exitTime: hours(-23) },
    { status: "CANCELLED" as const, validFrom: hours(2), validUntil: hours(26), entryTime: null, exitTime: null },
  ];

  let count = 0;
  for (const [i, resident] of residents.entries()) {
    for (const [k, state] of states.entries()) {
      const code = `DEMO-INV-${i + 1}-${k + 1}`;
      await prisma.invitation.upsert({
        where: { code },
        update: {},
        create: {
          code,
          guestName: GUESTS[(i + k) % GUESTS.length],
          notes: k === 1 ? "Llega en auto gris" : null,
          createdById: resident.id,
          propertyId: resident.propertyId!,
          typeId: k === 3 ? provider.id : visitor.id,
          ...state,
        },
      });
      count++;
    }
  }

  hackerLog.success("INVITATION", `${count} demo invitations ready`);
};
