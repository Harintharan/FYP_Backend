import express from "express";
import helmet from "helmet";
import cors from "cors";
import { host, port } from "./config.js";
import authRoutes from "./routes/auth.js";
import registrationRoutes from "./routes/registrations.js";
import testRoutes from "./routes/test.js";
import batchRoutes from "./routes/batchRoutes.js";
import productCategoryRoutes from "./routes/ProductCategoryRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import packageRegistryRoutes from "./routes/PackageRegistryRoutes.js";
import sensorTypeRoutes from "./routes/SensorTypeRoutes.js";
import checkpointRoutes from "./routes/checkpointRoutes.js";
import shipmentRoutes from "./routes/shipmentRoutes.js";
import shipmentSegmentRoutes from "./routes/shipmentSegmentRoutes.js";
// sensorData and sensorDataBreach APIs removed - legacy tables were dropped
import telemetryRoutes from "./routes/telemetryRoutes.js";
import packageStatusRoutes from "./routes/packageStatusRoutes.js";
// sensorData and sensorDataBreach APIs removed - legacy tables were dropped
import { runMigrations } from "../migrations/index.js";
import { startAutomaticCleanup } from "./utils/tokenCleanup.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Support legacy /auth path plus canonical /api/auth path
app.use(["/auth", "/api/auth"], authRoutes);
app.use("/api/registrations", registrationRoutes);
app.use("/api/test", testRoutes);
app.use("/api/batches", batchRoutes);
app.use("/api/product-categories", productCategoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/package-registry", packageRegistryRoutes);
app.use("/api/sensor-types", sensorTypeRoutes);
// Legacy sensor_data routes removed to simplify telemetry handling
app.use("/api/telemetry", telemetryRoutes);
app.use("/api/package-status", packageStatusRoutes);
app.use("/api", checkpointRoutes);
app.use("/api", shipmentRoutes);
app.use("/api", shipmentSegmentRoutes);

app.use((err, _req, res, _next) => {
  console.error("Unhandled error", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(port, host, async () => {
  const networkHint =
    host === "0.0.0.0"
      ? " (share your machine's LAN IP so others on the network can connect)"
      : "";
  console.log(`Server listening on ${host}:${port}${networkHint}`);
  try {
    await runMigrations();
    console.log("✅ Database setup completed successfully");
    startAutomaticCleanup(24);
    console.log("✅ Automatic token cleanup started");
  } catch (err) {
    console.error("❌ Error setting up database:", err);
  }
});
