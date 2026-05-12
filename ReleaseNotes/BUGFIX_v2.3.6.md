# ARK ASA Server Manager — Release Report v2.3.6

> **Release Date:** May 12, 2026
> **Version:** 2.3.6
> **Type:** Bug Fixes & Stability Update

---

## 🚀 v2.3.6 New Features & Updates

### Infinity AI Assistant
- **Stability Improvements**: Enhanced the autonomous agent response processing to be more robust.
- **Improved RCON Communication**: Refactored the custom `ArkRconClient` to handle ASA-specific multi-packet responses, ensuring reliable server communication.

---

## 🐛 Critical Bug Fixes

### 1. RCON Connection and Command Execution Failures
**Problem:** The previous third-party `rcon` crate could not handle ARK: Survival Ascended's non-standard multi-packet responses or invalid UTF-8 data, leading to dropped connections and failed commands (such as broadcasting or retrieving player lists).
**Fix:** 
- Replaced the third-party crate with a custom, robust `ArkRconClient`.
- Implemented robust multi-packet reading logic with automatic reconnection capabilities.
- Added safe UTF-8 decoding to prevent panics on malformed responses.

### 2. Player List Parsing Issues
**Problem:** Retrieving player lists often failed due to truncated RCON packets when there were many players online.
**Fix:**
- Updated the RCON client to properly aggregate fragmented packets before parsing.
- Improved regex parsing for player list extraction to handle edge cases in ASA's output format.

---

## ✅ Verification
- `cargo build` — **0 errors**, compiles clean
- Tested RCON commands (broadcast, listplayers, saveworld) successfully on live ASA server.
