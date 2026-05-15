# ⏰ Scheduler Page

The Scheduler allows for full automation of server maintenance tasks, from simple interval restarts to complex, cron-based custom logic chains.

## 📝 Component Overview
- **File Path**: `src/pages/Scheduler.tsx`
- **Core Logic**: `src-tauri/src/services/scheduler.rs` (Backend).
- **Features**: Basic Interval Mode, Advanced Maintenance Mode, Cron-based Custom Tasks, Pre-warning System.

## 🚀 Key Features

### 1. Basic Schedule Mode
- **Simple Intervals**: Set the server to restart every X hours (1, 2, 3, 4, 6, 8, 12, or 24).
- **Automated Warning**: Sends a notification to players in-game at a fixed interval before the restart.

### 2. Advanced Maintenance Mode
- **Sequential Chains**: Execute a multi-step workflow at a specific time:
    1. **Stop Server**: Graceful shutdown via RCON `SaveWorld` and process termination.
    2. **Update Server**: Triggers SteamCMD to check for and apply updates.
    3. **Start Server**: Launches the process with current configuration.
    4. **Maintenance Task**: Executes optional tasks like `DestroyWildDinos` once the server is back online.
- **Day Selection**: Configure specific days of the week for maintenance (e.g., "Every Tuesday and Friday at 4:00 AM").

### 3. Custom Scheduled Tasks
- **Cron Expressions**: Support for standard cron syntax for granular control.
- **Task Types**:
    - **Restart**: Standard server reboot.
    - **AutoUpdateMods**: Triggers the Mod Manager to check for updates.
    - **Backup**: Triggers a local or cloud backup.
    - **Announcement**: Broadcasts a specific message to all online players.
    - **RCON Command**: Executes any arbitrary RCON command string.
- **Pre-Warning**: Configurable countdown warnings sent to players (e.g., "Restarting in 10, 5, 3, and 1 minutes").

### 4. Live Countdown & Status
- **Next Run Indicator**: Real-time visual countdown timer showing exactly when the next automated event will trigger.
- **Task Logs**: Tracks the "Last Run" timestamp for every configured task to ensure automation is functioning.

## 🎨 UI/UX Patterns
- **Visual Chains**: Uses a numbered list with vertical connectors to represent the sequential flow of advanced maintenance.
- **Glow Accents**: Active modes (Basic vs. Advanced) are highlighted with green border glows and pulse animations.
- **Task Chips**: Custom tasks are presented in a grid with color-coded icons based on their function (e.g., Orange for Restart, Blue for Backup).
