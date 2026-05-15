# Backup System

Data integrity is paramount. The ARK Manager features a multi-tiered backup system designed to protect your world data, player profiles, and server configurations from corruption or hardware failure.

## Backup Types

### Manual Backups
Create a snapshot of your server at any time with a single click. This is highly recommended before:
- Adding or removing major mods.
- Performing an ARK game update.
- Manually editing INI files.

### Automated Backups
Configure the **Scheduler** to perform backups at regular intervals (e.g., every 6 hours). The system will automatically prune old backups based on your retention policy to save disk space.

### Pre-Update Backups
When enabled, the manager will automatically create a backup immediately before applying a SteamCMD patch.

## What is Backed Up?

You can customize the contents of each backup:
- **World Data**: The actual `.ark` save file containing structures and dinos.
- **Player Profiles**: Individual `.arkprofile` and `.arktribe` files.
- **Configurations**: The `Saved/Config/WindowsServer` directory.
- **Mod Data**: (Optional) Backs up installed mod assets.

## Restoration Process

Restoring a server is simple and safe:
1. Select the desired backup from the list.
2. Click **"Restore"**.
3. The manager will archive the current "corrupted" state before overwriting it with the backup data.
4. The server will automatically restart once the restoration is complete.

## Remote & Cloud Backups (Advanced)

For ultimate redundancy, configure the **Cloud Storage** integration:
- **S3 / AWS**: Sync your backups to an Amazon S3 bucket.
- **Google Drive / Dropbox**: Link your personal cloud storage for off-site protection.
- **SFTP**: Transfer backups to a remote Linux or Windows server.

---
*Tip: Compression is enabled by default. A typical ARK world save (100MB) will be compressed to approximately 15MB, allowing you to store hundreds of versions with minimal storage impact.*
