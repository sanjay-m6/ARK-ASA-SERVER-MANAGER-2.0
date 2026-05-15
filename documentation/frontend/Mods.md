# Mod Manager (CurseForge Integration)

ARK: Survival Ascended utilizes CurseForge for mod management. The Mod Manager simplifies the discovery, installation, and updating of these mods directly within the dashboard.

## Searching and Installing Mods

The manager features a built-in search engine that queries the CurseForge API in real-time.
- **Search by Name or ID**: Enter keywords or the specific Mod ID from the CurseForge website.
- **Filters**: Sort results by category (New, Popular, Total Downloads).
- **Mod Details**: View descriptions, version history, and dependencies before installing.

## Managing Installed Mods

Once a mod is added to a server, it appears in the **"Installed Mods"** list.

### Mod Load Order
Load order is critical for compatibility. 
- Use the **Drag-and-Drop** interface to reorder mods.
- High-priority mods (like total conversions or core overhauls) should generally be at the top of the list.

### Enabling/Disabling Mods
You can toggle mods on or off without uninstalling them. The manager automatically updates the `-mods=` startup argument when you save your changes.

## Updates & Integrity

### Automated Updates
The Mod Manager can be configured to check for mod updates automatically. If a new version is detected:
1. The server will perform a graceful shutdown (if configured).
2. The mod files will be patched via the CurseForge client.
3. The server will restart.

### Integrity Scanning
If a mod is causing crashes or failing to load, use the **"Verify Integrity"** tool. This will re-download the mod files and ensure they match the latest version on the CDN.

## Advanced Configuration

- **CurseForge API Key**: To use the search and auto-update features, you must provide a CurseForge API key in the application settings.
- **Mod Storage**: Customize where downloaded mod assets are stored to optimize disk usage across multiple server instances.

---
*Tip: Large mods (over 1GB) may significantly increase server startup time. Monitor the "Startup Progress" bar on the dashboard.*
