import { Response } from "express";
import prisma from "../prisma/prismaClient";
import { AuthRequest } from "../middleware/authMiddleware";

// USER CHECKOUT
export const checkout = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const cartItems = await prisma.cart.findMany({
      where: { userId },
      include: { product: true },
    });

    if (cartItems.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    const total = cartItems.reduce(
      (sum, item) => sum + item.qty * item.product.price,
      0
    );

    const order = await prisma.order.create({
      data: {
        userId,
        total,
        status: "pending",
      },
    });

    // clear cart
    await prisma.cart.deleteMany({
      where: { userId },
    });

    res.json({
      message: "Checkout success",
      order,
    });
  } catch (error) {
    res.status(500).json({ error });
  }
};

// USER ORDERS
export const getMyOrders = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const orders = await prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    res.json(orders);
  } catch (error) {
    res.status(500).json({ error });
  }
};

// ADMIN - ALL ORDERS
export const getAllOrders = async (_req: AuthRequest, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      include: { user: true },
      orderBy: { createdAt: "desc" },
    });

    res.json(orders);
  } catch (error) {
    res.status(500).json({ error });
  }
};
