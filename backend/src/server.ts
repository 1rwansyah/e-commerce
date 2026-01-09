import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";

import authRoutes from "./routes/authRoute";
import productRoutes from "./routes/productRoute";
import cartRoutes from "./routes/cartRoute";
import orderRoutes from "./routes/orderRoute";
import paymentRoutes from "./routes/paymenRoute";
import adminRevenueRoutes from "./routes/adminRevenueRoute";
import reviewRoutes from "./routes/reviewRoute";
import wishlistRoutes from "./routes/wishlistRoute";
import profileRoutes from "./routes/profileRoute";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/midtrans", paymentRoutes);
app.use("/api/admin", adminRevenueRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/profile", profileRoutes);

app.get("/", (_, res) => {
  res.send("Backend E-Commerce Elektronik OK 🚀");
});

app.listen(5000, () =>
  console.log("Server running on http://localhost:5000")
);
