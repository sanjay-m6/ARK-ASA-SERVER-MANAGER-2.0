# 💬 Cross-Chat Service

The Cross-Chat service is the social heart of clustered environments, enabling real-time communication between players across different game servers (e.g., a player on *The Island* chatting seamlessly with a player on *Scorched Earth*).

## 📝 Service Overview
- **File Path**: `src-tauri/src/services/cross_chat.rs`
- **Architecture**: Log-driven Relay Engine with RCON Broadcast.
- **Core Functionality**: Cluster-wide Message Relay, Server Identity Prefixing, Real-time Chat Monitoring.

## 🚀 Key Features

### 1. Hybrid Relay Architecture (🔗)
The service utilizes a high-efficiency dual-path approach:
- **Passive Listening**: Instead of spamming the server with RCON queries, the service uses a dedicated `LogWatcher` for each server to monitor `ShooterGame.log` for new chat activity.
- **Active Broadcasting**: Once a message is captured, the service uses the `RconService` to re-broadcast the message to all other servers within the same cluster ID.

### 2. Intelligent Message Formatting
- **Server Identity Injection**: To provide context in multi-map environments, relayed messages are automatically prefixed with the source server's name (e.g., `[Island] PlayerName: Hello!`).
- **System Filtering**: Uses specialized Regular Expressions to separate player messages from system events (e.g., world saves, join/leave logs), ensuring the cross-chat remains focused on player communication.

### 3. Cluster Awareness (🌐)
- **Scoped Communication**: Servers are grouped by `Cluster ID`, ensuring that messages are only relayed to "Sister Servers" within the same story arc or community group.
- **Multi-Cluster Support**: The service can concurrently manage relay operations for multiple independent clusters without any cross-talk or performance degradation.

### 4. Non-Invasive Implementation
- **No Mods Required**: Operates entirely through existing log files and RCON protocols. No binary modifications or game-side plugins are needed to enable cluster-wide social features.
- **Atomic Control**: Administrators can enable or disable cross-chat relay instantly for any specific cluster through the manager's UI.

## 🛠️ Technical Details

### Chat Extraction Logic
The service uses an optimized regex to parse the ARK-specific log format:
```rust
// Matches: 2024.02.05_12.00.00: LogServer: PlayerName: MessageContent
let chat_regex = Regex::new(r"(\d{4}\.\d{2}\.\d{2}_\d{2}\.\d{2}\.\d{2}): (?:[A-Za-z0-9_]+): ([^:]+): (.*)");
```

### Relay Workflow
1. **Watch**: `LogWatcher` detects a new line in `ShooterGame.log`.
2. **Extract**: Regex separates the player name and content.
3. **Format**: Prepends `[ServerName]` to the content.
4. **Relay**: Iterates through all other servers in the cluster and sends a `ServerChat` RCON command.

## 🎨 Developer Notes
- **Thread Safety**: Uses `Arc<AtomicBool>` to safely terminate background relay threads when a cluster is disabled or the manager is shut down.
- **Performance**: Log watching is extremely lightweight, ensuring that cross-chat has zero impact on the game server's FPS or memory footprint.
