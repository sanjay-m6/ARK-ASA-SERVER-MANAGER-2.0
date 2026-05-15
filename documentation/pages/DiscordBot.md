# 🤖 Discord Bot Page

The Discord Bot (Discord Bridge) integrates your ARK server with your community's Discord server, providing cross-chat, status updates, and administrative controls.

## 📝 Component Overview
- **File Path**: `src/pages/DiscordBot.tsx`
- **Backend Service**: `DiscordBridgeService` (Rust).
- **Technology**: Discord Webhooks (Simple) and Discord Bot API (Advanced Bridge).

## 🚀 Key Features

### 1. Webhook Notifications
- **Event Alerts**: Automatically sends messages to Discord when a server starts, stops, or crashes.
- **Customizable Alerts**: Toggle specific notifications (e.g., only show crashes and updates, ignore player joins).
- **Embed Support**: Uses rich Discord embeds with colors and icons for professional formatting.

### 2. Full Bot Bridge (Cross-Chat)
- **Bidirectional Chat**: Syncs in-game chat to a Discord channel and vice-versa.
- **Tribe Integration**: Shows tribe names alongside player names in Discord (configurable).
- **Cluster Support**: Link multiple servers in a cluster to a single global Discord chat.

### 3. Live Server Status
- **Dynamic Message**: The bot maintains a "Live Status" message in Discord that updates every 60 seconds with current player counts and server uptime.
- **Player Lists**: Optional real-time player list message showing who is currently online.

### 4. Admin Bridge
- **Remote Commands**: Execute RCON commands from a designated "Admin Channel" in Discord.
- **Security**: Restricted to specific Discord roles or User IDs to prevent unauthorized access.

## 🛠️ Technical Details

### Backend Service Flow
The `DiscordBridgeService` in Rust maintains a persistent WebSocket connection to the Discord Gateway.
- **Event Handling**: Listens for `MessageCreate` events on Discord to bridge to RCON.
- **Log Scraping**: Monitors server logs for chat lines (e.g., `[Chat] Player: Hello`) to bridge to Discord.

### Configuration
Config is stored per Cluster. A cluster can have:
```json
{
  "bot_token": "DISCORD_TOKEN",
  "channel_id": "CHAT_CHANNEL_ID",
  "admin_channel_id": "ADMIN_CHANNEL_ID",
  "game_to_discord": true,
  "discord_to_game": true
}
```

## 🎨 UI/UX Patterns
- **Connection Monitoring**: A "Live Status" indicator at the top of the page shows if the webhook or bot is currently connected.
- **Quick Action Cards**: Buttons to send manual announcements or status updates instantly.
- **Setup Wizards**: Step-by-step guides for creating a Discord Bot and obtaining the necessary IDs.
