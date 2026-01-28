# Patch Notes - v2.2.5

## 🚀 **Server Visibility Fixed!**
This update addresses the critical issue where servers would start but fail to appear in the ARK server browser.

- **Status Visibility**: The server manager now intelligently detects when the ARK server is fully initialized.
  - 🔵 **Loading (Blue Pulse)**: The process has started, but the map/mods are still loading.
  - 🟢 **Online (Green Glow)**: The server log confirms startup is complete. This status persists across app restarts!
- **Database Persistence**: Server status is now saved to the local database, preventing "Running" indicators from being lost if the manager is closed.

## 🛡️ Feature: Intelligent Mode (From v2.2.4)
- **Graceful Shutdowns**: Uses RCON `SaveWorld` before stopping.
- **Shield Protection**: Automatically pauses server when new saves are imported.
- **Auto-Recovery**: Detecting and handling stuck processes.

## 🐛 Bug Fixes
- Fixed server list not populating after startup.
- Fixed UI status not reflecting true server state.
- Improved log parsing performance.

---
*Update your manager to v2.2.5 to ensure your servers are visible to players!*
