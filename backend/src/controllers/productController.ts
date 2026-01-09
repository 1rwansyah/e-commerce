import { prisma } from "../prisma/prismaClient";

export const getProducts = async (req: any, res: any) => {
  const search = req.query.search;
  const products = await prisma.product.findMany({
    where: search
      ? { name: { contains: search, mode: "insensitive" } }
      : {},
  });
  res.json(products);
};

export const getProduct = async (req: any, res: any) => {
  const product = await prisma.product.findUnique({
    where: { id: Number(req.params.id) },
  });
  res.json(product);
};

export const createProduct = async (req: any, res: any) => {
  const product = await prisma.product.create({
    data: { ...req.body, createdBy: req.user.id },
  });
  res.json(product);
};

export const updateProduct = async (req: any, res: any) => {
  const product = await prisma.product.update({
    where: { id: Number(req.params.id) },
    data: req.body,
  });
  res.json(product);
};

export const deleteProduct = async (req: any, res: any) => {
  await prisma.product.delete({
    where: { id: Number(req.params.id) },
  });
  res.json({ message: "Deleted" });
};
