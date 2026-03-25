# 🛡️ ADMIN PANEL — LOVABLE PROMPT + HOME SERVER SETUP GUIDE

---

## ═══════════════════════════════════════════
## PART A: LOVABLE ADMIN PANEL PROMPTS
## ═══════════════════════════════════════════

Paste these into a SEPARATE Lovable project (not the main frontend).
The admin panel should be a different app/URL — never expose it publicly.

---

### ADMIN PROMPT 1 — Foundation & Auth

```
Build a secure admin panel for a hosting AI backend called "HostPro Admin".

Design:
- Dark professional theme (dark gray #0f1117 background, white text, indigo/purple accents)
- Full sidebar layout
- No public registration — admin accounts created from backend only

Pages/routes:
- "/login" — Admin login page (the only public page)
- "/dashboard" — Overview stats, charts, system health
- "/logs/requests" — HTTP request log viewer
- "/logs/analysis" — VPS log analysis history
- "/logs/chat" — Chat session history
- "/logs/files" — File log viewer (Winston log files)
- "/providers" — AI provider management and testing
- "/settings" — App settings control panel
- "/users" — Admin user management
- "/audit" — Admin activity audit log

Sidebar links (icons + labels):
- Dashboard (grid icon)
- Request Logs (activity icon)
- Analysis Logs (terminal icon)
- Chat Logs (message icon)
- File Logs (file icon)
- AI Providers (cpu icon)
- Settings (settings icon)
- Users (users icon)
- Audit Log (shield icon)
- Logout (logout icon)

Create an AuthContext that:
- Stores adminToken in sessionStorage (NOT localStorage — more secure)
- Stores admin user info { username, role }
- Provides login(token, admin) and logout() functions
- isAuthenticated: boolean

Create a ProtectedRoute component that redirects to /login if not authenticated.
All pages except /login are protected.

Create src/services/adminApi.ts:
const ADMIN_BASE = import.meta.env.VITE_ADMIN_URL;
const ADMIN_PATH = import.meta.env.VITE_ADMIN_PATH; // the secret path

Helper: adminFetch(endpoint, options) — adds Authorization header automatically
```

---

### ADMIN PROMPT 2 — Login Page

```
Build the /login page for the admin panel.

Design:
- Centered card on dark background
- Logo/title: shield icon + "HostPro Admin" 
- Subtitle: "Secure Management Console"
- Form fields:
  - Username (text input, autofocus)
  - Password (password input, show/hide toggle)
  - Login button (full width, indigo)
- On login:
  - POST to ${ADMIN_BASE}${ADMIN_PATH}/login
  - Body: { username, password }
  - On success: store token + admin in AuthContext, redirect to /dashboard
  - On 401: show "Invalid credentials" error in red
  - On network error: show "Cannot connect to admin backend"
- Loading state: button shows spinner while requesting
- Keyboard: Enter submits form
- Security: no "remember me", session only

DO NOT show any hint that this is an admin panel in page title or meta tags.
Page title: just "Login"
```

---

### ADMIN PROMPT 3 — Dashboard

```
Build the /dashboard page with real-time stats.

Fetch data from: GET ${ADMIN_BASE}${ADMIN_PATH}/dashboard

Display these sections:

TOP ROW — 4 stat cards:
1. "Requests (24h)" — stats.requests24h (blue icon: activity)
2. "Analyses Today" — stats.analysisToday (purple icon: terminal)
3. "Critical Issues" — stats.analysisStats.criticalCount (red icon: alert-triangle)  
4. "Tokens Used Today" — stats.tokensToday.total_tokens formatted with commas (green icon: zap)

SECOND ROW — 2 cards:
Left: "Requests by Hour" — line chart using recharts
  - Data: stats.hourlyChart [{hour, requests}]
  - Blue line, dark grid, white text
  - X-axis: hour labels, Y-axis: request count

Right: "Analysis by Severity" — horizontal bar chart
  - Data: stats.analysisStats.bySeverity [{severity, count}]
  - Colors: critical=red, high=orange, medium=yellow, low=green

THIRD ROW — 3 cards:
1. "Top Endpoints" — table: path | count (from stats.requestStats.byPath)
2. "By Provider" — small pie chart or bar: stats.requestStats.byProvider
3. "Server Info" — table:
   - Node.js: serverInfo.nodeVersion
   - Uptime: serverInfo.uptime (format as Xh Xm)
   - Memory: serverInfo.memoryMB MB
   - Environment: serverInfo.env badge
   - PID: serverInfo.pid

BOTTOM ROW — "Recent Errors" table:
Columns: Time | Path | Status | Error
Status code colored: 4xx=orange 5xx=red
Auto-refresh every 30 seconds with a subtle "last updated" timestamp.
```

---

### ADMIN PROMPT 4 — Log Viewers

```
Build 4 log viewer pages with shared LogTable component.

SHARED LogTable component:
- Dark table, alternating row colors (#0f1117 / #161b22)
- Sticky header
- Pagination: 50/100/200 per page selector + prev/next buttons
- Search/filter bar at top
- Export button: downloads visible data as CSV
- Auto-refresh toggle (30s intervals) with animated dot indicator
- Click a row to expand full details in a slide-out drawer

─── PAGE 1: /logs/requests ───
Fetch: GET /admin-path/logs/requests?limit=100&offset=0

Filters bar: [Status dropdown: All/2xx/4xx/5xx] [Path search input] [IP search]
Stats bar above table: Total | Today | Errors | Avg response time

Table columns:
- Time (relative: "2 min ago" with full datetime on hover)
- Method badge (GET=blue POST=green DELETE=red)
- Path
- Status (colored badge)
- Response Time (ms, colored: <100=green <500=yellow >500=red)
- IP
- Provider badge (if present)

─── PAGE 2: /logs/analysis ───
Fetch: GET /admin-path/logs/analysis

Filters: [Severity dropdown] [Log Type dropdown] [Provider dropdown]
Stats cards above: Total | Critical | By Provider pie

Table columns:
- Time
- Severity (CRITICAL=red HIGH=orange MEDIUM=yellow LOW=green badge)
- Log Type badge (nginx/apache/php/mysql etc with color coding)
- Summary (truncated to 80 chars, expand on hover)
- Fix Steps count
- Provider
- Tokens (input+output)
- Duration

Click row → drawer shows full analysis.summary + all fix steps

─── PAGE 3: /logs/chat ───
Fetch: GET /admin-path/logs/chat

Table columns:
- Time
- Mode badge (website/dashboard/vps)
- Provider
- Messages count
- User message (truncated)
- Tokens
- Duration

─── PAGE 4: /logs/files ───
Fetch file list: GET /admin-path/logs/files
Fetch file content: GET /admin-path/logs/files/:filename?lines=200

Left panel: file list with name, size, date modified
  - Click a file to load it
  - .log files are clickable, .gz files show "compressed" badge

Right panel: log file viewer
  - Monospace font, dark background (#0d1117)
  - Each line is a JSON object — parse and colorize:
    - error level: red left border
    - warn level: yellow left border  
    - info level: blue left border
  - Line number gutter
  - Search bar (highlight matching lines)
  - "Load more" button (loads next 200 lines)
  - Auto-scroll to bottom toggle
```

---

### ADMIN PROMPT 5 — AI Providers Management

```
Build /providers page.

Fetch: GET /admin-path/providers

For each provider, show a card:
- Provider name (capitalized) + type badge (Anthropic/OpenAI-compatible)
- Current model name
- Status indicator: green "Configured" / gray "Not configured" / (based on configured field)
- "Default" badge if isDefault is true
- Two buttons: [Set as Default] [Test Connection]

"Set as Default" button:
- PUT /admin-path/providers/default { provider: "groq" }
- Shows loading → success toast "Default provider changed to Groq"
- Updates the Default badge immediately

"Test Connection" button:
- POST /admin-path/providers/test { provider: "claude" }
- Shows inline loading spinner
- On success: green checkmark + "Provider OK · 234ms · gpt-4o"
- On failure: red X + error message

At top: "Active Default: [provider name]" with large colored badge

Provider order: Claude, OpenAI, DeepSeek, Groq, Gemini, OpenRouter

Provider color coding:
- Claude: orange/coral
- OpenAI: green
- DeepSeek: blue
- Groq: purple
- Gemini: blue/indigo
- OpenRouter: gray
```

---

### ADMIN PROMPT 6 — Settings Panel

```
Build /settings page.

Fetch all settings: GET /admin-path/settings
Save settings: PUT /admin-path/settings { settings: { key: value } }

Organize into sections with a "Save" button per section:

SECTION 1 — AI Configuration
- Default Provider: dropdown (claude/openai/deepseek/groq/gemini/openrouter)
- Max Tokens: number input (500–8000)

SECTION 2 — Access Control
- Maintenance Mode: toggle switch (when on: shows red banner "Maintenance mode active — public API is disabled")
- Chat Enabled: toggle
- VPS Analysis Enabled: toggle
- Rate Limit (per minute): number input

SECTION 3 — Data & Logs
- Log Retention (days): number input (7–90)
- [Clean Old Logs] button → DELETE /admin-path/logs/cleanup?days=N
  - Confirmation modal before deleting
  - Shows: "This will delete logs older than N days. Are you sure?"
  - After delete: toast "Deleted X request logs, X analysis logs"

SECTION 4 — Company Info
- Company Name: text input
- Support Email: email input

Each section has a "Save Changes" button that only sends that section's keys.
Show success toast on save. Show error toast on failure.
Unsaved changes: show yellow dot next to section heading.
```

---

### ADMIN PROMPT 7 — Users & Audit

```
Build /users and /audit pages.

─── /users ───
Fetch: GET /admin-path/users

Table: ID | Username | Role | Last Login | Created | Actions
Actions: [Delete] button (with confirmation) — disabled for own account

"Create Admin User" form (inline above table):
- Username input
- Password input (with strength indicator)
- Role dropdown (admin / superadmin)
- [Create User] button → POST /admin-path/users

"Change My Password" section (card below):
- Current Password input
- New Password input
- Confirm Password input
- [Change Password] button → PUT /admin-path/users/password

─── /audit ───
Fetch: GET /admin-path/logs/audit

Shows admin activity log — who did what and when.

Table columns:
- Time (relative)
- Admin (username)
- Action (colored badge: LOGIN=blue LOGOUT=gray SETTINGS_UPDATE=yellow USER_CREATE=green USER_DELETE=red PROVIDER_CHANGE=purple LOG_CLEANUP=orange)
- Detail
- IP

No pagination needed (last 100 actions only).
This page helps you track: who changed settings, who logged in, etc.
```

---

### ADMIN PROMPT 8 — Final Polish

```
Final polish for admin panel:

1. Top navbar shows:
   - "HostPro Admin" logo (left)
   - Current admin username + role badge (right)
   - Session timer countdown: "Session expires in 7h 43m" (right)
   - Logout button

2. Sidebar shows:
   - Active page highlighted
   - Notification badges:
     - Request Logs: count of 5xx errors today (red badge)
     - Analysis Logs: count of critical analyses today (red badge)

3. Add a real-time log stream (optional enhancement):
   - On /logs/requests page, add "Live Mode" toggle
   - When on: poll GET /admin-path/logs/requests?limit=10 every 5s
   - New rows slide in from top with highlight animation

4. Dark/light mode toggle in top right

5. Environment in .env.local for admin frontend:
VITE_ADMIN_URL=http://localhost:3000
VITE_ADMIN_PATH=/admin-YOURRANDOMPATHHERE
```

---

## ═══════════════════════════════════════════
## PART B: HOME SERVER UBUNTU SETUP GUIDE
## ═══════════════════════════════════════════

### STEP 1 — Install Ubuntu & Basic Server Prep

```bash
# Update everything first
sudo apt update && sudo apt upgrade -y

# Install essential tools
sudo apt install -y curl wget git nano ufw fail2ban htop net-tools

# Set timezone
sudo timedatectl set-timezone Asia/Dhaka
# Check: timedatectl

# Set hostname
sudo hostnamectl set-hostname hosting-ai-server
```

---

### STEP 2 — Secure SSH (Important for home server!)

```bash
# Edit SSH config
sudo nano /etc/ssh/sshd_config

# Change these lines:
Port 2222                     # Change from default 22
PermitRootLogin no            # Disable root login
PasswordAuthentication no     # Force key-only login
MaxAuthTries 3

# Restart SSH
sudo systemctl restart sshd

# Generate SSH key on YOUR LAPTOP (not server):
# ssh-keygen -t ed25519 -C "your-email@example.com"
# Copy to server:
# ssh-copy-id -p 2222 youruser@your-home-ip
```

---

### STEP 3 — Firewall Setup

```bash
# Allow only what you need
sudo ufw default deny incoming
sudo ufw default allow outgoing

sudo ufw allow 2222/tcp    # SSH (your new port)
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw allow 3000/tcp    # Node.js API (only during testing, remove after Nginx)

sudo ufw enable
sudo ufw status verbose
```

---

### STEP 4 — Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version    # should be v20.x
npm --version     # should be 10.x
```

---

### STEP 5 — Install and Configure Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx

# Test: curl http://localhost
```

---

### STEP 6 — Deploy the Backend

```bash
# Create app directory
sudo mkdir -p /opt/hosting-ai
sudo chown $USER:$USER /opt/hosting-ai
cd /opt/hosting-ai

# Upload files (from your laptop):
# scp -P 2222 -r ./hosting-ai-v3/* youruser@your-home-ip:/opt/hosting-ai/

# OR if using git:
# git clone https://github.com/your/repo.git .

# Install dependencies
npm install

# Create data and logs directories
mkdir -p data logs

# Set up environment
cp .env.example .env
nano .env
```

**In nano, fill these critical values:**
```
ANTHROPIC_API_KEY=sk-ant-your-real-key
JWT_SECRET=paste-64-random-chars-here
ADMIN_JWT_SECRET=different-64-random-chars-here
ADMIN_SECRET_PATH=/admin-generate-random-path-here
ADMIN_USERNAME=youradminname
ADMIN_PASSWORD=YourStrongPassword123!
ALLOWED_ORIGINS=https://your-lovable-app.lovable.app,https://admin.yourdomain.com
COMPANY_NAME=YourCompanyName
NODE_ENV=production
```

**Generate random secrets:**
```bash
# Generate JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate ADMIN_JWT_SECRET (run again for different value)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate random admin path
node -e "console.log('/admin-' + require('crypto').randomBytes(8).toString('hex'))"
```

```bash
# Run setup (creates admin user)
npm run setup

# Test run
npm run dev
# Should see: 🚀 Hosting AI v3 — port 3000

# In another terminal, test it:
curl http://localhost:3000/api/health
```

---

### STEP 7 — Install PM2 (keeps app running forever)

```bash
sudo npm install -g pm2

# Start app
pm2 start src/server.js --name hosting-ai --interpreter node

# Auto-start on server reboot
pm2 startup
# Copy and run the command it gives you (starts with: sudo env PATH...)
pm2 save

# Monitor
pm2 status
pm2 logs hosting-ai
pm2 monit        # live CPU/memory dashboard
```

---

### STEP 8 — Set Up Domain with Nginx (for HTTPS)

**Option A — Use a free domain:**
- Get free domain at: freenom.com or afraid.org
- Or use DuckDNS: duckdns.org (easiest for home servers)

**Option B — Use your router's dynamic IP:**
- Most home ISPs give you a dynamic IP
- Install: `sudo apt install ddclient` for dynamic DNS

```bash
# Create Nginx site config
sudo nano /etc/nginx/sites-available/hosting-ai
```

Paste this:
```nginx
# Main API server
server {
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;

        # CRITICAL: SSE streaming requires these
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        chunked_transfer_encoding on;
        add_header X-Accel-Buffering no;
    }
}
```

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/hosting-ai /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Install Certbot for free SSL
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com

# Auto-renewal
sudo systemctl enable certbot.timer
```

**If you don't have a domain yet — test locally with port forwarding:**
```bash
# On your router: forward port 3000 → your server's local IP
# Then use: http://your-public-ip:3000/api/health
# Find your public IP: curl ifconfig.me
```

---

### STEP 9 — Set Up Fail2Ban (block brute force attacks)

```bash
sudo nano /etc/fail2ban/jail.local
```

Paste:
```ini
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port = 2222

[nginx-http-auth]
enabled = true
```

```bash
sudo systemctl restart fail2ban
sudo fail2ban-client status
```

---

### STEP 10 — Testing Everything

```bash
# Test all public endpoints
BASE=http://localhost:3000

# Health check
curl $BASE/api/health | jq

# List providers
curl $BASE/api/health/providers | jq

# Test VPS log analysis
curl -X POST $BASE/api/vps/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "logContent": "[error] connect() to unix:/run/php/php8.2-fpm.sock failed (11: Resource temporarily unavailable)",
    "provider": "claude"
  }' | jq

# Test website chat (non-streaming)
curl -X POST $BASE/api/chat/website \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role":"user","content":"What VPS plans do you have?"}]}'

# Get diagnostic script
curl $BASE/api/vps/diagnostic-script | jq '.instructions'

# Test admin login (replace path with your ADMIN_SECRET_PATH)
curl -X POST $BASE/YOUR_ADMIN_SECRET_PATH/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"YourPassword"}' | jq

# Store token and test dashboard
TOKEN="paste_token_from_above"
curl $BASE/YOUR_ADMIN_SECRET_PATH/dashboard \
  -H "Authorization: Bearer $TOKEN" | jq '.stats'

# Test analysis logs
curl $BASE/YOUR_ADMIN_SECRET_PATH/logs/analysis \
  -H "Authorization: Bearer $TOKEN" | jq
```

---

### STEP 11 — Monitoring & Maintenance

```bash
# View live logs
pm2 logs hosting-ai --lines 100

# View error logs only
pm2 logs hosting-ai --err

# Restart after changes
pm2 restart hosting-ai

# Check disk usage
df -h

# Check memory
free -m

# Check who is attacking your server
sudo fail2ban-client status sshd

# View app log files
ls -la /opt/hosting-ai/logs/
tail -f /opt/hosting-ai/logs/app-$(date +%Y-%m-%d).log | jq

# Clean old logs manually
curl -X DELETE $BASE/YOUR_ADMIN_SECRET_PATH/logs/cleanup?days=30 \
  -H "Authorization: Bearer $TOKEN"
```

---

### STEP 12 — Auto-Update Script (optional)

```bash
# Create update script
nano /opt/hosting-ai/update.sh
```

Paste:
```bash
#!/bin/bash
cd /opt/hosting-ai
git pull
npm install
pm2 restart hosting-ai
echo "✅ Updated and restarted at $(date)"
```

```bash
chmod +x /opt/hosting-ai/update.sh

# Run manually to update:
/opt/hosting-ai/update.sh
```

---

## QUICK REFERENCE — Most Used Commands

```bash
pm2 status                           # Is the app running?
pm2 restart hosting-ai               # Restart app
pm2 logs hosting-ai --lines 50       # Last 50 log lines
curl localhost:3000/api/health       # Is API responding?
sudo systemctl status nginx          # Is Nginx running?
sudo ufw status                      # Firewall status
sudo fail2ban-client status          # Intrusion detection
df -h                                # Disk space
free -m                              # Memory usage
```

---

## TROUBLESHOOTING

**App won't start:**
```bash
cd /opt/hosting-ai && node src/server.js
# Read the error — usually a missing .env variable or bad API key
```

**SSE streaming not working through Nginx:**
Make sure you have ALL of these in nginx config:
```
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 300s;
chunked_transfer_encoding on;
add_header X-Accel-Buffering no;
```

**CORS errors in Lovable:**
Add your Lovable app URL to ALLOWED_ORIGINS in .env, then restart:
```bash
pm2 restart hosting-ai
```

**Admin panel not found:**
Your ADMIN_SECRET_PATH in .env must exactly match VITE_ADMIN_PATH in Lovable.
Double-check there are no trailing slashes.

**Can't connect from outside home network:**
- Check router port forwarding (80, 443 → server's local IP)
- Check UFW: `sudo ufw status`
- Check your public IP: `curl ifconfig.me`
