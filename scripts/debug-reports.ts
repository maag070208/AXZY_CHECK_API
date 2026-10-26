import "../tests/setup/env";
import request from "supertest";
import { app } from "@src/app";
import { prisma, resetDatabase } from "../tests/setup/db";
import { flowsSeed } from "../prisma/seeds/flows";
import { tokenFor } from "../tests/factories";

(async () => {
  await resetDatabase();
  await flowsSeed(prisma);
  const guard2 = await prisma.user.findUniqueOrThrow({ where: { username: "flow_guard2" }, include: { role: true } });
  const shift = await prisma.user.findUniqueOrThrow({ where: { username: "flow_shift" }, include: { role: true } });
  const perms = await prisma.rolePermission.findMany({ where: { roleId: guard2.roleId }, include: { permission: true } });
  console.log("guard permissions", perms.map((p) => p.permission.code).sort());
  const body = { title: "Persona sospechosa en acceso", description: "Merodea desde hace 20 min", media: [{ type: "IMAGE", url: "https://example.test/a/uno.jpg", key: "a/uno.jpg" }], latitude: 32.5, longitude: "-117.01" };
  const res = await request(app).post("/api/v1/incidents").set("Authorization", `Bearer ${tokenFor(guard2)}`).send(body);
  console.log("create", res.status, JSON.stringify(res.body));
  const get = await request(app).get("/api/v1/incidents").set("Authorization", `Bearer ${tokenFor(shift)}`);
  console.log("get", get.status, JSON.stringify(get.body));
  await prisma.$disconnect();
})();
