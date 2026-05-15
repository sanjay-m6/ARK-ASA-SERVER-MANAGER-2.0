# 🌉 Discord Bridge Service

The Discord Bridge is a high-performance integration layer that connects the ARK game servers to a Discord community, enabling two-way chat synchronization, live status reporting, and remote administrative control.

## 📝 Service Overview
- **File Path**: `src-tauri/src/services/discord_bridge.rs`
- **Architecture**: Dual-path sync (HTTP Webhooks + Serenity Gateway).
- **Core Functionality**: Two-Way Chat Sync, Live Server/Player Lists, Remote Admin Commands, Echo Prevention.

## 🚀 Key Features

### 1. Two-Way Community Sync (🔄)
- **Game → Discord**: Relays player chat to a configured Discord channel, automatically prefixing messages with the source server's name for clarity.
- **Discord → Game**: Captures community messages from Discord and broadcasts them into the game world, prefixed with `[Discord]`.
- **Intelligent Echo Prevention**: Tracks outgoing messages to ensure the bot never creates infinite feedback loops between the two platforms.

### 2. Live Status Embeds
The service maintains "Living Documents" in Discord to keep the community informed without needing to check the manager UI:
- **Server Status List**: A persistent, self-updating message showing the live status (🟢 Online, 🔴 Stopped, 🟡 Starting) and connection details for all servers in the cluster.
- **Player Monitor**: A real-time list of online players, with optional support for displaying Tribe Names and total server playtime (integrated with `PlayerIntelligenceService`).

### 3. Remote Admin Console (🛠️)
Trusted administrators can manage the entire server cluster directly from a secure Discord channel using command prefixes:
- `!status` - Get an instant summary of all server states.
- `!start / !stop / !restart <id>` - Control specific server processes remotely.
- `!update <id>` - Trigger an asynchronous SteamCMD update.
- `!kick <id> <steam_id>` - Remove a player from the game via RCON.
- `!broadcast <id> <msg>` - Send a global announcement to a specific server.

### 4. Safety & Performance
- **Channel Isolation**: Separates public community chat from administrative command channels to prevent unauthorized access.
- **Rate Limiting**: Implements per-user rate limits to prevent chat spam from disrupting the in-game experience.
- **Diagnostic Toolkit**: Features a multi-stage connection tester that validates Bot Tokens, Guild access, and Channel permissions to simplify initial setup.

## 🛠️ Technical Details

### Administrative Command Mapping
The bridge maps Discord messages to internal Tauri commands:
```rust
"!start" => {
    let app = self.app_handle.clone();
    tauri::async_runtime::spawn(async move {
        crate::commands::server::start_server(app, id, false).await;
    });
}
```

### Discord Intent Configuration
Uses `serenity` with specific Gateway Intents to maintain the WebSocket connection:
```rust
let intents = GatewayIntents::GUILDS 
            | GatewayIntents::GUILD_MESSAGES 
            | GatewayIntents::MESSAGE_CONTENT;
```

## 🎨 Developer Notes
- **Persistence**: Discord configuration (tokens, channel IDs) is stored in the `discord_bridge_config` database table.
- **Experimental Flag**: While highly stable, some "Cross-Chat" features are currently marked as experimental while ASA's internal log format stabilizes.
- **Scalability**: Designed to handle high-volume clusters with dozens of servers through efficient async message batching.
