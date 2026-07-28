import { Request, Response } from 'express';
import * as DashboardService from './dashboard.service';

export const getDashboard = async (req: Request, res: Response) => {
  const result = await DashboardService.getDashboardMetrics();
  res.status(result.success ? 200 : 400).json(result);
};

export const getCompletedRoundsToday = async (req: Request, res: Response) => {
  const result = await DashboardService.getCompletedRoundsToday();
  res.status(result.success ? 200 : 400).json(result);
};
