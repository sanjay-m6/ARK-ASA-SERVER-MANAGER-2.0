# 📅 Scheduler Service

The Scheduler is a high-level automation engine that manages recurring administrative tasks, ranging from simple restart loops to complex mod update orchestrations and time-gated game events.

## 📝 Service Overview
- **File Path**: `src-tauri/src/services/scheduler.rs`
- **Architecture**: Async background worker with per-minute precision.
- **Core Functionality**: Cron-based Tasking, Basic Restart Loops, Auto-Mod Updates, Multi-Stage Warning Broadcasts.

## 🚀 Key Features

### 1. Dual-Mode Scheduling (🛠️)
The service caters to both beginner and expert administrators through two distinct modes:
- **Basic Mode**: A "Set and Forget" recurring loop for restarts. Users define an interval (e.g., 12 hours) and the system automatically calculates the next run time from midnight and handles the RCON warnings.
- **Advanced Mode**: Provides full **Cron Expression** support (e.g., `30 4 * * 0` for 4:30 AM every Sunday), allowing for surgical precision in task timing.

### 2. Autonomous Mod Watchdog (📦)
This is the most advanced feature of the scheduler, ensuring the server always runs the latest mod versions:
- **Delta-Check Logic**: Scrapes CurseForge to compare mod "Last Updated" timestamps against the server's "Last Started" timestamp.
- **Pre-Update Warnings**: Automatically broadcasts countdown messages to players via RCON (e.g., "Server updating mods in 15 minutes").
- **Safety Rollback Engine**: Before updating, the scheduler creates a verified "Pre-Update Backup." If the server fails to launch post-update (common with breaking mod changes), the service **automatically rolls back** to the stable state and restarts the server.

### 3. Event & Boost Management
- **Temporal Multipliers**: Schedule "Boost Start" and "Boost End" tasks to automatically adjust server multipliers (XP, Taming, Harvesting) for weekend events without manual intervention.
- **Raw RCON Execution**: Allows scheduling of any arbitrary console command, such as `DestroyWildDinos` or `SaveWorld`.

### 4. Precision Timing & Resilience
- **Midnight-Relative Logic**: To ensure schedules remain predictable across app restarts, the service calculates "Next Run" times relative to absolute midnight rather than app uptime.
- **Background Worker**: Operates on a dedicated `tauri::async_runtime` loop, ensuring that scheduled tasks are triggered even if the manager's UI is minimized or hidden.

## 🛠️ Technical Details

### Task Definition
```rust
pub struct ScheduledTask {
    pub server_id: i64,
    pub task_type: String,      // "Restart", "Stop", "RconCommand", "AutoUpdateMods", etc.
    pub cron_expression: String,
    pub pre_warning_minutes: i32,
    pub command: Option<String>,
}
```

### Rollback Workflow
If an `AutoUpdateMods` task fails, the following recovery is triggered:
1. Identify the associated `PreUpdate` backup.
2. Terminate any hanging server processes.
3. Restore `ShooterGame/Saved/Config` and `ShooterGame/Saved/SavedArks`.
4. Trigger a clean start without forcing a binary update.

## 🎨 Developer Notes
- **Thread Safety**: Uses `rusqlite` connection pooling and `Mutex` guards to prevent database lock-ups during high-frequency task execution.
- **Extensibility**: The `execute_task` match block is designed to be easily extended with new task types (e.g., Automated Backups to S3, Cluster-Wide Updates).
