import { PrismaClient } from '@prisma/client';
import { hackerLog } from './seeds/logger';

const prisma = new PrismaClient();

async function main() {
    hackerLog.ascii();
    hackerLog.header('Initializing Dynamic Catalogs');

    hackerLog.info('CATALOG', 'Seeding Property Types');
    const propertyTypes = [
        { name: 'CASA', value: 'Casa' },
        { name: 'DEPTO', value: 'Departamento' }
    ];
    for (const item of propertyTypes) {
        await prisma.propertyType.upsert({
            where: { name: item.name },
            update: { value: item.value },
            create: { name: item.name, value: item.value },
        });
    }
    hackerLog.success('CATALOG', 'Property Types synced');

    hackerLog.info('CATALOG', 'Seeding Property Statuses');
    const propertyStatuses = [
        { name: 'VACNT', value: 'No habitada' },
        { name: 'HABIT', value: 'Habitada' },
        { name: 'RENT', value: 'En renta' }
    ];
    for (const item of propertyStatuses) {
        await prisma.propertyStatus.upsert({
            where: { name: item.name },
            update: { value: item.value },
            create: { name: item.name, value: item.value },
        });
    }
    hackerLog.success('CATALOG', 'Property Statuses synced');

    hackerLog.info('CATALOG', 'Seeding Invitation Types');
    const invitationTypes = [
        { name: 'VISIT', value: 'Visita Común / Residente' },
        { name: 'PROV', value: 'Proveedor (App / Servicios)' }
    ];
    for (const item of invitationTypes) {
        await prisma.invitationType.upsert({
            where: { name: item.name },
            update: { value: item.value },
            create: { name: item.name, value: item.value },
        });
    }
    hackerLog.success('CATALOG', 'Invitation Types synced');

    hackerLog.info('CATALOG', 'Seeding Resident Relationships');
    const residentRelationships = [
        { name: 'HIJO', value: 'Hijo(a)' },
        { name: 'ESPOS', value: 'Esposo(a)' },
        { name: 'PADRE', value: 'Padre/Madre' },
        { name: 'FAMIL', value: 'Familiar' },
        { name: 'AMIGO', value: 'Amigo' },
        { name: 'TRABJ', value: 'Trabajador' }
    ];
    for (const item of residentRelationships) {
        await prisma.residentRelationship.upsert({
            where: { name: item.name },
            update: { value: item.value },
            create: { name: item.name, value: item.value },
        });
    }
    hackerLog.success('CATALOG', 'Resident Relationships synced');

    hackerLog.info('CATALOG', 'Seeding User Roles');
    const roles = [
        { name: 'ADMIN', value: 'Administrador' },
        { name: 'GUARD', value: 'Guardia de Seguridad' },
        { name: 'SHIFT', value: 'Jefe de Guardias' },
        { name: 'RESDN', value: 'Residente / Usuario App' },
        { name: 'MAINT', value: 'Mantenimiento' }
    ];
    for (const item of roles) {
        await prisma.role.upsert({
            where: { name: item.name },
            update: { value: item.value },
            create: { name: item.name, value: item.value },
        });
    }
    hackerLog.success('CATALOG', 'User Roles synced');

    hackerLog.info('CATALOG', 'Seeding Shift Alert SysConfig');
    const sysConfigDefaults = [
        { key: 'SHIFT_ALERT_MORNING_TIME', value: '07:00' },
        { key: 'SHIFT_ALERT_EVENING_TIME', value: '19:00' },
        { key: 'SHIFT_ALERT_TIMEZONE', value: 'America/Tijuana' },
        // Dashboard en vivo (Home de WEB): minutos sin escanear antes de
        // marcar una ronda activa como "estancada" en las alertas.
        { key: 'DASHBOARD_STALE_MINUTES', value: '20' }
    ];
    for (const item of sysConfigDefaults) {
        await prisma.sysConfig.upsert({
            where: { key: item.key },
            update: {},
            create: { key: item.key, value: item.value },
        });
    }
    hackerLog.success('CATALOG', 'Shift Alert SysConfig synced');

    hackerLog.divider();
    hackerLog.success('SYSTEM', 'Catalogs seeded successfully');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
