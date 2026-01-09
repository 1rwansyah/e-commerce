import express from "express";
import prisma from "../prisma/prismaClient";
import { authenticate } from "../middleware/authMiddleware";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();

const uploadDir = path.join(__dirname, "..", "..", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (
    _req: express.Request,
    _file: any,
    cb: (error: Error | null, destination: string) => void
  ) => cb(null, uploadDir),
  filename: (
    _req: express.Request,
    file: any,
    cb: (error: Error | null, filename: string) => void
  ) => {
    const ext = path.extname(file.originalname || "");
    const safeExt = ext && ext.length <= 10 ? ext : "";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (
    _req: express.Request,
    file: any,
    cb: multer.FileFilterCallback
  ) => {
    if (file.mimetype?.startsWith("image/")) return cb(null, true);
    return cb(new Error("Only image files are allowed"));
  },
});

// list reviews for a product (public)
router.get("/:productId", async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    if (Number.isNaN(productId)) {
      return res.status(400).json({ message: "Invalid productId" });
    }

    const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const reviews = await (prisma as any).review.findMany({
      where: { productId, parentId: null },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, email: true, role: true } },
        replies: {
          orderBy: { createdAt: "asc" },
          include: { user: { select: { id: true, email: true, role: true } } },
        },
      },
    });

    return res.json({ reviews });
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || "Failed to load reviews" });
  }
});

// create review for a product (user/admin)
router.post(
  "/:productId",
  authenticate,
  upload.single("image"),
  async (req: any, res) => {
  try {
    const productId = Number(req.params.productId);
    if (Number.isNaN(productId)) {
      return res.status(400).json({ message: "Invalid productId" });
    }

    const contentRaw = req.body?.content;
    const content = typeof contentRaw === "string" ? contentRaw.trim() : "";
    if (!content) {
      return res.status(400).json({ message: "content is required" });
    }
    if (content.length > 500) {
      return res.status(400).json({ message: "content is too long (max 500 chars)" });
    }

    const parentIdRaw = req.body?.parentId;
    const parentId = parentIdRaw === undefined || parentIdRaw === null || parentIdRaw === ""
      ? undefined
      : Number(parentIdRaw);
    if (parentId !== undefined && Number.isNaN(parentId)) {
      return res.status(400).json({ message: "Invalid parentId" });
    }

    const isAdmin = String(req.user?.role || "").toLowerCase() === "admin";
    const ratingRaw = req.body?.rating;
    // admin: komentar tanpa rating; reply: tanpa rating
    const rating = parentId !== undefined || isAdmin ? 5 : (ratingRaw === undefined ? 5 : Number(ratingRaw));
    if (!isAdmin) {
      if (Number.isNaN(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "rating must be between 1 and 5" });
      }
    }

    const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Non-admin user: only 1 top-level review per product (must edit afterwards)
    if (parentId === undefined && !isAdmin) {
      const existingTopLevel = await (prisma as any).review.findFirst({
        where: { productId, userId: req.user.id, parentId: null },
        select: { id: true },
      });
      if (existingTopLevel) {
        return res.status(409).json({ message: "You already reviewed this product. Please edit your review." });
      }
    }

    if (parentId !== undefined) {
      const parent = await (prisma as any).review.findUnique({ where: { id: parentId } });
      if (!parent || parent.productId !== productId) {
        return res.status(400).json({ message: "Invalid parentId for this product" });
      }
      if (parent.parentId !== null && parent.parentId !== undefined) {
        return res.status(400).json({ message: "Reply only supports 1 level" });
      }
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const imageUrl = req.file ? `${baseUrl}/uploads/${req.file.filename}` : undefined;

    const created = await (prisma as any).review.create({
      data: {
        productId,
        userId: req.user.id,
        content,
        rating,
        image: parentId !== undefined ? undefined : imageUrl,
        parentId,
      },
      include: { user: { select: { id: true, email: true, role: true } } },
    });

    return res.json(created);
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || "Failed to create review" });
  }
  }
);

// edit review (owner or admin)
router.put(
  "/:id",
  authenticate,
  upload.single("image"),
  async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid review id" });
      }

      const existing = await (prisma as any).review.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ message: "Review not found" });
      }

      const isAdmin = String(req.user?.role || "").toLowerCase() === "admin";
      if (!isAdmin && existing.userId !== req.user.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const contentRaw = req.body?.content;
      const content = typeof contentRaw === "string" ? contentRaw.trim() : "";
      if (!content) {
        return res.status(400).json({ message: "content is required" });
      }
      if (content.length > 500) {
        return res.status(400).json({ message: "content is too long (max 500 chars)" });
      }

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const imageUrl = req.file ? `${baseUrl}/uploads/${req.file.filename}` : undefined;
      const removeImage = String(req.body?.removeImage || "").toLowerCase() === "true";

      // replies: only allow editing content
      const isReply = existing.parentId !== null && existing.parentId !== undefined;
      if (isReply) {
        const updated = await (prisma as any).review.update({
          where: { id },
          data: { content },
          include: { user: { select: { id: true, email: true, role: true } } },
        });
        return res.json(updated);
      }

      const ratingRaw = req.body?.rating;
      const rating = ratingRaw === undefined || ratingRaw === null || ratingRaw === "" ? undefined : Number(ratingRaw);
      if (rating !== undefined && (Number.isNaN(rating) || rating < 1 || rating > 5)) {
        return res.status(400).json({ message: "rating must be between 1 and 5" });
      }

      const data: any = { content };
      if (rating !== undefined) data.rating = rating;

      if (removeImage) data.image = null;
      else if (imageUrl) data.image = imageUrl;

      const updated = await (prisma as any).review.update({
        where: { id },
        data,
        include: { user: { select: { id: true, email: true, role: true } } },
      });
      return res.json(updated);
    } catch (e: any) {
      return res.status(500).json({ message: e?.message || "Failed to update review" });
    }
  }
);

// delete review (owner or admin)
router.delete("/:id", authenticate, async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Invalid review id" });
    }

    const existing = await (prisma as any).review.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Review not found" });
    }

    if (existing.userId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    await (prisma as any).review.deleteMany({ where: { OR: [{ id }, { parentId: id }] } });
    return res.json({ message: "Review deleted" });
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || "Failed to delete review" });
  }
});

export default router;
