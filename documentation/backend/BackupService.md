# 💾 Local Backup Service

The Local Backup service is the core disaster recovery engine, responsible for the creation, verification, and surgical restoration of server data, including world saves, configuration files, and installed mods.

## 📝 Service Overview
- **File Path**: `src-tauri/src/services/backup_service.rs`
- **Format**: Compressed ZIP archives with DEFLATE optimization.
- **Core Functionality**: Recursive Data Capture, Integrity Verification, Automated Retention Cleanup.

## 🚀 Key Features

### 1. Granular Data Capture (🎯)
The service allows administrators to choose exactly what they want to preserve:
- **World Saves**: Captures the entire `SavedArks` directory, including player profiles, tribe data, and the world map.
- **Configurations**: Backs up the `WindowsServer` config directory, ensuring custom engine and game rules are never lost.
- **Mod Assets**: Optionally captures the `Mods` directory (binaries and assets). While large, this is critical for ensuring a server can be restored to a specific mod-version state.
- **Cluster Data**: Includes cross-server transfer data (Obelisk/Cloud storage) for clustered environments.

### 2. Integrity & Verification Pass
To prevent "Silent Corruption," the service includes built-in validation:
- **CRC-32 Verification**: After creating an archive, the service can perform a test-read of every entry to ensure the backup is structurally sound before marking it as "Verified" in the database.
- **Timestamp Tracking**: Every backup is uniquely identified by a `SERVERID_TIMESTAMP` string, preventing accidental overwrites.

### 3. Automated Lifecycle Management
- **Retention Policies**: The service automatically manages disk space by enforcing a "Keep N Most Recent" rule. Older backups are purged during the next creation cycle based on administrative settings.
- **Pre-Update Hooking**: This service is the technical foundation for the manager's "Automatic Rollback" system, which triggers a restoration if a mod update fails to launch.

### 4. Surgical Restoration logic (♻️)
Restoration is non-destructive and highly targeted:
- **Path Mapping**: The service understands the internal structure of the backup ZIP and correctly re-maps files to their respective game directories (e.g., `Config/` inside the ZIP -> `ShooterGame/Saved/Config/WindowsServer/` on disk).
- **Collision Handling**: Safely creates required directory trees if the target filesystem has been wiped.

## 🛠️ Technical Details

### Backup Metadata
```rust
pub struct Backup {
    pub id: i64,
    pub server_id: i64,
    pub file_path: PathBuf,
    pub size: i64,
    pub includes_configs: bool,
    pub includes_mods: bool,
    pub includes_saves: bool,
    pub includes_cluster: bool,
    pub verified: bool,
}
```

### Recursive Zip Creation
Uses a high-performance walking algorithm to build the archive:
```rust
for entry in walkdir::WalkDir::new(source_dir) {
    // ... Construct relative archive paths
    // ... Stream file contents into ZipWriter
}
```

## 🎨 Developer Notes
- **Storage Location**: By default, backups are stored in a dedicated `ASA_Backups` root to prevent game server crashes from impacting backup availability.
- **Compression**: The service uses level 6 DEFLATE compression by default, striking an ideal balance between archival speed and disk space efficiency.
