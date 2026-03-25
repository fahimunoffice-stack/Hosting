// ─────────────────────────────────────────────────────────────
//  Admin Panel Routes
//  Mounted at ADMIN_SECRET_PATH (e.g. /admin-x7k2p9)
//  All routes here require admin JWT except /login
// ─────────────────────────────────────────────────────────────

import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import {
  getAdminByUsername, createAdminUser, updateAdminLastLogin,
  getAllAdmins, deleteAdmin,
  getDashboardStats, getRequestLogs, getRequestStats,
  getAnalysisLogs, getAnalysisStats,
  getChatLogs,
  getAllSettings, getSetting, setSetting,
  getAuditLogs, cleanupOldLogs, insertAuditLog,
} from "../services/database.js";
import { requireAdmin, generateAdminToken, audit } from "../middleware/adminAuth.js";
import { listProviders } from "../services/aiProvider.js";
import { logger } from "../services/logger.js";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const router = Router();

// Strict rate limiter for admin — 10 req/min
const adminLimiter = rateLimit({
  windowMs: 60000,
  max: parseInt(process.env.ADMIN_RATE_LIMIT_MAX || "10"),
  message: { error: "Too many admin requests" },
});
router.use(adminLimiter);

// ── POST /login ───────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  const admin = getAdminByUsername(username);

  if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
    logger.warn(`Failed admin login attempt for: ${username}`, {
      ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
    });
    // Generic error — don't reveal whether username exists
    return res.status(401).json({ error: "Invalid credentials" });
  }

  updateAdminLastLogin(username);
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
  insertAuditLog(username, "LOGIN", "Admin logged in", ip);

  const token = generateAdminToken(admin);
  logger.info(`Admin login: ${username}`);

  res.json({
    success: true,
    token,
    admin: { id: admin.id, username: admin.username, role: admin.role },
    expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || "8h",
  });
});

// ── POST /logout ──────────────────────────────────────────────
router.post("/logout", requireAdmin, (req, res) => {
  audit(req, "LOGOUT", "Admin logged out");
  res.json({ success: true });
});

// ── GET /me ───────────────────────────────────────────────────
router.get("/me", requireAdmin, (req, res) => {
  res.json({ admin: req.admin });
});

// ════════════════════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════════════════════

router.get("/dashboard", requireAdmin, (req, res) => {
  try {
    const stats = getDashboardStats();
    const providers = listProviders();
    const settings = getAllSettings();
    const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]));

    res.json({
      success: true,
      stats,
      providers,
      settings: settingsMap,
      serverInfo: {
        nodeVersion: process.version,
        uptime: Math.floor(process.uptime()),
        memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
        pid: process.pid,
        env: process.env.NODE_ENV,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  LOGS — Request Logs
// ════════════════════════════════════════════════════════════

router.get("/logs/requests", requireAdmin, (req, res) => {
  const { limit = 100, offset = 0, path: p, status, ip } = req.query;
  const logs = getRequestLogs({ limit: +limit, offset: +offset, path: p, status: status ? +status : undefined, ip });
  const stats = getRequestStats();
  res.json({ success: true, logs, stats, total: stats.total });
});

// ── Analysis Logs ─────────────────────────────────────────────
router.get("/logs/analysis", requireAdmin, (req, res) => {
  const { limit = 100, offset = 0, severity, logType, provider } = req.query;
  const logs = getAnalysisLogs({ limit: +limit, offset: +offset, severity, logType, provider });
  const stats = getAnalysisStats();
  res.json({ success: true, logs, stats });
});

// ── Chat Logs ─────────────────────────────────────────────────
router.get("/logs/chat", requireAdmin, (req, res) => {
  const { limit = 100, offset = 0, mode, provider } = req.query;
  const logs = getChatLogs({ limit: +limit, offset: +offset, mode, provider });
  res.json({ success: true, logs });
});

// ── File Logs (from Winston log files) ───────────────────────
router.get("/logs/files", requireAdmin, (req, res) => {
  const logDir = process.env.LOG_DIR || "./logs";
  try {
    const files = readdirSync(logDir)
      .filter(f => f.endsWith(".log") || f.endsWith(".gz"))
      .map(f => {
        const fp = path.join(logDir, f);
        const stat = statSync(fp);
        return { name: f, size: stat.size, modified: stat.mtime };
      })
      .sort((a, b) => b.modified - a.modified);
    res.json({ success: true, files });
  } catch {
    res.json({ success: true, files: [] });
  }
});

// Read a specific log file (last N lines)
router.get("/logs/files/:filename", requireAdmin, (req, res) => {
  const logDir = process.env.LOG_DIR || "./logs";
  const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, ""); // sanitize
  const lines = parseInt(req.query.lines || "200");

  if (!filename.endsWith(".log")) {
    return res.status(400).json({ error: "Can only read .log files" });
  }

  try {
    const content = readFileSync(path.join(logDir, filename), "utf8");
    const allLines = content.trim().split("\n");
    const tail = allLines.slice(-Math.min(lines, 1000));
    res.json({ success: true, filename, lines: tail, total: allLines.length });
  } catch {
    res.status(404).json({ error: "Log file not found" });
  }
});

// ── Audit Log ─────────────────────────────────────────────────
router.get("/logs/audit", requireAdmin, (req, res) => {
  const logs = getAuditLogs(parseInt(req.query.limit || "100"));
  res.json({ success: true, logs });
});

// ── Cleanup old logs ──────────────────────────────────────────
router.delete("/logs/cleanup", requireAdmin, (req, res) => {
  const days = parseInt(req.query.days || getSetting("log_retention_days") || "30");
  const result = cleanupOldLogs(days);
  audit(req, "LOG_CLEANUP", `Deleted logs older than ${days} days. Removed: ${JSON.stringify(result)}`);
  res.json({ success: true, deleted: result });
});

// ════════════════════════════════════════════════════════════
//  SETTINGS
// ════════════════════════════════════════════════════════════

router.get("/settings", requireAdmin, (req, res) => {
  res.json({ success: true, settings: getAllSettings() });
});

router.put("/settings", requireAdmin, (req, res) => {
  const { settings } = req.body; // { key: value, ... }
  if (!settings || typeof settings !== "object") {
    return res.status(400).json({ error: "settings object required" });
  }

  const allowed = [
    "ai_provider", "max_tokens", "rate_limit_max", "log_retention_days",
    "maintenance_mode", "chat_enabled", "vps_analysis_enabled",
    "company_name", "support_email",
  ];

  const updated = [];
  for (const [key, value] of Object.entries(settings)) {
    if (!allowed.includes(key)) continue;
    setSetting(key, value, req.admin.username);
    updated.push(key);
  }

  audit(req, "SETTINGS_UPDATE", `Updated: ${updated.join(", ")}`);
  logger.info(`Admin ${req.admin.username} updated settings: ${updated.join(", ")}`);

  res.json({ success: true, updated });
});

// ════════════════════════════════════════════════════════════
//  AI PROVIDER MANAGEMENT
// ════════════════════════════════════════════════════════════

router.get("/providers", requireAdmin, (req, res) => {
  res.json({ success: true, providers: listProviders() });
});

// Update default provider (sets AI_PROVIDER env at runtime)
router.put("/providers/default", requireAdmin, (req, res) => {
  const { provider } = req.body;
  const valid = ["claude", "openai", "deepseek", "groq", "gemini", "openrouter"];
  if (!valid.includes(provider)) {
    return res.status(400).json({ error: `Invalid provider. Must be: ${valid.join(", ")}` });
  }
  process.env.AI_PROVIDER = provider;
  setSetting("ai_provider", provider, req.admin.username);
  audit(req, "PROVIDER_CHANGE", `Default AI provider changed to: ${provider}`);
  res.json({ success: true, defaultProvider: provider });
});

// Test a provider — send a quick test message
router.post("/providers/test", requireAdmin, async (req, res) => {
  const { provider } = req.body;
  const { callAI } = await import("../services/aiProvider.js");

  try {
    const start = Date.now();
    const result = await callAI({
      system: "You are a test assistant. Reply with exactly: 'Provider OK'",
      messages: [{ role: "user", content: "Test connection" }],
      provider,
    });
    res.json({
      success: true,
      provider,
      model: result.model,
      response: result.text,
      latencyMs: Date.now() - start,
      tokens: { input: result.inputTokens, output: result.outputTokens },
    });
  } catch (err) {
    res.status(500).json({ success: false, provider, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  ADMIN USER MANAGEMENT
// ════════════════════════════════════════════════════════════

router.get("/users", requireAdmin, (req, res) => {
  res.json({ success: true, users: getAllAdmins() });
});

router.post("/users", requireAdmin, async (req, res) => {
  const { username, password, role = "admin" } = req.body;
  if (!username || !password) return res.status(400).json({ error: "username and password required" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

  const hash = await bcrypt.hash(password, 12);
  const result = createAdminUser(username, hash, role);

  if (result.changes === 0) return res.status(409).json({ error: "Username already exists" });

  audit(req, "USER_CREATE", `Created admin user: ${username} (${role})`);
  res.json({ success: true, message: `Admin user '${username}' created` });
});

router.delete("/users/:id", requireAdmin, (req, res) => {
  if (req.admin.id === parseInt(req.params.id)) {
    return res.status(400).json({ error: "Cannot delete your own account" });
  }
  deleteAdmin(req.params.id);
  audit(req, "USER_DELETE", `Deleted admin user ID: ${req.params.id}`);
  res.json({ success: true });
});

// Change own password
router.put("/users/password", requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: "Both passwords required" });
  if (newPassword.length < 8) return res.status(400).json({ error: "New password must be 8+ characters" });

  const admin = getAdminByUsername(req.admin.username);
  if (!(await bcrypt.compare(currentPassword, admin.password_hash))) {
    return res.status(401).json({ error: "Current password incorrect" });
  }

  const hash = await bcrypt.hash(newPassword, 12);
  const db = (await import("../services/database.js")).default;
  db.prepare("UPDATE admin_users SET password_hash = ? WHERE username = ?").run(hash, req.admin.username);
  audit(req, "PASSWORD_CHANGE", "Admin changed their password");
  res.json({ success: true });
});

export default router;
