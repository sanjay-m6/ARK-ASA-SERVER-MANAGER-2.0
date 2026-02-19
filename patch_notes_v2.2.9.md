# 🚀 Patch Notes - v2.2.9

## 🩺 Critical Fixes

### ✅ Server Status — Now Truly Reliable
This update resolves a long-standing race condition where servers would remain stuck in **"LOADING..."** or **"STARTING..."** even after successfully coming online.

- **Accurate Online Detection** — Status now transitions to 🟢 **ONLINE** only when the server log confirms `"Advertising for join"`, eliminating false positives.
- **Log Baseline System** — A baseline is set at the moment a server is started, ensuring only *new* log lines are scanned for startup confirmation. Prevents ghost-online triggers from stale logs.
- **DB Sync on Restart** — If the manager is reopened with a server already running, it re-reads logs from disk and correctly restores the `online` status without requiring a restart.
- **Startup Progress Timer** — Live elapsed-time counter is now shown inside the status badge during startup (e.g., `LOADING... 2m 14s`). Disappears automatically once `online`.
- **Force Stop Button** — A ❌ Force Stop button now appears next to the LOADING/STARTING badge so you can safely abort a problematic startup at any time.

---

## 🤖 Discord Bot Improvements

### 📋 Admin Commands (`!update`, `!broadcast`)
- New `!update` command — triggers a SteamCMD update for a specified server from Discord.
- New `!broadcast` command — sends a serverwide RCON message to all cluster servers directly from your admin Discord channel.
- Admin-channel gating — only messages from the configured admin channel are processed, protecting against accidental triggers.

### 🔔 Real-Time Status in Clusters
- Discord Bot now correctly reports **live server status** (`online` / `offline`) inside cluster multi-server embeds.
- Fixed an issue where servers showed as **offline** in Discord even when actively running.

---

## 🗓️ Scheduler Fixes

- Fixed **Auto-Update Mods** task type not displaying its label and icon in the Scheduler UI — it now shows correctly with its green gear icon.
- Scheduler task list now renders all task types reliably, including newly registered automation types.

---

## 🔥 Firewall & Port Management

- Fixed assigned ports incorrectly showing as **Closed** immediately after assignment — rules are now applied and reflected correctly in real-time.
- Improved rule-loading performance; firewall settings now populate significantly faster on page load.

---

## 🐛 Additional Bug Fixes

- Fixed `toggleServerAutomation` being called **twice** on each press (duplicate invocation removed).
- Fixed the **Offers Toggle** (`active`/`hidden`) not saving correctly due to a `is_active` ↔ `isActive` property name mismatch between frontend and backend.
- Fixed clusters failing to delete, leaving orphaned entries in the database.
- Console output now auto-expands when a server is started and auto-collapses when stopped.
- Startup error messages are now written directly into the in-app console output for easier diagnosis.

---

## 🛠️ Technical Changes

- Frontend log deduplication: consecutive identical log lines are now discarded before render.
- Server log polling interval: 10-second tick added for servers in `starting`/`running` state as a startup-detection failsafe.
- `server-status-change` event listener now calls `refreshServers()` on every status transition to keep UI in sync with the database.
- i18n migration: all hardcoded strings in `ServerManager.tsx`, `ConfigEditor.tsx`, and scheduler components are now fully translated.

---

*Thank you for using ARK ASA Server Manager 2.0! 🦖*
