import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { respondError } from "@src/core/errors/http-error";
import { streamPaymentReceipt } from "./receipt.service";
import {
  cancelCharge,
  createCharge,
  createPayment,
  FinanceActor,
  generateMonthlyCharges,
  getFinanceSummary,
  getResidentFinance,
  listCharges,
  listPayments,
  voidPayment,
} from "./finance.service";

const actorOf = (req: Request): FinanceActor => ({
  id: Number((req.user as { id?: number } | undefined)?.id),
  canManage: (req.user as { role?: string } | undefined)?.role === "ADMIN",
});

export const getCharges = async (req: Request, res: Response) => {
  try {
    const result = await listCharges(actorOf(req), req.query as any);
    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    return respondError(res, error);
  }
};

export const postCharge = async (req: Request, res: Response) => {
  try {
    const result = await createCharge(actorOf(req), req.body);
    return res.status(201).json(createTResult(result));
  } catch (error: any) {
    return respondError(res, error);
  }
};

export const postMonthlyCharges = async (req: Request, res: Response) => {
  try {
    const result = await generateMonthlyCharges(actorOf(req), req.body);
    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    return respondError(res, error);
  }
};

export const patchCancelCharge = async (req: Request, res: Response) => {
  try {
    const result = await cancelCharge(Number(req.params.id), req.body.reason);
    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    return respondError(res, error);
  }
};

export const getPayments = async (req: Request, res: Response) => {
  try {
    const result = await listPayments(actorOf(req), req.query as any);
    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    return respondError(res, error);
  }
};

export const postPayment = async (req: Request, res: Response) => {
  try {
    const result = await createPayment(actorOf(req), req.body);
    return res.status(201).json(createTResult(result));
  } catch (error: any) {
    return respondError(res, error);
  }
};

export const postVoidPayment = async (req: Request, res: Response) => {
  try {
    const result = await voidPayment(actorOf(req), Number(req.params.id), req.body.reason);
    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    return respondError(res, error);
  }
};

export const getSummary = async (_req: Request, res: Response) => {
  try {
    const result = await getFinanceSummary();
    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    return respondError(res, error);
  }
};

export const getMyFinance = async (req: Request, res: Response) => {
  try {
    const result = await getResidentFinance(Number((req.user as { id?: number } | undefined)?.id));
    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    return respondError(res, error);
  }
};

export const getMyBalance = async (req: Request, res: Response) => {
  try {
    const result = await getResidentFinance(Number((req.user as { id?: number } | undefined)?.id));
    return res.status(200).json(createTResult(result.summary));
  } catch (error: any) {
    return respondError(res, error);
  }
};

export const getReceipt = async (req: Request, res: Response) => {
  try {
    const actor = actorOf(req);
    await streamPaymentReceipt(res, Number(req.params.id), actor.id, true);
  } catch (error: any) {
    if (!res.headersSent) return respondError(res, error);
    res.end();
  }
};

export const getMyReceipt = async (req: Request, res: Response) => {
  try {
    const actor = actorOf(req);
    await streamPaymentReceipt(res, Number(req.params.id), actor.id, false);
  } catch (error: any) {
    if (!res.headersSent) return respondError(res, error);
    res.end();
  }
};
