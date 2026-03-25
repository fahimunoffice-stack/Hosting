import jwt from "jsonwebtoken";
const SECRET = process.env.JWT_SECRET || "change_me";

export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch { res.status(401).json({ error: "Invalid or expired token" }); }
}

export function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.slice(7);
  if (token) { try { req.user = jwt.verify(token, SECRET); } catch {} }
  next();
}

export function generateToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });
}
