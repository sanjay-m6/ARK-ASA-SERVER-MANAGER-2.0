# 🚂 SteamCMD Service

The SteamCMD service is the core provisioning engine that manages the installation, repair, and health of the SteamCMD utility, which is required to download and update the ARK: Survival Ascended server binaries.

## 📝 Service Overview
- **File Path**: `src-tauri/src/services/steamcmd.rs`
- **Architecture**: Sandboxed in `AppData/Local`.
- **Core Functionality**: Automated Deployment, Cache Maintenance, Disk Space Analysis, Health Diagnostics.

## 🚀 Key Features

### 1. Automated Provisioning (📥)
- **Zero-Touch Setup**: Automatically downloads the latest `steamcmd.zip` from Valve's content delivery network during the manager's initial setup phase.
- **Managed Extraction**: Uses an asynchronous background task to extract the utility, ensuring the manager's UI remains responsive during disk-intensive operations.
- **Dynamic Pathing**: Resolves installation paths based on the host OS environment, typically sandboxing the utility within the application's data directory to bypass Windows permission restrictions.

### 2. Maintenance & Repair (🔧)
- **Self-Repair Engine**: If the `steamcmd.exe` becomes corrupted or fails a health check, the service can trigger a "Force Repair," which cleans orphaned package files and re-provisions a fresh executable.
- **Cache Purging**: Provides specialized methods to clear the SteamCMD `appcache` and `downloading` folders. This is the primary fix for common "Update Stuck at 0%" or "Stale Manifest" errors.

### 3. Smart Diagnostics (🧠)
The service provides a comprehensive `SteamCmdHealth` report:
- **Disk Space Audit**: Uses native Windows APIs (`GetDiskFreeSpaceExW`) to calculate available storage on the target drive, preventing update failures before they happen.
- **Integrity Verification**: Checks for non-zero file sizes and verified directory structures to ensure the utility is ready for execution.
- **Cache Analysis**: Detects the presence of large or stale cache folders that might be impacting performance or storage.

## 🛠️ Technical Details

### Health Model
```rust
pub struct SteamCmdHealth {
    pub is_healthy: bool,
    pub exe_exists: bool,
    pub exe_size_bytes: u64,
    pub disk_space_gb: f64,
    pub has_stale_cache: bool,
    pub install_path: String,
}
```

### Windows-Specific Optimization
The service utilizes a direct Windows API call to get accurate disk metrics:
```rust
unsafe {
    windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW(
        wide.as_ptr(),
        &mut free_bytes as *mut u64,
        &mut total_bytes as *mut u64,
        &mut total_free as *mut u64,
    );
}
```

## 🎨 Developer Notes
- **Reliability**: The service is designed to be "Auto-Healing." Any call to a server update command will first verify the SteamCMD health and attempt a silent installation if it's missing.
- **Data Isolation**: While SteamCMD is installed in AppData, the actual server games are installed in user-defined paths, keeping the manager's binaries separate from the heavy game data (100GB+).
