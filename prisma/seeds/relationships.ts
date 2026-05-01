import { PrismaClient } from "@prisma/client";
import { hackerLog } from "./logger";

export async function relationshipsSeed(prisma: PrismaClient) {
  hackerLog.info('RELATION', 'Establishing Resident Relationships');
  const relationships = [
    "Padre",
    "Madre",
    "Esposo(a)",
    "Hijo(a)",
    "Hermano(a)",
    "Abuelo(a)",
    "Nieto(a)",
    "Tío(a)",
    "Primo(a)",
    "Sobrino(a)",
    "Amigo(a)",
    "Otro",
  ];

  for (const name of relationships) {
    await prisma.residentRelationship.upsert({
      where: { name },
      update: {},
      create: { name, value: name },
    });
  }

  hackerLog.success('RELATION', 'Relationship matrix established');
}
