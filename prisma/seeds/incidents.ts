import { PrismaClient } from "@prisma/client";
import { hackerLog } from "./logger";

export const incidentCatalogsSeed = async (prisma: PrismaClient) => {
    hackerLog.info('SEED', 'Populating Incident Categories and Types...');

    const categories = [
        {
            name: 'SEGURIDAD',
            value: 'Seguridad',
            type: 'INCIDENT',
            color: '#EF4444',
            icon: 'shield-alert',
            types: [
                { name: 'ROBO', value: 'Robo / Hurto' },
                { name: 'INTRUSION', value: 'Intrusión' },
                { name: 'SOSPECHOSO', value: 'Persona Sospechosa' },
                { name: 'RINA', value: 'Riña / Pelea' },
                { name: 'VANDALISMO', value: 'Vandalismo' },
                { name: 'ARMA', value: 'Arma de Fuego / Blanca' }
            ]
        },
        {
            name: 'SERVICIOS',
            value: 'Servicios / Convivencia',
            type: 'INCIDENT',
            color: '#3B82F6',
            icon: 'account-group',
            types: [
                { name: 'BASURA', value: 'Basura Acumulada' },
                { name: 'RUIDO', value: 'Ruido Excesivo' },
                { name: 'MASCOTA', value: 'Mascota sin Correa' },
                { name: 'ESTACIONAMIENTO', value: 'Estacionamiento Indebido' },
                { name: 'PAQUETERIA', value: 'Entrega Paquetería' },
                { name: 'QUEJA', value: 'Queja Vecinal' }
            ]
        }
    ];

    for (const cat of categories) {
        const { types, ...catData } = cat;
        const createdCat = await prisma.incidentCategory.upsert({
            where: { name: catData.name },
            update: catData,
            create: catData
        });

        for (const type of types) {
            await prisma.incidentType.upsert({
                where: { name: type.name },
                update: { ...type, categoryId: createdCat.id },
                create: { ...type, categoryId: createdCat.id }
            });
        }
    }

    hackerLog.success('SEED', 'Incident Catalogs populated');
};
