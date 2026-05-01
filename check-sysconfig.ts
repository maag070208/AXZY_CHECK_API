import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
    const configs = await prisma.sysConfig.findMany();
    console.log(configs);
}
main();
