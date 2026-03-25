// ─────────────────────────────────────────────────────────────
//  database.js
//  SQLite via better-sqlite3 — zero external DB needed.
//  Stores: admin users, API request logs, AI analysis logs,
//          settings, provider configs.
// ─────────────────────────────────────────────────────────────

import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import path from "path";

const DB_PATH = process.env.DB_PATH || "./data/hosting-ai.db";

// Ensure data directory exists
mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ─────────────────────────────────────────────────────────────
//  Schema — runs on startup, creates tables if not exist
// ─────────────────────────────────────────────────────────────
db.exec(`
  -- Admin users table
  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    last_login TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- API request logs — every request logged here
  CREATE TABLE IF NOT EXISTS request_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT DEFAULT (datetime('now')),
    method TEXT,
    path TEXT,
    ip TEXT,
    user_agent TEXT,
    status_code INTEGER,
    response_time_ms INTEGER,
    user_id TEXT,
    provider TEXT,
    error TEXT
  );

  -- AI analysis logs — VPS log analyses
  CREATE TABLE IF NOT EXISTS analysis_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT DEFAULT (datetime('now')),
    session_id TEXT,
    ip TEXT,
    provider TEXT,
    model TEXT,
    log_type TEXT,
    severity TEXT,
    log_snippet TEXT,
    summary TEXT,
    fix_steps_count INTEGER,
    input_tokens INTEGER,
    output_tokens INTEGER,
    duration_ms INTEGER,
    error TEXT
  );

  -- Chat message logs — all chat interactions
  CREATE TABLE IF NOT EXISTS chat_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT DEFAULT (datetime('now')),
    session_id TEXT,
    ip TEXT,
    mode TEXT,
    provider TEXT,
    model TEXT,
    message_count INTEGER,
    user_message TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    duration_ms INTEGER,
    error TEXT
  );

  -- Settings — key/value store for admin-configurable settings
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    updated_by TEXT
  );

  -- Admin activity log — who did what in admin panel
  CREATE TABLE IF NOT EXISTS admin_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT DEFAULT (datetime('now')),
    admin_username TEXT,
    action TEXT,
    detail TEXT,
    ip TEXT
  );

  -- Insert default settings if not exist
  INSERT OR IGNORE INTO settings (key, value, description) VALUES
    ('ai_provider', 'claude', 'Default AI provider'),
    ('max_tokens', '3000', 'Max tokens per AI response'),
    ('rate_limit_max', '30', 'Max requests per minute per IP'),
    ('log_retention_days', '30', 'Days to keep logs'),
    ('maintenance_mode', 'false', 'Set true to disable public API'),
    ('chat_enabled', 'true', 'Enable/disable chat endpoints'),
    ('vps_analysis_enabled', 'true', 'Enable/disable VPS log analysis'),
    ('company_name', 'HostPro', 'Company display name'),
    ('support_email', 'support@hostpro.com', 'Support email address');
`);

// ─────────────────────────────────────────────────────────────
//  Request Logs
// ─────────────────────────────────────────────────────────────
export function insertRequestLog(data) {
  const stmt = db.prepare(`
    INSERT INTO request_logs (method, path, ip, user_agent, status_code, response_time_ms, user_id, provider, error)
    VALUES (@method, @path, @ip, @userAgent, @statusCode, @responseTimeMs, @userId, @provider, @error)
  `);
  return stmt.run(data);
}

export function getRequestLogs({ limit = 100, offset = 0, path: filterPath, status, ip } = {}) {
  let query = "SELECT * FROM request_logs WHERE 1=1";
  const params = [];
  if (filterPath) { query += " AND path LIKE ?"; params.push(`%${filterPath}%`); }
  if (status) { query += " AND status_code = ?"; params.push(status); }
  if (ip) { query += " AND ip = ?"; params.push(ip); }
  query += " ORDER BY id DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);
  return db.prepare(query).all(...params);
}

export function getRequestStats() {
  return {
    total: db.prepare("SELECT COUNT(*) as n FROM request_logs").get().n,
    today: db.prepare("SELECT COUNT(*) as n FROM request_logs WHERE date(timestamp) = date('now')").get().n,
    errors: db.prepare("SELECT COUNT(*) as n FROM request_logs WHERE status_code >= 400").get().n,
    byStatus: db.prepare("SELECT status_code, COUNT(*) as count FROM request_logs GROUP BY status_code ORDER BY count DESC").all(),
    byPath: db.prepare("SELECT path, COUNT(*) as count FROM request_logs GROUP BY path ORDER BY count DESC LIMIT 10").all(),
    byProvider: db.prepare("SELECT provider, COUNT(*) as count FROM request_logs WHERE provider IS NOT NULL GROUP BY provider").all(),
  };
}

// ─────────────────────────────────────────────────────────────
//  Analysis Logs
// ─────────────────────────────────────────────────────────────
export function insertAnalysisLog(data) {
  const stmt = db.prepare(`
    INSERT INTO analysis_logs (session_id, ip, provider, model, log_type, severity, log_snippet, summary, fix_steps_count, input_tokens, output_tokens, duration_ms, error)
    VALUES (@sessionId, @ip, @provider, @model, @logType, @severity, @logSnippet, @summary, @fixStepsCount, @inputTokens, @outputTokens, @durationMs, @error)
  `);
  return stmt.run(data);
}

export function getAnalysisLogs({ limit = 100, offset = 0, severity, logType, provider } = {}) {
  let query = "SELECT * FROM analysis_logs WHERE 1=1";
  const params = [];
  if (severity) { query += " AND severity = ?"; params.push(severity); }
  if (logType) { query += " AND log_type = ?"; params.push(logType); }
  if (provider) { query += " AND provider = ?"; params.push(provider); }
  query += " ORDER BY id DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);
  return db.prepare(query).all(...params);
}

export function getAnalysisStats() {
  return {
    total: db.prepare("SELECT COUNT(*) as n FROM analysis_logs").get().n,
    today: db.prepare("SELECT COUNT(*) as n FROM analysis_logs WHERE date(timestamp) = date('now')").get().n,
    bySeverity: db.prepare("SELECT severity, COUNT(*) as count FROM analysis_logs GROUP BY severity").all(),
    byLogType: db.prepare("SELECT log_type, COUNT(*) as count FROM analysis_logs GROUP BY log_type ORDER BY count DESC").all(),
    byProvider: db.prepare("SELECT provider, COUNT(*) as count FROM analysis_logs GROUP BY provider").all(),
    avgTokens: db.prepare("SELECT AVG(input_tokens) as avg_in, AVG(output_tokens) as avg_out FROM analysis_logs").get(),
    criticalCount: db.prepare("SELECT COUNT(*) as n FROM analysis_logs WHERE severity = 'critical'").get().n,
  };
}

// ─────────────────────────────────────────────────────────────
//  Chat Logs
// ─────────────────────────────────────────────────────────────
export function insertChatLog(data) {
  const stmt = db.prepare(`
    INSERT INTO chat_logs (session_id, ip, mode, provider, model, message_count, user_message, input_tokens, output_tokens, duration_ms, error)
    VALUES (@sessionId, @ip, @mode, @provider, @model, @messageCount, @userMessage, @inputTokens, @outputTokens, @durationMs, @error)
  `);
  return stmt.run(data);
}

export function getChatLogs({ limit = 100, offset = 0, mode, provider } = {}) {
  let query = "SELECT * FROM chat_logs WHERE 1=1";
  const params = [];
  if (mode) { query += " AND mode = ?"; params.push(mode); }
  if (provider) { query += " AND provider = ?"; params.push(provider); }
  query += " ORDER BY id DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);
  return db.prepare(query).all(...params);
}

// ─────────────────────────────────────────────────────────────
//  Settings
// ─────────────────────────────────────────────────────────────
export function getSetting(key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row?.value;
}

export function getAllSettings() {
  return db.prepare("SELECT * FROM settings ORDER BY key").all();
}

export function setSetting(key, value, adminUsername = "system") {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at, updated_by)
    VALUES (?, ?, datetime('now'), ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `).run(key, String(value), adminUsername);
}

// ─────────────────────────────────────────────────────────────
//  Admin Users
// ─────────────────────────────────────────────────────────────
export function getAdminByUsername(username) {
  return db.prepare("SELECT * FROM admin_users WHERE username = ?").get(username);
}

export function createAdminUser(username, passwordHash, role = "admin") {
  return db.prepare("INSERT OR IGNORE INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)").run(username, passwordHash, role);
}

export function updateAdminLastLogin(username) {
  db.prepare("UPDATE admin_users SET last_login = datetime('now') WHERE username = ?").run(username);
}

export function getAllAdmins() {
  return db.prepare("SELECT id, username, role, last_login, created_at FROM admin_users").all();
}

export function deleteAdmin(id) {
  return db.prepare("DELETE FROM admin_users WHERE id = ?").run(id);
}

// ─────────────────────────────────────────────────────────────
//  Admin Audit
// ─────────────────────────────────────────────────────────────
export function insertAuditLog(adminUsername, action, detail, ip) {
  db.prepare("INSERT INTO admin_audit (admin_username, action, detail, ip) VALUES (?, ?, ?, ?)").run(adminUsername, action, detail, ip);
}

export function getAuditLogs(limit = 100) {
  return db.prepare("SELECT * FROM admin_audit ORDER BY id DESC LIMIT ?").all(limit);
}

// ─────────────────────────────────────────────────────────────
//  Dashboard Stats — combined overview for admin home
// ─────────────────────────────────────────────────────────────
export function getDashboardStats() {
  const last24h = db.prepare(`
    SELECT COUNT(*) as n FROM request_logs
    WHERE timestamp > datetime('now', '-24 hours')
  `).get().n;

  const tokenUsage = db.prepare(`
    SELECT
      SUM(input_tokens + output_tokens) as total_tokens,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens
    FROM analysis_logs
    WHERE date(timestamp) = date('now')
  `).get();

  const recentErrors = db.prepare(`
    SELECT path, status_code, error, timestamp
    FROM request_logs
    WHERE status_code >= 400
    ORDER BY id DESC LIMIT 10
  `).all();

  const hourlyChart = db.prepare(`
    SELECT strftime('%H:00', timestamp) as hour, COUNT(*) as requests
    FROM request_logs
    WHERE timestamp > datetime('now', '-24 hours')
    GROUP BY hour ORDER BY hour
  `).all();

  return {
    requests24h: last24h,
    analysisToday: getAnalysisStats().today,
    tokensToday: tokenUsage,
    recentErrors,
    hourlyChart,
    analysisStats: getAnalysisStats(),
    requestStats: getRequestStats(),
  };
}

// Cleanup old logs
export function cleanupOldLogs(daysToKeep = 30) {
  const cutoff = `datetime('now', '-${daysToKeep} days')`;
  const r1 = db.prepare(`DELETE FROM request_logs WHERE timestamp < ${cutoff}`).run();
  const r2 = db.prepare(`DELETE FROM analysis_logs WHERE timestamp < ${cutoff}`).run();
  const r3 = db.prepare(`DELETE FROM chat_logs WHERE timestamp < ${cutoff}`).run();
  return { requestLogs: r1.changes, analysisLogs: r2.changes, chatLogs: r3.changes };
}

export default db;
