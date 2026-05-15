# ⌨️ RCON Console Page

The RCON Console is a powerful administrative tool that provides a direct, low-latency command-line interface to the server's game engine. It allows for real-time player management, world saving, and game-state manipulation.

## 📝 Component Overview
- **File Path**: `src/pages/RconConsole.tsx`
- **Associated Store**: `useRconStore`
- **Features**: Interactive Terminal, Player List Management, Quick Action Buttons, Error Classification.

## 🚀 Key Features

### 1. Interactive Terminal (📟)
- **Command History**: Navigate through previously executed commands using the Up/Down arrow keys.
- **Real-time Output**: Displays formatted responses from the server engine, including timestamps for auditing.
- **Auto-scroll**: The terminal automatically sticks to the bottom as new output arrives.

### 2. Quick Commands Dashboard
One-click shortcuts for high-frequency administrative tasks:
- **Save World**: Force an immediate world save to disk.
- **Destroy Wild Dinos**: Wipe all wild creatures to refresh spawns.
- **Time Controls**: Instant buttons for Noon (12:00) and Midnight (00:00).
- **Broadcast**: Global server-wide message system for announcements.

### 3. Active Player Management (👥)
- **Live Roster**: A real-time list of all currently connected Steam players.
- **Moderation Tools**: Integrated "Kick" and "Ban" buttons for every player in the list.
- **Metadata**: Displays player names and unique SteamIDs for precise identification.

### 4. Connection Intelligence
- **Heartbeat Monitor**: Automatically verifies the RCON socket every 15 seconds to detect "silent" disconnects.
- **Error Classification**: Uses a specialized classifier to identify if a command failed due to:
    - **Authentication**: Incorrect admin password.
    - **Timeout**: Server is under heavy load and didn't respond in time.
    - **Network**: Physical socket closure or IP mismatch.

## 🛠️ Technical Details

### Command Execution logic
The console utilizes specialized Tauri commands to handle ASA's unique RCON protocol requirements:
```typescript
const response = await invoke<RconResponse>('rcon_send_command', {
    serverId: selectedServerId,
    command: cmdToSend,
});
```

### Persistence
The command history is managed in a global `Zustand` store, allowing administrators to switch between pages without losing their terminal session data.

## 🎨 UI/UX Patterns
- **Terminal Aesthetic**: Deep `slate-950` background with cyan prompt characters (❯) for a classic console feel.
- **Categorized Error Styling**:
    - **Red**: Authentication or Severe failures.
    - **Amber**: Timeouts and transient issues.
    - **Orange**: Connection drops.
- **Glow Indicators**: Active connections are marked with a pulsating emerald dot.
