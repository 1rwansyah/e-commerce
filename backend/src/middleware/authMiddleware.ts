import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

export interface AuthUser {
  id: string;
  role: "user" | "admin" | string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

type JwtAuthPayload = {
  id: string;
  role: string;
  iat?: number;
  exp?: number;
};

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtAuthPayload;
    req.user = { id: decoded.id, role: decoded.role };
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
};
