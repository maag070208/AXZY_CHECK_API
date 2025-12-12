import Router from "express";
import { createUser, getAllUsers, login } from "./user.controller";

const router = Router();

router.get("/", getAllUsers);
router.post("/login", login);
router.post("/", createUser);

export default router;
