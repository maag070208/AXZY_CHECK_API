import { PrismaClient } from "@prisma/client";
import { hackerLog } from "../base/logger";

/**
 * Valores propios de este cliente: zona horaria y destinatarios de correo.
 * Se crean si faltan; un administrador puede cambiarlos después (PUT /settings/:key)
 * sin que el seed los revierta.
 */
export const clientSettingsSeed = async (prisma: PrismaClient) => {
    hackerLog.info('CLIENT', 'Deploying client settings');

    const settings = [
        { key: 'app.timezone', valueType: 'string', value: 'America/Tijuana', group: 'general', description: 'Zona horaria del cliente (horarios, alertas y turnos)' },
        { key: 'INCIDENT_EMAIL', valueType: 'string', value: 'maag070208@gmail.com|asael070208@gmail.com', group: 'notificaciones' },
        { key: 'MAINTENANCE_EMAIL', valueType: 'string', value: 'maag070208@gmail.com|asael070208@gmail.com', group: 'notificaciones' },
    ];

    for (const setting of settings) {
        await prisma.appSetting.upsert({
            where: { key: setting.key },
            update: {},
            create: setting,
        });
    }

    hackerLog.success('CLIENT', 'Client settings configured');
};
