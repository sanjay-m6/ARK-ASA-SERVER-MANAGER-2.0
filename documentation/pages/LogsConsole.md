# 📟 Logs & Console Page

The Logs & Console page provides a real-time, filtered view of server output and a direct interface for executing RCON commands.

## 📝 Component Overview
- **File Path**: `src/pages/LogsConsole.tsx`
- **Backend Event**: `server_log` (emitted by `ProcessManager`).
- **Features**: Log Level Parsing, Real-time Streaming, Command History, Export functionality.

## 🚀 Key Features

### 1. Real-time Log Streaming
- **Live Feed**: Displays stdout and stderr from the server process as it happens.
- **Auto-Scroll**: Automatically scrolls to the newest entry unless manually paused by the user.
- **Smart Parsing**: Automatically identifies and color-codes log levels:
    - 🔵 **Info**: General server activity.
    - 🟡 **Warning**: Non-critical issues or configuration notices.
    - 🔴 **Error**: Server crashes, mod load failures, or database errors.
    - 🟣 **CFCore**: Specific logs related to CurseForge mod downloading.

### 2. Log Analysis Tools
- **Search**: Instant local search through the current log buffer (up to 1,000 lines).
- **Level Filtering**: Toggle specific log levels to isolate errors or focus on mod loading.
- **Export**: Download the currently loaded log buffer as a `.txt` file for external review or sharing with support.

### 3. Integrated RCON Console
- **Quick Commands**: One-click buttons for common tasks like `SaveWorld`, `ListPlayers`, and `DestroyWildDinos`.
- **Command History**: Use the Up/Down arrow keys to cycle through previously executed commands.
- **Direct Feedback**: Command responses are injected directly into the log stream for easy context viewing.

## 🛠️ Technical Details

### Log Event Structure
The frontend listens for the following data structure from Rust:
```typescript
interface ServerLogEvent {
    server_id: number;
    line: string;
    is_stderr: boolean;
}
```

### Parsing Logic
Log levels are determined by scanning the string content for keywords:
- `error` / `failed` -> Error
- `warning` / `warn` -> Warning
- `cfcore` -> CurseForge Core
- `debug` -> Debug

## 🎨 UI/UX Patterns
- **Monospaced Typography**: Uses system monospace fonts for high readability of technical data.
- **Terminal Aesthetic**: Deep dark background (`slate-950`) with vibrant syntax highlighting.
- **Status Indicators**: Pulse animations show when the RCON connection is active for the selected server.
