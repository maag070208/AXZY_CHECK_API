import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
    const existing = await prisma.sysConfig.findUnique({ where: { key: "INCIDENT_EMAIL" }});
    const email = existing?.value || "aamaro@axzy.dev";
    await prisma.sysConfig.upsert({
        where: { key: "MAINTENANCE_EMAIL" },
        update: {},
        create: { key: "MAINTENANCE_EMAIL", value: email }
    });
    console.log("MAINTENANCE_EMAIL sysconfig added.");
}
main();
