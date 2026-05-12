# 🦖 ASA Server Manager 2.0

<div align="center">

![ASA Server Manager](https://img.shields.io/badge/ASA-Server%20Manager-blue?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMiI+PHBhdGggZD0iTTEyIDJ2MjAiLz48cGF0aCBkPSJNMiAxMmgyMCIvPjwvc3ZnPg==)
![Version](https://img.shields.io/badge/version-2.3.6-green?style=for-the-badge)
![Platform](https://img.shields.io/badge/platform-Windows-0078D6?style=for-the-badge&logo=windows)
![License](https://img.shields.io/badge/license-MIT-orange?style=for-the-badge)
[![Discord](https://img.shields.io/badge/Discord-Join%20Us-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/Pr69DHEnXJ)

**A professional-grade ARK: Survival Ascended dedicated server management application built with Tauri, React, and Rust.**

[Features](#-features) • [Installation](#-installation) • [Discord](https://discord.gg/Pr69DHEnXJ) • [Development](#-development) • [Contributing](#-contributing)

</div>

---

## ✨ Features

### 🤖 Infinity AI Assistant
- **AI-Powered Management** - Autonomous assistant capable of safely managing server actions via natural language
- **Smart Troubleshooting** - Real-time log parsing and fix recommendations using NVIDIA's Llama models

### 🖥️ Server Management
- **Visual Cluster Builder** - Drag-and-drop UI to link and manage cross-ARK clusters easily
- **One-Click Server Deployment** - Install and configure ASA dedicated servers effortlessly
- **Real-time Server Control** - Start, stop, and restart servers with instant feedback
- **Embedded Console** - View live server logs directly in the app with color-coded output
- **Auto-hiding Console Window** - Server console runs in background, no popup windows
- **Intelligent Server Automation** - Automatic data protection during updates and save imports (Graceful RCON Shutdown)

### 🌐 Network & Connectivity
- **Public/LAN Detection** - Automatically detects if your server is publicly accessible
- **Port Management** - Configure game, query, and RCON ports
- **Connection Info** - Quick copy IP and port for sharing with players

### 🎮 Advanced Configuration
- **Map Selection** - Support for all official ASA maps
- **Mod Integration** - CurseForge mod browser and installer
- **RCON Console** - Send commands directly to your server
- **Config Editor** - Edit GameUserSettings.ini and Game.ini

### 📊 Monitoring
- **System Dashboard** - CPU, RAM, and disk usage monitoring
- **Server Status** - Real-time uptime and player count
- **Log Viewer** - Color-coded logs with filtering

---

## 🚀 Installation

### Prerequisites
- **Windows 10/11** (64-bit)
- **SteamCMD** (auto-installed if missing)
- **~50GB disk space** per server

### Quick Install
1. Download the latest release from [Releases](https://github.com/sanjay-m6/ASA-SERVER-MANAGER-2.0/releases)
2. Run the installer
3. Launch ASA Server Manager
4. Click "Deploy Server" to install your first server

---

## 💻 Development

### Tech Stack
| Component | Technology |
|-----------|------------|
| Frontend | React 18 + TypeScript + Vite |
| Styling | TailwindCSS |
| Backend | Rust + Tauri 2.0 |
| Database | SQLite (rusqlite) |
| State | Zustand |

### Prerequisites
```bash
# Node.js 18+
node --version

# Rust 1.70+
rustc --version

# Tauri CLI
cargo install tauri-cli
```

### Setup
```bash
# Clone the repository
git clone https://github.com/sanjay-m6/ASA-SERVER-MANAGER-2.0.git
cd ASA-SERVER-MANAGER-2.0

# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

### Project Structure
```
├── src/                    # React frontend
│   ├── components/         # Reusable UI components
│   ├── pages/              # Page components
│   ├── stores/             # Zustand state stores
│   ├── utils/              # Helper functions & Tauri bindings
│   └── types/              # TypeScript definitions
│
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── commands/       # Tauri IPC commands
│   │   ├── services/       # Business logic
│   │   ├── db/             # Database operations
│   │   └── models.rs       # Data structures
│   └── Cargo.toml          # Rust dependencies
│
└── asa-cli/                # CLI utility (optional)
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  Dashboard  │  │   Server    │  │    Mods     │     │
│  │             │  │   Manager   │  │   Browser   │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
└────────────────────────┬────────────────────────────────┘
                         │ Tauri IPC
┌────────────────────────▼────────────────────────────────┐
│                    Rust Backend                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   Process   │  │   Network   │  │   Config    │     │
│  │   Manager   │  │   Service   │  │   Editor    │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│                         │                                │
│  ┌──────────────────────▼───────────────────────────┐  │
│  │               SQLite Database                     │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 🔧 Configuration

### Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `ASM_DEBUG` | Enable debug logging | `false` |
| `ASM_DB_PATH` | Custom database path | AppData |

### Server Defaults
```json
{
  "gamePort": 7777,
  "queryPort": 27015,
  "rconPort": 27020,
  "maxPlayers": 70
}
```

---

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) first.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Tauri](https://tauri.app/) - Desktop app framework
- [ARK: Survival Ascended](https://survivetheark.com/) - Game
- [CurseForge](https://www.curseforge.com/) - Mod hosting

---

<div align="center">

**Made with ❤️ for the ARK Community**

[Discord](https://discord.gg/Pr69DHEnXJ) • [Report Bug](https://github.com/sanjay-m6/ASA-SERVER-MANAGER-2.0/issues) • [Request Feature](https://github.com/sanjay-m6/ASA-SERVER-MANAGER-2.0/issues)

</div>
