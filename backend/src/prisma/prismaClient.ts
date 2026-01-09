import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();


export default prisma;   // ✅ pastikan ada default export
