import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { addUser, getUserByEmail, getUsers } from "./user.service";
import {
  comparePassword,
  generateJWT,
  hashPassword,
} from "@src/core/utils/security";

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await getUserByEmail(email);
    console.log(user);
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
    const { q } = req.query;
    const users = await getUsers(q as string);

    return res.status(200).json(createTResult(users));
  } catch (error: any) {
    return res.status(500).json(createTResult("", error.message));
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const { name, lastName, email, password, role } = req.body;

    const existing = await getUserByEmail(email);
    if (existing) {
      return res
        .status(400)
        .json(createTResult(null, ["Email already exists"]));
    }

    const hashed = await hashPassword(password);

    const user = await addUser({
      name,
      lastName,
      email,
      password: hashed,
      role: role ?? "USER",
    });

    return res.status(201).json(createTResult(user));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const getCoachesList = async (req: Request, res: Response) => {
  try {
    const { getCoaches } = require("./user.service");
    const coaches = await getCoaches();
    return res.status(200).json(createTResult(coaches));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};
