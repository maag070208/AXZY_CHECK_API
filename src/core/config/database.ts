import { PrismaClient, Prisma } from '@prisma/client';

declare global {
    // eslint-disable-next-line no-var
    var __prismaClient: PrismaClient | undefined;
}

const buildDatasourceUrl = (): string => {
    const base = process.env.DATABASE_URL;
    if (!base) {
        throw new Error('DATABASE_URL is not set');
    }
    if (base.includes('connection_limit=')) {
        return base;
    }
    const limit = process.env.PRISMA_CONNECTION_LIMIT ?? '10';
    const timeout = process.env.PRISMA_POOL_TIMEOUT ?? '10';
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}connection_limit=${limit}&pool_timeout=${timeout}`;
};

const createPrismaClient = (): PrismaClient => {
    return new PrismaClient({
        log: process.env.NODE_ENV === 'development'
            ? [
                { emit: 'event', level: 'query' },
                { emit: 'event', level: 'warn' },
                'error',
              ]
            : ['error'],
        datasources: {
            db: {
                url: buildDatasourceUrl(),
            },
        },
    });
};

export const prismaClient: PrismaClient = global.__prismaClient ?? createPrismaClient();

if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaClient as any).$on('query', (e: Prisma.QueryEvent) => {
        if (e.duration > 200) {
            console.warn(`[Prisma] Slow query (${e.duration}ms):`, e.query);
        }
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaClient as any).$on('warn', (e: Prisma.LogEvent) => {
        console.warn('[Prisma WARN]', e.message);
    });
}

if (process.env.NODE_ENV !== 'production') {
    global.__prismaClient = prismaClient;
}

const shutdown = async (signal: string): Promise<void> => {
    console.log(`[Database] Received ${signal}, disconnecting Prisma...`);
    try {
        await prismaClient.$disconnect();
    } catch (err) {
        console.error('[Database] Error during disconnect:', err);
    }
    process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

process.on('beforeExit', () => {
    void prismaClient.$disconnect();
});

export type { Prisma };
