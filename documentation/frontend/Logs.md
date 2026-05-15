# 📟 Logs & Console

The Logs & Console module provides a high-fidelity, real-time window into your server's operation. It combines advanced log streaming with an integrated RCON (Remote Control) console, allowing you to monitor and manage your ARK: Survival Ascended server from a single unified interface.

## 📝 Page Overview
- **Route**: `/logs`
- **Purpose**: Real-time server output monitoring, historical log auditing, and direct RCON command execution.
- **Aesthetic**: Technical "Terminal Dark" interface featuring syntax-highlighted log levels, pulsing connection heartbeats, and a rapid-action command palette.

## 🚀 Key Modules

### 1. Real-Time Log Streamer (📡)
Monitor your server's heartbeat as it happens:
- **Intelligent Level Parsing**: Automatically categorizes every log line into **Info**, **Warning**, **Error**, **Debug**, or **CFCore** levels with color-coded indicators.
- **Tauri-Powered Events**: Uses a high-performance event bridge to stream logs directly from the server process with minimal overhead and zero lag.
- **Auto-Scroll Orchestration**: A smart auto-scroll system that keeps you locked to the newest events, with the ability to pause and inspect specific historical entries at any time.

### 2. Intelligent Log Filtering (🔍)
Find exactly what you need in the noise:
- **Multi-Level Toggle Chips**: Granular control over which log levels are visible. Isolate errors instantly or audit specific CurseForge plugin loading sequences.
- **Full-Text Search**: Instant search across the current log buffer, highlighting matches and filtering out irrelevant data as you type.
- **Deduplication Engine**: Automatically reconciles historical file logs with live incoming events to ensure a seamless and non-redundant timeline.

### 3. RCON Command Console (⌨️)
Direct control over your game world:
- **Integrated Command Input**: A dedicated, monospace input field with command history (Up/Down arrows) for rapid administrative control.
- **Quick-Action Palette**: One-click access to the most common administrative tasks:
    - **Save World**: Force an immediate world save.
    - **List Players**: See exactly who is currently connected via RCON.
    - **Broadcast**: Send a high-impact global message to all players.
    - **Destroy Dinos**: Clear wild creatures to refresh spawns and improve performance.
- **Response Auditing**: RCON command responses are injected directly into the log stream, providing a clear audit trail of actions and their results.

### 4. Data Export & Management (💾)
Preserve your server's history:
- **High-Fidelity Export**: Download the current log buffer as a clean, timestamped text file for external analysis or community reporting.
- **One-Click Clear**: Instantly flush the UI buffer to start a clean auditing session without affecting the physical log files on disk.

## 🛠️ Interface Controls
- **Server Selector [Select]**: Switch between multiple servers to monitor their independent log streams.
- **Search Bar [Input]**: Filter the log view by specific keywords or player names.
- **Level Toggles [Chips]**: Filter the console by Info, Warning, Error, or CFCore levels.
- **Pause/Play [Button]**: Lock the scroll position to inspect a specific incident.
- **Command Input [Monospace]**: Enter raw RCON commands directly.

## 🎨 Design Notes
- **Monospace Aesthetic**: Uses high-legibility monospace fonts to maintain the "Developer Console" feel while providing modern UI enhancements.
- **Neon Accents**: Employs emerald and cyan gradients for headers to maintain the premium "Liquid Glass" identity.
- **Status Indicators**: Pulsing connection dots in the RCON panel provide instant visual confirmation that the server is reachable and responsive.
