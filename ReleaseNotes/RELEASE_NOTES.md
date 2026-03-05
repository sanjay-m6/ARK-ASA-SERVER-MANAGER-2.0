# 🚀 ARK: ASA Server Manager v2.2.6

**Release Date:** 2026-02-02

This update focuses on a massive overhaul of the **Mod Manager**, intelligent automation for firewalls, and accurate server monitoring.

## 🔥 Key Features

### 🌟 Advanced Mod Filters
The Mod Manager now features a complete, CurseForge-style filtering system.
- **Categories**: Filter mods by type (Structures, Dinos, Maps, Cosmetics, etc.).
- **Sorting**: Sort by Popularity, Last Updated, Name, Total Downloads, etc.
- **Order**: Toggle between Ascending and Descending order.
- **UI**: Clean toolbar integration in the "Available Mods" tab.

### 🔍 Smart Mod ID Search
Searching by **Mod ID** is now fully supported.
- **Direct Lookup**: Pasting a numeric ID (e.g., `928708`) instantly fetches that specific mod.
- **Bypass**: Bypasses the fuzzy text search for 100% accuracy on ID lookups.

### 🛡️ Intelligent Firewall Automation
Manual port forwarding is no longer strictly required for Windows Firewall users.
- **Auto-Manage**: New setting in `Settings -> Firewall`.
- **Logic**: Automatically opens server ports (7777, 27015, RCON) when the server starts and closes them on stop (optional).
- **Backend**: Uses native `netsh` commands via a secure backend handler.

### 🧠 Smart Server Monitoring
- **TCP/UDP Reachability**: Replaced basic process tracking with active network checks.
- **True Status**: "Online" now means the server is actually reachable and responding to queries, not just that the `.exe` is running.
- **Crash Detection**: Improved detection for "Exit Code 3" and other crash states, triggering auto-repair if configured.

## 🐛 Bug Fixes & Improvements

- **Fixed**: Servers staying "Online" in the UI after crashing.
- **Fixed**: Mod search returning "No Mods Found" for valid Mod IDs.
- **Fixed**: `ConfigInput` type errors causing red text in the editor.
- **Fixed**: Infinite loading screens when switching tabs rapidly.
- **Fixed**: CSS parsing errors filling the console logs.
- **Fixed**: Removed deprecated Steam Workshop search logic from the backend.
- **Optimization**: Cleaned up backend compiler warnings and unused imports.
- **Optimization**: Memory footprint reduction via `optimize_memory` command.
