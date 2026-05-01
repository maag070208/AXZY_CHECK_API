import { Router } from "express";
import { createRecurring, deleteRecurring, getRecurringList, toggleRecurring, assignGuard, getMyRecurring, updateRecurring, getDataTable } from "./recurring.controller";
import validationMiddleware from "@src/core/middlewares/token-validator.middleware";

const router = Router();

// All routes protected by token
router.use(validationMiddleware);

// Only ADMIN and SHIFT_GUARD should access modification routes
// For now, validationMiddleware adds user to res.locals.user. 
// We can check roles in controller or added middleware.
// Assuming validationMiddleware is sufficient for authentication.

router.post("/datatable", validationMiddleware, getDataTable);
router.get("/", validationMiddleware, getRecurringList);
router.get("/my-list", validationMiddleware, getMyRecurring);
router.post("/", validationMiddleware, createRecurring);
router.post("/:id/assign", validationMiddleware, assignGuard);
router.put("/:id", validationMiddleware, updateRecurring);
router.put("/:id/toggle", validationMiddleware, toggleRecurring);
router.delete("/:id", validationMiddleware, deleteRecurring);

export default router;
