import Router from "express";
import { validate } from "@src/core/validation/validate";
import { idParam } from "@src/core/validation/common";
import { loginBody, createUserBody, updateUserBody, changePasswordBody, resetPasswordBody } from "./user.schemas";
import { createUser, getAllUsers, getUser, login, updateUserProfile, changePassword, logout, resetPassword, deleteUser, getDataTable, getMyPermissions } from "./user.controller";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { loginRateLimiter } from "@src/core/middlewares/rate-limit.middleware";
import { selfOrPermission } from "@src/modules/common/middlewares/require-permission.middleware";

const router = Router();

// Públicas (sin token): solo POST /login, declarada en core/routes/public.ts.
// Resto: el guard global exige token. Aquí se añade el control de rol.

router.get("/me/permissions", getMyPermissions);
router.post("/datatable", requirePermission("users.read"), getDataTable);
router.get("/", requirePermission("users.read"), getAllUsers);
// Perfil propio (cualquier rol) o cualquier usuario (ADMIN). Devuelve rol/horario
// y nunca el hash de la contraseña.
router.get("/:id", selfOrPermission("users.manage"), validate({ params: idParam }), getUser);
router.post("/login", loginRateLimiter, validate({ body: loginBody }), login);
router.post("/", requirePermission("users.manage"), validate({ body: createUserBody }), createUser);
// Perfil propio (cualquiera) o cualquier usuario (ADMIN). Los campos de rol se filtran en el controlador.
router.put("/:id", selfOrPermission("users.manage"), validate({ params: idParam, body: updateUserBody }), updateUserProfile);
router.put("/:id/password", selfOrPermission("users.manage"), validate({ params: idParam, body: changePasswordBody }), changePassword);
router.put("/:id/reset-password", requirePermission("users.manage"), validate({ params: idParam, body: resetPasswordBody }), resetPassword);
router.post("/logout", logout);
router.delete("/:id", requirePermission("users.manage"), validate({ params: idParam }), deleteUser);

export default router;
