import { Router } from "express";
import {
  summarizeFalsification,
  DEFAULT_HASH_BITS,
} from "../services/falsificationAnalysis.js";

const router = Router();

router.get("/falsification", (req, res) => {
  const N = Number.parseInt(String(req.query.N ?? 1), 10);
  const b = Number.parseInt(String(req.query.b ?? DEFAULT_HASH_BITS), 10);
  const safeN = Number.isFinite(N) && N > 0 ? N : 1;
  const safeB = Number.isFinite(b) && b > 0 ? b : DEFAULT_HASH_BITS;
  const summary = summarizeFalsification({ N: safeN, b: safeB });
  res.json(summary);
});

export default router;

