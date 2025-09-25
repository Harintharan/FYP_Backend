import express from "express";
import helmet from "helmet";
import cors from "cors";
import { port } from "./config.js";
import authRoutes from "./routes/auth.js";
import registrationRoutes from "./routes/registrations.js";
import testRoutes from "./routes/test.js";

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

app.use((err, _req, res, _next) => {
  console.error("Unhandled error", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
