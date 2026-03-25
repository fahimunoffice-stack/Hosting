// ─────────────────────────────────────────────────────────────
//  setup.js — Run once: node src/utils/setup.js
//  Creates the initial admin user from .env credentials
// ─────────────────────────────────────────────────────────────

import "dotenv/config";
import bcrypt from "bcryptjs";
import { createAdminUser, getAdminByUsername } from "../services/database.js";

const username = process.env.ADMIN_USERNAME || "admin";
const password = process.env.ADMIN_PASSWORD || "ChangeMe123!";

async function setup() {
  console.log("\n🔧 Hosting AI Backend — Setup\n");

  // Validate environment
  const warnings = [];
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.includes("your_")) warnings.push("⚠️  ANTHROPIC_API_KEY not set");
  if (!process.env.ADMIN_JWT_SECRET || process.env.ADMIN_JWT_SECRET.includes("secret")) warnings.push("⚠️  ADMIN_JWT_SECRET is using default — CHANGE THIS!");
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes("change")) warnings.push("⚠️  JWT_SECRET is using default — CHANGE THIS!");
  if (!process.env.ADMIN_SECRET_PATH || process.env.ADMIN_SECRET_PATH.includes("CHANGE")) warnings.push("⚠️  ADMIN_SECRET_PATH still has default value — CHANGE IT!");
  if (password === "ChangeMe123!") warnings.push("⚠️  ADMIN_PASSWORD is using default — change it in .env");

  if (warnings.length > 0) {
    console.log("Warnings:\n" + warnings.join("\n") + "\n");
  }

  // Create admin user
  const existing = getAdminByUsername(username);
  if (existing) {
    console.log(`✅ Admin user '${username}' already exists — skipping creation`);
  } else {
    const hash = await bcrypt.hash(password, 12);
    createAdminUser(username, hash, "superadmin");
    console.log(`✅ Admin user created:`);
    console.log(`   Username: ${username}`);
    console.log(`   Password: ${password}`);
    console.log(`   Role:     superadmin\n`);
  }

  console.log(`📊 Database: ${process.env.DB_PATH || "./data/hosting-ai.db"}`);
  console.log(`🔐 Admin path: ${process.env.ADMIN_SECRET_PATH || "/admin-CHANGE_THIS_NOW"}`);
  console.log(`🤖 Default AI provider: ${process.env.AI_PROVIDER || "claude"}`);
  console.log(`\n✅ Setup complete! Run: npm run dev\n`);

  process.exit(0);
}

setup().catch(err => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
