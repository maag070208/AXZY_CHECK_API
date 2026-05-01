import Router from "express";
import { createUser, getAllUsers, login, getCoachesList, updateUserProfile, changePassword, logout, resetPassword, deleteUser, getDataTable } from "./user.controller";

const router = Router();

router.post("/datatable", getDataTable);

router.get("/", getAllUsers);
router.get("/coaches", getCoachesList);
router.post("/login", login);
router.post("/", createUser);
router.put("/:id", updateUserProfile);
router.put("/:id/password", changePassword);
router.put("/:id/reset-password", resetPassword);
router.post("/logout", logout); 
router.delete("/:id", deleteUser);



export default router;
