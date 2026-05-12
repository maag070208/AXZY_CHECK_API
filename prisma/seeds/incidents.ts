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
        let createdCat = await prisma.incidentCategory.findUnique({
            where: { name: cat.name },
            select: { id: true }
        });

        if (createdCat) {
            await prisma.incidentCategory.update({
                where: { id: createdCat.id },
                data: {
                    value: cat.value,
                    type: cat.type,
                    color: cat.color,
                    icon: cat.icon
                }
            });
        } else {
            createdCat = await prisma.incidentCategory.create({
                data: {
                    name: cat.name,
                    value: cat.value,
                    type: cat.type,
                    color: cat.color,
                    icon: cat.icon
                },
                select: { id: true }
            });
        }

        for (const type of cat.types) {
            const existingType = await prisma.incidentType.findUnique({
                where: { name: type.name },
                select: { id: true }
            });

            if (existingType) {
                await prisma.incidentType.update({
                    where: { id: existingType.id },
                    data: {
                        value: type.value,
                        categoryId: createdCat.id
                    }
                });
            } else {
                await prisma.incidentType.create({
                    data: {
                        name: type.name,
                        value: type.value,
                        categoryId: createdCat.id
                    }
                });
            }
        }
    }

    hackerLog.success('SEED', 'Incident Catalogs populated');
};
