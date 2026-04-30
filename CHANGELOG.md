# Changelog

All notable changes to the ARK ASA Server Manager are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
