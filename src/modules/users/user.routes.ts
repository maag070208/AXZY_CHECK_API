import Router from "express";
import { validate } from "@src/core/validation/validate";
import { idParam } from "@src/core/validation/common";
import { loginBody, createUserBody, updateUserBody } from "./user.schemas";
import { createUser, getAllUsers, login, getCoachesList, updateUserProfile, changePassword, logout, resetPassword, deleteUser, getDataTable } from "./user.controller";
import { requireRole } from "@src/modules/common/middlewares/role.middleware";
import { loginRateLimiter } from "@src/core/middlewares/rate-limit.middleware";
import { selfOrRole } from "@src/modules/common/middlewares/self-or-role.middleware";

const router = Router();

// Públicas (sin token): solo POST /login, declarada en core/routes/public.ts.
// Resto: el guard global exige token. Aquí se añade el control de rol.
const MANAGERS = ["ADMIN", "SHIFT"];

router.post("/datatable", requireRole(MANAGERS), getDataTable);
router.get("/", requireRole(MANAGERS), getAllUsers);
router.get("/coaches", requireRole(["ADMIN"]), getCoachesList);
router.post("/login", loginRateLimiter, validate({ body: loginBody }), login);
router.post("/", requireRole(["ADMIN"]), validate({ body: createUserBody }), createUser);
// Perfil propio (cualquiera) o cualquier usuario (ADMIN). Los campos de rol se filtran en el controlador.
router.put("/:id", selfOrRole(["ADMIN"]), validate({ params: idParam, body: updateUserBody }), updateUserProfile);
router.put("/:id/password", selfOrRole(["ADMIN"]), changePassword);
router.put("/:id/reset-password", requireRole(["ADMIN"]), resetPassword);
router.post("/logout", logout);
router.delete("/:id", requireRole(["ADMIN"]), deleteUser);

export default router;
