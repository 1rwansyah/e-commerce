import express from "express";
import prisma from "../prisma/prismaClient";
import { authenticate } from "../middleware/authMiddleware";

const router = express.Router();

// list wishlist (user)
router.get("/", authenticate, async (req: any, res) => {
  try {
    const items = await (prisma as any).wishlist.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        product: true,
      },
    });
    return res.json({ items });
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || "Failed to load wishlist" });
  }
});

// toggle wishlist
router.post("/toggle", authenticate, async (req: any, res) => {
  try {
    const productIdRaw = req.body?.productId;
    const productId = Number(productIdRaw);
    if (Number.isNaN(productId)) {
      return res.status(400).json({ message: "Invalid productId" });
    }

    const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const existing = await (prisma as any).wishlist.findUnique({
      where: { userId_productId: { userId: req.user.id, productId } },
      select: { id: true },
    });

    if (existing) {
      await (prisma as any).wishlist.delete({ where: { id: existing.id } });
      return res.json({ wished: false });
    }

    await (prisma as any).wishlist.create({
      data: { userId: req.user.id, productId },
    });

    return res.json({ wished: true });
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || "Failed to toggle wishlist" });
  }
});

export default router;
