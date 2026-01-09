import { Request, Response } from "express";
import prisma from "../prisma/prismaClient";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const register = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "email and password are required" });
  }

  const existing = await prisma.profile.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ message: "Email already registered" });
  }

  const hashed = await bcrypt.hash(password, 10);

  const user = await prisma.profile.create({
    data: {
      email,
      password: hashed,
      role: "user",
    },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  return res.status(201).json(user);
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "email and password are required" });
  }

  const user = await prisma.profile.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ message: "Invalid credentials" });

  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: "1d" }
  );

  return res.json({
    token,
    user: { id: user.id, email: user.email, role: user.role },
  });
};
