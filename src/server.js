import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimiter } from "./middleware/rateLimiter.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { logger } from "./services/logger.js";
import { getSetting } from "./services/database.js";

import chatRoutes from "./routes/chat.js";
import vpsRoutes from "./routes/vps.js";
import planRoutes from "./routes/plans.js";
import healthRoutes from "./routes/health.js";
import adminRoutes from "./routes/admin.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: false }));

const origins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173").split(",").map(o => o.trim());
app.use(cors({
  origin: (origin, cb) => (!origin || origins.includes(origin)) ? cb(null, true) : cb(new Error(`CORS: ${origin}`)),
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

app.use(express.json({ limit: "100kb" }));
app.use(requestLogger);

// Maintenance mode check
app.use("/api/", (req, res, next) => {
  if (getSetting("maintenance_mode") === "true") {
    return res.status(503).json({ error: "Service temporarily unavailable." });
  }
  next();
});

app.use("/api/", rateLimiter);
app.use("/api/health", healthRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/vps", vpsRoutes);
app.use("/api/plans", planRoutes);

// Admin panel — mounted at secret hidden path
const ADMIN_PATH = process.env.ADMIN_SECRET_PATH || "/admin-CHANGE_THIS_NOW";
app.use(ADMIN_PATH, adminRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`🚀 Hosting AI v3 — port ${PORT} | provider: ${process.env.AI_PROVIDER || "claude"}`);
  logger.info(`Admin panel active at secret path (check ADMIN_SECRET_PATH in .env)`);
});
