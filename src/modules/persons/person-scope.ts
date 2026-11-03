import { Prisma } from "@prisma/client";
import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";
import { ClientScope, scopeByClient } from "@src/core/scope/client-scope";

/**
 * Multicliente (fase 5): la `Person` tiene `clientId` propio, así que pertenece a un cliente aunque todavía
 * no tenga ningún vínculo con una propiedad (p. ej. una visita o una empleada recién creada y aún sin
 * autorización). Antes se deducía el cliente de sus vínculos y las personas sin vínculo se veían en todos
 * los clientes de la organización.
 *
 * Alcance único de personas: `{ clientId }` del alcance de la petición. Sin cliente en el alcance responde
 * 403 (`scopeByClient`); una persona de otro cliente es inexistente para este cliente (404 al leerla, 400
 * al referenciarla en un alta).
 */
export const personScopeWhere = (scope: ClientScope | undefined): Prisma.PersonWhereInput => scopeByClient(scope);

/** Persona visible desde el alcance; de otro cliente o inexistente → 404 (no se revela que existe). */
export const assertPersonInScope = async (personId: number, scope: ClientScope | undefined) => {
  const person = await prismaClient.person.findFirst({
    where: { id: personId, ...personScopeWhere(scope) },
  });
  if (!person) throw new AppError("PERSON_NOT_FOUND", "Persona no encontrada", 404);
  return person;
};

/**
 * Referencia a una persona dentro de una escritura: inexistente → 404; de otro cliente → 400
 * (referencia ajena en un alta, PLAN §2.4).
 */
export const assertPersonReference = async (personId: number, scope: ClientScope | undefined) => {
  const exists = await prismaClient.person.findUnique({ where: { id: personId }, select: { id: true } });
  if (!exists) throw new AppError("PERSON_NOT_FOUND", "Persona no encontrada", 404);
  const inScope = await prismaClient.person.findFirst({ where: { id: personId, ...personScopeWhere(scope) }, select: { id: true } });
  if (!inScope) throw new AppError("PERSON_OUT_OF_SCOPE", "La persona no pertenece a este cliente", 400);
  return exists;
};
