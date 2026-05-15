# 📢 Discord Webhook Service

The Discord Webhook service provides a lightweight, configuration-free notification system that keeps administrators and players informed of critical server events via Discord channels.

## 📝 Service Overview
- **File Path**: `src-tauri/src/services/discord.rs`
- **Protocol**: HTTP POST (Webhooks).
- **Core Functionality**: Event Alerting, Rich Embed Generation, Status Reporting.

## 🚀 Key Features

### 1. Granular Alert Routing (🚥)
The service features a programmable alert engine that checks user preferences before sending notifications:
- **Selective Events**: Admins can toggle alerts for specific triggers such as `serverStart`, `serverStop`, `serverCrash`, or `scheduledTask`.
- **JSON Configuration**: Preferences are stored as a JSON blob in the settings database, allowing the frontend to easily modify alert behavior without backend recompilation.

### 2. Rich Visual Embeds (🎨)
Utilizes Discord's Embed API to provide high-fidelity status reports:
- **Color Coding**: Instant visual cues (Green for Online, Red for Stopped, Dark Red for Crash, Blue for Player Activity).
- **Dynamic Fields**: Embeds include real-time metadata such as Map Names, Player Counts (`{current}/{max}`), and Process Exit Codes.
- **Branded Footers**: All messages are tagged with "ASA Server Manager 2.0" and a UTC timestamp for audit trail purposes.

### 3. Comprehensive Status Updates (📊)
The service can generate cluster-wide status reports:
- **Aggregation**: Summarizes the health of the entire server list (e.g., "3 of 5 servers online").
- **Player Metrics**: Calculates total active players across all cluster members.
- **Inline Formatting**: Uses Discord's grid layout to display per-server details (Map, Players, Status) in a compact, readable format.

### 4. Automatic Metadata Resolution
- **Identity Mapping**: The service automatically queries the SQLite database to resolve internal `server_id` integers into human-readable server names (e.g., "The Island PVE") before broadcasting to Discord.

## 🛠️ Technical Details

### Webhook Execution Flow
1. **Trigger**: An internal service (e.g., `Guardian`) detects an event.
2. **Lookup**: The service retrieves the `discord_webhook_url` from the settings table.
3. **Validate**: Checks `discord_alerts_config` to see if the `event_key` is enabled.
4. **Construct**: Builds a `DiscordEmbed` using specialized constructors.
5. **Post**: Sends a JSON payload to the Discord API via `reqwest`.

### Common Embed Constructors
```rust
impl DiscordEmbed {
    pub fn server_online(server_name: &str) -> Self;
    pub fn server_crashed(server_name: &str, exit_code: i32) -> Self;
    pub fn player_join(server_name: &str, player_name: &str) -> Self;
    pub fn status_update(online: usize, total: usize, details: Vec<...>) -> Self;
}
```

## 🎨 Developer Notes
- **Non-Blocking**: All webhook operations are asynchronous, ensuring that a slow Discord API response never hangs the main server manager logic.
- **Error Handling**: Implements silent failure for missing URLs and logs HTTP error bodies for invalid webhook configurations to the console.
