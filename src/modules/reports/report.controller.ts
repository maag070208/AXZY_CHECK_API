
import { Request, Response } from 'express';
import * as ReportService from './report.service';

export const getGuardStats = async (req: Request, res: Response) => {
    const filters = {
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        guardId: req.query.guardId ? parseInt(req.query.guardId as string) : undefined
    };
    const result = await ReportService.getGuardGeneralStats(filters);
    res.json(result);
};

export const getTopPerformance = async (req: Request, res: Response) => {
    const filters = {
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string
    };
    const result = await ReportService.getTopPerformanceGuards(filters);
    res.json(result);
};

export const getActivityDistribution = async (req: Request, res: Response) => {
    const filters = {
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        guardId: req.query.guardId ? parseInt(req.query.guardId as string) : undefined
    };
    const result = await ReportService.getActivityDistribution(filters);
    res.json(result);
};

export const getGuardDetailedReport = async (req: Request, res: Response) => {
    const filters = {
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        guardId: req.query.guardId ? parseInt(req.query.guardId as string) : undefined
    };
    const result = await ReportService.getGuardDetailedReport(filters);
    res.json(result);
};

export const getGuardDetailBreakdown = async (req: Request, res: Response) => {
    const filters = {
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        guardId: parseInt(req.params.id)
    };
    const result = await ReportService.getGuardDetailBreakdown(filters);
    res.status(result.success ? 200 : 400).json(result);
};

export const getWorkloadComparison = async (req: Request, res: Response) => {
    const filters = {
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string
    };
    const result = await ReportService.getWorkloadComparison(filters);
    res.json(result);
};
