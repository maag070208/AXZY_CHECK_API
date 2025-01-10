import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { getUserByEmail, getUsers } from "./user.service";
import { comparePassword, generateJWT } from "@src/core/utils/security";

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await getUserByEmail(email);

    if (!user) {
      return res.status(401).json(createTResult("", ["User not found"]));
    }

    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json(createTResult("", ["Invalid password"]));
    }

    return res.status(200).json(createTResult(await generateJWT(user)));
  } catch (error: any) {
    return res.status(500).json(createTResult("", error.message));
  }
};

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const users = await getUsers();

    return res.status(200).json(createTResult(users));
  } catch (error: any) {
    return res.status(500).json(createTResult("", error.message));
  }
};
