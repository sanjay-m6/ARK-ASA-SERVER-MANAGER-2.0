# Changelog

All notable changes to ASA Server Manager will be documented in this file.

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
