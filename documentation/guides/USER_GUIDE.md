# User Guide: Getting Started with ARK ASA Server Manager

Welcome to the ARK: Survival Ascended Server Manager 2.0. This guide will walk you through the essential steps to set up and manage your first ASA server.

## 1. Initial Setup

### Requirements
- **OS**: Windows 10/11 (64-bit).
- **Permissions**: Administrator privileges are required for process management and firewall rules.
- **Hardware**: Minimum 16GB RAM (32GB+ recommended for multiple servers).

### First Launch
When you first open the application:
1. **SteamCMD**: The manager will automatically download and install SteamCMD if it's missing.
2. **Administrator Check**: Ensure you accept the UAC prompt to allow the manager to control server processes.
3. **Settings**: Go to the **Settings** page and verify your "Base Install Directory." This is where all your servers will be stored.

## 2. Deploying Your First Server

1. **New Server**: Click the "New Server" button on the Sidebar.
2. **Basic Config**: Give your server a name and select your map (e.g., The Island).
3. **Installation**: Click "Install." The manager will use SteamCMD to download the server binaries (approx. 40GB).
4. **Ports**: Ensure ports `7777`, `27015`, and `27020` are open in your router/firewall.

## 3. Configuration & Mods

### Editing Settings
Use the **Configuration Editor** to adjust your multipliers (XP, Taming, Harvesting) and server rules.
- **Save Profiles**: You can save your settings as a profile to reuse later.
- **Preview**: Check the "Preview" tab to see exactly what your startup command looks like.

### Managing Mods
1. Go to the **Mod Manager**.
2. Search for mods via the CurseForge integration.
3. Add them to your server and arrange the **Load Order**.
4. Click "Apply to Server" to update the configuration.

## 4. Running Your Server

- **Start**: Launches the server process. You can monitor progress via the "Startup Progress" bar.
- **RCON**: Once the server is online, use the **RCON Console** to manage players and execute commands.
- **Updates**: Use the "Check for Updates" button to keep your server binaries and mods current.

## 5. Automation (Optional but Recommended)

- **Guardian**: Enable the Guardian for 24/7 crash protection.
- **Scheduler**: Set up daily restarts or hourly backups.
- **Backups**: Configure automatic world backups to protect against data loss.

## Troubleshooting Tips

- **Server Not Visible**: Double-check your Port Forwarding and firewall rules.
- **Stuck on Startup**: Check the `Logs` page for specific error messages (e.g., missing mods or corrupt saves).
- **Performance Issues**: Use the `Hardware` page to optimize CPU affinity and process priority.

---
*For more detailed technical guides, visit the [Knowledge Base](/wiki) within the application.*
