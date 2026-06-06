# 🦖 ARK Server Manager 2.0 (Ascended & Evolved)

<div align="center">

![ARK Server Manager](https://img.shields.io/badge/ARK-Server%20Manager-blue?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMiI+PHBhdGggZD0iTTEyIDJ2MjAiLz48cGF0aCBkPSJNMiAxMmgyMCIvPjwvc3ZnPg==)
![Version](https://img.shields.io/badge/version-4.4.6-green?style=for-the-badge)
![Platform](https://img.shields.io/badge/platform-Windows-0078D6?style=for-the-badge&logo=windows)
![License](https://img.shields.io/badge/license-MIT-orange?style=for-the-badge)
[![Discord](https://img.shields.io/badge/Discord-Join%20Us-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/Pr69DHEnXJ)
[![Donate](https://img.shields.io/badge/Donate-PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://paypal.me/infinity86s)

**A professional-grade dedicated server management suite for both ARK: Survival Ascended (ASA) and ARK: Survival Evolved (ASE), built with Tauri, React, and Rust.**

[Features](#-features) • [Architecture](#%EF%B8%8F-architecture) • [Installation](#-installation) • [Development](#-development) • [Discord](https://discord.gg/Pr69DHEnXJ) • [Contributing](#-contributing)

</div>

---

## ✨ Features

### 🎮 Dual-Game Support (ASA & ASE)
- **Unified Interface** - Easily switch between dedicated management dashboards for **ARK: Survival Ascended** and **ARK: Survival Evolved**.
- **Individually Optimized Configurations** - Handles differences in modding frameworks, network requirements, and settings between the two game architectures.

### 🤖 Infinity AI Assistant
- **AI-Powered Management** - Autonomous assistant capable of safely managing server actions (starts, backups, restarts) via natural language commands.
- **Smart Troubleshooting** - Real-time server log parsing, crash analysis, and configuration fix recommendations using NVIDIA's Llama models.

### 🖥️ Server Management & Automation
- **Visual Cluster Builder** - Drag-and-drop node graph interface to easily link and manage cross-server clusters (shared inventory/tamed dinos).
- **One-Click Server Deployment** - Effortless automatic downloading, installation, validation, and updating of servers via SteamCMD.
- **Graceful Automations** - Auto-notifies active players via RCON in-game warnings and performs a secure world save (`cheat saveworld`) before executing updates or restarts.
- **Mod Manager & Watchdog** - Integrated CurseForge mod browser and automatic installer for ASA, and Steam Workshop downloader for ASE. Auto-reinstalls/updates mods upon release.

### 🌐 Network & Connectivity
- **UPnP Port Forwarding** - Automatically forwards game, query, and RCON ports directly from the application for routers that support UPnP.
- **Connection Health Checks** - Automatically detects if your server is publicly accessible or limited to LAN.
- **Tribe Log Viewer** - Live viewer that reads and displays in-game tribe activity logs without requiring in-game connections.

### 📊 Monitoring & Scheduling
- **System Telemetry** - Dynamic charts showing host system metrics including CPU, RAM, and disk utilization.
- **Embedded Console** - Live-tailed server consoles running headlessly in the background with color-coded syntax output.
- **Advanced Scheduler** - Complete cron-like custom task scheduler for automatic database backups, routine server restarts, and in-game announcement broadcasts.
- **Backup & Cloud Restore** - Flexible local backups and automated cloud upload profiles (S3, Google Drive, Dropbox, Backblaze B2, and FTP) powered by Rust's high-performance OpenDAL engine.

---

## 🏗️ Architecture

ARK Server Manager 2.0 is designed as a secure, high-performance hybrid desktop application:

*   **Frontend (React + TypeScript + TailwindCSS + Zustand):** A highly responsive visual interface presenting separate layout workspaces for ASA and ASE. Includes lazy-loaded panels, dark-mode dashboard graphs, and an interactive mod browser.
*   **Desktop Bridge (Tauri 2.0 + SQLite):** A lightweight IPC (Inter-Process Communication) gateway bridging UI events to native operating system functions. Leverages a local SQLite database (`rusqlite`) for secure, fast storage of server definitions and settings.
*   **Backend Services (Rust):** A modular, multithreaded backend running high-performance daemon loops:
    *   `process_manager.rs` - Gracefully handles background server processes and console output.
    *   `guardian.rs` / `mod_watchdog.rs` - Self-healing monitors that auto-restart servers on crash and coordinate updates.
    *   `discord_bridge.rs` - Full bidirectional bot gateway that bridges in-game chat to Discord channels (Cross-Chat).
    *   `cloud_backup_service.rs` - High-performance backups powered by OpenDAL.

```
┌────────────────────────────────────────────────────────────────────────┐
│                             React Frontend                             │
│ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────┐ │
│ │    ASA Workspace     │ │    ASE Workspace     │ │   AI Assistant   │ │
│ │ (Dashboard, Config)  │ │ (Dashboard, Config)  │ │   (Chat panel)   │ │
│ └──────────────────────┘ └──────────────────────┘ └──────────────────┘ │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Tauri IPC
┌───────────────────────────────────▼────────────────────────────────────┐
│                              Tauri Bridge                              │
│  ┌────────────────────────┐  ┌───────────────────────┐  ┌───────────┐  │
│  │   UPnP Port Mapper     │  │ SQLite Database (DB)  │  │ Sys Info  │  │
│  └────────────────────────┘  └───────────────────────┘  └───────────┘  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Rust Native
┌───────────────────────────────────▼────────────────────────────────────┐
│                              Rust Backend                              │
│ ┌──────────────────┐ ┌───────────────────┐ ┌─────────────────────────┐ │
│ │ Process Manager  │ │ Guardian Services │ │ Discord Bot / CrossChat │ │
│ │ (Console, RCON)  │ │ (Auto-heal, Cron) │ │ (serenity, webhooks)    │ │
│ └────────┬─────────┘ └─────────┬─────────┘ └────────────┬────────────┘ │
│          │                     │                        │              │
│ ┌────────▼─────────┐ ┌─────────▼─────────┐ ┌────────────▼────────────┐ │
│ │    SteamCMD      │ │      OpenDAL      │ │    CurseForge/Steam     │ │
│ │ (Deploy, Update) │ │  (Cloud Backups)  │ │     (Mod Scrapers)      │ │
│ └──────────────────┘ └───────────────────┘ └─────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Installation

### Prerequisites
- **Windows 10/11** (64-bit)
- **SteamCMD** (automatically downloaded and installed if missing)
- **~50GB+ SSD storage space** recommended per server instance

### Quick Install
1. Download the latest installer from the [Releases page](https://github.com/sanjay-m6/ARK-ASA-SERVER-MANAGER-2.0/releases).
2. Run the installer and launch the application.
3. Choose either **Ascended (ASA)** or **Evolved (ASE)** mode from the main dashboard.
4. Click **Deploy Server** to automatically download the server assets and set up your first instance.

---

## 💻 Development

### Tech Stack
| Component | Technology |
|---|---|
| **Frontend** | React 19 + TypeScript + Vite |
| **Styling** | TailwindCSS + Framer Motion |
| **State Management** | Zustand |
| **Desktop Framework** | Tauri 2.0 |
| **Backend Core** | Rust (Edition 2021) |
| **Database** | SQLite (`rusqlite`) |
| **Cloud Engine** | OpenDAL |

### Local Setup
To run the server manager locally for development:

1. **Prerequisites:**
   * Node.js (v18+)
   * Rust (v1.75+)
   * Tauri CLI (installed via `cargo install tauri-cli`)

2. **Clone the repository:**
   ```bash
   git clone https://github.com/sanjay-m6/ARK-ASA-SERVER-MANAGER-2.0.git
   cd ARK-ASA-SERVER-MANAGER-2.0
   ```

3. **Install node dependencies:**
   ```bash
   npm install
   ```

4. **Launch in development mode:**
   ```bash
   npm run tauri dev
   ```

5. **Build the production package:**
   ```bash
   npm run tauri build
   ```

---

## 🤝 Contributing
Contributions are welcome! If you'd like to help improve the project:
1. Fork the repository.
2. Create a clean feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes (`git commit -m 'Add amazing feature'`).
4. Push to the branch (`git push origin feature/amazing-feature`).
5. Open a Pull Request on the [Pull Requests page](https://github.com/sanjay-m6/ARK-ASA-SERVER-MANAGER-2.0/pulls).

For bug reports or feature suggestions, feel free to open a ticket on the [Issues page](https://github.com/sanjay-m6/ARK-ASA-SERVER-MANAGER-2.0/issues).

---

## 📝 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Made with ❤️ for the ARK Community**

[Discord](https://discord.gg/Pr69DHEnXJ) • [Report Bug](https://github.com/sanjay-m6/ARK-ASA-SERVER-MANAGER-2.0/issues) • [Request Feature](https://github.com/sanjay-m6/ARK-ASA-SERVER-MANAGER-2.0/issues) • [Donate via PayPal](https://paypal.me/infinity86s)

</div>
