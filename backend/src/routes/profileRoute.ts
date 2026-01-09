import express from "express";
import prisma from "../prisma/prismaClient";
import { authenticate } from "../middleware/authMiddleware";

const router = express.Router();

router.get("/me", authenticate, async (req: any, res) => {
  try {
    const me = await (prisma as any).profile.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        role: true,
        defaultRecipientName: true,
        defaultPhone: true,
        defaultAddress: true,
        defaultPostalCode: true,
      },
    });

    if (!me) return res.status(404).json({ message: "User not found" });
    return res.json(me);
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || "Failed to load profile" });
  }
});

router.put("/me", authenticate, async (req: any, res) => {
  try {
    const recipientName = typeof req.body?.defaultRecipientName === "string" ? req.body.defaultRecipientName.trim() : "";
    const phone = typeof req.body?.defaultPhone === "string" ? req.body.defaultPhone.trim() : "";
    const address = typeof req.body?.defaultAddress === "string" ? req.body.defaultAddress.trim() : "";
    const postalCode = typeof req.body?.defaultPostalCode === "string" ? req.body.defaultPostalCode.trim() : "";

    const updated = await (prisma as any).profile.update({
      where: { id: req.user.id },
      data: {
        defaultRecipientName: recipientName || null,
        defaultPhone: phone || null,
        defaultAddress: address || null,
        defaultPostalCode: postalCode || null,
      },
      select: {
        id: true,
        email: true,
        role: true,
        defaultRecipientName: true,
        defaultPhone: true,
        defaultAddress: true,
        defaultPostalCode: true,
      },
    });

    return res.json(updated);
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || "Failed to update profile" });
  }
});

export default router;
