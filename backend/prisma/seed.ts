import prisma from "../src/prisma/prismaClient";
import bcrypt from "bcryptjs";

async function main() {
  // Hash password
  const adminPassword = await bcrypt.hash("admin123", 10);
  const userPassword = await bcrypt.hash("user123", 10);

  // Admin user
  const admin = await prisma.profile.upsert({
    where: { email: "admin@gmail.com" },
    update: {},
    create: { email: "admin@gmail.com", password: adminPassword, role: "admin" },
  });

  // Regular user
  const user = await prisma.profile.upsert({
    where: { email: "user@example.com" },
    update: {},
    create: { email: "user@example.com", password: userPassword, role: "user" },
  });

  // Sample products created by admin
  await prisma.product.createMany({
    data: [
      { name: "Laptop", price: 1500, stock: 10, createdBy: admin.id },
      { name: "Smartphone", price: 700, stock: 20, createdBy: admin.id },
      { name: "Headphones", price: 100, stock: 30, createdBy: admin.id },
    ],
    skipDuplicates: true, // aman dijalankan berkali-kali
  });

  console.log("Seed data created ✅");
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
