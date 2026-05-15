# 🔄 Backups Page

The Backups page provides a robust data protection system, allowing users to secure their server progress and configurations locally or in the cloud.

## 📝 Component Overview
- **File Path**: `src/pages/Backups.tsx`
- **Logic**: Interfaces with the Rust-based `BackupService`.
- **Tabs**: Local Storage, Cloud Archive.

## 🚀 Key Features

### 1. Local Backup Management
- **Manual Backups**: Create a snapshot of the server at any time with options to include/exclude save files, configs, and mods.
- **Auto-Backup Schedule**: Configure the manager to take automatic backups every X hours.
- **Backup Verification**: Check the integrity of backup archives to ensure they aren't corrupted.

### 2. Cloud Archive (Google Drive/S3)
- **Off-site Storage**: Sync backups to external cloud providers.
- **Redundancy**: Protects against local drive failures.
- **Easy Migration**: Download cloud backups to a new machine to quickly restore a server.

### 3. Timeline View
- **Visual History**: A vertical timeline showing the history of backups.
- **Change Tracking**: Highlights what changed between backup versions (Configs vs Saves).

### 4. Smart Cleanup
- **Retention Policy**: Automatically delete backups older than X days or keep only the last N backups.
- **Storage Management**: Display total storage used and warn when the drive is nearly full.

## 🛠️ Technical Details

### Backup Logic
Backups are created as compressed `.zip` or `.tar.gz` archives in the `backups/` directory relative to the server path.
```rust
// Rust implementation snippet
pub fn create_backup(server_id: u32, options: BackupOptions) -> Result<PathBuf, Error> {
    // Collects files -> Compresses -> Moves to archive
}
```

### IPC Commands
- `get_backups(serverId)`: List all local/cloud backups.
- `restore_backup(backupId)`: Triggers the restore process (Warning: Overwrites current files).
- `delete_backup(backupId)`: Permanent removal.

## 🎨 UI/UX Patterns
- **Risk Warnings**: Destructive actions like "Restore" are gated by a specialized `ConfirmDialog` with a "Danger" variant.
- **Size Formatting**: Automatically converts bytes to human-readable units (KB, MB, GB).
- **Empty States**: Encourages users to "Take Your First Backup" before major server updates.
