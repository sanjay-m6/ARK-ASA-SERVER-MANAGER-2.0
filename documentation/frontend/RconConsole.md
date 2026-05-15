# RCON Console & Administration

Remote Console (RCON) is the primary method for interacting with your server while it is running. The built-in RCON module provides a secure, low-latency interface for executing commands and monitoring player activity.

## Connection & Security

Each server must have a unique **RCON Port** and an **Admin Password** defined in its configuration.
- **Auto-Connect**: The manager can be set to connect to RCON automatically as soon as the server reaches an "Online" state.
- **Heartbeat**: The console maintains a steady heartbeat to detect if the RCON service has crashed or timed out.

## Executing Commands

### Live Command Input
Type commands directly into the terminal. The console supports:
- **Command History**: Use the arrow keys to cycle through previously executed commands.
- **Shortcuts**: Pre-set buttons for common commands like `SaveWorld`, `DestroyWildDinos`, and `ListPlayers`.

### Command Presets
Create custom buttons for commands you use frequently. This is useful for complex commands like spawning items or modifying server rates on the fly.

## Player Management

The RCON console features a dedicated **Live Player List**:
- **Kick/Ban**: Remove problematic players instantly.
- **Message Player**: Send a private direct message (DM) to a specific user.
- **Broadcast**: Send an alert to everyone currently on the server.
- **Whitelisting**: Manage the `PlayersExclusiveJoinList` to restrict access to your server.

## Activity Streaming

The main terminal window streams:
- **Admin Actions**: Logs of every command executed.
- **Join/Leave Events**: Real-time notifications when players enter or exit the map.
- **Death Logs**: (If enabled) View player and creature death notifications.

---
*Safety Note: The RCON password is encrypted in the local database. Never share your `GameUserSettings.ini` file, as it contains this password in plain text.*
