# 🚀 Process Manager Service

The Process Manager is the mission-control engine of the application. It handles the launching, monitoring, and graceful termination of ARK: Survival Ascended server instances with specialized logic for Windows-native performance and Unreal Engine 5 stability.

## 📝 Service Overview
- **File Path**: `src-tauri/src/services/process_manager.rs`
- **Architecture**: Multi-threaded process monitor with Win32 API integration.
- **Core Functionality**: Invisible Launching, Crash Detection, Auto-Repair, Performance Tuning.

## 🚀 Key Features

### 1. Advanced Windows Orchestration (🖥️)
- **Invisible Execution**: Launches servers using `CREATE_NO_WINDOW` flags, keeping the administrator's desktop clean while the manager handles all output.
- **Window Management**: Includes a specialized `window_hider` module that can dynamically hide or show server console windows using the Win32 `ShowWindow` API.
- **Priority Scaling**: Allows administrators to set process priority classes (e.g., `HIGH_PRIORITY_CLASS`) to ensure the game server receives preferential CPU scheduling.

### 2. Intelligent Lifecycle Monitoring
- **3-Second Pulse**: A background watchdog thread audits the health of every active server process every 3 seconds.
- **UE5 Handoff Logic**: Implements a "Smart Verification" system for Unreal Engine 5. Unlike older engines, ASA often exits its parent process during boot. The manager detects this and verifies the server is still alive via A2S UDP queries before incorrectly marking it as "Crashed."
- **Stop Reason Tracking**: Categorizes every termination (e.g., `UserAction`, `ScheduledRestart`, `StartupTimeout`, `CrashDetected`) for a comprehensive audit trail.

### 3. Autonomous Self-Healing (🛡️)
- **Auto-Repair Engine**: If a crash is detected, the manager can be configured to automatically purge corrupted mod caches (`.temp` directories) and attempt a recovery restart.
- **Timeout Protection**: Automatically terminates "Zombie" processes that fail to reach an "Online" state within a configurable window (e.g., 20 minutes), preventing resource exhaustion.

### 4. Dynamic Argument Engine
The manager constructs complex startup strings that include:
- **Core Parameters**: Map, Session Name, Ports (Game/Query/RCON), and Max Players.
- **Clustering**: Handles cluster IDs and shared directory paths for cross-server transfers.
- **Mod Injection**: Dynamically builds the `-mods=` argument list based on the enabled mods in the database.

## 🛠️ Technical Details

### Server Lifecycle Events
```rust
pub struct ServerLifecycleEvent {
    pub server_id: i64,
    pub event: String,      // "START", "STOP", "CRASH"
    pub reason: Option<String>,
    pub uptime_seconds: Option<u64>,
    pub timestamp: String,
}
```

### Process State Determination
The manager uses a multi-layered check to determine the "True Status":
1. **OS Check**: Is the PID still active?
2. **Network Check**: Is the Query Port responding to A2S_INFO?
3. **Log Check**: Have the logs printed "Server is ready"?
4. **Port Check**: Is the port still bound to a process?

## 🎨 Developer Notes
- **Thread Safety**: Uses an `Arc<Mutex<HashMap<i64, ServerProcess>>>` to manage multiple servers concurrently without race conditions.
- **Win32 Dependencies**: Heavily relies on `windows-sys` for low-level process and window control.
- **Asynchronous Events**: Emits real-time `server-status-change` and `server-lifecycle-event` signals to the frontend via the Tauri event bus.
