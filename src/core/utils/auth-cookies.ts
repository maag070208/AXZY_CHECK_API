import { Request, Response } from "express";

export const SESSION_COOKIE = "checkapp_session";
export const REFRESH_COOKIE = "checkapp_refresh";
export const REFRESH_COOKIE_PATH = "/api/v1/users/refresh";

const isProduction = process.env.NODE_ENV === "production";

const baseOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: isProduction,
};

export const readCookie = (req: Request, name: string): string | null => {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
};

export const setSessionCookies = (res: Response, accessToken: string, refreshToken: string) => {
  res.cookie(SESSION_COOKIE, accessToken, {
    ...baseOptions,
    maxAge: 24 * 60 * 60 * 1000,
    path: "/",
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseOptions,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: REFRESH_COOKIE_PATH,
  });
};

export const clearSessionCookies = (res: Response) => {
  res.clearCookie(SESSION_COOKIE, { ...baseOptions, path: "/" });
  res.clearCookie(REFRESH_COOKIE, { ...baseOptions, path: REFRESH_COOKIE_PATH });
};
