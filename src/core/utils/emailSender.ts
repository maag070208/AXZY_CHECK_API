import { transporter, resend, mailFrom } from "../config/mail";
import { getSetting } from "../settings/app-settings.service";

/**
 * Los textos del correo vienen de lo que capturan los guardias: sin escapar, un título con HTML
 * se inyectaba en el correo de la administración (enlaces falsos, imágenes de rastreo).
 */
export const escapeHtml = (value: unknown): string =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** Solo enlaces http(s) a la evidencia; cualquier otro esquema (javascript:, data:) se descarta. */
const safeUrl = (url: unknown): string => (/^https?:\/\//i.test(String(url ?? "")) ? escapeHtml(url) : "#");

export const sendIncidentEmail = async (incident: any, guard: any) => {
  try {
    // 1. Destinatarios desde AppSetting (separados por "|")
    const emails = await getSetting("INCIDENT_EMAIL", "");

    if (!emails) {
      console.warn("No Recipients found for INCIDENT_EMAIL");
      return;
    }

    const recipients = emails.split("|");

    const subject = `⚠️ Nuevo Incidente Reportado: ${incident.title}`;

    // 2. Prepare Media Links
    let mediaLinks = '<p><em>No hay evidencia adjunta.</em></p>';
    if (incident.media && Array.isArray(incident.media) && incident.media.length > 0) {
        mediaLinks = '<ul>';
        incident.media.forEach((m: any) => {
            const url = m.url;
            const type = m.type === 'VIDEO' ? 'Video' : 'Foto';
            mediaLinks += `<li><a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${type} - Ver evidencia</a></li>`;
        });
        mediaLinks += '</ul>';
    }

    // 3. Prepare Email Content with improved design
    const htmlContent = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #d9534f; padding: 20px; text-align: center;">
          <h2 style="color: #ffffff; margin: 0; font-size: 24px;">⚠️ Nuevo Incidente Reportado</h2>
        </div>
        
        <div style="padding: 30px; background-color: #ffffff;">
          <p style="font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
            Se ha reportado una nueva incidencia en el sistema. A continuación se detallan los datos registrados por el guardia.
          </p>
          
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #eee; width: 30%; font-weight: bold; color: #555;">Guardia:</td>
              <td style="padding: 10px; border-bottom: 1px solid #eee; color: #333;">${escapeHtml(`${guard.name} ${guard.lastName || ""}`.trim())}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Fecha:</td>
              <td style="padding: 10px; border-bottom: 1px solid #eee; color: #333;">${new Date().toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Título:</td>
              <td style="padding: 10px; border-bottom: 1px solid #eee; color: #333;">${escapeHtml(incident.title)}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Categoría:</td>
              <td style="padding: 10px; border-bottom: 1px solid #eee; color: #333;">
                <span style="background-color: #fce4ec; color: #c2185b; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">
                  ${escapeHtml(incident.category?.value || 'Sin categoría')}
                </span>
              </td>
            </tr>
          </table>

          <div style="margin-bottom: 25px;">
            <h3 style="color: #d9534f; border-bottom: 2px solid #d9534f; padding-bottom: 5px; margin-bottom: 15px;">Descripción</h3>
            <blockquote style="background: #f9f9f9; padding: 15px; border-left: 5px solid #d9534f; margin: 0; font-style: italic; color: #555;">
              ${escapeHtml(incident.description || 'Sin descripción')}
            </blockquote>
          </div>

          <div style="margin-bottom: 20px;">
            <h3 style="color: #d9534f; border-bottom: 2px solid #d9534f; padding-bottom: 5px; margin-bottom: 15px;">Evidencias Adjuntas</h3>
            ${mediaLinks}
          </div>

          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
             <a href="${process.env.SYSTEM_URL ?? ''}" style="background-color: #333; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 5px; font-weight: bold;">Ir al Panel de Control</a>
          </div>
        </div>
        
        <div style="background-color: #fcfcfc; padding: 15px; text-align: center; border-top: 1px solid #e0e0e0;">
          <p style="font-size: 12px; color: #999; margin: 0;">Este es un mensaje automático del sistema de recorridos y seguridad.</p>
        </div>
      </div>
    `;

    // 4. Send Email  
    if (resend) {
      const { data, error } = await resend.emails.send({
        from: mailFrom(),
        to: recipients,
        subject: subject,
        html: htmlContent,
      });
      if (error) {
        console.error("Resend Error:", error);
      } else {
        console.log("Resend Success:", data);
      }
    } else {
      await transporter.sendMail({
        from: mailFrom(),
        to: recipients,
        subject: subject,
        html: htmlContent,
      });
    }

    console.log(`Incident email sent to ${recipients.join(", ")}`);

  } catch (error) {
    console.error("Error sending incident email:", error);
  }
};

export const sendMaintenanceEmail = async (maintenance: any, guard: any) => {
  try {
    const emails = await getSetting("MAINTENANCE_EMAIL", "");

    if (!emails) {
      console.warn("No Recipients found for MAINTENANCE_EMAIL");
      return;
    }

    const recipients = emails.split("|");
    const subject = `🔧 Nuevo Reporte de Mantenimiento: ${maintenance.title}`;

    let mediaLinks = '<p><em>No hay evidencia adjunta.</em></p>';
    if (maintenance.media && Array.isArray(maintenance.media) && maintenance.media.length > 0) {
        mediaLinks = '<ul>';
        maintenance.media.forEach((m: any) => {
            const url = m.url;
            const type = m.type === 'VIDEO' ? 'Video' : 'Foto';
            mediaLinks += `<li><a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${type} - Ver evidencia</a></li>`;
        });
        mediaLinks += '</ul>';
    }

    const htmlContent = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #f0ad4e; padding: 20px; text-align: center;">
          <h2 style="color: #ffffff; margin: 0; font-size: 24px;">🔧 Nuevo Reporte de Mantenimiento</h2>
        </div>
        
        <div style="padding: 30px; background-color: #ffffff;">
          <p style="font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
            Se ha reportado un nuevo mantenimiento en el sistema. A continuación se detallan los datos registrados.
          </p>
          
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #eee; width: 30%; font-weight: bold; color: #555;">Reporta:</td>
              <td style="padding: 10px; border-bottom: 1px solid #eee; color: #333;">${escapeHtml(`${guard.name} ${guard.lastName || ""}`.trim())}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Fecha:</td>
              <td style="padding: 10px; border-bottom: 1px solid #eee; color: #333;">${new Date().toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Tipo:</td>
              <td style="padding: 10px; border-bottom: 1px solid #eee; color: #333;">${escapeHtml(maintenance.type?.value || maintenance.title)}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Categoría:</td>
              <td style="padding: 10px; border-bottom: 1px solid #eee; color: #333;">${escapeHtml(maintenance.categoryRel?.value || maintenance.category || 'Mantenimiento General')}</td>
            </tr>
          </table>

          <div style="margin-bottom: 25px;">
            <h3 style="color: #f0ad4e; border-bottom: 2px solid #f0ad4e; padding-bottom: 5px; margin-bottom: 15px;">Descripción</h3>
            <blockquote style="background: #f9f9f9; padding: 15px; border-left: 5px solid #f0ad4e; margin: 0; font-style: italic; color: #555;">
              ${escapeHtml(maintenance.description || 'Sin descripción')}
            </blockquote>
          </div>

          <div style="margin-bottom: 20px;">
            <h3 style="color: #f0ad4e; border-bottom: 2px solid #f0ad4e; padding-bottom: 5px; margin-bottom: 15px;">Evidencias Adjuntas</h3>
            ${mediaLinks}
          </div>

          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
             <a href="${process.env.SYSTEM_URL ?? ''}" style="background-color: #333; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 5px; font-weight: bold;">Ir al Panel de Control</a>
          </div>
        </div>
        
        <div style="background-color: #fcfcfc; padding: 15px; text-align: center; border-top: 1px solid #e0e0e0;">
          <p style="font-size: 12px; color: #999; margin: 0;">Este es un mensaje automático del sistema de recorridos y seguridad.</p>
        </div>
      </div>
    `;

    if (resend) {
      const { data, error } = await resend.emails.send({
        from: mailFrom(),
        to: recipients,
        subject: subject,
        html: htmlContent,
      });
      if (error) {
        console.error("Resend Error (Maintenance):", error);
      } else {
        console.log("Resend Success (Maintenance):", data);
      }
    } else {
      await transporter.sendMail({
        from: mailFrom(),
        to: recipients,
        subject: subject,
        html: htmlContent,
      });
    }

    console.log(`Maintenance email sent to ${recipients.join(", ")}`);

  } catch (error) {
    console.error("Error sending maintenance email:", error);
  }
};
