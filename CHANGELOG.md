# Changelog

All notable changes to ASA Server Manager will be documented in this file.

## [2.2.9] - 2026-02-19

### ✨ New Features
- **Startup Progress Timer** — Live elapsed-time counter shown inside the status badge during startup (e.g., `LOADING... 2m 14s`).
- **Force Stop Button** — A Force Stop button appears next to the LOADING/STARTING badge for aborting problematic startups.
- **Discord Admin Commands** — New `!update` and `!broadcast` commands for Discord bot admin channel control.

### 🐛 Bug Fixes
- **Server Status Race Condition** — Fixed servers stuck in "LOADING..." / "STARTING..." even after coming online; status now transitions on `"Advertising for join"` log detection only.
- **Log Baseline System** — Only new log lines (after server start) are scanned for startup confirmation; prevents stale log ghost-online triggers.
- **DB Sync on Restart** — Manager correctly restores `online` status from disk logs when reopened with a server already running.
- **Discord Server Status** — Fixed servers showing as offline in Discord bot cluster embeds when actually running.
- **Auto-Update Mods Scheduler** — Fixed task type not displaying its label and icon in Scheduler UI.
- **Firewall Port Status** — Fixed assigned ports incorrectly showing as Closed after assignment.
- **Offers Toggle** — Fixed `is_active` / `isActive` property name mismatch causing toggle not to save.
- **Cluster Deletion** — Fixed clusters failing to delete, leaving orphaned DB entries.
- **Duplicate Automation Toggle** — Fixed `toggleServerAutomation` being called twice per button press.

### 🛠️ Technical Changes
- Frontend log deduplication for consecutive identical lines.
- 10-second startup-detection polling for servers in `starting`/`running` state.
- `server-status-change` listener now calls `refreshServers()` on every status transition.
- Full i18n migration for `ServerManager.tsx`, `ConfigEditor.tsx`, and scheduler components.

---

## [2.2.8] - 2026-02-13

### ✨ New Features
- **Server Console Window** — Added "Show Server Console" button in the Console Output section to pop up the actual ARK server console window.
- **Discord Bot Setup Improvements** — Added "Generate Invite Link" button and collapsible setup guide in Discord Bridge settings.
- **Discord Bot Online Status** — Bot now appears online in Discord via WebSocket Gateway connection.

### 🐛 Bug Fixes
- **Discord Webhook Save** — Fixed webhook configurations not saving properly.
- **Discord Bot Save** — Fixed bot integration settings not persisting on save.
- **Discord Server Status** — Fixed servers showing as offline in Discord when they were actually online (`online` status was not recognized).
- **Cluster Deletion** — Fixed clusters not being deletable, causing orphaned entries.
- **Cluster Bot Integration** — Discord Bot now correctly reports real-time server status within clusters.
- **Mod Downloads** — Fixed mods failing to download and install.
- **Player Stat Controls** — Fixed player stat configuration controls not applying in Config Editor.

---

## [2.2.4] - 2026-01-28

### ✨ New Features
- **Intelligent Mode (Advanced Automation)** - Per-server data protection tier that automates safety during updates and save imports.
- **Graceful RCON Shutdown** - Servers now attempt to save world state and exit cleanly via RCON before termination.
- **Enhanced Data Safety** - Expanded file watcher to monitor `SavedArks` and root folders for comprehensive protection.
- **Improved Automation UI** - New glowing shield indicators, descriptive tooltips, and snappy toggle interactions.
- **Non-Dedicated Save Import** - Migrate your single-player saves to dedicated servers easily.

### 🐛 Bug Fixes
- **Solved Critical Build Errors** - Fixed all backend type inference and lifetime bugs causing build instability.
- **Configuration Accuracy** - Fixed mappings for "Turrets Attack Riderless" and renamed "Crafting Skill" to "Crafting Speed" for parity with ARK.
- **Ghost Process Prevention** - Implemented startup status reset to prevent offline servers appearing as online.
- **RCON Stability** - Improved RCON command sequencing for reliable shutdowns.

---

## [2.1.2] - 2026-01-13

### 🔧 Bug Fixes
- Fixed GitHub Actions workflow to use `tauri-apps/tauri-action@v0` (v2 doesn't exist)

### ✨ New Features
- **Preset Selector** - Quick configuration presets for different server types
- **Array Editor** - Edit array-based config values with intuitive UI
- **Config Tooltips** - Hover tooltips with descriptions for settings
- **Code Editor** - Improved code editing component
- **Import Server Dialog** - Import existing ARK server installations

---

## [2.1.0] - 2026-01-11

### ✨ New Features

#### Cluster Management - Realtime Updates
- **Start All / Stop All** buttons for clusters
- **Live server status indicators** (🟢 Running, 🟡 Starting, ⚫ Stopped)
- **Running count badge** showing X/Y servers active
- **Realtime status updates** via Tauri events
- **Cluster command line arguments** - Servers now start with `-clusterid` and `-ClusterDirOverride` for proper ARK cluster support

#### Server Clone Actions Modal
- **Clone Server** - Duplicate any server with ports offset by +10
- **Transfer Settings** - Copy INI config files (GameUserSettings.ini, Game.ini) to another server
- **Extract Save Data** - Copy world/player data (SavedArks folder) between servers
- Modern modal UI with target server selection

#### Modern Confirmation Dialogs
- Beautiful glassmorphic confirmation dialogs
- Replaced browser `confirm()` with custom modals
- Three variants: Danger (red), Warning (amber), Success (green)
- Loading states during operations

### 🐛 Bug Fixes

#### Server Settings Persistence
- Fixed IP address not saving to database
- Added `ip_address` column to servers table with migration
- Settings now sync between INI files and database

#### Cluster Server Linking
- Fixed `cluster_id` not being set on servers when creating clusters
- Servers now properly associate with clusters in database

### 🔧 Technical Improvements

- Added `update_server_settings` command for syncing database with INI changes
- Added `clone_server`, `transfer_settings`, `extract_save_data` backend commands
- Added `refreshServers` method to server store for realtime updates
- Database migrations for `ip_address` and `cluster_id` columns
- Fixed GitHub Actions workflow to use `tauri-apps/tauri-action@v0` (v2 doesn't exist)

---

## [2.0.0] - Previous Release

Initial release of ASA Server Manager 2.0
