# 🐛 ASA Server Manager v2.1.1 - Bug Fix Release

**Release Date:** January 11, 2026

---

## 🔧 Bug Fixes

### 🔴 Critical Fix: Cluster Creation Error
**Issue:** "Failed to create cluster" error when trying to create a new cluster with servers.

**Cause:** The database INSERT statement was missing the required `server_ids` column, causing a NOT NULL constraint violation.

**Fix:** Updated `cluster.rs` to properly serialize and insert `server_ids` as a JSON array when creating clusters.

---

### 🔴 Critical Fix: Server Executable Not Found
**Issue:** Starting a server would fail with "Server executable not found" error if the server files weren't fully installed.

**Cause:** The app would only check for the executable and fail without offering a solution.

**Fix:** Now when you start a server and the executable is missing, the app will **automatically download and install** the server files via SteamCMD before starting. No more manual intervention needed!

---

### 🟡 Fix: RCON Console Connection Using Wrong IP
**Issue:** RCON console was hardcoded to connect to `127.0.0.1`, causing connection failures for servers with different IP addresses.

**Fix:** RCON console now uses the server's configured `ipAddress` field, falling back to `127.0.0.1` only if no IP is configured.

---

### 🟡 Fix: Dashboard Showing Wrong IP Address
**Issue:** The Server Control Hub dashboard always displayed `127.0.0.1` regardless of the server's actual configured IP.

**Fix:** Dashboard now displays the server's configured IP address correctly.

---

### 🟢 Fix: GitHub Actions Build Workflow
**Issue:** CI/CD build workflow failed with "Unable to resolve action `tauri-apps/tauri-action@v2`" error.

**Cause:** The `tauri-apps/tauri-action` GitHub Action does not have a `v2` tag. Even though the project uses Tauri 2.0, the action itself is versioned at `v0`.

**Fix:** Updated `.github/workflows/build.yml` to use `tauri-apps/tauri-action@v0`.

---

### 🟢 Enhancement: RCON Configuration in Settings
**Enhancement:** Added RCON settings to the Visual Settings Manager:
- **RCON Enabled** toggle - Enable/disable remote console access
- **RCON Port** slider - Configure RCON port (default: 27020)

---

## 📁 Files Changed
- `.github/workflows/build.yml` - Fixed tauri-action version from v2 to v0
- `src-tauri/src/commands/cluster.rs` - Fixed cluster creation INSERT statement
- `src-tauri/src/commands/server.rs` - Auto-download server if executable missing
- `src/pages/Dashboard.tsx` - Display correct server IP address
- `src/pages/RconConsole.tsx` - Use server's configured IP for RCON connection
- `src/components/config/ConfigBuilder.tsx` - Added RCON Port setting
- `src/data/configMappings.ts` - Added RCON Enabled and RCON Port to Visual Settings

---

## ⬇️ Download
Download the latest installer: **ASA Server Manager_2.1.1_x64-setup.exe**

---

## 🙏 Thank You
Thanks for using ASA Server Manager! Report any issues in our [Discord server](https://discord.gg/Pr69DHEnXJ).
