import express from "express";
import prisma from "../prisma/prismaClient";
import { authenticate } from "../middleware/authMiddleware";

const router = express.Router();

// add/update cart
router.post("/", authenticate, async (req: any, res) => {
  const { productId, qty } = req.body;

  if (!productId || qty === undefined) {
    return res.status(400).json({ message: "productId and qty are required" });
  }

  const parsedProductId = Number(productId);
  const parsedQty = Number(qty);
  if (Number.isNaN(parsedProductId) || Number.isNaN(parsedQty)) {
    return res.status(400).json({ message: "Invalid productId or qty" });
  }

  const product = await prisma.product.findUnique({ where: { id: parsedProductId } });
  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }
  if (product.stock <= 0) {
    return res.status(400).json({ message: "Product out of stock" });
  }
  if (parsedQty > product.stock) {
    return res.status(400).json({ message: "Quantity exceeds available stock" });
  }

  if (parsedQty <= 0) {
    await prisma.cart.deleteMany({
      where: { userId: req.user.id, productId: parsedProductId },
    });
    return res.json({ message: "Item removed from cart" });
  }

  const cart = await prisma.cart.upsert({
    where: {
      userId_productId: {
        userId: req.user.id,
        productId: parsedProductId,
      },
    },
    update: { qty: parsedQty },
    create: {
      userId: req.user.id,
      productId: parsedProductId,
      qty: parsedQty,
    },
  });

  res.json(cart);
});

// get cart
router.get("/", authenticate, async (req: any, res) => {
  const cart = await prisma.cart.findMany({
    where: { userId: req.user.id },
    include: { product: true },
  });

  res.json(cart);
});

// remove item cart
router.delete("/:productId", authenticate, async (req: any, res) => {
  const productId = Number(req.params.productId);
  if (Number.isNaN(productId)) {
    return res.status(400).json({ message: "Invalid productId" });
  }

  await prisma.cart.deleteMany({
    where: { userId: req.user.id, productId },
  });

  return res.json({ message: "Item removed from cart" });
});

// clear all cart
router.delete("/", authenticate, async (req: any, res) => {
  await prisma.cart.deleteMany({ where: { userId: req.user.id } });
  return res.json({ message: "Cart cleared" });
});

export default router;
