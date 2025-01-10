import Router from "express";
import { getAllUsers, login } from "./user.controller";

const router = Router();

router.get("/", getAllUsers);
router.post("/login", login);

export default router;
