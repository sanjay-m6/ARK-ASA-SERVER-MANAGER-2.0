# ASA Server Manager 2.0 - Documentation Index

Welcome to the technical documentation for the ARK: Survival Ascended Server Manager 2.0. This documentation provides an in-depth look at the application's architecture, page-by-page functionality, and backend service logic.

## 🏗️ Architecture Overview

The application is built using a modern desktop stack:
- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, Zustand (State Management).
- **Backend**: Rust, Tauri 2.0 (Framework), SQLite (Database), RCON (Protocol).
- **Communication**: Tauri IPC (Inter-Process Communication) for seamless interaction between the UI and Rust backend.

## 📂 Documentation Sections

### 1. [System Architecture](./architecture/SYSTEM.md)
Detailed breakdown of the core systems, data flow, and state management patterns.

### 2. Frontend Pages (`/src/pages`)
Documentation for each user interface module:
- [📊 Dashboard](./pages/Dashboard.md) - Real-time monitoring and server status.
- [🖥️ Server Manager](./pages/ServerManager.md) - Server installation and lifecycle management.
- [🧩 Mod Manager](./pages/ModManager.md) - CurseForge integration and modpack handling.
- [⚙️ Config Editor](./pages/ConfigEditor.md) - Visual and raw INI editing.
- [🔄 Backups](./pages/Backups.md) - Local and cloud backup management.
- [🔗 Cluster Manager](./pages/ClusterManager.md) - Multi-server cluster configurations.
- [📟 RCON & Logs](./pages/RconLogs.md) - Command execution and log monitoring.
- [🤖 AI Assistant](./pages/AIAssistant.md) - Intelligent log analysis and troubleshooting.
- [🔌 Tools & Plugins](./pages/Tools.md) - Discord bot, Plugin manager, and UPnP.

### 3. Backend Services (`/src-tauri/src/services`)
Technical deep-dives into the Rust logic:
- [🚀 Process Manager](./backend/ProcessManager.md) - Handles server startup/shutdown.
- [📡 ArkRcon](./backend/ArkRcon.md) - Custom ASA-specific RCON implementation.
- [🛡️ Security & Steam](./backend/SecuritySteam.md) - Admin privileges and SteamCMD integration.
- [☁️ Cloud & Discord](./backend/CloudDiscord.md) - Backup sync and Discord bridge.

### 4. [Developer Guides](./guides/CONTRIBUTING.md)
- [🛠️ Setup Guide](./guides/SETUP.md)
- [🐛 Troubleshooting](./guides/TROUBLESHOOTING.md)
- [🧪 Testing Patterns](./guides/TESTING.md)

---
*Maintained by Antigravity AI Assistant*
