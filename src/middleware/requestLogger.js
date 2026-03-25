import { insertRequestLog } from "../services/database.js";
import { logger } from "../services/logger.js";

export function requestLogger(req, res, next) {
  const start = Date.now();
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress || "unknown";

  res.on("finish", () => {
    const ms = Date.now() - start;
    const isAdmin = req.path.includes(process.env.ADMIN_SECRET_PATH || "/admin");

    try {
      insertRequestLog({
        method: req.method,
        path: isAdmin ? "[ADMIN]" : req.path, // hide admin path in logs
        ip,
        userAgent: req.headers["user-agent"]?.slice(0, 200) || null,
        statusCode: res.statusCode,
        responseTimeMs: ms,
        userId: req.user?.id || null,
        provider: req.body?.provider || null,
        error: res.statusCode >= 400 ? res.locals.errorMessage || null : null,
      });
    } catch (e) {
      logger.error("Failed to insert request log", { error: e.message });
    }

    if (!isAdmin) {
      logger.info(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`, { ip });
    }
  });

  next();
}
