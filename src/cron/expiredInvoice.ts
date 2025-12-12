import { PrismaClient } from "@prisma/client";
import { sendExpiredPaymentEmail } from "@src/core/utils/emailSender";

const prisma = new PrismaClient();

export const checkAndSendExpiredInvoices = async () => {
  try {
    console.log("🔍 Verificando facturas vencidas...");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiredPayments = await prisma.payment.findMany({
      where: {
        invoiceExpiration: {
            lte: today,
        },
        invoiceExpirationSended: false,
      },
      include: {
        client: true,
        paymentDetail: true,
      },
    });
    console.log(expiredPayments[0]);
    if (expiredPayments.length === 0) {
      console.log("✅ No hay facturas vencidas hoy.");
      return;
    }

    console.log(`📩 Enviando correos a ${expiredPayments.length} clientes...`);
    for (const payment of expiredPayments) {
      await sendExpiredPaymentEmail(payment, payment.client.email).then(
        async () => {
          console.log(`📧 Correo enviado a ${payment.client.email}`);
          console.log(`actualizando el campo invoiceExpirationSended a true`);
          await prisma.payment.update({
            where: { id: payment.id },
            data: { invoiceExpirationSended: true },
          });
        }
      );
      console.log(`📧 Correo enviado a ${payment.client.email}`);
    }
  } catch (error) {
    console.error(
      "❌ Error al verificar facturas vencidas o enviar correos:",
      error
    );
  }
};
