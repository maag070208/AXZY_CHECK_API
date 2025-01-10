import { transporter } from "@src/core/config/mail";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { Request, Response } from "express";
import { getDetails } from "../clients/client.service";

export const sendMail = async (req: Request, res: Response) => {
  try {
    const client = await getDetails(Number(req.body.clientId));

    if (!client) {
      return res.status(404).json(createTResult(null, ["Client not found"]));
    }

    console.log({ client });

    if (!client.email) {
      return res
        .status(404)
        .json(createTResult(null, ["Client does not have an email"]));
    }

    const mail = await transporter.sendMail({
      from: "aamaro@axzy.dev",
      to: client.email,
      subject: "Pago pendiente de: " + client.name,
      text: `Hola ${client.name}, tienes un pago pendiente de $${client.totalPendingToPaid} MXN`,
    });
    console.log(mail);
    return res.status(201).json(createTResult(mail));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};
