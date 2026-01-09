import { Response } from "express";
import prisma from "../prisma/prismaClient";
import { AuthRequest } from "../middleware/authMiddleware";

export const addToCart = async (req: AuthRequest, res: Response) => {
  const { productId, qty } = req.body;
  const userId = req.user!.id;

  const cart = await prisma.cart.create({
    data: { userId, productId, qty },
  });

  res.json(cart);
};

export const getCart = async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const cart = await prisma.cart.findMany({
    where: { userId },
    include: { product: true },
  });

  res.json(cart);
};
