# 🛡️ Guardian Self-Healing System

The Guardian is the manager's autonomous watchdog service, responsible for monitoring server process health, tracking resource consumption, and providing self-healing capabilities through automated crash recovery.

## 📝 Service Overview
- **File Path**: `src-tauri/src/services/guardian.rs`
- **Architecture**: Low-overhead OS process monitoring (`sysinfo`).
- **Core Functionality**: Crash Detection, Auto-Restart Orchestration, Resource Telemetry (CPU/RAM).

## 🚀 Key Features

### 1. High-Performance Monitoring (⚡)
The Guardian utilizes a specialized "Partial Refresh" strategy to monitor server health without impacting game performance:
- **PID Tracking**: Securely maps database server IDs to their active OS Process IDs.
- **Efficient Telemetry**: Only refreshes relevant process data from the OS kernel, avoiding the heavy overhead of full system hardware scans.
- **Resource Profiling**: Calculates real-time **Memory Usage (MB)** and **CPU Usage (%)** for every running ARK instance.

### 2. Autonomous Self-Healing (💊)
- **Crash Detection**: The Guardian identifies process failures within seconds of a crash event.
- **Configurable Auto-Restart**: Administrators can toggle "Auto-Restart" on a per-server basis. When enabled, the Guardian autonomously re-provisions the server process if it terminates unexpectedly.
- **Crash Counter**: Tracks cumulative failure counts for each server, helping developers identify unstable mod configurations or hardware bottlenecks.

### 3. Crash Intelligence & Logging
- **Event Journal**: Maintains a persistent rolling log of the last 100 crash events across the entire cluster.
- **Detailed Audits**: Each crash log includes the server name, precise UTC timestamp, and a record of whether the self-healing system successfully triggered a recovery.

### 4. Developer API
The Guardian exposes several Tauri commands for frontend integration:
- `get_server_health`: Fetches detailed metrics for a specific server.
- `set_auto_restart`: Updates the autonomous healing policy for a server.
- `get_crash_log`: Retrieves the cluster-wide failure history for display in the admin panel.

## 🛠️ Technical Details

### Server Health Model
```rust
pub struct ServerHealth {
    pub server_id: i64,
    pub is_alive: bool,
    pub crash_count: u32,
    pub memory_mb: f64,
    pub cpu_percent: f32,
    pub auto_restart_enabled: bool,
}
```

### Lightweight Process Refresh
To ensure minimal impact on the host system, the service uses a surgical refresh pattern:
```rust
let mut sys = System::new();
sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
let process = sys.process(Pid::from_u32(pid));
```

## 🎨 Developer Notes
- **Safety First**: The Guardian is "crash-aware" but not "restart-happy." It validates process state multiple times before confirming a failure to prevent race conditions during server reboots.
- **Visibility**: All Guardian actions (registration, auto-restarts, crash logging) are output to the manager's console with a distinct 🛡️ icon for easy log auditing.
