# ARK ASA Server Manager — Bug Fix Report v2.3.3

> **Release Date:** April 30, 2026
> **Version:** 2.3.3
> **Type:** Bug Fix + UI Enhancement

---

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
