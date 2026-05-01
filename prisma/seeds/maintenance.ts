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

    hackerLog.success('SEED', 'Maintenance Catalogs populated');
};
