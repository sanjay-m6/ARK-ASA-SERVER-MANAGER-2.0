# 🌉 Discord Bridge Service (Pro)

The Discord Bridge is a bidirectional communication and remote management engine that integrates the ARK server cluster directly into the Discord ecosystem.

## 📝 Service Overview
- **File Path**: `src-tauri/src/services/discord_bridge.rs`
- **Library**: Powered by `serenity` (Discord Gateway) and `tokio` (Async runtime).
- **Core Functionality**: Bidirectional Chat Relay, Remote Admin Commands, Persistent Status Boards.

## 🚀 Key Features

### 1. Bidirectional Chat Relay (↔️)
- **Game → Discord**: Relays global chat messages from all servers in a cluster to a unified Discord channel, prefixed with the server name.
- **Discord → Game**: Relays messages from Discord users back into the game world, appearing as `[Discord] User: Message`.
- **Intelligent Filtering**: Features a memory-backed "Echo Prevention" system that prevents the bot from re-broadcasting its own messages across the relay loop.
- **Rate Limiting**: Protects servers from spam by enforcing a 5-message per 10-second window per user.

### 2. Remote Management Interface (🤖)
The bridge enables a "Private Admin Channel" where authorized administrators can execute cluster commands via the bot:
- `!list` / `!status`: Get a real-time status report of all managed servers.
- `!start <id>` / `!stop <id>`: Remotely toggle server power states.
- `!restart <id>`: Trigger a graceful restart with warnings.
- `!update <id>`: Force a SteamCMD update check.
- `!broadcast <id> <msg>`: Send an emergency broadcast directly to active players.
- `!kick <id> <steam_id>`: Remove a specific player from a specific server.

### 3. Persistent Status Boards (📊)
- **Self-Updating Messages**: Instead of sending frequent messages, the bot can maintain a single "Living" message in a dedicated channel.
- **Server List**: Displays Map names, IP addresses, and current/max player slots.
- **Player List**: Lists all currently online survivors, including Tribe names and current session playtime (optional).

### 4. Connection Reliability
- **Gateway Persistence**: The bot maintains a persistent WebSocket connection to the Discord Gateway, ensuring it appears "Online" and responsive even during idle periods.
- **Credential Validation**: Includes a robust test suite that verifies Token validity, Guild membership, and specific Channel permissions (View/Send/History) with actionable fix suggestions.

## 🛠️ Technical Details

### Command Execution
Admin commands are executed by spawning non-blocking tasks in the Tauri async runtime, ensuring that a long-running `!update` command doesn't block the chat relay.
```rust
tauri::async_runtime::spawn(async move {
    match crate::commands::server::start_server(app, id, false).await {
        // ... success/error handling
    }
});
```

### Rate Limiting Logic
Uses a sliding window algorithm to track message frequency per Discord UserID:
```rust
pub struct RateLimiter {
    messages: HashMap<String, Vec<Instant>>,
    max_messages: usize,
    window_seconds: u64,
}
```

## 🎨 Developer Notes
- **Privileged Intents**: Requires `MESSAGE_CONTENT` to be enabled in the Discord Developer Portal for the command parser and chat relay to function.
- **Cluster Sync**: The bridge is designed to handle multiple servers simultaneously, using the `cluster_id` as the primary key for routing messages.
