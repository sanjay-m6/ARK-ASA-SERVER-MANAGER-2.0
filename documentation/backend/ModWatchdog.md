# 🐕 Mod Watchdog Service

The Mod Watchdog is an autonomous background supervisor that monitors the health and version-status of installed mods, ensuring that servers are always running the latest content without requiring manual administrative intervention.

## 📝 Service Overview
- **File Path**: `src-tauri/src/services/mod_watchdog.rs`
- **Architecture**: Async background worker with per-minute polling.
- **Core Functionality**: Live Update Detection, Graceful Orchestration, Maintenance Windows, Rollback Protection.

## 🚀 Key Features

### 1. Real-time Delta Detection (🐕)
- **Polling Loop**: Operates on a dedicated async thread that audits all "Online" servers every 60 seconds.
- **Version Tracking**: Maintains an in-memory `mod_state` map that compares the "Date Modified" timestamp from CurseForge against the server's current state to identify pending updates instantly.
- **Selective Checking**: Only checks servers that are currently active, minimizing unnecessary network traffic for offline or Hibernated instances.

### 2. Graceful Orchestration Pipeline
The watchdog ensures that updates don't disrupt the player experience without warning:
- **Multi-Stage Warnings**: Automatically broadcasts RCON messages at the 15, 10, 5, and 1-minute marks (e.g., "Mod update detected! Server restarting in 5 minutes!").
- **State Preservation**: Executes a final `SaveWorld` command via RCON before initiating the shutdown, preventing any data loss during the update cycle.
- **Maintenance Windows**: Supports configurable time ranges (e.g., `02:00-05:00`) to restrict intrusive update restarts to periods of low player activity.

### 3. Automated Rollback & Safety
- **Pak-Only Snapshots**: Before the update begins, the watchdog creates a lightweight backup of the `.pak` files in the mods directory. This provides a "last known good" state if a new mod version is corrupted or incompatible.
- **Safe Restart Mode**: If enabled, the watchdog will only restart the server if the player count is zero, or if it is within a defined maintenance window.

### 4. Community Notifications
- **Discord Integration**: Automatically sends rich embeds to the configured Discord channel, informing the community which mods were updated and providing a live status link.
- **Manager Feedback**: Streams real-time "Manager Logs" to the UI, detailing the specific mod names and timestamps that triggered the watchdog.

## 🛠️ Technical Details

### Watchdog Configuration
```rust
pub struct WatchdogConfig {
    pub server_id: i64,
    pub enabled: bool,
    pub polling_interval_minutes: u64,
    pub safe_restart_mode: bool,
    pub maintenance_windows: Vec<String>,
}
```

### Orchestration Workflow
1. **Detect**: Mod update found on CurseForge.
2. **Warn**: 15-minute countdown starts via RCON.
3. **Save**: `SaveWorld` command sent.
4. **Stop**: Server process terminated with `UpdateRequired` reason.
5. **Start**: Server restarted; ARK engine auto-downloads updates.
6. **Alert**: Discord community notified.

## 🎨 Developer Notes
- **Concurrency**: Uses `tokio::sync::Mutex` for thread-safe access to watchdog configs and active update flags.
- **Path Awareness**: Correctly identifies the `ShooterGame/Saved/Mods` directory for backup operations.
- **Service Dependency**: Relies on `ModScraper` for network queries and `RconService` for game-world interaction.
