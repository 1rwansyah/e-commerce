import express from "express";
import { payOrder, midtransWebhook } from "../controllers/paymenController";

const router = express.Router();

router.post("/pay", payOrder);
router.get("/webhook", (_req, res) => {
  return res.status(200).json({ ok: true });
});
router.get("/public-key", (_req, res) => {
  const clientKey = process.env.MIDTRANS_CLIENT_KEY;
  if (!clientKey) {
    return res.status(500).json({ message: "MIDTRANS_CLIENT_KEY not configured" });
  }
  return res.json({ clientKey });
});
router.post("/webhook", midtransWebhook);

export default router;
