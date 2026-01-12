import express from "express";
import { updateWifi } from "../controllers/wifiController.js";

const router = express.Router();

// Define the route for updating wifi
router.post("/update_wifi", updateWifi);

export default router;
