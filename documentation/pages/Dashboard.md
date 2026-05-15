# 📊 Dashboard Page

The Dashboard serves as the central mission control for the ARK: Survival Ascended Server Manager. it provides a real-time overview of all servers, hardware utilization, and critical system alerts.

## 📝 Component Overview
- **File Path**: `src/pages/Dashboard.tsx`
- **State Management**: Uses `useServerStore` (Zustand) for global server states and local React state for UI transitions.
- **Interactions**: Relies heavily on Tauri IPC events (`tauri-apps/api/event`) to receive live updates from the backend.

## 🚀 Key Features

### 1. Server Status Grid
Displays a dynamic list of all managed servers with:
- **Real-time Status**: Online, Offline, Starting, Updating, or Error states.
- **Player Count**: Current/Max players parsed via RCON.
- **Quick Controls**: Start, Stop, and Update buttons integrated into each card.
- **Visual Feedback**: Progress bars for server startup and update tasks.

### 2. Live Log Monitoring
A centralized log view that listens to the `log-event` from the Tauri backend.
- **Log Parsing**: Automatically categorizes logs into Info, Warning, and Error.
- **Real-time Streaming**: Logs are appended to the view as they occur in the server process.
- **Scroll Management**: Smart auto-scroll that pauses when the user scrolls up to inspect previous lines.

### 3. AI Anomaly Detection
The Dashboard includes an intelligent listener that monitors server logs for specific failure patterns (e.g., "Address already in use", "Out of memory", "Invalid mod ID").
- **Auto-Analysis**: When a critical error is detected, a notification is triggered.
- **AI Consultation**: The user can click "Analyze with AI" to open the AI Assistant with the relevant log context pre-loaded.

### 4. Hardware Telemetry
A compact view of the host system's performance:
- **CPU Usage**: Real-time percentage across all cores.
- **RAM Allocation**: Used vs. Total memory, highlighting server-specific consumption.
- **Storage**: Available space on the drive where servers are installed.

## 🛠️ Technical Details

### IPC Listeners
```typescript
// Example of the status listener in Dashboard.tsx
useEffect(() => {
    const unlisten = listen('server-status-change', (event: any) => {
        const { serverId, status } = event.payload;
        // Updates local server state
    });
    return () => { unlisten.then(f => f()); };
}, []);
```

### State Integration
The dashboard stays in sync with the `serverStore` to ensure that any change made in the `ServerManager` page is immediately reflected here without a page refresh.

## 🎨 UI/UX Patterns
- **Glassmorphism**: Uses semi-transparent backgrounds with backdrop filters for a premium dark-mode feel.
- **Micro-Animations**: Subtle transitions on server cards when status changes.
- **Empty States**: Encourages users to "Add First Server" when no data is present.
