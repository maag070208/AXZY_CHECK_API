import path from "path";
import fs from "fs";
import { transporter } from "../config/mail";

export const sendPaymentEmail = async (data: any, email: string) => {
  const filePath = path.join(
    __dirname,
    "../../public/templates/addPayment.html"
  );
  const html = await fs.promises.readFile(filePath, "utf8");

  const personalizedHtml = html
    .replace("{{name}}", data.name)
    .replace("{{concept_header}}", data.concept)
    .replace("{{concept_detail}}", data.concept)
    .replace(
      "{{date}}",
      new Date(data.invoiceDate).toLocaleDateString("es-MX", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    )
    .replace(
      "{{expiration_date}}",
      new Date(data.invoiceExpiration).toLocaleDateString("es-MX", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    )
    .replace("{{total}}", data.total);

  console.log("urlPdf", data.pdfUrl);
  console.log("urlXml", data.xmlUrl);

  const attachments = [];

  if (data.pdfUrl != "") {
    attachments.push({
      filename: "factura.pdf",
      path: data.pdfUrl,
    });
  }

  if (data.xmlUrl != "") {
    attachments.push({
      filename: "factura.xml",
      path: data.xmlUrl,
    });
  }
  console.log({ attachments });
  await transporter
    .sendMail({
      from: "aamaro@axzy.dev",
      to: email,
      subject: "Concepto de pago",
      html: personalizedHtml,
      attachments: attachments,
    })
    .catch((err) => {
      console.log(err);
    });
};

export const sendPaymentDetailEmail = async (data: any, email: string) => {
  const filePath = path.join(
    __dirname,
    "../../public/templates/addPaymentDetail.html"
  );
  console.log(data);
  const html = await fs.promises.readFile(filePath, "utf8");
  const personalizedHtml = html
    .replace("{{name}}", data.payment.client.name)
    .replace("{{concept_header}}", data.payment.invoiceNumber)
    .replace(
      "{{date}}",
      new Date(data.createdAt).toLocaleDateString("es-MX", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    )
    .replace("{{concept}}", data.concept)
    .replace("{{total}}", data.payment.total)
    .replace("{{paid}}", data.payment.paid)
    .replace("{{amount}}", data.amount)
    .replace(
      "{{totalPendingToPaid}}",
      Number(data.payment.subTotal).toString()
    );

  await transporter
    .sendMail({
      from: "aamaro@axzy.dev",
      to: email,
      subject: "Detalle de pago",
      html: personalizedHtml,
    })
    .catch((err) => {
      console.log(err);
    });
};

export const sendExpiredPaymentEmail = async (data: any, email: string) => {
  const filePath = path.join(
    __dirname,
    "../../public/templates/expiredPayment.html"
  );
  const html = await fs.promises.readFile(filePath, "utf8");

  // Calcular el saldo pendiente
  const remainingAmount = data.total - data.paid;

  // Formatear valores como moneda MXN
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(amount);

  const formattedTotal = formatCurrency(data.total);
  const formattedPaid = formatCurrency(data.paid);
  const formattedRemaining = formatCurrency(remainingAmount);

  const formattedExpiration = new Date(
    data.invoiceExpiration
  ).toLocaleDateString("es-MX", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const personalizedHtml = html
    .replace("{{name}}", data.client.name)
    .replace("{{invoice_number}}", data.invoiceNumber)
    .replace("{{total}}", formattedTotal)
    .replace("{{paid}}", formattedPaid)
    .replace("{{remaining}}", formattedRemaining)
    .replace("{{invoiceExpiration}}", formattedExpiration);

  await transporter.sendMail({
    from: "aamaro@axzy.dev",
    to: email,
    subject: "⚠️ Aviso: Tu factura ha vencido",
    html: personalizedHtml,
  });

  console.log(`Correo enviado a ${email} sobre la factura vencida.`);
};
