import { PrismaClient } from "@prisma/client";
import { hackerLog } from "./logger";

/**
 * @description Catálogos para el módulo Verificación de Cambio de Turno.
 * Discriminador `type='SHIFT'` para no mezclarse con INCIDENT/MAINTENANCE/CASA_CLUB.
 * Se genera una incidencia `Incident` al crear un ShiftCheck con falta/retardo/uniforme.
 */
export const shiftCatalogsSeed = async (prisma: PrismaClient) => {
    hackerLog.info('SEED', 'Populating Shift Catalogs...');

    const categories = [
        {
            name: 'SHIFT_FALTA',
            value: 'Falta',
            type: 'SHIFT',
            color: '#DC2626',
            icon: 'account-cancel',
            types: [
                { name: 'FALTA_INJUSTIFICADA', value: 'Falta injustificada' },
                { name: 'FALTA_JUSTIFICADA', value: 'Falta justificada' },
            ],
        },
        {
            name: 'SHIFT_RETARDO',
            value: 'Retardo',
            type: 'SHIFT',
            color: '#F59E0B',
            icon: 'clock-alert',
            types: [
                { name: 'RETARDO_LEVE', value: 'Retardo leve (<15 min)' },
                { name: 'RETARDO_GRAVE', value: 'Retardo grave (>=15 min)' },
            ],
        },
        {
            name: 'SHIFT_UNIFORME',
            value: 'Uniforme',
            type: 'SHIFT',
            color: '#7C3AED',
            icon: 'tshirt-crew',
            types: [
                { name: 'UNIFORME_INCOMPLETO', value: 'Uniforme incompleto' },
                { name: 'ASEO_PERSONAL', value: 'Aseo personal' },
            ],
        },
        {
            name: 'SHIFT_ENTREGA',
            value: 'Entrega de Turno',
            type: 'SHIFT',
            color: '#0F766E',
            icon: 'calendar-clock',
            types: [
                { name: 'EQUIPO_FALTANTE', value: 'Equipo faltante en entrega' },
                { name: 'NOVEDADES_NO_REPORTADAS', value: 'Novedades no reportadas a administración' },
            ],
        },
    ];

    for (const cat of categories) {
        let createdCat = await prisma.incidentCategory.findUnique({
            where: { name: cat.name },
            select: { id: true },
        });

        if (createdCat) {
            await prisma.incidentCategory.update({
                where: { id: createdCat.id },
                data: {
                    value: cat.value,
                    type: cat.type,
                    color: cat.color,
                    icon: cat.icon,
                },
            });
        } else {
            createdCat = await prisma.incidentCategory.create({
                data: {
                    name: cat.name,
                    value: cat.value,
                    type: cat.type,
                    color: cat.color,
                    icon: cat.icon,
                },
                select: { id: true },
            });
        }

        for (const type of cat.types) {
            const existingType = await prisma.incidentType.findUnique({
                where: { name: type.name },
                select: { id: true },
            });

            if (existingType) {
                await prisma.incidentType.update({
                    where: { id: existingType.id },
                    data: { value: type.value, categoryId: createdCat.id },
                });
            } else {
                await prisma.incidentType.create({
                    data: { name: type.name, value: type.value, categoryId: createdCat.id },
                });
            }
        }
    }

    hackerLog.success('SEED', 'Shift Catalogs populated');
};
