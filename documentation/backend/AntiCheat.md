# 🛡️ Anti-Cheat Service

The Anti-Cheat service is a proactive security engine that monitors game logs and system events to detect, log, and automatically punish malicious activity such as speed-hacking, undermeshing, and administrative abuse.

## 📝 Service Overview
- **File Path**: `src-tauri/src/services/anti_cheat.rs`
- **Architecture**: Reactive Event Processor with Regex-based Log Parsing.
- **Core Functionality**: Heuristic Violation Detection, Undermesh Protection, Command Blacklisting, Autonomous Enforcement (Kick/Ban).

## 🚀 Key Features

### 1. Heuristic Violation Engine (🧠)
- **Adjustable Sensitivity**: Administrators can fine-tune detection thresholds (e.g., `0.5` for strict competitive play, `2.0` for relaxed creative servers).
- **Multi-Vector Monitoring**: Intelligently evaluates player behavior for anomalies in speed, flight, and inventory state through integration with external hooks like `NgcCore`.
- **Severity Scoring**: Every violation is assigned a severity score; actions are only triggered if the score exceeds the server's configured sensitivity.

### 2. Proactive Protection Layers
- **Mesh Protection**: Scans server logs in real-time for structure placement signatures that indicate "Undermeshing" (placing structures inside world geometry).
- **Command Abuse Protection**: Monitors the `AdminCmd` log stream to ensure that sensitive console commands are only executed by whitelisted SteamIDs. Any unauthorized admin actions trigger an immediate system alert.

### 3. Autonomous Response Pipeline (🔨)
When a violation is confirmed, the service can execute a graduated series of actions:
- **Logging**: Detailed records are saved to the database for manual review.
- **Kick/Ban**: Automatically executes `KickPlayer` or `BanPlayer` commands via the RCON service, providing the violation type as the ban reason.
- **Discord Alerts**: Sends instantaneous "Anti-Cheat Alert" rich embeds to the administrative Discord channel.

### 4. Real-time Log Parsing
The service integrates a dedicated `LogWatcher` for each active server:
- **Regex Detection**: Uses optimized regular expressions to extract Player Names, SteamIDs, and Command Strings from the high-volume `ShooterGame.log`.
- **Background Processing**: Operates on an independent async task pool to ensure that high-frequency log activity never impacts server performance or manager responsiveness.

## 🛠️ Technical Details

### Violation Event Model
```rust
pub struct ViolationEvent {
    pub server_id: i64,
    pub player_name: String,
    pub steam_id: String,
    pub violation_type: String, // "Speed", "UnderMesh", "Command Abuse"
    pub severity: f32,
    pub details: String,
    pub timestamp: u64,
}
```

### Protection Configurations
```rust
pub struct AntiCheatConfig {
    pub enabled: bool,
    pub sensitivity: f32,
    pub actions: ActionConfig,           // kick_enabled, ban_enabled, etc.
    pub mesh_protection: MeshConfig,
    pub command_protection: CommandProtectionConfig,
}
```

## 🎨 Developer Notes
- **Extensibility**: The violation processor is designed to handle custom event types, allowing for integration with future third-party anti-cheat plugins.
- **Persistence**: All configuration is stored in the `anti_cheat_config` database table and cached in-memory for high-speed evaluation.
- **Safety**: Feature a "Log Only" mode to allow administrators to test sensitivity settings without accidentally banning players.
