# ARK ASA Server Manager — Release Report v2.3.5

> **Release Date:** May 10, 2026
> **Version:** 2.3.5
> **Type:** Major Feature Update & Enhancements

---

## 🚀 v2.3.5 New Features & Updates

### Infinity AI Assistant
- **Autonomous Agent**: Integrated NVIDIA-powered Infinity AI assistant for advanced server management via natural language.
- **Secure Backend Proxy**: Securely channels AI API requests without exposing keys to the frontend.
- **Safe Execution**: All destructive actions suggested by the AI enforce user confirmation via a robust tool-calling framework.

### Community & Points System
- **Support Tickets**: Players can submit support tickets linked with their Discord profile, manageable directly in-app.
- **Player Points**: Easily award or modify player points from the backend database for community events.

### Tribe Log Viewer & UPnP Panel
- **Log Watcher**: Parses tribe logs natively with an elegant viewer panel.
- **UPnP Controls**: Automatic port mapping simplified with a new UPnP settings tab.

### Visual Cluster Builder
- Build and manage multi-server configurations visually. Simply link servers together into cohesive clusters via the UI.

### New Map Support
- Added official profiles and cover art for new maps: **Amissa, Insaluna, Reverence, Svartalfheim, Temptress Lagoon**.

---

## 🔥 v2.4.0 Preview Fixes

### ASA Config Directory Mismatch — Admin Password & RCON Broken

**Problem:** For ASA servers, configurations were saved in `ShooterGame/Saved/Config/Windows/` (on Windows) or `Linux/` (on Linux), whereas the dedicated server executable always expects configs in `ShooterGame/Saved/Config/WindowsServer/`. This caused the server to ignore user-configured values, resulting in disabled RCON and broken in-game admin cheats/commands (such as `gcm`).

**Fix:** Updated the target configuration directory logic to correctly return `WindowsServer` for all ASA servers on both Windows and Linux target hosts.

**Files Changed:**
- `src-tauri/src/services/config_generator.rs`

---

### SteamCMD Error (7) — Dead-End Installation Failure

**Problem:** Users encountering SteamCMD Error 7 during installation were shown a static error message with no way to recover — no retry button, no repair option, no diagnostics.

**Fix:** Implemented a full error recovery system:
- **Backend:** Added `repair_steamcmd`, `clear_steamcmd_cache`, and `get_steamcmd_health` Tauri commands in `server.rs`
- **Backend:** Added `repair()`, `clear_cache()`, and `check_health()` methods to `SteamCmdService` in `steamcmd.rs`
- **Frontend:** Replaced static error display with actionable recovery panel containing:
  - "Try Again" button — re-runs installation
  - "Repair SteamCMD" button — re-downloads and re-extracts SteamCMD
  - "Clear Cache" button — removes `appcache`, `downloading`, and `temp` folders
  - Diagnostic tips section (disk space, antivirus, permissions, path format)

**Files Changed:**
- `src-tauri/src/services/steamcmd.rs`
- `src-tauri/src/commands/server.rs`
- `src-tauri/src/lib.rs`
- `src/utils/tauri.ts`
- `src/components/server/InstallServerDialog.tsx`

---

### Preset Selector — No Export/Import

**Problem:** Server presets could only be applied from the built-in list. No way to save custom configs, share presets between machines, or import community presets.

**Fix:** Full preset management system:
- Export any preset (built-in or custom) as a `.json` file
- Import presets from `.json` files with validation
- Save current server config as a named custom preset
- Delete custom presets
- Custom presets persisted in localStorage

**Files Changed:**
- `src/data/presets.ts`
- `src/components/config/PresetSelector.tsx`

---

### Bulk Mod Import — No URL Support

**Problem:** Users copying CurseForge URLs instead of raw mod IDs would get validation errors. No way to paste from clipboard or import from file.

**Fix:**
- Added CurseForge URL parser that auto-extracts numeric mod IDs
- Added "Paste from Clipboard" button
- Added "Import from File" button (`.txt` format)
- Added URL format hint below textarea

**Files Changed:**
- `src/components/mods/AdvancedModInput.tsx`

---

## 🗺️ v2.4.0 Map Updates

### Ark Club Map Added

Added "Ark Club" to the released maps category with:
- Custom landscape thumbnail image
- Map profile entry in backend (`ArkClub_WP`)

**Files Changed:**
- `src/assets/maps/ark_club.png`
- `src/components/server/InstallServerDialog.tsx`

---

## 🌐 v2.4.0 Localization

### Traditional Chinese (zh-TW)

Added full Traditional Chinese translation:
- New locale file `src/i18n/locales/zh-TW.json`
- Registered in i18n config with 🇹🇼 flag
- Appears in language selector as "繁體中文"

**Files Changed:**
- `src/i18n/locales/zh-TW.json`
- `src/i18n/index.ts`

---

## Previous Fixes (v2.3.3)
## 🐛 Critical Bug Fixes

### 1. Config INI Overwrite on Server Startup

**Problem:** When starting a server, `GameUserSettings.ini` was **fully regenerated** from the ~30 fields the app knows about. Any custom settings pasted from third-party configuration tools (e.g., engram overrides, tribe settings, advanced PvP rules) were **silently destroyed**.

**Root Cause:** `ConfigGenerator::write_configs()` used a full file write for `GameUserSettings.ini` instead of the merge strategy already used for `Game.ini`.

**Fix:** Changed `write_configs()` to use `IniParser::merge()` — existing files are read first, new values from the UI override known keys, and **all unknown/custom keys are preserved**.

**Files Changed:**
- `src-tauri/src/services/config_generator.rs` — `write_configs()` method

---

### 2. Default Empty Password Written to INI

**Problem:** `ServerAdminPassword=` was always written to `GameUserSettings.ini` even when the user hadn't set a password, potentially causing authentication issues on some server configurations.

**Fix:** `ServerAdminPassword` is now only written to the INI file when the user has explicitly set an admin password. Empty values are skipped entirely.

**Files Changed:**
- `src-tauri/src/services/config_generator.rs` — `generate_game_user_settings()` method

---

### 3. Runtime Panics in Process Manager & Scheduler

**Problem:** Multiple `unwrap()` calls on `Mutex::lock()` results could cause unrecoverable panics if the mutex was poisoned (e.g., after a thread panic during server operations).

**Fix:** Replaced all `unwrap()` calls with proper `Result` error propagation using `map_err()`. Mutex poisoning is now handled gracefully with descriptive error messages instead of crashing the application.

**Files Changed:**
- `src-tauri/src/services/process_manager.rs`
- `src-tauri/src/services/scheduler.rs`

---

### 4. Discord Bot Double-Command Execution

**Problem:** Discord bot commands like `!start 1` would trigger the server startup sequence twice, causing port binding conflicts (the second instance fails because ports are already in use).

**Fix:** Added command deduplication logic in the Discord bridge service to prevent the same command from executing multiple times within a short window.

**Files Changed:**
- `src-tauri/src/commands/discord.rs`
- `src-tauri/src/services/discord_bridge.rs`

---

### 5. Recursive Save Import (SavedArks Self-Copy)

**Problem:** When importing a save via "Import Save" into a server that was already installed at the same path, the `SavedArks` folder would recursively copy into itself, growing indefinitely until the program crashed or the disk filled up.

**Fix:** Added path validation in the import logic to detect and prevent self-referencing copy operations (source === destination detection).

**Files Changed:**
- `src-tauri/src/commands/import.rs`

---

## 🗺️ Map Selection Updates

### 6. Missing Map: The Center

**Problem:** `TheCenter_WP` was missing from the backend map profiles, meaning it couldn't be properly configured when selected.

**Fix:** Added `TheCenter_WP` to `get_map_profiles()` with correct default multiplier values.

### 7. Outdated Map Release Dates

**Problem:** Genesis Part 1 was listed as "April 2026" (incorrect) and several upcoming maps were missing entirely.

**Fix:** Corrected release dates and added missing maps:
- **Released:** The Island, Scorched Earth, The Center, Aberration, Extinction, Ragnarok, Valguero
- **DLC:** Lost Colony (separated into its own category)
- **Premium Mods:** Astraeos, Forglar
- **Upcoming:** Genesis Part 1 (June 2026), Genesis Part 2 (TBC), Fjordur (TBC), Crystal Isles (TBC), Lost Island (TBC)

---

## 🎨 UI Improvements

### 8. Map Selection — Image Cards

**Before:** Flat dark cards with emoji icons (🏝️ 🏜️)
**After:** Full landscape image backgrounds for all 15 maps with:
- Dark gradient overlay for text readability
- Size badges (Large / Medium) on each card
- Status badges (DLC / MOD / SOON) with colored backgrounds
- Hover zoom animation (110% scale, 300ms transition)
- Selected state: white ring glow + green checkmark
- Upcoming maps: greyscale + 60% opacity (non-clickable)

### 9. Human-Readable i18n Fallbacks

All translation function calls (`t()`) now include English fallback strings as the second argument, preventing "dot.dot.word" display when localization keys are missing.

---

## 📁 New Assets

| File | Description |
|------|-------------|
| `src/assets/maps/the_island.png` | The Island landscape |
| `src/assets/maps/scorched_earth.png` | Scorched Earth landscape |
| `src/assets/maps/the_center.png` | The Center landscape |
| `src/assets/maps/aberration.png` | Aberration landscape |
| `src/assets/maps/extinction.png` | Extinction landscape |
| `src/assets/maps/ragnarok.png` | Ragnarok landscape |
| `src/assets/maps/valguero.png` | Valguero landscape |
| `src/assets/maps/lost_colony.png` | Lost Colony landscape |
| `src/assets/maps/astraeos.png` | Astraeos landscape |
| `src/assets/maps/forglar.png` | Forglar landscape |
| `src/assets/maps/genesis.png` | Genesis Part 1 landscape |
| `src/assets/maps/genesis2.png` | Genesis Part 2 landscape |
| `src/assets/maps/fjordur.png` | Fjordur landscape |
| `src/assets/maps/crystal_isles.png` | Crystal Isles landscape |
| `src/assets/maps/lost_island.png` | Lost Island landscape |

---

## ✅ Verification

- `cargo build` — **0 errors**, compiles clean
- Vite dev server — **0 TypeScript errors**, all assets load
- Manual browser verification — map images render correctly with hover and selection states
