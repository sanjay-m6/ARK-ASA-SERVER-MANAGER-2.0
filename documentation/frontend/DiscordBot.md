# 🤖 Discord Bot & Bridge

The Discord Bot & Bridge is your server's primary community engagement and remote auditing hub. It seamlessly connects your ARK: Survival Ascended servers with your Discord community, enabling two-way communication, real-time status tracking, and automated administrative alerts.

## 📝 Page Overview
- **Route**: `/tools/discord`
- **Purpose**: Two-way game-to-Discord chat, persistent server status messages, automated event notifications, and remote administrative monitoring.
- **Aesthetic**: Social "Indigo & Slate" interface featuring real-time connection heartbeats, interactive alert toggles, and high-impact metric cards.

## 🚀 Key Modules

### 1. Two-Way Discord Bridge (🌉)
Bridge the gap between your game world and your community:
- **Cross-Platform Communication**: Enables real-time chat synchronization. Players in-game can chat with members in Discord, and vice-versa, creating a unified community experience.
- **Cluster-Aware Networking**: Advanced support for server clusters. Sync chat across multiple maps simultaneously, allowing your entire player base to stay connected regardless of which server they are on.
- **Secure Bot Integration**: A dedicated bridge service that manages Discord Bot tokens and permissions, ensuring a stable and secure connection to your Guild.

### 2. Persistent Live Status (📊)
Keep your community informed with automated updates:
- **Dynamic Server Lists**: The bot maintains a single, pinned message in your Discord channel that updates in real-time with server names, IP addresses, player counts, and current status (Online/Updating/Offline).
- **Live Player Rosters**: Dedicated messages that display exactly who is currently online, including their tribe affiliations and current session playtime.
- **Hardware Health Reporting**: Optionally stream hardware metrics (CPU and RAM usage) to private administrative channels for remote performance auditing.

### 3. Intelligent Alert System (🔔)
Never miss a critical server event:
- **Granular Notification Library**: A comprehensive set of toggleable alerts for every major milestone:
    - **Server Lifecycle**: Start, Stop, and Update events.
    - **Critical Incidents**: Unexpected crashes or boot failures.
    - **Player Activity**: Connections and disconnections.
    - **System Events**: Successful backups and scheduled task executions.
- **Webhook Connection Monitoring**: A real-time heartbeat sensor that monitors your Discord connection status, providing instant visual feedback if your webhook URL becomes invalid.

### 4. Administrative Quick-Actions (⚡)
Broadcast information instantly from the manager:
- **Rapid Announcement Palette**: One-click templates for sending critical community updates, including maintenance warnings, restart notifications, and global news.
- **Notification Audit Log**: A historical record of recent communications sent to Discord, allowing you to verify that your alerts were delivered successfully.
- **Integrated Test Suite**: Built-in verification tools for both simple Webhooks and complex Bot tokens to ensure your configuration is perfect before deployment.

## 🛠️ Interface Controls
- **Webhook URL [Input]**: Define the Discord Webhook for simple alerts.
- **Bot Token [Password]**: Securely enter your Discord Bot token for the full Bridge experience.
- **Live Mode [Toggle]**: Enable or disable real-time connection monitoring and heartbeats.
- **Alert Toggles [Switch]**: Individually enable or disable specific notification types.
- **Test Connection [Send]**: Send a sample high-fidelity embed to verify your Discord settings.

## 🎨 Design Notes
- **Social Aesthetic**: Uses vibrant indigo accents to distinguish the "Community/Bridge" layer of the application from technical server controls.
- **Status-Aware UI**: Features pulsing emerald indicators and "Wifi" icons that react to your live Discord connection state.
- **Metric Cards**: High-impact cards at the top of the page provide an instant summary of your active alerts and notification volume.
