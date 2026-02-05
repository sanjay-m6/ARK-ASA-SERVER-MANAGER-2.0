# 🚀 Patch Notes - v2.2.7

## 🆕 New Features

### 🌐 Cross-Server Chat (BETA)
Relay chat messages between all servers in your cluster!
- **Toggle per cluster** - Enable/disable from Cluster Manager
- **Server name prefixes** - Messages show `[ServerName] Player: message`
- **RCON-based relay** - Uses existing RCON connections

### 💬 Discord Chat Bridge (BETA)
Two-way chat sync between your ARK servers and Discord!
- **Game → Discord** - In-game messages appear in your Discord channel
- **Discord → Game** - Discord messages broadcast to all cluster servers
- **Rate limiting** - Anti-spam protection (5 msgs/10 seconds)
- **Test Connection** - Verify your bot token and channel access
- **Direction toggles** - Enable/disable each direction independently

> **Setup**: Cluster Manager → Your Cluster → Discord Bridge Settings

### ⚔️ Offline PvP Protection Settings
New config options in **Config Editor → PvP/PvE Mode**:
- `PreventOfflinePvP` - Toggle protection when players are offline
- `PreventOfflinePvPInterval` - Delay (0-900s) before protection activates

### 📦 Advanced Mod ID Input Mode
Bulk import mod IDs in **Mod Manager**:
- Paste comma, space, or newline-separated mod IDs
- Automatic duplicate detection
- Numeric validation
- Preserves mod load order

---

## 🐛 Bug Fixes
- Fixed unused code warnings in experimental services
- Improved backup command argument handling

---

## 🛠️ Technical Changes
- Added `serenity` crate for Discord bot integration
- New database tables: `cluster_settings`, `discord_bridge_config`
- New Rust services: `cross_chat.rs`, `discord_bridge.rs`
- Frontend: `DiscordBridgeSettings.tsx`, `AdvancedModInput.tsx`

---

*Thank you for using ARK ASA Server Manager 2.0!*
