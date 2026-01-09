import express from "express";
import prisma from "../prisma/prismaClient";
import { authenticate } from "../middleware/authMiddleware";
import { adminOnly } from "../middleware/adminonly";
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

// admin upload product image
router.post(
  "/:id/image",
  authenticate,
  adminOnly,
  upload.single("image"),
  async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid product id" });
      }

      const existing = await prisma.product.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "Image file is required" });
      }

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const imageUrl = `${baseUrl}/uploads/${req.file.filename}`;

      const updated = await prisma.product.update({
        where: { id },
        data: { image: imageUrl },
      });

      return res.json(updated);
    } catch (e: any) {
      return res.status(500).json({ message: e?.message || "Upload failed" });
    }
  }
);

// admin create product
router.post("/", authenticate, adminOnly, async (req: any, res) => {
  try {
    const { name, price, stock, image, description, discountPercent } = req.body;

    if (!name || price === undefined || stock === undefined) {
      return res
        .status(400)
        .json({ message: "name, price, and stock are required" });
    }

    const discount = discountPercent === undefined ? 0 : Number(discountPercent);
    if (Number.isNaN(discount) || discount < 0 || discount > 100) {
      return res.status(400).json({ message: "discountPercent must be between 0 and 100" });
    }

    const product = await (prisma as any).product.create({
      data: {
        name,
        description: description ? String(description) : undefined,
        price: Number(price),
        discountPercent: discount,
        stock: Number(stock),
        image: image ? String(image) : undefined,
        createdBy: req.user.id, // 🔥 FIX FINAL
      },
    });

    res.json(product);
  } catch (e) {
    res.status(500).json(e);
  }
});

// admin update product
router.put("/:id", authenticate, adminOnly, async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Invalid product id" });
    }

    const { name, price, stock, image, description, discountPercent } = req.body;

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Product not found" });
    }

    const normDiscountPercent = discountPercent === "" || discountPercent === null ? undefined : discountPercent;
    const normPrice = price === "" || price === null ? undefined : price;
    const normStock = stock === "" || stock === null ? undefined : stock;

    const discount =
      normDiscountPercent === undefined ? (existing as any).discountPercent ?? 0 : Number(normDiscountPercent);
    if (Number.isNaN(discount) || discount < 0 || discount > 100) {
      return res.status(400).json({ message: "discountPercent must be between 0 and 100" });
    }

    const updated = await (prisma as any).product.update({
      where: { id },
      data: {
        name: name ?? existing.name,
        description: description ?? (existing as any).description,
        price: normPrice === undefined ? existing.price : Number(normPrice),
        discountPercent: discount,
        stock: normStock === undefined ? existing.stock : Number(normStock),
        image: image ?? existing.image,
      },
    });

    return res.json(updated);
  } catch (e) {
    return res.status(500).json(e);
  }
});

// admin delete product
router.delete("/:id", authenticate, adminOnly, async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Invalid product id" });
    }

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Product not found" });
    }

    const orderItemCount = await (prisma as any).orderItem?.count?.({
      where: { productId: id },
    });
    if (typeof orderItemCount === "number" && orderItemCount > 0) {
      return res.status(409).json({
        message: "Product cannot be deleted because it is referenced by orders",
      });
    }

    await prisma.cart.deleteMany({ where: { productId: id } });
    await (prisma as any).wishlist?.deleteMany?.({ where: { productId: id } });
    await (prisma as any).review?.deleteMany?.({ where: { productId: id } });

    try {
      await prisma.product.delete({ where: { id } });
      return res.json({ message: "Product deleted" });
    } catch (e: any) {
      if (e?.code === "P2003") {
        return res.status(409).json({
          message:
            "Product cannot be deleted because it is still referenced by other records",
          details: e,
        });
      }
      throw e;
    }
  } catch (e) {
    return res.status(500).json(e);
  }
});

// public list
router.get("/", async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const sort = typeof req.query.sort === "string" ? req.query.sort : undefined;
  const maxPriceRaw = typeof req.query.maxPrice === "string" ? req.query.maxPrice : undefined;
  const maxPrice = maxPriceRaw ? Number(maxPriceRaw) : undefined;

  const where: any = {};
  if (search) {
    where.name = { contains: search, mode: "insensitive" };
  }
  if (typeof maxPrice === "number" && !Number.isNaN(maxPrice)) {
    where.price = { lte: maxPrice };
  }

  const orderBy: any =
    sort === "price_asc" ? { price: "asc" } : sort === "price_desc" ? { price: "desc" } : undefined;

  const products = await prisma.product.findMany({
    where,
    orderBy,
  });

  const ids = products.map((p) => p.id);
  const groups = ids.length
    ? await (prisma as any).review.groupBy({
        by: ["productId"],
        where: {
          productId: { in: ids },
          parentId: null,
          user: { role: { not: "admin" } },
        },
        _avg: { rating: true },
        _count: { _all: true },
      })
    : [];

  const ratingMap = new Map<number, { avgRating: number; reviewCount: number }>();
  for (const g of groups) {
    const pid = Number(g.productId);
    const avg = Number(g._avg?.rating ?? 0);
    const cnt = Number(g._count?._all ?? 0);
    ratingMap.set(pid, { avgRating: avg, reviewCount: cnt });
  }

  const enriched = products.map((p) => {
    const r = ratingMap.get(p.id);
    return {
      ...p,
      avgRating: r?.avgRating ?? 0,
      reviewCount: r?.reviewCount ?? 0,
    };
  });

  res.json(enriched);
});

// public get by id
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ message: "Invalid product id" });
  }

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  const agg = await (prisma as any).review.aggregate({
    where: { productId: id, parentId: null, user: { role: { not: "admin" } } },
    _avg: { rating: true },
    _count: { _all: true },
  });

  const avgRating = Number(agg?._avg?.rating ?? 0);
  const reviewCount = Number(agg?._count?._all ?? 0);

  return res.json({
    ...product,
    avgRating,
    reviewCount,
  });
});

export default router;
