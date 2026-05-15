# 📜 Logs & Diagnostics

The Logs & Diagnostics hub is the primary forensic center for your server. it provides a high-fidelity, real-time stream of every action, error, and event occurring within the server engine and the manager's background processes.

## 📝 Page Overview
- **Route**: `/logs`
- **Purpose**: Real-time server auditing, error troubleshooting, forensic log analysis, and integrated RCON response monitoring.
- **Aesthetic**: Technical "Emerald & Cyan" interface featuring monospaced log grids, live severity filters, and integrated command bridges.

## 🚀 Key Modules

### 1. Real-Time Log Stream (📡)
Monitor your server's pulse with sub-second accuracy:
- **Live Event Engine**: Listens directly to the server's output stream, displaying game events, player connections, and mod loading sequences as they happen.
- **Intelligent Severity Parsing**: The manager automatically categorizes log lines into specific levels (Info, Warning, Error, Debug) and applies distinct visual styling to help you spot issues instantly.
- **Historical Context Ingestion**: Upon selecting a server, the manager automatically retrieves recent log history from the filesystem, ensuring you have the necessary context before the live stream begins.

### 2. Forensic Search & Filtering (🔍)
Isolate critical information in seconds:
- **Multi-Level Filter Chips**: Quickly toggle the visibility of specific log levels. For example, hide "Info" messages to focus exclusively on "Errors" and "Warnings" during a crash investigation.
- **Keyword Search Engine**: Filter thousands of log lines in real-time to find specific Player IDs, Mod names, or technical exceptions.
- **Live Diagnostics Stats**: View a real-time count of every log category, providing an instant "Health Audit" of your server's current operational state.

### 3. Integrated RCON Bridge (⌨️)
Take immediate action based on log observations:
- **Contextual Command Input**: A dedicated terminal at the base of the log viewer allows you to send RCON commands instantly without switching pages.
- **Log-Integrated Responses**: Responses from your RCON commands are injected directly into the log stream, allowing you to see the immediate result of your administrative actions in context.
- **Rapid-Action Palette**: Includes a selection of "Quick Commands" for common forensic tasks like listing players or saving the world state.

### 4. Technical Workflow Tools (🛠️)
Professional auditing capabilities for power users:
- **Intelligent Auto-Scroll**: The log viewer automatically follows new data but intelligently pauses if you scroll up to inspect a specific event, preventing you from losing your place.
- **Export for Audit**: One-click functionality to export your current log buffer to a text file, perfect for sharing with mod developers or technical support teams.
- **CurseForge Integration Logs**: Specialized "CFCore" filters that isolate log messages related to mod downloads and dependency resolution.

## 🛠️ Interface Controls
- **Auto-Scroll [Pause/Play]**: Toggle whether the log viewer follows the latest incoming data.
- **Clear Logs [Trash]**: Wipe the current session's log buffer to start fresh.
- **Export Logs [Download]**: Save the current log stream to your local machine as a .txt file.
- **Level Toggles [Info/Warn/Error]**: Filter the log stream by severity.
- **Search [Magnifying Glass]**: Perform a live keyword search across the log history.

## 🎨 Design Notes
- **Diagnostic Palette**: Uses vibrant emerald and cyan gradients to distinguish the "Diagnostic/System" layer of the application.
- **High-Contrast Grid**: Features a monospaced font with subtle line-by-line hover effects to make reading dense technical data easier on the eyes.
- **Responsive Status Badges**: Displays a live status indicator (Running/Stopped) for the selected server directly within the selector.
