# 🎮 RCON Service

The RCON (Remote Console) service is the primary communication engine of the manager, responsible for executing administrative commands, fetching live player data, and maintaining a resilient connection to ARK: Survival Ascended servers.

## 📝 Service Overview
- **File Path**: `src-tauri/src/services/rcon.rs`
- **Architecture**: Persistent Session Pooling with Auto-Recovery.
- **Core Functionality**: Live Command Execution, Player List Parsing, Connection Heartbeats.

## 🚀 Key Features

### 1. Resilient Connection Lifecycle (🔄)
The RCON service is designed to handle the notoriously unstable nature of game server networking:
- **Linear Backoff Setup**: During server startup, the service attempts to connect up to 10 times with increasing delays. This accounts for the 30–120s delay before the ASA engine fully initializes its RCON subsystem.
- **Auto-Healing Commands**: If a command fails due to a stale connection (e.g., a server crash or manual restart), the service automatically attempts a silent re-authentication and retries the command before notifying the user of any failure.

### 2. Specialized ASA Support
The service uses a custom `ArkRconClient` tailored specifically for the quirks of ARK: Survival Ascended:
- **Packet Aggregation**: Handles the lack of standard empty-packet sentinels in ASA, ensuring that large responses (like hundreds of player names) are correctly reconstructed.
- **Lossy UTF-8 Handling**: Prevents crashes caused by players using non-standard characters in their names or garbage bytes occasionally sent by the server engine.

### 3. Integrated Admin Suite
Provides a typed API for the most common administrative tasks:
- **Player Operations**: Kick, Ban, Unban, and Private Messaging.
- **World Control**: Global Chat Broadcasting, SaveWorld orchestration, Time-of-Day adjustment, and "Wild Dino Wipes."
- **Status Reporting**: Powers the manager's dashboard with live "Online Player" lists, parsed into structured data for easy UI display.

### 4. Background Maintenance (💓)
- **Keep-Alive Heartbeat**: A background task automatically sends a "no-op" query (`ListPlayers`) to every active session every 60 seconds. This prevents intermediate routers or firewalls from closing idle connections.
- **Multi-Server Orchestration**: Manages multiple simultaneous connections across a cluster, ensuring thread-safe access from the UI, Discord Bridge, and Guardian services.

## 🛠️ Technical Details

### RconResponse Structure
```rust
pub struct RconResponse {
    pub success: bool,
    pub message: String,
    pub data: Option<String>,
}
```

### Auto-Reconnect Logic
The `send_command` function wraps a recovery mechanism:
```rust
match session.connection.send_command(command).await {
    Ok(response) => Ok(response),
    Err(_) => self.try_reconnect_and_retry(server_id, ...).await
}
```

## 🎨 Developer Notes
- **Security**: Admin passwords are held in-memory within the `RconSession` struct and are never logged to console or disk.
- **Performance**: The service uses `tokio::sync::Mutex` for non-blocking asynchronous access, ensuring high throughput for cluster-wide broadcasts.
