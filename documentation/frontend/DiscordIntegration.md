# 🤖 Discord Integration

The Discord Integration page is a comprehensive communication and alert management hub that bridges the gap between your ARK server and your community's Discord ecosystem.

## 📝 Page Overview
- **Route**: `/discord`
- **Purpose**: Community engagement, automated notifications, and remote administrative control.
- **Aesthetic**: Modern "Indigo & Violet" themed dashboard with live connection indicators and grouped alert toggles.

## 🚀 Key Modules

### 1. Multi-Mode Connection Guard (🔗)
Flexible integration options to suit different community needs:
- **Webhook Integration**: A high-speed, lightweight link for one-way notifications (Server Status, Crashes, Updates) and quick administrative broadcasts.
- **Bot Bridge Mode**: A bidirectional communication suite that relays in-game chat to Discord and vice-versa, fostering a unified community.
- **Live Heartbeat Monitor**: Real-time visual tracking of the webhook status (`Connected`, `Checking`, or `Disconnected`) with 30-second automated health checks.

### 2. Intelligent Alert Engine (🔔)
Granular control over exactly what information is relayed to your community:
- **Server Lifecycle**: Automated pings for server `Start`, `Stop`, `Crash`, and `SteamCMD Updates`.
- **Player Activity**: Optional join/leave notifications for real-time population tracking.
- **System Reports**: Automated confirmation of backup completions and scheduled task executions.
- **Auto-Save Resilience**: Alert configurations are persisted automatically in the background to prevent accidental data loss.

### 3. Remote Command Console (🛡️)
Powerful administrative tools that allow you to manage your cluster directly from Discord:
- **Admin Channel Gating**: Restrict sensitive commands to a private Discord channel for maximum security.
- **Discord Command Suite**: Remote execution of:
    - `!list`: View all servers in the cluster.
    - `!start / !stop / !restart`: Lifecycle management of specific nodes.
    - `!kick / !ban`: Instant player discipline from your mobile device.
    - `!broadcast`: Send emergency alerts to the entire server cluster.

### 4. Dynamic Live Lists
Maintains persistent, real-time status messages in designated Discord channels:
- **Server Status List**: A single, automatically updated Discord message showing the live status, player count, and IP of every server in your fleet.
- **Active Player List**: A dedicated message tracking current online players, including tribe names and playtime metadata.

### 5. Activity & Metrics
Visibility into the health and volume of your integration:
- **Notification Stream**: A chronological log of the last 10 notifications sent, allowing for transparency in system communication.
- **Engagement Stats**: High-level counters for active alerts, online servers, and recent sends.

## 🛠️ Interface Controls
- **Test Connection [Send]**: Instantly trigger a rich embed test message to verify your webhook or bot token configuration.
- **Quick Actions [Zap]**: Rapid-fire buttons for manual broadcasts like "Maintenance Starting" or "Server Restarting".
- **Live Mode Toggle**: Real-time monitoring of connection health and event streams.

## 🎨 Design Notes
- **Indigo Aesthetic**: Uses a signature indigo-to-violet gradient set to represent the "Bridge" between platforms.
- **Visual Feedback**: Employs animated `Pulse` effects for active live modes and high-contrast badges for connection health.
- **Segmented Layout**: Uses distinct tabs for `Webhook`, `Bot`, `Admin`, and `Alerts` to manage the high volume of configuration options without clutter.
