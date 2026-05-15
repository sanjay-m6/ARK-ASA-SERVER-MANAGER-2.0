# Server Management

The Server Manager is where you deploy, configure, and maintain your ARK: Survival Ascended server instances. This module handles everything from initial installation to advanced process management.

## Creating and Importing Servers

### Deploying a New Server
1. Click the **"New Server"** button.
2. **Assign a Name**: This is for internal organization and does not affect the in-game session name.
3. **Select Map**: Choose from standard maps (The Island, Scorched Earth, etc.) or specify a custom Map ID/Mod ID for community maps.
4. **Define Ports**: 
    - **Game Port**: Default is 7777.
    - **Query Port**: Default is 27015.
    - **RCON Port**: Default is 27020.
    *Note: Ensure these ports are forwarded in your firewall/router.*

### Importing Existing Servers
If you already have a server installed, use the **"Import Server"** function. Point the manager to the `ArkAscendedServer.exe` executable, and it will automatically detect the installation path and configuration files.

## Server Lifecycle Management

The Server Manager provides granular control over the process:
- **Hard Stop**: Forcefully terminates the process (use only if the server is unresponsive).
- **Graceful Shutdown**: Sends a broadcast message to players and saves the world before closing.
- **Clone Server**: Creates an exact duplicate of an existing server, including configurations and mods—perfect for testing changes or expanding a cluster.

## Deployment Settings

### SteamCMD Integration
The manager uses a dedicated SteamCMD instance to handle installations. You can:
- **Validate Files**: Checks for corruption and replaces missing assets.
- **Auto-Update**: Enables the manager to check for ARK updates every 15 minutes and apply them automatically.

### Process Optimization
- **CPU Affinity**: Bind specific servers to individual CPU cores to prevent thread contention.
- **Priority Level**: Set the Windows process priority (High, Above Normal, etc.) to ensure smooth performance under load.
- **Eco-Mode**: Reduces background resource usage for idle servers.

## Automation & Monitoring

- **Auto-Restart on Crash**: Leverages the Guardian service to monitor the process ID (PID) and restart upon failure.
- **Auto-Start on Boot**: Configures the server to start automatically when the ARK Manager application or Windows starts.

---
*Warning: Changing ports while a server is running will require a restart to take effect.*
