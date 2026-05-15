# Application Settings

The Settings module allows you to customize the ARK Manager's behavior, appearance, and integration with third-party services.

## General Configuration

- **Language**: Choose your preferred UI language (supports English, German, French, etc.).
- **Theme**: Toggle between Dark, Light, and "Liquid Glass" (Custom) aesthetics.
- **Start with Windows**: Enable the manager to launch automatically on system startup.
- **Minimize to Tray**: Keeps the application running in the background when the window is closed.

## Global Paths

Correct path configuration is essential for the manager's functionality:
- **SteamCMD Path**: Where the SteamCMD executable is located.
- **Base Install Directory**: The default folder where new servers will be created.
- **Backup Directory**: Centralized storage for all server snapshots.

## API & Integration

### CurseForge
- **API Key**: Required for mod searching and automated updates.
- **Mod Cache**: Define how long the manager should store mod metadata before refreshing.

### Discord
- **Bot Token**: Link your custom Discord bot to the manager.
- **Channel IDs**: Define where server status updates and cross-chat messages should be posted.

## Performance & System

- **Process Priority**: Set the global priority for the manager itself.
- **Check for Updates**: Enable automatic checking for new versions of the ARK Server Manager.
- **Diagnostics**: Generate a support report containing non-sensitive logs and system information to help troubleshoot issues.

## Security & Privacy

- **Database Encryption**: Options for securing your local server database.
- **Usage Statistics**: Toggle whether you want to share anonymous performance data with the development team.

---
*Warning: Modifying Global Paths while servers are active is not recommended and may lead to directory resolution errors.*
