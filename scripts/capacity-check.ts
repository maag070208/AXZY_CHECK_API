/**
 * Prueba de capacidad 500: siembra 500 propiedades/usuarios/residentes,
 * 500 vehículos y 10,000 eventos de acceso en la base de PRUEBA local.
 *
 * Seguridad: importa tests/setup/env, que exige una base *_test local.
 * Uso: pnpm capacity:check
 */
import "../tests/setup/env";
import { performance } from "perf_hooks";
import bcrypt from "bcryptjs";
import request from "supertest";
import { AccessDecision, AccessDirection, AccessMethod, AccessSource, VehicleStatus } from "@prisma/client";
import { app } from "@src/app";
import { prisma, resetDatabase } from "../tests/setup/db";
import { tokenFor } from "../tests/factories";

const USERS = 500;
const EVENTS = 10_000;
const PASSWORD = "Capacity123!";
const RUNS = 5;

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

const measure = async (label: string, fn: () => Promise<request.Response>, thresholdMs: number) => {
  const times: number[] = [];
  let status = 0;
  for (let i = 0; i < RUNS; i += 1) {
    const started = performance.now();
    const response = await fn();
    times.push(performance.now() - started);
    status = response.status;
  }
  return { label, status, p50: percentile(times, 50), p95: percentile(times, 95), thresholdMs };
};

const main = async () => {
  console.log("[capacity] preparando base de prueba…");
  await resetDatabase();

  const [roleAdmin, roleResident, kind, occupancy, type, status, residentKind] = await Promise.all([
    prisma.role.findUniqueOrThrow({ where: { name: "ADMIN" } }),
    prisma.role.findUniqueOrThrow({ where: { name: "RESDN" } }),
    prisma.propertyKind.findUniqueOrThrow({ where: { code: "HOUSE" } }),
    prisma.occupancyStatus.findUniqueOrThrow({ where: { code: "VACANT" } }),
    prisma.propertyType.findFirstOrThrow({ where: { name: "CASA" } }),
    prisma.propertyStatus.findFirstOrThrow({ where: { name: "VACNT" } }),
    prisma.residentKind.findUniqueOrThrow({ where: { code: "OWNER" } }),
  ]);

  const password = bcrypt.hashSync(PASSWORD, 10);
  const admin = await prisma.user.create({
    data: { name: "Capacity", lastName: "Admin", username: "capacity_admin", password, roleId: roleAdmin.id },
    include: { role: true },
  });

  await prisma.property.createMany({
    data: Array.from({ length: USERS }, (_, i) => ({
      identifier: `CAP-${String(i + 1).padStart(4, "0")}`,
      name: `Propiedad ${i + 1}`,
      mainStreet: "Calle Capacity",
      typeId: type.id,
      statusId: status.id,
      kindId: kind.id,
      occupancyStatusId: occupancy.id,
      vehicleQuota: 2,
    })),
  });
  const properties = await prisma.property.findMany({ where: { identifier: { startsWith: "CAP-" } }, select: { id: true }, orderBy: { id: "asc" } });

  await prisma.user.createMany({
    data: properties.map((property, i) => ({
      name: `Residente ${i + 1}`,
      lastName: "Capacity",
      username: `cap_resident_${String(i + 1).padStart(4, "0")}`,
      password,
      roleId: roleResident.id,
      propertyId: property.id,
    })),
  });
  const residents = await prisma.user.findMany({
    where: { username: { startsWith: "cap_resident_" } },
    select: { id: true, name: true, lastName: true, username: true, propertyId: true, role: true },
    orderBy: { id: "asc" },
  });

  await prisma.person.createMany({
    data: residents.map((resident) => ({ firstName: resident.name, lastName: resident.lastName, userId: resident.id })),
  });
  const persons = await prisma.person.findMany({ where: { userId: { in: residents.map((r) => r.id) } }, select: { id: true, userId: true } });
  const personByUser = new Map(persons.map((person) => [person.userId, person.id]));

  await prisma.resident.createMany({
    data: residents.map((resident) => ({
      personId: personByUser.get(resident.id)!,
      propertyId: resident.propertyId!,
      kindId: residentKind.id,
      isPrimary: true,
      startDate: new Date(),
    })),
  });

  await prisma.vehicle.createMany({
    data: residents.map((resident, i) => ({
      propertyId: resident.propertyId!,
      ownerId: resident.id,
      plate: `CAP-${String(i + 1).padStart(4, "0")}`,
      plateNormalized: `CAP${String(i + 1).padStart(4, "0")}`,
      tagCode: `TAG-CAP-${String(i + 1).padStart(4, "0")}`,
      brand: "Toyota",
      model: "Corolla",
      color: "Blanco",
      status: VehicleStatus.APPROVED,
      approvedById: admin.id,
      approvedAt: new Date(),
    })),
  });

  const methods = [AccessMethod.QR, AccessMethod.TAG, AccessMethod.PIN, AccessMethod.MANUAL];
  const decisions = [AccessDecision.ALLOWED, AccessDecision.ALLOWED, AccessDecision.ALLOWED, AccessDecision.DENIED];
  for (let offset = 0; offset < EVENTS; offset += 1000) {
    await prisma.accessEvent.createMany({
      data: Array.from({ length: Math.min(1000, EVENTS - offset) }, (_, i) => {
        const property = properties[(offset + i) % properties.length];
        return {
          propertyId: property.id,
          method: methods[(offset + i) % methods.length],
          direction: (offset + i) % 2 === 0 ? AccessDirection.ENTRY : AccessDirection.EXIT,
          source: AccessSource.GUARD,
          decision: decisions[(offset + i) % decisions.length],
          reason: "CAPACITY_CHECK",
          occurredAt: new Date(Date.now() - ((offset + i) % 365) * 24 * 60 * 60 * 1000),
        };
      }),
    });
  }

  const adminToken = `Bearer ${tokenFor(admin)}`;
  const resident = residents[0];
  const residentToken = `Bearer ${tokenFor(resident)}`;
  const propertyId = residents[0].propertyId!;

  const results = [
    await measure("Login", () => request(app).post("/api/v1/users/login").send({ username: resident.username, password: PASSWORD }), 2000),
    await measure("Usuarios (datatable)", () => request(app).post("/api/v1/users/datatable").set("Authorization", adminToken).send({ page: 1, limit: 25, filters: {} }), 2000),
    await measure("Propiedades", () => request(app).get("/api/v1/properties").set("Authorization", adminToken), 2000),
    await measure("Residentes", () => request(app).get("/api/v1/residents").set("Authorization", adminToken), 2000),
    await measure("Bitácora", () => request(app).get("/api/v1/access/events?page=1&pageSize=50").set("Authorization", adminToken), 1500),
    await measure("Estado caseta", () => request(app).get(`/api/v1/access/status?propertyId=${propertyId}`).set("Authorization", adminToken), 1000),
    await measure("Buscar vehículo", () => request(app).get("/api/v1/vehicles/lookup?q=TAG-CAP-0001").set("Authorization", adminToken), 1000),
    await measure("Mis accesos", () => request(app).get("/api/v1/my-access/events?page=1&pageSize=50").set("Authorization", residentToken), 1500),
  ];

  console.table(results.map((row) => ({
    endpoint: row.label,
    status: row.status,
    p50_ms: Math.round(row.p50),
    p95_ms: Math.round(row.p95),
    limite_ms: row.thresholdMs,
    ok: row.status < 400 && row.p95 <= row.thresholdMs,
  })));

  const failed = results.filter((row) => row.status >= 400 || row.p95 > row.thresholdMs);
  await prisma.$disconnect();
  if (failed.length > 0) {
    console.error(`[capacity] ${failed.length} endpoint(s) fuera de límite.`);
    process.exit(1);
  }
  console.log(`[capacity] OK: ${USERS} usuarios, ${USERS} propiedades, ${EVENTS} eventos.`);
};

main().catch(async (error) => {
  console.error("[capacity] error:", error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
