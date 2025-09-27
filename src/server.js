const express = require("express");
// const productRoutes = require("./routes/productRoutes");
// const userRoutes = require("./routes/userRoutes");
// const iotBatchRoutes = require("./routes/iotBatchRoutes");
const batchRoutes = require("./routes/batchRoutes");
const productRegistryRoutes = require("./routes/ProductRegistryRoutes");
const checkpointRoutes = require("./routes/checkpointRoutes");
const shipmentRoutes = require("./routes/shipmentRoutes");
const ShipmentSegmentHandoverRoutes = require("./routes/ShipmentSegmentHandoverRoutes");
const ShipmentSegmentAcceptanceRoutes = require("./routes/shipmentSegmentAcceptanceRoutes");
const pool = require("./config/db"); // DB connection
require("dotenv").config();

const app = express();
//console.log("DEBUG productRoutes =", productRoutes);

app.use(express.json());

// Routes
//app.use("/api/products", productRoutes);
//app.use("/api/users", userRoutes);
//app.use("/api/iot-batches", iotBatchRoutes);
app.use("/api/batches", batchRoutes);
app.use("/api/product-registry", productRegistryRoutes);
app.use("/api", checkpointRoutes);
app.use("/api", shipmentRoutes);
app.use("/api", ShipmentSegmentAcceptanceRoutes);
app.use("/api", ShipmentSegmentHandoverRoutes);

// Import the migration runner
const { runMigrations } = require("../migrations");

// Initialize database by running migrations
const initDB = async () => {
  try {
    // Run all pending migrations
    await runMigrations();
    console.log("✅ Database setup completed successfully");
  } catch (err) {
    console.error("❌ Error setting up database:", err);
  }
};

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await initDB();
});
