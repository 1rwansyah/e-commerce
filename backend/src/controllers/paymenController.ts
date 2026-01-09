import { Request, Response } from "express";
import prisma from "../prisma/prismaClient";
import snap from "../lib/midtrans";

const formatMidtransTimeUTC = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  const Y = date.getUTCFullYear();
  const M = pad(date.getUTCMonth() + 1);
  const D = pad(date.getUTCDate());
  const h = pad(date.getUTCHours());
  const m = pad(date.getUTCMinutes());
  const s = pad(date.getUTCSeconds());
  return `${Y}-${M}-${D} ${h}:${m}:${s} +0000`;
};

export const payOrder = async (req: Request, res: Response) => {
  const { orderId } = req.body;

  try {
    const order = await prisma.order.findUnique({
      where: { id: Number(orderId) },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.status !== "pending") {
      return res.status(400).json({ message: "Order already processed" });
    }

    const recipientName = String((order as any).recipientName || "").trim();
    const phone = String((order as any).phone || "").trim();
    const address = String((order as any).address || "").trim();
    const postalCode = String((order as any).postalCode || "").trim();
    if (!recipientName || !phone || !address || !postalCode) {
      return res.status(400).json({ message: "Address is required before payment" });
    }

    // If order is older than 15 minutes, mark as expired and block payment
    const createdAt = new Date(order.createdAt as Date);
    const now = new Date();
    const diffMs = now.getTime() - createdAt.getTime();
    const expiryMs = 15 * 60 * 1000;
    if (diffMs >= expiryMs) {
      await prisma.order.update({ where: { id: order.id }, data: { status: "expired" } });
      return res.status(400).json({ message: "Order expired (exceeded 15 minutes from creation)" });
    }

    // Use unique order_id per payment attempt so user can reopen payment without conflict
    const midtransOrderId = `ORDER-${order.id}-${Date.now()}`;
    const transaction = await (snap as any).createTransaction({
      transaction_details: {
        order_id: midtransOrderId,
        gross_amount: order.total,
      },
      expiry: {
        start_time: formatMidtransTimeUTC(order.createdAt as Date),
        unit: "minutes",
        duration: 15,
      },
    });

    res.json({
      token: transaction.token,
    });
  } catch (error) {
    res.status(500).json({ error });
  }
};

export const midtransWebhook = async (req: Request, res: Response) => {
  try {
    const { order_id, transaction_status } = req.body as any;
    // Midtrans 'Test Notification URL' may call the endpoint without a real payload.
    // Return 200 to pass the URL validation.
    if (!order_id) return res.status(200).json({ ok: true, message: "no order_id (test)" });

    const idStr = String(order_id);
    // Accept formats like ORDER-123 or ORDER-123-1700000000000
    const afterPrefix = idStr.replace(/^ORDER-/, "");
    const numericId = Number(afterPrefix.split("-")[0]);
    if (Number.isNaN(numericId)) {
      // If Midtrans sends an unexpected order_id (e.g. test), respond 200 so Midtrans doesn't mark URL as failing.
      return res.status(200).json({ ok: true, message: "invalid order_id (ignored)" });
    }

    let status: string = "pending";
    const s = String(transaction_status || "").toLowerCase();
    if (s === "capture" || s === "settlement") status = "paid";
    else if (s === "expire" || s === "expired") status = "expired";
    else if (s === "cancel" || s === "cancelled" || s === "deny") status = "cancelled";
    else if (s === "pending") status = "pending";

    const existing = await prisma.order.findUnique({
      where: { id: numericId },
      include: { items: true },
    });
    // Midtrans expects 200 even if we can't match the order.
    if (!existing) return res.status(200).json({ ok: true, message: "Order not found (ignored)" });

    const wasPaid = String(existing.status).toLowerCase() === "paid";
    const willBePaid = status === "paid";

    await prisma.$transaction(async (tx) => {
      if (willBePaid && !wasPaid) {
        for (const it of existing.items) {
          const prod = await tx.product.findUnique({ where: { id: it.productId }, select: { stock: true } });
          if (prod) {
            const newStock = Math.max(0, (prod.stock ?? 0) - it.qty);
            await tx.product.update({ where: { id: it.productId }, data: { stock: newStock } });
          }
        }
      }
      const data: any = { status };
      if (willBePaid && !wasPaid) {
        data.paidAt = new Date();
      }
      await tx.order.update({ where: { id: numericId }, data });
    });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error });
  }
};
