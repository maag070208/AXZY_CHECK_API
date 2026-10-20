-- E6: la zona horaria pasa a un ajuste único (app.timezone). Se copia el valor
-- que tenía la alerta de turno; si no existía, la instalación debe fijarlo
-- (la semilla de cliente o PUT /settings/app.timezone). Sin valor, la app usa UTC.
INSERT INTO "AppSetting" ("key", "valueType", "value", "group", "description", "isSecret", "updatedAt")
SELECT 'app.timezone', 'string', "value", 'general', 'Zona horaria del cliente (horarios, alertas y turnos)', false, now()
FROM "AppSetting"
WHERE "key" = 'SHIFT_ALERT_TIMEZONE'
ON CONFLICT ("key") DO NOTHING;
