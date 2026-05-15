# 🖥️ Server Manager Page

The Server Manager is the core management interface where users install, configure, and control individual ARK: Survival Ascended servers.

## 📝 Component Overview
- **File Path**: `src/pages/ServerManager.tsx`
- **Sub-components**: `ServerCard`, `InstallWizard`, `AdvancedSettings`.
- **Primary Hook**: `useServerStore` for persistence and `useTerminal` for the integrated console view.

## 🚀 Key Features

### 1. Server Installation Wizard
A step-by-step process for deploying a new server:
- **Validation**: Checks for valid directory paths and sufficient disk space.
- **SteamCMD Integration**: Triggers the backend `install_server` command which invokes SteamCMD via the `ProcessManager`.
- **Automatic Setup**: Initializes default INI files and directory structures.

### 2. Lifecycle Controls
Full control over the server process:
- **Start/Stop/Kill**: Safe shutdown vs. immediate process termination.
- **Update**: Checks for Steam updates and applies them using SteamCMD.
- **Validation**: "Validate Files" functionality to repair corrupted installations.

### 3. Port Management
A critical system that ensures server reachability:
- **Conflict Detection**: Automatically scans for open ports (Game, Query, RCON) and warns if another process is using them.
- **UPnP Integration**: Option to automatically map ports on compatible routers via the backend UPnP service.

### 4. Bulk Operations
For users running multiple servers (clusters):
- **Mass Actions**: Start/Stop all servers at once.
- **Sync Settings**: Apply common configurations across multiple server instances.

## 🛠️ Technical Details

### Server Instance Object
```typescript
interface Server {
    id: number;
    name: string;
    path: string;
    status: ServerStatus;
    gamePort: number;
    queryPort: number;
    rconPort: number;
    lastStarted?: string;
    // ...
}
```

### IPC Commands
- `install_server(path, name)`: Backend server creation.
- `start_server(serverId)`: Process spawning.
- `stop_server(serverId)`: Graceful RCON shutdown or SIGTERM.
- `update_server(serverId)`: SteamCMD update loop.

## 🎨 UI/UX Patterns
- **Context Menus**: Right-click on server rows for quick access to logs or config files.
- **Progress Overlays**: Non-blocking UI while long-running tasks like installation are in progress.
- **Status Indicators**: Pulsing badges for "Starting" and "Updating" states.
