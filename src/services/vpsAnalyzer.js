// ─────────────────────────────────────────────────────────────
//  vpsAnalyzer.js
//  Core VPS log analysis engine.
//  Detects log type, classifies errors, returns structured fix plans.
// ─────────────────────────────────────────────────────────────

import { callAI, streamAI } from "./aiProvider.js";

// ── Log type detector ─────────────────────────────────────────
export function detectLogType(content) {
  const c = content.toLowerCase();
  if (c.includes("nginx") || c.includes("upstream") || c.includes("server_name")) return "nginx";
  if (c.includes("apache") || c.includes("mod_") || c.includes("[mpm_")) return "apache";
  if (c.includes("php") && (c.includes("fpm") || c.includes("fatal error") || c.includes("warning:"))) return "php";
  if (c.includes("mysql") || c.includes("mariadb") || c.includes("innodb")) return "mysql";
  if (c.includes("postgresql") || c.includes("pg_") || c.includes("postgres")) return "postgres";
  if (c.includes("redis") || c.includes("aof") || c.includes("rdb")) return "redis";
  if (c.includes("systemd") || c.includes("kernel") || c.includes("oom") || c.includes("out of memory")) return "system";
  if (c.includes("docker") || c.includes("container") || c.includes("image")) return "docker";
  if (c.includes("certbot") || c.includes("let's encrypt") || c.includes("ssl") || c.includes("tls")) return "ssl";
  if (c.includes("ufw") || c.includes("iptables") || c.includes("firewall") || c.includes("blocked")) return "firewall";
  if (c.includes("ssh") || c.includes("sshd") || c.includes("failed password") || c.includes("invalid user")) return "ssh";
  if (c.includes("cron") || c.includes("crontab")) return "cron";
  if (c.includes("postfix") || c.includes("dovecot") || c.includes("smtp") || c.includes("imap")) return "mail";
  return "generic";
}

// ── Severity keywords ─────────────────────────────────────────
export function quickSeverity(content) {
  const c = content.toLowerCase();
  if (c.includes("out of memory") || c.includes("oom") || c.includes("killed process") ||
      c.includes("disk full") || c.includes("no space left") || c.includes("segfault") ||
      c.includes("kernel panic")) return "critical";
  if (c.includes("error") || c.includes("failed") || c.includes("fatal") ||
      c.includes("refused") || c.includes("timeout") || c.includes("denied")) return "high";
  if (c.includes("warn") || c.includes("deprecated") || c.includes("slow query")) return "medium";
  return "low";
}

// ── System prompt for log analysis ───────────────────────────
const LOG_ANALYSIS_SYSTEM = `You are an expert Linux systems administrator specializing in VPS server troubleshooting.
Analyze the provided server log and respond with ONLY a valid JSON object — no markdown, no extra text.

JSON format:
{
  "logType": "nginx | apache | php | mysql | postgres | redis | system | docker | ssl | firewall | ssh | cron | mail | generic",
  "severity": "critical | high | medium | low",
  "errorCount": <number of distinct errors found>,
  "summary": "<2-3 sentence plain English explanation of what is wrong>",
  "rootCause": "<the actual technical root cause>",
  "impact": "<what is this breaking for the end user right now>",
  "issues": [
    {
      "title": "<short issue name>",
      "description": "<what this specific error means>",
      "occurrences": <how many times seen>,
      "severity": "critical | high | medium | low"
    }
  ],
  "fixSteps": [
    {
      "step": <number>,
      "title": "<what this step does>",
      "command": "<exact bash command to run, or null if no command>",
      "explanation": "<why this command fixes the issue>",
      "dangerous": <true if this could cause data loss or downtime>,
      "runAsRoot": <true if requires sudo/root>
    }
  ],
  "preventionTips": ["<tip 1>", "<tip 2>", "<tip 3>"],
  "requiresRestart": <true | false>,
  "serviceToRestart": "<nginx | apache2 | php8.x-fpm | mysql | etc, or null>",
  "estimatedFixTime": "<e.g. 5 minutes | 30 minutes | requires investigation>",
  "shouldEscalate": <true if this needs senior admin attention>,
  "escalationReason": "<why escalation needed, or null>"
}`;

// ─────────────────────────────────────────────────────────────
//  analyzeLog — deep structured analysis, returns JSON
// ─────────────────────────────────────────────────────────────
export async function analyzeLog({ logContent, vpsContext = {}, provider }) {
  const logType = detectLogType(logContent);
  const quickSev = quickSeverity(logContent);

  const userMessage = `
Log type detected: ${logType}
Server context: ${JSON.stringify(vpsContext)}

=== SERVER LOG START ===
${logContent.slice(0, parseInt(process.env.LOG_MAX_CHARS || "12000"))}
=== SERVER LOG END ===

Analyze this log completely. Find ALL errors and issues.`;

  const result = await callAI({
    system: LOG_ANALYSIS_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
    provider,
    json: true,
  });

  let parsed;
  try {
    // Strip any accidental markdown code fences
    const cleaned = result.text.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    // Fallback if JSON parse fails
    parsed = {
      logType,
      severity: quickSev,
      summary: result.text.slice(0, 300),
      rootCause: "Could not parse structured response — see summary",
      issues: [],
      fixSteps: [],
      preventionTips: [],
      requiresRestart: false,
      shouldEscalate: true,
      escalationReason: "AI response was not structured JSON — manual review needed",
    };
  }

  return {
    ...parsed,
    meta: {
      provider: result.provider,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      analyzedAt: new Date().toISOString(),
      logLength: logContent.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────
//  streamLogChat — conversational follow-up on log issues (SSE)
//  Used after analyzeLog when user wants to ask follow-up questions
// ─────────────────────────────────────────────────────────────
export async function streamLogChat({ res, messages, vpsContext = {}, previousAnalysis = null, provider }) {
  const company = process.env.COMPANY_NAME || "HostPro";

  const system = `You are a senior Linux systems administrator AI for ${company}.
You are helping a customer debug their VPS server issues in real-time.

${previousAnalysis ? `
## Previous Log Analysis Context
Log type: ${previousAnalysis.logType}
Severity: ${previousAnalysis.severity}
Root cause: ${previousAnalysis.rootCause}
Service to restart: ${previousAnalysis.serviceToRestart || "none identified"}
` : ""}

${vpsContext.os ? `## Server Info\nOS: ${vpsContext.os}\nHostname: ${vpsContext.hostname || "unknown"}\nPlan: ${vpsContext.plan || "unknown"}` : ""}

## Your Rules
- Give EXACT bash commands in code blocks for every fix
- Warn with ⚠️ before any dangerous command
- Always explain what each command does before they run it  
- Suggest taking a snapshot before destructive operations
- If something is beyond VPS scope, say so clearly
- Be concise and direct — admins want solutions, not essays
- Format commands like this:
\`\`\`bash
sudo systemctl restart nginx
\`\`\``;

  await streamAI({ res, system, messages, provider });
}

// ─────────────────────────────────────────────────────────────
//  generateDiagnosticScript — returns a shell script the user
//  can run on their VPS to collect logs automatically
// ─────────────────────────────────────────────────────────────
export function generateDiagnosticScript() {
  return `#!/bin/bash
# HostPro VPS Diagnostic Script
# Run: bash diag.sh | tee diag-output.txt
# Then paste the output into the AI chat for analysis

echo "====== SYSTEM INFO ======"
uname -a
echo ""
echo "====== UPTIME & LOAD ======"
uptime
echo ""
echo "====== MEMORY ======"
free -m
echo ""
echo "====== DISK USAGE ======"
df -h
echo ""
echo "====== TOP PROCESSES ======"
ps aux --sort=-%cpu | head -15
echo ""
echo "====== RUNNING SERVICES ======"
systemctl list-units --type=service --state=running --no-pager
echo ""
echo "====== OPEN PORTS ======"
ss -tulnp
echo ""
echo "====== RECENT SYSTEM ERRORS ======"
journalctl -p err -n 80 --no-pager
echo ""
echo "====== NGINX ERROR LOG (last 100 lines) ======"
[ -f /var/log/nginx/error.log ] && tail -100 /var/log/nginx/error.log || echo "Nginx log not found"
echo ""
echo "====== APACHE ERROR LOG (last 100 lines) ======"
[ -f /var/log/apache2/error.log ] && tail -100 /var/log/apache2/error.log || echo "Apache log not found"
echo ""
echo "====== PHP-FPM LOG (last 100 lines) ======"
find /var/log -name "php*-fpm*" 2>/dev/null | head -1 | xargs -I{} tail -100 {} || echo "PHP-FPM log not found"
echo ""
echo "====== MYSQL ERROR LOG (last 100 lines) ======"
[ -f /var/log/mysql/error.log ] && tail -100 /var/log/mysql/error.log || echo "MySQL log not found"
echo ""
echo "====== FIREWALL STATUS ======"
ufw status verbose 2>/dev/null || iptables -L --line-numbers 2>/dev/null || echo "No firewall detected"
echo ""
echo "====== LAST 20 LOGINS ======"
last -n 20
echo ""
echo "====== FAILED SSH ATTEMPTS (last 30) ======"
grep "Failed password\\|Invalid user" /var/log/auth.log 2>/dev/null | tail -30 || journalctl -u ssh -n 30 --no-pager 2>/dev/null
echo ""
echo "====== CRON JOBS ======"
crontab -l 2>/dev/null || echo "No crontab for current user"
ls /etc/cron.d/ 2>/dev/null
echo ""
echo "====== END OF DIAGNOSTIC REPORT ======"`;
}
