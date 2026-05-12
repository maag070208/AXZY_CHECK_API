import { PrismaClient } from "@prisma/client";
import { hackerLog } from "./logger";

export const maintenanceCatalogsSeed = async (prisma: PrismaClient) => {
    hackerLog.info('SEED', 'Populating Maintenance Categories and Types...');

    const categories = [
        {
            name: 'PLOMERIA',
            value: 'Plomería',
            type: 'MAINTENANCE',
            color: '#0288d1',
            icon: 'water-pump',
            types: [
                { name: 'FUGA_AGUA', value: 'Fuga de Agua' },
                { name: 'FALTA_AGUA', value: 'Falta de Agua' },
                { name: 'DRENAJE_TAPADO', value: 'Drenaje Tapado' },
                { name: 'HUMEDAD_GOTERAS', value: 'Humedad/Goteras' }
            ]
        },
        {
            name: 'ELECTRICIDAD',
            value: 'Electricidad',
            type: 'MAINTENANCE',
            color: '#fbc02d',
            icon: 'lightning-bolt',
            types: [
                { name: 'LUMINARIA_APAGADA', value: 'Luminaria apagada' },
                { name: 'CORTO_CIRCUITO', value: 'Corto circuito' },
                { name: 'FALLO_PORTON', value: 'Fallo en portón' },
                { name: 'CAMARAS_SIN_FUNCION', value: 'Cámaras sin función' }
            ]
        },
        {
            name: 'ESTRUCTURA',
            value: 'Estructura',
            type: 'MAINTENANCE',
            color: '#7b1fa2',
            icon: 'home-city',
            types: [
                { name: 'DAÑO_PINTURA', value: 'Daño en pintura' },
                { name: 'CRISTAL_ROTO', value: 'Cristal roto' },
                { name: 'FALLO_CERCO', value: 'Fallo en cerco' },
                { name: 'BACH_PAVIMENTO', value: 'Baches/Pavimento' }
            ]
        },
        {
            name: 'JARDINERIA',
            value: 'Jardinería',
            type: 'MAINTENANCE',
            color: '#388e3c',
            icon: 'pine-tree',
            types: [
                { name: 'PODA_CESPED', value: 'Poda de césped' },
                { name: 'PODA_ARBOLES', value: 'Poda de árboles' },
                { name: 'RIEGO_FALTANTE', value: 'Riego faltante' },
                { name: 'PLAGAS', value: 'Plagas' }
            ]
        },
        {
            name: 'GENERAL',
            value: 'General',
            type: 'MAINTENANCE',
            color: '#e65100',
            icon: 'toolbox',
            types: [
                { name: 'DAÑO_EQUIPAMIENTO', value: 'Daños en equipamiento' },
                { name: 'LIMPIEZA_PROFUNDA', value: 'Limpieza profunda requerida' },
                { name: 'OTRO_MANT', value: 'Otro' }
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

    hackerLog.success('SEED', 'Maintenance Catalogs populated');
};
