# 🤖 Log Watcher Service

The Log Watcher is a high-performance, event-driven monitoring engine that provides real-time visibility into game server behavior by tracking and analyzing `ShooterGame.log` files.

## 📝 Service Overview
- **File Path**: `src-tauri/src/services/log_watcher.rs`
- **Mechanism**: OS-Level File System Notifications (`notify` crate).
- **Core Functionality**: Real-time Error Detection, Delta-based Parsing, AI Anomaly Reporting.

## 🚀 Key Features

### 1. Reactive Monitoring (⚡)
The service utilizes native OS event hooks to detect changes to log files instantly:
- **Zero-Latency Detection**: Instead of periodic polling, the manager is notified by the OS the moment a log entry is written.
- **Efficient Processing**: The service only reads the **delta** (newly added content) since the last check, ensuring minimal impact on system performance even with multi-gigabyte log files.

### 2. Intelligent Log Management
- **Truncation Awareness**: Automatically handles "Log Clearing" events (common during server restarts) by resetting read pointers, ensuring that the next monitoring cycle starts from the beginning of the new file.
- **Provisioning**: If a log file doesn't exist (e.g., on a fresh install), the service automatically creates the directory structure and file to establish the watch immediately.

### 3. Anomaly & Crash Detection (💥)
The watcher acts as a sentinel for server stability:
- **Keyword Heuristics**: Continuously scans incoming lines for critical failure signatures such as `Fatal Error`, `Exception`, and `Crash`.
- **Event Emission**: When an anomaly is detected, a `log_anomaly` event is broadcasted across the manager's event bus, containing the specific server ID and the offending log line.

### 4. AI-Ready Integration
- **Contextual Alerts**: The anomaly events are specifically designed to be consumed by the UI's AI Agent, allowing it to provide instant troubleshooting advice or trigger automated recovery actions (like a server restart).

## 🛠️ Technical Details

### Delta Reading Logic
The service uses a file-position-tracking algorithm to avoid redundant processing:
```rust
if current_len > last_pos {
    let _ = file.seek(SeekFrom::Start(last_pos));
    let reader = BufReader::new(file);
    for line in reader.lines() {
        // ... process new line
    }
    last_pos = current_len;
}
```

### Anomaly Event Model
```rust
pub struct LogAnomalyEvent {
    pub server_id: i64,
    pub anomaly_type: String, // "Fatal Error", "Crash", "Exception"
    pub details: String,      // The full log line
}
```

## 🎨 Developer Notes
- **Thread Isolation**: Each monitored server runs its own dedicated background thread to ensure that I/O bottlenecks on one drive don't impact the monitoring of other clusters.
- **Non-Recursive**: To maximize performance, the watcher only monitors the specific `.log` file and ignores other file operations in the directory.
