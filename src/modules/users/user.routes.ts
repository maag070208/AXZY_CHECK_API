import Router from "express";
import { validate } from "@src/core/validation/validate";
import { idParam } from "@src/core/validation/common";
import { loginBody, createUserBody, updateUserBody } from "./user.schemas";
import { createUser, getAllUsers, login, getCoachesList, updateUserProfile, changePassword, logout, resetPassword, deleteUser, getDataTable } from "./user.controller";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { loginRateLimiter } from "@src/core/middlewares/rate-limit.middleware";
import { selfOrPermission } from "@src/modules/common/middlewares/require-permission.middleware";

const router = Router();

// Públicas (sin token): solo POST /login, declarada en core/routes/public.ts.
// Resto: el guard global exige token. Aquí se añade el control de rol.

router.post("/datatable", requirePermission("users.read"), getDataTable);
router.get("/", requirePermission("users.read"), getAllUsers);
router.get("/coaches", requirePermission("users.manage"), getCoachesList);
router.post("/login", loginRateLimiter, validate({ body: loginBody }), login);
router.post("/", requirePermission("users.manage"), validate({ body: createUserBody }), createUser);
// Perfil propio (cualquiera) o cualquier usuario (ADMIN). Los campos de rol se filtran en el controlador.
router.put("/:id", selfOrPermission("users.manage"), validate({ params: idParam, body: updateUserBody }), updateUserProfile);
router.put("/:id/password", selfOrPermission("users.manage"), changePassword);
router.put("/:id/reset-password", requirePermission("users.manage"), resetPassword);
router.post("/logout", logout);
router.delete("/:id", requirePermission("users.manage"), deleteUser);

export default router;
