# 📥 Server Installer Service

The Server Installer is the high-bandwidth provisioning engine responsible for the initial deployment and subsequent updating of the ARK: Survival Ascended server binaries via Valve's SteamCMD utility.

## 📝 Service Overview
- **File Path**: `src-tauri/src/services/server_installer.rs`
- **Architecture**: Asynchronous Subprocess Wrapper with Real-time Stream Parsing.
- **Core Functionality**: Automated Installation, Verification/Validation, Real-time Console Streaming.

## 🚀 Key Features

### 1. Seamless SteamCMD Integration (🚂)
- **Autonomous Execution**: Manages the full SteamCMD lifecycle, including login (anonymous), path forcing, and app updating for ASA (`AppID: 2430930`).
- **Hidden Operations**: Runs SteamCMD with the `CREATE_NO_WINDOW` flag on Windows, ensuring that technical console windows are suppressed and all output is neatly captured by the manager's UI.
- **Validation-First**: Every installation or update task includes a mandatory `validate` pass to ensure binary integrity and prevent game crashes caused by corrupted assets.

### 2. Real-time Progress Streaming (⚡)
The service provides unparalleled visibility into the 60GB+ download process:
- **Granular Progress**: Parses SteamCMD's stdout in real-time to extract exact decimal-point percentages (e.g., `Downloading... 45.2%`).
- **Live Terminal Feed**: Broadcasts every line of technical output to a `install-console` event bus, allowing administrators to see exactly what SteamCMD is doing.
- **Stage Tracking**: Categorizes the process into distinct phases: `Preparing`, `Connecting`, `Downloading`, `Verifying`, and `Complete`.

### 3. Smart Provisioning Heuristics
- **Delta Installation**: Before starting a download, the service checks for existing `.exe` and `.acf` (App Manifest) files. If found, it intelligently switches to "Validation" mode instead of re-downloading the entire game, saving significant time and bandwidth.
- **Automatic Directory Management**: Gracefully handles the creation of complex folder hierarchies required by the ARK engine.

### 4. Error Resilience & Recovery
- **Intelligent Exit Mapping**: Converts obscure SteamCMD exit codes into actionable human-readable advice. For example, it identifies "Error Code 8" as a Disk Space/Permission issue and provides a step-by-step fix.
- **Watchdog Timeouts**: Implements a 30-minute hard timeout for all installation tasks to prevent hanging the manager during severe Steam outages.

## 🛠️ Technical Details

### Console Output Model
```rust
pub struct ConsoleOutput {
    pub line: String,
    pub line_type: String, // "info", "progress", "warning", "error", "success"
    pub timestamp: String,
}
```

### Stream Parsing Logic
The service uses an asynchronous buffer reader to process the SteamCMD stdout stream line-by-line:
```rust
if line.contains("Update state") {
    if let Some(progress_str) = line.split("progress:").nth(1) {
        if let Some(pct) = progress_str.split_whitespace().next() {
            // ... Emit progress to UI
        }
    }
}
```

## 🎨 Developer Notes
- **Disk I/O**: Installation is a heavy operation. The service is fully asynchronous and runs in the background to ensure the manager's UI remains buttery smooth.
- **App Context**: Relies on the `SteamCmdService` to provide the location of the core SteamCMD executable.
