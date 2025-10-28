import express from "express";
import helmet from "helmet";
import cors from "cors";
import { port } from "./config.js";
import authRoutes from "./routes/auth.js";
import registrationRoutes from "./routes/registrations.js";
import testRoutes from "./routes/test.js";
import batchRoutes from "./routes/batchRoutes.js";
import productCategoryRoutes from "./routes/ProductCategoryRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import packageRegistryRoutes from "./routes/PackageRegistryRoutes.js";
import checkpointRoutes from "./routes/checkpointRoutes.js";
import shipmentRoutes from "./routes/shipmentRoutes.js";
import shipmentSegmentRoutes from "./routes/shipmentSegmentRoutes.js";
import { runMigrations } from "../migrations/index.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/auth", authRoutes);
app.use("/api/registrations", registrationRoutes);
app.use("/api/test", testRoutes);
app.use("/api/batches", batchRoutes);
app.use("/api/product-categories", productCategoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/product-registry", packageRegistryRoutes);
app.use("/api", checkpointRoutes);
app.use("/api", shipmentRoutes);
app.use("/api", shipmentSegmentRoutes);

app.use((err, _req, res, _next) => {
  console.error("Unhandled error", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(port, async () => {
  console.log(`Server listening on port ${port}`);
  try {
    await runMigrations();
    console.log("✅ Database setup completed successfully");
  } catch (err) {
    console.error("❌ Error setting up database:", err);
  }
});
