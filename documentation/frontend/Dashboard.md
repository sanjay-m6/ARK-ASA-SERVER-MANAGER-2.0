# Dashboard Overview

The Dashboard is the central nervous system of the ARK: Survival Ascended Server Manager. It provides a real-time, bird's-eye view of your entire server infrastructure, system health, and active player base.

## Key Performance Indicators (KPIs)

At the top of the dashboard, you will find high-level metrics that help you monitor the overall health of your host machine:

- **CPU Usage**: Real-time percentage of processor load. High sustained usage may indicate the need for process priority optimization or hardware upgrades.
- **RAM Usage**: Memory consumption across all active server instances. ARK: SA is memory-intensive; monitor this closely to prevent system instability.
- **Disk Space**: Available storage on the drive where your servers and backups are located.
- **Active Players**: Total number of unique players currently connected across all managed servers.

## Server Status Grid

The main section of the Dashboard features a responsive grid of "Live Cards" for each of your servers.

### Status Indicators
- **Online (Green)**: The server is running and reachable via RCON/Game Query.
- **Starting (Cyan)**: The server process has been initiated and is currently loading assets.
- **Stopped (Gray)**: The server is offline.
- **Updating (Orange)**: SteamCMD is currently patching or verifying server files.
* **Crashed (Red)**: The process has exited unexpectedly. The manager will attempt auto-restart if configured.

### Quick Actions
Each card provides immediate access to essential controls:
- **Start/Stop/Restart**: Primary process lifecycle management.
- **RCON Console Link**: Jump directly to the command interface for that specific server.
- **Resource Monitor**: View per-server CPU and RAM metrics.

## Automation & Intelligence

The Dashboard highlights the status of the "Guardian" system and "Intelligent Mode":
- **Guardian**: When active, it monitors server health 24/7 and performs auto-restarts upon detection of hangs or crashes.
- **Intelligent Mode**: Optimizes resource allocation dynamically based on player count and system load.

## Recent Activity Log

The bottom panel displays a unified stream of events, including:
- Server lifecycle events (Start/Stop).
- Backup completion status.
- Critical system warnings or errors.
- Mod update notifications.

---
*Tip: Hover over the resource graphs to see detailed historical data for the last 60 minutes.*
