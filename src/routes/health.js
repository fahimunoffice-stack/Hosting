import { Router } from "express";
import { listProviders } from "../services/aiProvider.js";

const router = Router();

// GET /api/health
router.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Hosting AI Backend",
    version: "2.0.0",
    company: process.env.COMPANY_NAME,
    defaultProvider: process.env.AI_PROVIDER || "claude",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()) + "s",
  });
});

// GET /api/providers — list all configured AI providers
router.get("/providers", (req, res) => {
  res.json({
    success: true,
    defaultProvider: process.env.AI_PROVIDER || "claude",
    providers: listProviders(),
  });
});

export default router;
