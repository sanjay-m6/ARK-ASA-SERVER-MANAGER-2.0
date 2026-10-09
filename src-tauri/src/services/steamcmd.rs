use std::path::PathBuf;
use std::io::Cursor;
use tauri::AppHandle;
use tauri::Manager;
use anyhow::{Result, Context};

pub struct SteamCmdService {
    app_handle: AppHandle,
    custom_dir: Option<PathBuf>,
}

impl SteamCmdService {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle, custom_dir: None }
    }

    /// Create a SteamCmdService with a custom directory override.
    /// When set, all operations use this path instead of the default app_data_dir/steamcmd.
    pub fn with_custom_dir(app_handle: AppHandle, custom_dir: PathBuf) -> Self {
        Self { app_handle, custom_dir: Some(custom_dir) }
    }

    pub fn get_steamcmd_dir(&self) -> Result<PathBuf> {
        if let Some(ref custom) = self.custom_dir {
            return Ok(custom.clone());
        }
        let app_dir = self.app_handle.path().app_data_dir()?;
        Ok(app_dir.join("steamcmd"))
    }

    pub fn get_steamcmd_exe(&self) -> Result<PathBuf> {
        let dir = self.get_steamcmd_dir()?;
        if cfg!(target_os = "windows") {
            Ok(dir.join("steamcmd.exe"))
        } else {
            if dir.join("steamcmd.sh").exists() {
                Ok(dir.join("steamcmd.sh"))
            } else if dir.join("steamcmd").exists() {
                Ok(dir.join("steamcmd"))
            } else if dir.join("steamcmd.exe").exists() {
                Ok(dir.join("steamcmd.exe"))
            } else {
                Ok(dir.join(crate::platform::Platform::steamcmd_executable_name()))
            }
        }
    }

    pub fn check_installation(&self) -> bool {
        match self.get_steamcmd_exe() {
            Ok(path) => path.exists(),
            Err(_) => false,
        }
    }

    pub async fn install(&self) -> Result<()> {
        let install_dir = self.get_steamcmd_dir()?;
        if !install_dir.exists() {
            std::fs::create_dir_all(&install_dir)?;
        }

        let is_windows = cfg!(target_os = "windows");
        let download_url = if is_windows {
            "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip"
        } else {
            "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz"
        };

        println!("Downloading SteamCMD from {}...", download_url);
        let response = reqwest::get(download_url)
            .await
            .context("Failed to download SteamCMD")?;

        let bytes = response.bytes().await.context("Failed to get bytes from response")?;
        
        println!("Extracting SteamCMD...");
        let target_dir = install_dir.clone();
        tokio::task::spawn_blocking(move || -> Result<()> {
            if is_windows {
                let mut archive = zip::ZipArchive::new(Cursor::new(bytes))?;
                archive.extract(&target_dir)?;
            } else {
                use flate2::read::GzDecoder;
                use tar::Archive;
                let tar = GzDecoder::new(Cursor::new(bytes));
                let mut archive = Archive::new(tar);
                archive.unpack(&target_dir)?;
            }
            Ok(())
        }).await??;

        let exe_path = self.get_steamcmd_exe()?;
        let _ = crate::platform::Platform::ensure_executable_permissions(&exe_path);

        #[cfg(target_family = "unix")]
        {
            let linux32_dir = install_dir.join("linux32");
            if linux32_dir.exists() {
                if let Ok(entries) = std::fs::read_dir(&linux32_dir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_file() {
                            let _ = crate::platform::Platform::ensure_executable_permissions(&p);
                        }
                    }
                }
            }
        }

        println!("SteamCMD installed successfully at {:?}", install_dir);
        Ok(())
    }

    /// Re-download and re-extract SteamCMD to repair a broken installation
    pub async fn repair(&self) -> Result<()> {
        let install_dir = self.get_steamcmd_dir()?;

        // Remove existing steamcmd files but keep steamapps (server data)
        let exe_path = self.get_steamcmd_exe()?;
        if exe_path.exists() {
            let _ = std::fs::remove_file(&exe_path);
        }
        // Remove appcache
        let appcache = install_dir.join("appcache");
        if appcache.exists() {
            let _ = std::fs::remove_dir_all(&appcache);
        }
        // Remove package folder
        let package_dir = install_dir.join("package");
        if package_dir.exists() {
            let _ = std::fs::remove_dir_all(&package_dir);
        }
        // Remove linux32 folder on Unix
        let linux32_dir = install_dir.join("linux32");
        if linux32_dir.exists() {
            let _ = std::fs::remove_dir_all(&linux32_dir);
        }

        println!("Repairing SteamCMD - re-downloading...");
        self.install().await
    }

    /// Terminate any running steamcmd processes to release file locks on cache files
    pub fn kill_existing_processes(&self) -> Result<()> {
        #[cfg(target_os = "windows")]
        {
            use std::process::Command;
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            println!("Killing any existing steamcmd.exe processes...");
            let _ = Command::new("taskkill")
                .args(["/F", "/IM", "steamcmd.exe"])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
        #[cfg(not(target_os = "windows"))]
        {
            use std::process::Command;
            println!("Killing any existing steamcmd processes...");
            let _ = Command::new("pkill")
                .args(["-9", "steamcmd"])
                .output();
            let _ = Command::new("pkill")
                .args(["-9", "steamcmd.sh"])
                .output();
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
        Ok(())
    }

    /// Clear SteamCMD downloading & temp folders (without wiping appcache)
    pub fn clear_downloading_cache(&self) -> Result<()> {
        let _ = self.kill_existing_processes();
        let install_dir = self.get_steamcmd_dir()?;

        let downloading = install_dir.join("steamapps").join("downloading");
        if downloading.exists() {
            let _ = std::fs::remove_dir_all(&downloading);
        }

        let temp = install_dir.join("steamapps").join("temp");
        if temp.exists() {
            let _ = std::fs::remove_dir_all(&temp);
        }

        Ok(())
    }

    /// Clear SteamCMD download cache to fix stale download issues
    pub fn clear_cache(&self) -> Result<()> {
        // First kill any running steamcmd processes to release locks
        let _ = self.kill_existing_processes();

        let install_dir = self.get_steamcmd_dir()?;

        // Clear downloading folder inside steamapps
        let downloading = install_dir.join("steamapps").join("downloading");
        if downloading.exists() {
            std::fs::remove_dir_all(&downloading)
                .context("Failed to remove downloading directory")?;
            println!("Cleared SteamCMD downloading cache");
        }

        // Clear temp folder
        let temp = install_dir.join("steamapps").join("temp");
        if temp.exists() {
            std::fs::remove_dir_all(&temp)
                .context("Failed to remove temp directory")?;
            println!("Cleared SteamCMD temp cache");
        }

        // Clear any stale appmanifest files directly inside steamcmd/steamapps
        let steamapps_dir = install_dir.join("steamapps");
        if steamapps_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&steamapps_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        if let Some(ext) = path.extension() {
                            if ext == "acf" {
                                let _ = std::fs::remove_file(&path);
                                println!("Cleared stale manifest in steamcmd: {:?}", path.file_name());
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }

    /// Clear downloading cache, temp folder, and appmanifest for a target server installation
    pub fn clear_target_manifest_and_cache(&self, install_path: &PathBuf, app_id: &str) -> Result<()> {
        let manifest = install_path.join("steamapps").join(format!("appmanifest_{}.acf", app_id));
        if manifest.exists() {
            let _ = std::fs::remove_file(&manifest);
            println!("Cleared target appmanifest: {:?}", manifest);
        }

        let downloading = install_path.join("steamapps").join("downloading");
        if downloading.exists() {
            let _ = std::fs::remove_dir_all(&downloading);
            println!("Cleared target downloading cache: {:?}", downloading);
        }

        let temp = install_path.join("steamapps").join("temp");
        if temp.exists() {
            let _ = std::fs::remove_dir_all(&temp);
            println!("Cleared target temp cache: {:?}", temp);
        }

        Ok(())
    }

    /// Check if SteamCMD is healthy (exists, non-zero size, basic structure)
    pub fn check_health(&self) -> Result<SteamCmdHealth> {
        let exe_path = self.get_steamcmd_exe()?;
        let install_dir = self.get_steamcmd_dir()?;

        let exe_exists = exe_path.exists();
        let exe_size = if exe_exists {
            std::fs::metadata(&exe_path).map(|m| m.len()).unwrap_or(0)
        } else {
            0
        };

        // Check disk space on the drive where steamcmd is installed
        let disk_space_gb = get_available_disk_space(&install_dir);

        // Check if appcache exists (might be stale)
        let has_stale_cache = install_dir.join("appcache").exists();

        let is_healthy = exe_exists && exe_size > 100; // steamcmd executable should be non-empty

        Ok(SteamCmdHealth {
            is_healthy,
            exe_exists,
            exe_size_bytes: exe_size,
            disk_space_gb,
            has_stale_cache,
            install_path: install_dir.to_string_lossy().to_string(),
        })
    }
}

/// Health status report for SteamCMD
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamCmdHealth {
    pub is_healthy: bool,
    pub exe_exists: bool,
    pub exe_size_bytes: u64,
    pub disk_space_gb: f64,
    pub has_stale_cache: bool,
    pub install_path: String,
}

/// Get available disk space in GB for the drive containing the given path
pub fn get_available_disk_space(path: &PathBuf) -> f64 {
    #[cfg(windows)]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;

        // Get the root of the path (e.g., "C:\")
        let root = path
            .components()
            .next()
            .map(|c| {
                let mut root_str = c.as_os_str().to_string_lossy().to_string();
                if !root_str.ends_with('\\') {
                    root_str.push('\\');
                }
                root_str
            })
            .unwrap_or_else(|| "C:\\".to_string());

        let wide: Vec<u16> = OsStr::new(&root)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let mut free_bytes: u64 = 0;
        let mut total_bytes: u64 = 0;
        let mut total_free: u64 = 0;

        unsafe {
            windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW(
                wide.as_ptr(),
                &mut free_bytes as *mut u64,
                &mut total_bytes as *mut u64,
                &mut total_free as *mut u64,
            );
        }

        free_bytes as f64 / (1024.0 * 1024.0 * 1024.0)
    }

    #[cfg(not(windows))]
    {
        #[cfg(unix)]
        {
            use std::ffi::CString;
            use std::os::unix::ffi::OsStrExt;

            let mut check_path = path.as_path();
            while !check_path.exists() {
                if let Some(parent) = check_path.parent() {
                    check_path = parent;
                } else {
                    break;
                }
            }

            if let Ok(c_path) = CString::new(check_path.as_os_str().as_bytes()) {
                unsafe {
                    let mut stat: libc::statvfs = std::mem::zeroed();
                    if libc::statvfs(c_path.as_ptr(), &mut stat) == 0 {
                        let free_bytes = (stat.f_bavail as u64) * (stat.f_frsize as u64);
                        return free_bytes as f64 / (1024.0 * 1024.0 * 1024.0);
                    }
                }
            }
        }

        // Fallback using sysinfo Disks
        let disks = sysinfo::Disks::new_with_refreshed_list();
        let mut best_len = 0;
        let mut free_bytes = 0u64;
        let mut found = false;
        for disk in disks.list() {
            let mount = disk.mount_point();
            if path.starts_with(mount) {
                let len = mount.to_string_lossy().len();
                if len >= best_len {
                    best_len = len;
                    free_bytes = disk.available_space();
                    found = true;
                }
            }
        }
        if found {
            return free_bytes as f64 / (1024.0 * 1024.0 * 1024.0);
        }

        0.0
    }
}
