import express from "express";
import prisma from "../prisma/prismaClient";
import { authenticate } from "../middleware/authMiddleware";
import { adminOnly } from "../middleware/adminonly";

const router = express.Router();

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // Monday=0
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day);
  return date;
}

function startOfMonth(d: Date) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(1);
  return date;
}

function startOfYear(d: Date) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setMonth(0, 1);
  return date;
}

async function sumRevenue(createdBy: string | null, from: Date, to: Date) {
  const items: any[] = await prisma.orderItem.findMany({
    where: {
      order: {
        status: "paid",
        OR: [
          { paidAt: { gte: from, lt: to } } as any,
          { paidAt: null, createdAt: { gte: from, lt: to } } as any,
        ] as any,
      },
      ...(createdBy ? { product: { createdBy } } : {}),
    },
    select: {
      qty: true,
      price: true,
    },
  } as any);
  return items.reduce((sum, it) => sum + it.price * it.qty, 0);
}

router.get("/revenue/summary", authenticate as any, adminOnly as any, async (req: any, res) => {
  try {
    const scope = String(req.query.scope || "all").toLowerCase();
    const createdBy = scope === "mine" ? req.user.id : null;
    const now = new Date();
    const weekStart = startOfWeek(now);
    const weekEnd = new Date(weekStart.getTime());
    weekEnd.setDate(weekEnd.getDate() + 7);

    const monthStart = startOfMonth(now);
    const monthEnd = new Date(monthStart.getTime());
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    const yearStart = startOfYear(now);
    const yearEnd = new Date(yearStart.getTime());
    yearEnd.setFullYear(yearEnd.getFullYear() + 1);

    const [weekTotal, monthTotal, yearTotal] = await Promise.all([
      sumRevenue(createdBy, weekStart, weekEnd),
      sumRevenue(createdBy, monthStart, monthEnd),
      sumRevenue(createdBy, yearStart, yearEnd),
    ]);

    return res.json({
      week: { total: weekTotal, from: weekStart, to: weekEnd },
      month: { total: monthTotal, from: monthStart, to: monthEnd },
      year: { total: yearTotal, from: yearStart, to: yearEnd },
    });
  } catch (e) {
    return res.status(500).json({ error: "Failed to compute revenue" });
  }
});

router.get("/revenue/transactions", authenticate as any, adminOnly as any, async (req: any, res) => {
  try {
    const range = String(req.query.range || "month").toLowerCase();
    const scope = String(req.query.scope || "all").toLowerCase();
    const now = new Date();
    let from: Date;
    let to: Date;
    if (range === "all") {
      from = new Date(0);
      to = new Date("2100-01-01T00:00:00.000Z");
    } else if (range === "week") {
      from = startOfWeek(now);
      to = new Date(from.getTime());
      to.setDate(to.getDate() + 7);
    } else if (range === "year") {
      from = startOfYear(now);
      to = new Date(from.getTime());
      to.setFullYear(to.getFullYear() + 1);
    } else if (req.query.from && req.query.to) {
      from = new Date(String(req.query.from));
      to = new Date(String(req.query.to));
    } else {
      from = startOfMonth(now);
      to = new Date(from.getTime());
      to.setMonth(to.getMonth() + 1);
    }

    const items: any[] = await prisma.orderItem.findMany({
      where: {
        order: {
          status: "paid",
          ...(range === "all"
            ? {}
            : {
                OR: [
                  { paidAt: { gte: from, lt: to } } as any,
                  { paidAt: null, createdAt: { gte: from, lt: to } } as any,
                ] as any,
              }),
        },
        ...(scope === "mine" ? { product: { createdBy: req.user.id } } : {}),
      },
      include: {
        product: { select: { id: true, name: true } },
        order: { select: { id: true, createdAt: true, paidAt: true, user: { select: { id: true, email: true } } } },
      },
      orderBy: { orderId: "desc" },
    } as any);

    // Group by orderId
    const byOrder: Record<string, any> = {};
    for (const it of items) {
      const key = String(it.orderId);
      if (!byOrder[key]) {
        byOrder[key] = {
          orderId: it.orderId,
          createdAt: it.order?.createdAt,
          paidAt: it.order?.paidAt,
          user: it.order?.user,
          total: 0,
          items: [] as any[],
        };
      }
      const subtotal = it.price * it.qty;
      byOrder[key].total += subtotal;
      byOrder[key].items.push({
        productId: it.productId,
        name: it.product?.name,
        qty: it.qty,
        price: it.price,
        subtotal,
      });
    }

    const list = Object.values(byOrder).sort((a: any, b: any) => b.orderId - a.orderId);
    return res.json({ from, to, range, count: list.length, transactions: list });
  } catch (e) {
    return res.status(500).json({ error: "Failed to load transactions" });
  }
});

export default router;
