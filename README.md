# Smart MSL Monitor

Minimum Stock Level (MSL) monitoring and delivery reminder system for
**Shreyas Industrial Fasteners**. Customers send monthly forecast PDFs
(e.g. Kirloskar Toyota Textile Machinery); the app parses them, tracks
stock against MIN/MAX levels, and sends WhatsApp + email reminders
automatically — even when the app window is closed.

---

## Quick Start — Windows (Double-click installer)

1. Go to [Releases](../../releases) → download `SmartMSLMonitor-Setup-x.x.x.exe`
2. **Right-click → Run as Administrator**
3. Follow the wizard (~30 seconds)
4. A shortcut appears on your desktop — double-click to open the app in your browser

**That's it.** No MySQL, no Node.js, no configuration needed. Everything is bundled.

---

## How it works (Windows Service)

The installer registers a **Windows Service** (via NSSM) that:

- Starts automatically **when Windows boots** — even before you log in
- Runs the backend server at `http://localhost:4000`
- Sends WhatsApp & email notifications on schedule (every 30 seconds check)
- Restarts itself automatically if it crashes
- Writes logs to `%APPDATA%\SmartMSLMonitor\logs\`

**You never need to open the app for notifications to fire.** Just keep the PC on.

---

## Features

- **Forecast upload** — PDF/Excel parsing, KTTM layout adapter, versioning, review screen
- **Material sheet** — editable grid, per-part MSL status, actual-stock column, per-material due dates
- **Reminders** — scheduled WhatsApp/email reminders (10/5/3/1 days before due), snooze & reschedule
- **WhatsApp conversations** — reply `1` (remind later), `2` (new date/time), `3` (delivered) via the built-in Baileys client (no Docker needed)
- **Notifications log** — full history, filters, retry, CSV export
- **MSL configuration** — global default, per-customer defaults, per-part overrides
- **Backups** — automatic daily SQLite copy at 02:00, manual backup, download, restore
- **Health page** — live DB / scheduler / WhatsApp / SMTP / internet / outbox status

---

## Requirements

### Installer (.exe)
- Windows 10 / 11 (64-bit)
- Administrator rights for initial install only
- No extra software needed — WhatsApp runs via the built-in Baileys client (no Docker)

### Developer setup
- **Node.js** 20 LTS
- No database server needed — SQLite is bundled

---

## Developer Setup

```bash
# 1. Clone the repo
git clone https://github.com/shreyas-industrial/smart-msl-monitor.git
cd smart-msl-monitor

# 2. Install dependencies
npm ci --prefix backend
npm ci --prefix frontend

# 3. Set up environment
cp backend/.env.example backend/.env
# Edit backend/.env as needed (DATABASE_URL is already set for SQLite)

# 4. Create database & seed
cd backend
npx prisma migrate deploy
node prisma/seed.js
cd ..

# 5. Start development servers
npm run dev
# Frontend: http://localhost:5173
# Backend:  http://localhost:4000
```

Default login on fresh installs: the admin password is generated at first run
and written to `backend/storage/initial-admin-credentials.txt` — you will be
asked to set a new password on first login.

---

## WhatsApp Setup (Baileys — built-in)

WhatsApp is handled in-process by the Baileys client — **no Docker, no
external service**. The backend connects directly to WhatsApp Web.

1. Start the app (backend + frontend)
2. Open **Settings → WhatsApp** in the app
3. Click **Show QR Code** and scan it with WhatsApp on your phone
   (WhatsApp → **Linked Devices → Link a Device**)
4. Session status should turn **WORKING** — use **Send test message** to verify

Auth credentials are stored in `backend/storage/wa-auth/` (or under the
configured storage root) and survive restarts. Replies to reminder messages
(`1` / `2` / `3`) are handled automatically.

> Migrating from WAHA? Remove `docker-compose.yml` usage — it is no longer
> needed. The old `waha_*` settings keys are ignored.

---

## Building the Windows Installer Locally

> Normally GitHub Actions builds this — see below. Only do this if you need a local build.

**Prerequisites:** NSIS 3.x installed on Windows, Git Bash or PowerShell

```powershell
# Build frontend
npm run build

# Download NSSM and Node.js portable to installer/runtimes/
# (GitHub Actions does this automatically — see .github/workflows/release.yml)

# Compile installer
& "C:\Program Files (x86)\NSIS\makensis.exe" installer/smart-msl-monitor.nsi
# Output: dist-installer/SmartMSLMonitor-Setup-1.0.0.exe
```

---

## GitHub Actions — Automated Releases

Push a version tag to trigger a full build + release:

```bash
git tag v1.2.3
git push origin v1.2.3
```

GitHub Actions will:
1. Build the frontend
2. Generate the Prisma SQLite client (Linux + Windows targets)
3. Download portable Node.js 20 and NSSM on a Windows runner
4. Compile the NSIS installer
5. Create a GitHub Release with the `.exe` attached

You can also trigger a manual build from **Actions → Build & Release Windows Installer → Run workflow**.

---

## Data & Backup

- Database: `%APPDATA%\SmartMSLMonitor\data\msl.db` (SQLite)
- Uploads: `%APPDATA%\SmartMSLMonitor\uploads\`
- Backups: `%APPDATA%\SmartMSLMonitor\backups\` (daily `.db` copies, 14 kept)
- Logs: `%APPDATA%\SmartMSLMonitor\logs\`

Uninstalling prompts whether to keep or delete user data.

---

## Service Management (Windows)

```powershell
# Check service status
sc query SmartMSLMonitor

# Start / stop / restart
net start SmartMSLMonitor
net stop SmartMSLMonitor

# Remove service (uninstaller does this automatically)
nssm remove SmartMSLMonitor confirm
```

---

## Project Structure

```
smart-msl-monitor/
├── backend/              # Node.js / Express / Prisma
│   ├── prisma/           # SQLite schema + migrations + seed
│   ├── scripts/          # firstrun.js (auto DB setup on first install)
│   └── src/
│       ├── config/       # Prisma client, logger, config
│       ├── controllers/  # Route handlers
│       ├── services/     # Business logic (notifications, scheduler…)
│       └── workers/      # node-cron scheduler
├── frontend/             # React 18 + Vite + TanStack Query + AG Grid
├── installer/            # NSIS installer script + assets
│   ├── smart-msl-monitor.nsi
│   └── assets/           # app.ico (place your icon here)
└── .github/
    └── workflows/
        └── release.yml   # GitHub Actions build + release
```
