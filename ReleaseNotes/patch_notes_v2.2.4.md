# Patch Notes - v2.2.4

## 🛡️ New Feature: Intelligent Mode (Advanced-Automation)
This update introduces **Intelligent Mode**, a premium automation layer designed to protect your ARK: Survival Ascended server during updates, save imports, and configuration changes.

- **Graceful RCON Shutdown**: Unlike standard auto-stop, Intelligent Mode uses RCON to send a `SaveWorld` command followed by `DoExit`. This ensures all player progress is committed to disk before the server stops.
- **Shield Protection**: Expanded file monitoring now watches the `SavedArks` directory. If you drop a new save file in, the manager automatically pauses the server safely to apply the data.
- **Smart Fallback**: If RCON is unresponsive, the manager automatically falls back to a safe forceful termination after 15 seconds.
- **Visual Status**: A new glowing shield icon on your server cards indicates when Intelligent Mode is guarding your instance.

## ✨ Other New Features
- **Non-Dedicated Save Import**: Easily migrate your Single Player or Non-Dedicated session saves to your dedicated server with our new import tool.
- **Enhanced UI Feedback**: Added detailed tooltips and status indicators for all automation features.
- **Optimistic UI Updates**: Toggling settings now reflects immediately in the UI for a smoother experience.

## 🐛 Bug Fixes & Refinements
- **Core Stability**: Resolved multiple "Type Inference" and "Lifetime" errors in the Rust backend that were causing build instability.
- **Config Mapping**: Fixed the "Turrets Attack Riderless" setting which was incorrectly mapped in previous versions.
- **Stat Labeling**: Corrected "Crafting Skill" multiplier to "Crafting Speed" to match ARK's internal naming.
- **Process Ghosting**: Fixed a bug where servers would appear as "Running" if the manager was restarted after a crash.
- **RCON Reliability**: Improved RCON connection handling during shutdown sequences.

## 🛠️ Internal Updates
- Upgraded `notify` crate implementation for better file system event detection.
- Refactored `ProcessManager` to support asynchronous graceful shutdowns.
- Optimized database queries for server status retrieval.

---
*Thank you for using ARK ASA Server Manager 2.0!*
