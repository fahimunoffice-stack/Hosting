import { Router } from "express";
import { analyzeLog, streamLogChat, generateDiagnosticScript, detectLogType } from "../services/vpsAnalyzer.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { validateChatRequest } from "../middleware/validators.js";

const router = Router();

// ─────────────────────────────────────────────────────────────
//  POST /api/vps/analyze
//  Main log analysis endpoint — deep structured analysis
//  Returns full breakdown: errors, fix steps, commands, prevention
//
//  Body: {
//    logContent: string,       (required)
//    vpsContext?: object,      (optional server info)
//    provider?: string         (optional: claude|openai|groq|deepseek...)
//  }
// ─────────────────────────────────────────────────────────────
router.post("/analyze", optionalAuth, async (req, res) => {
  const { logContent, vpsContext, provider } = req.body;

  if (!logContent || typeof logContent !== "string") {
    return res.status(400).json({ error: "logContent is required" });
  }
  if (logContent.trim().length < 10) {
    return res.status(400).json({ error: "Log content too short to analyze" });
  }
  if (logContent.length > 50000) {
    return res.status(400).json({ error: "Log too large. Max 50,000 characters. Use the diagnostic script to get focused logs." });
  }

  try {
    const analysis = await analyzeLog({ logContent, vpsContext, provider });
    res.json({ success: true, analysis });
  } catch (err) {
    console.error("[VPS Analyze Error]", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/vps/chat
//  Streaming conversational VPS assistant (SSE)
//  Use for follow-up questions after analyzeLog
//
//  Body: {
//    messages: [{role, content}],
//    vpsContext?: object,
//    previousAnalysis?: object,   (from /analyze response)
//    provider?: string
//  }
// ─────────────────────────────────────────────────────────────
router.post("/chat", validateChatRequest, async (req, res) => {
  const { messages, vpsContext, previousAnalysis, provider } = req.body;

  await streamLogChat({
    res,
    messages,
    vpsContext,
    previousAnalysis,
    provider,
  });
});

// ─────────────────────────────────────────────────────────────
//  GET /api/vps/diagnostic-script
//  Returns a shell script the user runs on their VPS
//  Output can be pasted into /analyze for full diagnosis
// ─────────────────────────────────────────────────────────────
router.get("/diagnostic-script", (req, res) => {
  res.json({
    success: true,
    instructions: [
      "1. SSH into your VPS",
      "2. Copy the script below into a file: nano diag.sh",
      "3. Run it: bash diag.sh | tee diag-output.txt",
      "4. Copy the output and paste it into the AI log analyzer",
    ],
    script: generateDiagnosticScript(),
  });
});

// ─────────────────────────────────────────────────────────────
//  POST /api/vps/detect-type
//  Quick log type detection (no AI needed, instant)
// ─────────────────────────────────────────────────────────────
router.post("/detect-type", (req, res) => {
  const { logContent } = req.body;
  if (!logContent) return res.status(400).json({ error: "logContent required" });
  res.json({ success: true, logType: detectLogType(logContent) });
});

// ─────────────────────────────────────────────────────────────
//  GET /api/vps/common-commands
//  Quick reference of useful VPS diagnostic commands
// ─────────────────────────────────────────────────────────────
router.get("/common-commands", (req, res) => {
  res.json({
    success: true,
    categories: [
      {
        name: "System Health",
        commands: [
          { label: "CPU & Memory overview", cmd: "top -bn1 | head -25" },
          { label: "Memory usage", cmd: "free -m" },
          { label: "Disk usage", cmd: "df -h" },
          { label: "Disk I/O", cmd: "iostat -x 1 3" },
          { label: "System uptime & load", cmd: "uptime" },
          { label: "Top processes by CPU", cmd: "ps aux --sort=-%cpu | head -15" },
          { label: "Top processes by Memory", cmd: "ps aux --sort=-%mem | head -15" },
        ],
      },
      {
        name: "Web Server",
        commands: [
          { label: "Nginx status", cmd: "systemctl status nginx" },
          { label: "Nginx error log (last 100)", cmd: "tail -100 /var/log/nginx/error.log" },
          { label: "Nginx access log (last 50)", cmd: "tail -50 /var/log/nginx/access.log" },
          { label: "Nginx config test", cmd: "nginx -t" },
          { label: "Apache status", cmd: "systemctl status apache2" },
          { label: "Apache error log (last 100)", cmd: "tail -100 /var/log/apache2/error.log" },
          { label: "Apache config test", cmd: "apache2ctl configtest" },
        ],
      },
      {
        name: "PHP",
        commands: [
          { label: "PHP version", cmd: "php -v" },
          { label: "PHP-FPM status", cmd: "systemctl status php8.1-fpm" },
          { label: "PHP-FPM log", cmd: "tail -100 /var/log/php8.1-fpm.log" },
          { label: "PHP error log", cmd: "tail -100 /var/log/php_errors.log" },
        ],
      },
      {
        name: "Database",
        commands: [
          { label: "MySQL status", cmd: "systemctl status mysql" },
          { label: "MySQL error log", cmd: "tail -100 /var/log/mysql/error.log" },
          { label: "MySQL slow queries", cmd: "tail -100 /var/log/mysql/mysql-slow.log" },
          { label: "PostgreSQL status", cmd: "systemctl status postgresql" },
          { label: "PostgreSQL log", cmd: "tail -100 /var/log/postgresql/postgresql-*.log" },
        ],
      },
      {
        name: "Security",
        commands: [
          { label: "Firewall status", cmd: "ufw status verbose" },
          { label: "Open ports", cmd: "ss -tulnp" },
          { label: "Failed SSH logins", cmd: "grep 'Failed password' /var/log/auth.log | tail -30" },
          { label: "Last logins", cmd: "last -n 20" },
          { label: "Active connections", cmd: "ss -ant | awk '{print $1}' | sort | uniq -c" },
        ],
      },
      {
        name: "System Logs",
        commands: [
          { label: "System errors (last 50)", cmd: "journalctl -p err -n 50 --no-pager" },
          { label: "All recent logs", cmd: "journalctl -n 100 --no-pager" },
          { label: "OOM kills", cmd: "dmesg | grep -i 'oom\\|killed'" },
          { label: "Kernel errors", cmd: "dmesg | grep -i error | tail -20" },
          { label: "Boot log", cmd: "journalctl -b --no-pager | tail -50" },
        ],
      },
      {
        name: "Services",
        commands: [
          { label: "All running services", cmd: "systemctl list-units --type=service --state=running" },
          { label: "Failed services", cmd: "systemctl --failed" },
          { label: "Docker containers", cmd: "docker ps -a" },
          { label: "Docker logs (replace NAME)", cmd: "docker logs --tail 100 CONTAINER_NAME" },
        ],
      },
    ],
  });
});

export default router;
