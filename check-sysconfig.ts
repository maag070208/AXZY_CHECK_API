import { prismaClient } from "./src/core/config/database";
const prisma = prismaClient;

async function main() {
    const configs = await prisma.sysConfig.findMany();
    console.log(configs);
}
main();
