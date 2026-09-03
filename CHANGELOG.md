# Changelog

All notable changes to the ARK ASA Server Manager are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [4.6.19] — 2026-09-03

### Added
- **📦 Server Presets & Templates Hub**:
  - Full server preset & template export, import, starter library (PvE Casual, PvP Hardcore, Primal Chaos, Small Tribes, Ultra Boosted 25x, etc.), and 1-click apply server rates, INIs, and modpacks.
  - Clone Server and Export as Template actions in Server Manager.
- **🔌 UPnP Peer Port Forwarding**: Added Peer Port (`game_port + 1`, 7778 UDP) to the UPnP port forwarding matrix.

### Fixed
- **🛡️ Public IP & MultiHome UE5 Socket Protection**: Added `is_local_interface_ip` to validate local network adapters, automatically omitting `-MultiHome` for external IPs to prevent `WSAEADDRNOTAVAIL` 10049 UE5 socket crashes and offline listing on trackers like `ASA-Server.de`.
- **🔄 Startup Failure & Exit Code 1 / Code 0 Crash Recovery**: Fixed pre-online process terminations being misclassified as "stopped" instead of "crashed", enabling Guardian auto-restart and diagnostics. Added `PeerPort` (7778) to pre-startup port cleanup loop.
- **📊 Build Version Comparison Optimization**: Parsed numeric build numbers in version check logic to prevent false-positive update banners.

---

## [4.6.18] — 2026-09-02

### Added
- **🐕 Mod Update Watchdog Persistence & Auto-Recovery**: Added `mod_watchdog_settings` SQLite table with automatic background reload.
- **🎯 RCON Give Items Player UID / EOS ID Resolution**: Auto-resolved player profile IDs for RCON `GiveItemToPlayer`.
- **💾 RCON Verified Save Validation & Deep Search**: Added recursive `.ark` search and size/integrity validation.
- **⚙️ GameUserSettings.ini & Game.ini Visual Editor Cleanup**: Restructured breeding multipliers and loot quality under appropriate sections.
- **🧹 Clean INI Generation**: Removed redundant `SessionName=` and obsolete sections from INIs.
- **👑 In-Game Admin Management & Privilege Setup Modal**: Fast in-game cheat privilege setup.
- **🩺 Crash Doctor & Post-Update Recovery Suite**: Recovery suite for post-update UE5 DLL hooks.

---

## [4.6.15] — 2026-08-20

### Fixed
- **🔄 ASA Server Restart & Scheduled Maintenance Stabilization**:
  - Resolved server crash misclassification on restart (Unreal Engine 5 exit codes `3`, `0`, `1`) during scheduled maintenance and restarts.
  - Eliminated false-positive Discord crash notifications during planned stops and maintenance windows.
  - Enforced synchronous stop-and-wait lifecycle polling in `scheduler.rs` and `server.rs` to ensure server processes cleanly release socket ports and resources before new process spawn.
  - Added immediate PID registration to Guardian watchdog on server startup to prevent race conditions during boot.
- **⚙️ ASE Configuration Save & Unified UTF-8 Encoding Pipeline**:
  - Fixed intermittent ASE configuration save error (`missing field "allowCryoCooldownonPve"`) by adding flexible serde aliases and case-insensitive fallback mapping in `write_ase_config`.
  - Built a unified multi-encoding detection reader in `IniParser` supporting standard UTF-8, UTF-8 with BOM, UTF-16 LE/BE (with/without BOM), and Windows-1252/ANSI with Latin-1 character normalization.
  - Implemented atomic pure UTF-8 writing with CRLF endings across all ASE configuration routines (`GameUserSettings.ini`, `Game.ini`, cluster configurations, and mod manager).
  - Preserved canonical casing `AllowCryoCooldownOnPvE=False` in `[ServerSettings]`.
- **🛡️ Scheduler Debounce & Watchdog Optimization**:
  - Added debounce tracking (`LAST_ADVANCED_RUN`) to prevent duplicate scheduled restart executions.

---

## [4.6.14] — 2026-08-18

### Added
- **🗺️ Bjarnheim Map Support (ASA)**: Official map support for custom community map *Bjarnheim* (`Bjarnheim_WP`, CurseForge Mod ID `1376189`) by Nekatus with automatic mod injection (`-mods=1376189`) and map preset configurations.
- **🐧 Linux Headless CLI Installer**: Added `scripts/install.sh` for 1-line installation of headless daemon `asa_manager` on Linux servers with setup guide in `LINUX_SETUP.md`.
- **📊 Logs & RCON Console Overhaul**: Modernized dark glassmorphic terminal interface in `LogsConsole.tsx` with syntax highlighting, search highlight, line numbers, 1-click line copy, responsive toolbar without scrollbars, and expanded RCON admin suite.

### Fixed
- **⚙️ ASA Server Settings Reset on Return**: Fixed critical bug where saving server settings reverted to default values by implementing `CaseInsensitiveMap`, multi-encoding UTF-16 LE/BE and UTF-8 BOM auto-detection in Rust backend (`ini_parser.rs`), and hardened DB sync in `ConfigEditor.tsx`.
- **⚡ Application Startup & White Screen**: Fixed ES import order in `main.tsx` and added `vite-env.d.ts` client declarations.

---

## [4.4.8] — 2026-06-15

### Added
- **🦕 Full ARK: Survival Evolved (ASE) Support Engine**: Added comprehensive native integration for managing ASE server instances, config parameters, sequential boots, backups, and automatic mod updates.
- **🔌 Rebuilt RCON Console**: Rewrote the RCON interface to feature tabbed layout for multi-server management, dynamic command history, and ANSI-colored output logs.
- **⚙️ Advanced Configuration Panels**: Added new multiplier slider inputs, masked password fields for security, and Event Profile configurations.
- **🪄 Installation Recovery Wizard**: Added interactive troubleshooting checklists, SteamCMD repair/cache cleaning tools, and clear error recovery dialogs.

---

## [2.4.0-beta] — 2026-05-19

### Added
- **🦖 Entire ASE (Survival Evolved) Support Engine** — Native integration of full server management, configs, scheduler, backup, and RCON consoles for ARK: Survival Evolved, fully parity-aligned with ASA.
- **💾 Save Management System & Timeline** — Automated backup timeline and comparison dashboard tracking player counts, structure counts, file size, and tamed dinos, with a robust one-click interactive restore feature.
- **⚡ Server Automation & Sequential Boot Engine** — Configurable sequential boot queues for multi-server setups to prevent CPU load spikes, and global server startup recovery settings.
- **💻 Enterprise Organization Dashboard** — A modern visual dashboard supporting drag-and-drop server hierarchy organization, cluster-aware automation, player notifications, and custom warning timers before server restarts.
- **🐕 Realtime Mod Manager & Watchdog** — Automated CurseForge mod updates checking, mod status indicators, and clipboard-based bulk import upgrades.
- **🤖 Discord Bot Bridge Integration** — Deep integration of the Discord Bot bridge for cross-chat relaying, automatic server alerts, and multi-server status reports.

---

## [2.3.6] — 2026-05-13

### Added
- **⚡ Hardware Isolation Engine** — new hardware allocation dashboard to bind server instances to specific CPU logical cores and eliminate OS thread migration overhead
- **⚡ High-Performance Task Scheduling** — configurable Windows Process Priority settings (Normal, High, AboveNormal, etc.) for every ASA server instance to ensure stable CPU cycles under load
- **🐕 Mod Update Watchdog System** — automated background worker that continuously monitors installed mods for new releases on CurseForge and prepares automated grace-periods and server maintenance windows
- **☁️ Advanced Cloud Backup Integration** — direct synchronization and scheduled disaster-recovery backups to enterprise cloud storage buckets
- **💻 Interactive CPU Topology Grid** — visual dashboard mapping the host machine’s physical and logical processor count automatically for easy server-affinity distribution

### Fixed
- **IPC Serialization Error** — resolved invalid argument payload crash (`missing field serverId`) in the `save_hardware_allocation` Tauri command by aligning Rust structs with React CamelCase naming conventions
- **TS Compilation Warnings** — fixed unused getters and type mismatches in `hardwareStore.ts` and lazy-loading components in `App.tsx`
- **Cloud Backup Navigation** — patched routing and permission bugs preventing standard access to the remote storage dashboard panel

---

## [2.3.4] — 2026-04-30

### Fixed
- **🔐 Password Corruption** — Admin Password no longer gets corrupted to `Admin123?ServerPassword=Ark123` on server startup; launch argument builder now strictly isolates password parameters
- **Password field merging** — `ServerAdminPassword` and `ServerPassword` are sanitized at config sync, INI generation, and startup argument layers
- **Stale password persistence** — INI generator now writes password fields unconditionally, allowing users to clear passwords dynamically
- **Corrupted DB passwords** — Auto-repair system detects and fixes legacy polluted admin passwords on load without manual intervention

### Added
- **Password masking UI** — Server Password and Admin Password fields now use masked input with Eye/EyeOff toggle for visibility
- **SettingPassword component** — New reusable masked input component for sensitive fields in ConfigBuilder
- **Advanced Config profile list** — Saved event profiles are now displayed in a selectable list with LIVE badge indicator
- **MultiplierSlider component** — Custom slider with visual fill bar + inline numeric input for precise value editing
- **Toast feedback** — All Advanced Config save/toggle actions now show success/error notifications

### Changed
- **Advanced Configuration Dashboard** — Complete UI rebuild with better layout, profile management, and polished transfer policy controls
- **Structure Overrides tab** — Replaced empty placeholder with informative redirect to Event Profiles

---

## [2.3.3] — 2026-04-30

### Added
- **SteamCMD Error Recovery System** — installation failures now show actionable recovery panel with "Try Again", "Repair SteamCMD", and "Clear Cache" buttons instead of a dead-end error screen
- **SteamCMD Health Check** — new backend service to verify SteamCMD executable integrity, disk space, and cache status
- **Ark Club map** — added to map selector with custom landscape image and map profile
- **Preset Export/Import** — server config presets can now be exported as `.json` files and imported on any machine
- **Custom Presets** — save your current server configuration as a named preset stored in localStorage
- **Traditional Chinese (zh-TW)** — full UI translation added to language selector
- **Bulk Mod Import from URLs** — AdvancedModInput now extracts mod IDs from CurseForge URLs automatically
- **Clipboard Paste for Mods** — one-click paste button in bulk mod import
- **File Import for Mods** — import mod IDs from `.txt` files
- **Diagnostic Tips** — installation failure screen shows troubleshooting checklist (disk space, antivirus, permissions, path format)

### Fixed
- **SteamCMD Error (7) dead-end** — users no longer get stuck on error screen with no recovery path
- **Silent install failures** — all installation errors now provide clear, categorized messages with suggested actions
- **Preset selector missing export** — built-in presets can now be exported for sharing

### Changed
- **Error recovery UX** — every error screen across the app now provides at least one recovery action
- **AdvancedModInput UI** — added header action bar with Paste/File buttons and URL format hint

---

## [2.3.3] — 2026-04-30

### Fixed
- **Config INI overwrite** — `GameUserSettings.ini` is now merged instead of fully overwritten on server startup; custom third-party keys are preserved
- **Empty admin password** — `ServerAdminPassword` line no longer written to INI when password is empty
- **Process manager panics** — replaced all `unwrap()` on mutex locks with proper error handling in `process_manager.rs` and `scheduler.rs`
- **Discord bot double-command** — fixed duplicate command execution that caused port binding failures
- **Recursive save import** — added self-referencing path detection to prevent `SavedArks` folder from copying into itself
- **Missing map profile** — added `TheCenter_WP` to backend map profiles
- **Incorrect release dates** — corrected Genesis Part 1 date to June 2026, added Crystal Isles, Lost Island, and Fjordur to upcoming maps

### Added
- **Map landscape images** — 15 unique map images for The Island, Scorched Earth, The Center, Aberration, Extinction, Ragnarok, Valguero, Lost Colony, Astraeos, Forglar, Genesis 1 & 2, Fjordur, Crystal Isles, Lost Island
- **DLC map category** — Lost Colony separated into its own "DLC Expansions" section
- **Map card enhancements** — size badges (Large/Medium), status badges (DLC/MOD/SOON), hover zoom animation, selection checkmark
- **i18n fallback strings** — all `t()` calls include human-readable English fallbacks

### Changed
- **Map selection UI** — cards now use landscape image backgrounds with gradient overlays instead of emoji icons
- **Upcoming maps** — displayed with greyscale images, 60% opacity, non-clickable (disabled state)

---

## [2.3.2] — 2026-04-28

### Added
- Initial stable release with Server Manager, RCON Console, Scheduler, Mod Manager
- Config Editor with INI support
- Cluster Manager for multi-server setups
- Backup & Rollback system
- Discord Bot integration
- SteamCMD auto-download and server installation
- Import Existing server and Import Save functionality
