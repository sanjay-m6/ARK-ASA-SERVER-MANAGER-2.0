# 🖥️ Server Manager

The Server Manager is the core operational engine of the application, providing a high-fidelity interface for the deployment, lifecycle orchestration, and deep maintenance of your ARK: Survival Ascended server network.

## 📝 Page Overview
- **Route**: `/servers`
- **Purpose**: Full lifecycle management (Start/Stop/Update), real-time log monitoring, bulk orchestration, and instance maintenance.
- **Aesthetic**: Technical "Sky & Violet" interface featuring expandable live consoles, status-aware action grids, and staggered deployment workflows.

## 🚀 Key Modules

### 1. Intelligent Lifecycle Orchestration (⚙️)
Beyond simple execution, the manager handles complex startup logic:
- **Multi-Stage Startup**: Servers transition through `Starting` (Process Initialized), `Running` (Loading Mods), and `Online` (Advertising for Join) states.
- **Log-Aware Readiness**: The manager parses live server output in real-time, only marking a server as "Online" when it detects the game is actually ready for players.
- **Staggered Bulk Actions**: Launch or stop your entire cluster with one click; the manager automatically staggers the commands to prevent CPU/Disk saturation.

### 2. Live Diagnostic Consoles (📜)
Every server features an integrated, high-performance terminal:
- **Real-Time Stream**: View live STDOUT and STDERR output directly within the manager interface.
- **Historical Buffering**: Maintains the last 500 lines of activity, allowing you to troubleshoot crashes even if the process has stopped.
- **Auto-Scroll & Tracking**: The console automatically follows the latest logs, ensuring you see startup progress as it happens.

### 3. Deployment & Migration Engine (🏗️)
Flexible tools for expanding your server network:
- **Fresh Deployment**: Integrated SteamCMD wizard for installing new instances.
- **Universal Import**: Bring in existing local servers or migrate "Non-Dedicated" session saves into a professional dedicated environment.
- **Cloning Modal**: Instantly duplicate a server's entire configuration, mods, and world data to create a mirror or cluster member.

### 4. Maintenance & Repair Suite (🛠️)
Advanced recovery tools for when things go wrong:
- **Deep Repair (Hardcore Retry)**: A specialized routine that stops the server, purges corrupted mod caches, and forces a fresh synchronization from CurseForge.
- **Port Conflict Scanner**: Proactively identifies if another application is using your server's ports before you attempt to launch.
- **Force Termination**: A "nuclear option" to kill unresponsive server processes that refuse to close through normal commands.

### 5. Automation & AI Toggles (🤖)
Control how the manager handles your servers in the background:
- **Auto-Start/Stop**: Configure servers to manage their own uptime based on system reboots or schedules.
- **Intelligent Mode**: Enable the AI engine to manage scaling and maintenance cycles autonomously.
- **Update-on-Launch**: Ensure your server always runs the latest version by checking for Steam updates every time you click "Start."

## 🛠️ Interface Controls
- **Deploy Server [Plus]**: Open the installation wizard for a new ARK instance.
- **Bulk Selection [Checkbox]**: Select multiple servers for batch operations.
- **Start/Stop/Restart**: Primary lifecycle controls that adapt based on current server state.
- **Console Toggle [Terminal]**: Expand or collapse the live log terminal for a specific server.
- **Delete [Trash]**: Safely remove a server instance and its associated data (with confirmation).

## 🎨 Design Notes
- **High-Contrast Semantics**: Uses a strict color palette (Green = Online, Yellow = Starting, Blue = Updating, Red = Crashed) for instant status recognition.
- **Glassmorphism Layout**: Each server sits in a premium glass panel with subtle hover-aware glow effects and depth.
- **Micro-Animations**: Features pulsing status dots, spinning refresh icons, and smooth staggered entry animations for the server roster.
