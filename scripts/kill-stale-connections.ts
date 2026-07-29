import { prismaClient } from '../src/core/config/database';

const prisma = prismaClient;

async function killStaleConnections() {
    const result = await prisma.$queryRaw<Array<{ pid: number; usename: string; application_name: string; state: string; query_start: Date | null }>>`
        SELECT pid, usename, application_name, state, query_start
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND application_name LIKE '%prisma%'
        ORDER BY query_start NULLS FIRST;
    `;

    console.log(`[killStale] Found ${result.length} prisma connections:`);
    for (const row of result) {
        console.log(`  pid=${row.pid} usename=${row.usename} app=${row.application_name} state=${row.state} query_start=${row.query_start}`);
    }

    const killed = await prisma.$executeRaw`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND application_name LIKE '%prisma%';
    `;

    console.log(`[killStale] Terminated ${killed} connections.`);
}

killStaleConnections().catch((err) => {
    console.error(err);
    process.exit(1);
});
