import express from "express";
import prisma from "../prisma/prismaClient";
import { authenticate } from "../middleware/authMiddleware";
import { adminOnly } from "../middleware/adminonly";

const getDiscountedUnitPrice = (product: any) => {
  const base = Number(product?.price ?? 0);
  const pct = Number(product?.discountPercent ?? 0);
  if (!Number.isFinite(base) || base <= 0) return 0;
  if (!Number.isFinite(pct) || pct <= 0) return base;
  const clamped = Math.max(0, Math.min(100, pct));
  const discounted = base * (1 - clamped / 100);
  return Math.max(0, discounted);
};

const router = express.Router();

// create order
router.post("/", authenticate, async (req: any, res) => {
  try {
    const recipientNameRaw = req.body?.recipientName;
    const phoneRaw = req.body?.phone;
    const addressRaw = req.body?.address;
    const postalCodeRaw = req.body?.postalCode;
    const recipientName = typeof recipientNameRaw === "string" ? recipientNameRaw.trim() : "";
    const phone = typeof phoneRaw === "string" ? phoneRaw.trim() : "";
    const address = typeof addressRaw === "string" ? addressRaw.trim() : "";
    const postalCode = typeof postalCodeRaw === "string" ? postalCodeRaw.trim() : "";

    const prof = await (prisma as any).profile.findUnique({
      where: { id: req.user.id },
      select: { defaultRecipientName: true, defaultPhone: true, defaultAddress: true, defaultPostalCode: true },
    });

    const finalRecipientName = recipientName || String((prof as any)?.defaultRecipientName || "").trim();
    const finalPhone = phone || String((prof as any)?.defaultPhone || "").trim();
    const finalAddress = address || String((prof as any)?.defaultAddress || "").trim();
    const finalPostalCode = postalCode || String((prof as any)?.defaultPostalCode || "").trim();

    const cart = await prisma.cart.findMany({
      where: { userId: req.user.id },
      include: { product: true },
    });

    if (cart.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // Validate stock and product availability before creating order
    for (const item of cart) {
      if (!item.product) {
        return res.status(400).json({ message: `Product not found for item ${item.productId}` });
      }
      if (item.product.stock <= 0) {
        return res.status(400).json({ message: `Product ${item.product.name} out of stock` });
      }
      if (item.qty > item.product.stock) {
        return res.status(400).json({ message: `Quantity for ${item.product.name} exceeds stock (${item.product.stock})` });
      }
    }

    const total = cart.reduce(
      (sum, item) => sum + getDiscountedUnitPrice(item.product) * item.qty,
      0
    );

    const order = await prisma.$transaction(async (tx) => {
      const txAny = tx as any;
      const created = await txAny.order.create({
        data: {
          userId: req.user.id,
          total,
          status: "pending",
          recipientName: finalRecipientName || null,
          phone: finalPhone || null,
          address: finalAddress || null,
          postalCode: finalPostalCode || null,
          items: {
            create: cart.map((item) => ({
              productId: item.productId,
              qty: item.qty,
              price: getDiscountedUnitPrice(item.product),
            })),
          },
        },
        include: {
          items: { include: { product: true } },
        },
      });

      await txAny.cart.deleteMany({ where: { userId: req.user.id } });
      return created;
    });

    return res.json({
      message: "Order created",
      order,
    });
  } catch (e) {
    return res.status(500).json(e);
  }
});

// update shipping info for an order (user)
router.put("/:id/shipping", authenticate, async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid order id" });

    const recipientName = typeof req.body?.recipientName === "string" ? req.body.recipientName.trim() : "";
    const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
    const address = typeof req.body?.address === "string" ? req.body.address.trim() : "";
    const postalCode = typeof req.body?.postalCode === "string" ? req.body.postalCode.trim() : "";

    if (!recipientName || !phone || !address || !postalCode) {
      return res.status(400).json({ message: "Shipping address is required (recipientName, phone, address, postalCode)" });
    }

    const existing = await (prisma as any).order.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, createdAt: true },
    });
    if (!existing) return res.status(404).json({ message: "Order not found" });
    if (existing.userId !== req.user.id) return res.status(403).json({ message: "Forbidden" });
    if (String(existing.status).toLowerCase() !== "pending") {
      return res.status(400).json({ message: "Order already processed" });
    }

    const createdAt = new Date(existing.createdAt as Date);
    const now = new Date();
    const diffMs = now.getTime() - createdAt.getTime();
    const expiryMs = 15 * 60 * 1000;
    if (diffMs >= expiryMs) {
      await (prisma as any).order.update({ where: { id }, data: { status: "expired" } });
      return res.status(400).json({ message: "Order expired (exceeded 15 minutes from creation)" });
    }

    const updated = await (prisma as any).order.update({
      where: { id },
      data: {
        recipientName,
        phone,
        address,
        postalCode,
      },
      include: { items: { include: { product: true } } },
    });

    return res.json({ message: "Shipping updated", order: updated });
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || "Failed to update shipping" });
  }
});

// get orders user
router.get("/", authenticate, async (req: any, res) => {
  try {
    const orders = await (prisma as any).order.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      include: { items: { include: { product: true } } },
    });

    return res.json(orders);
  } catch (e) {
    return res.status(500).json(e);
  }
});

// (optional admin) get all orders
router.get("/all", authenticate, adminOnly, async (_req: any, res) => {
  try {
    const orders = await (prisma as any).order.findMany({
      include: { user: true, items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
    });

    return res.json(orders);
  } catch (e) {
    return res.status(500).json(e);
  }
});

export default router;
