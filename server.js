const express = require("express");
const productRoutes = require("./routes/productRoutes");
const userRoutes = require("./routes/userRoutes");
const iotBatchRoutes = require("./routes/iotBatchRoutes");
const pool = require("./config/db"); // DB connection
require("dotenv").config();

const app = express();
console.log("DEBUG productRoutes =", productRoutes);


app.use(express.json());

// Routes
app.use("/api/products", productRoutes);
app.use("/api/users", userRoutes);
app.use("/api/iot-batches", iotBatchRoutes);

// Create table at startup
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        manufacturer TEXT NOT NULL,
        details TEXT NOT NULL,
        db_hash TEXT,
        block_id TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        eth_address TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        id_number TEXT NOT NULL,
        company TEXT NOT NULL,
        role TEXT NOT NULL,
        details_hash TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS iot_batches (
        id SERIAL PRIMARY KEY,
        product_id INT REFERENCES products(id) ON DELETE CASCADE,
        readings JSONB NOT NULL,
        batch_hash TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("✅ Database tables ready");
  } catch (err) {
    console.error("❌ Error creating tables:", err);
  }
};


const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await initDB();
});
