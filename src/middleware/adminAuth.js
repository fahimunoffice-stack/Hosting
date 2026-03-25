import jwt from "jsonwebtoken";
import { insertAuditLog } from "../services/database.js";

const ADMIN_SECRET = () => process.env.ADMIN_JWT_SECRET || "admin_fallback_change_this";

export function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.slice(7) || req.cookies?.adminToken;

  if (!token) {
    return res.status(401).json({ error: "Admin authentication required" });
  }

  try {
    const decoded = jwt.verify(token, ADMIN_SECRET());
    if (decoded.role !== "admin" && decoded.role !== "superadmin") {
      return res.status(403).json({ error: "Admin role required" });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired admin token" });
  }
}

export function generateAdminToken(admin) {
  return jwt.sign(
    { id: admin.id, username: admin.username, role: admin.role },
    ADMIN_SECRET(),
    { expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || "8h" }
  );
}

// Audit logging helper — use after sensitive admin actions
export function audit(req, action, detail) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
  insertAuditLog(req.admin?.username || "unknown", action, detail, ip);
}
