# Changelog

All notable changes to the ARK ASA Server Manager are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.4.0] — 2026-04-30

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
