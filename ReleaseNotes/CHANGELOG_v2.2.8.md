# 🎮 ARK ASA Server Manager — Patch Notes

## Version 2.2.8 — Bug Fixes & Discord Bot Integration

**Release Date:** February 13, 2026

---

### 🐛 Bug Fixes

**Discord Integration (Fixed)**
- 🔗 **Webhook Save Issue** — Fixed a critical bug preventing Discord webhook configurations from being saved properly.
- 💾 **Bot Settings Save** — Resolved the issue where Discord Bot integration settings could not be saved, causing configurations to be lost on restart.
- 🟢 **Bot Online Status** — The Discord Bot now correctly appears as **Online** in your server member list when the bridge is enabled.
- 📊 **Server Status in Discord** — Fixed servers incorrectly showing as 🔴 Offline in the Discord server list when they were actually online. The bot now correctly recognizes all server states (`online`, `running`, `starting`, `crashed`, `updating`, `repairing`, `startup_timeout`).

**Cluster Management (Fixed)**
- 🗑️ **Cluster Deletion** — Fixed the issue where clusters could not be deleted, causing orphaned entries and UI errors.
- 🤖 **Cluster Bot Integration** — Discord Bot now correctly reports real-time server status within clusters with accurate uptime tracking.

**Mod Management (Fixed)**
- 📦 **Mod Downloads** — Fixed the issue preventing mods from being downloaded and installed to servers.

**Configuration Editor (Fixed)**
- 🎮 **Player Stat Controls** — Resolved the issue with player stat configuration controls not applying correctly in the Config Editor.

---

### ✨ New Features

**🖥️ Server Console Window**
- Added a new **"Show Server Console"** button directly in the Console Output section header.
- Click it to instantly pop up the actual ARK server console window on your screen.
- Uses advanced process detection to reliably find and restore the server window, even when UE5 spawns child processes.

**🔗 Discord Bot Setup Improvements**
- Added **"Generate Invite Link"** button that creates a properly configured OAuth2 invite URL with the correct bot permissions.
- Added a collapsible **Bot Setup Guide** directly in the Discord Bridge settings for easy reference.
- Improved error messages with channel-specific details for easier debugging of permission issues.

---

### 🔧 Under the Hood
- Enhanced Discord API error reporting with detailed channel-specific error messages
- Improved server status detection accuracy with support for all status variants
- Added WebSocket Gateway connection via `serenity` for reliable bot online presence
- Improved process window management with `SW_RESTORE` and exe-name fallback for reliable console toggling
- Automatic bot restart when saving settings to ensure Gateway connection stays fresh

---

### 📝 Notes
- After updating, re-invite your Discord bot using the **"Generate Invite Link"** button to ensure correct permissions
- The bot requires **View Channels**, **Send Messages**, **Read Message History**, and **Manage Messages** permissions

---

*Report bugs in #bug-reports | Feature requests in #suggestions*
