import { getConfig } from "@src/core/utils/config";
import dotenv from "dotenv";
dotenv.config();

export const secretKey = getConfig("APP_SECRET");
