use crate::models::SystemInfo;
use crate::AppState;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};

use sysinfo::Disks;
use tauri::Manager;
use tauri::State;
use tokio::time::{sleep, Duration};

// Global flag for Eco Mode
static ECO_MODE_ACTIVE: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub async fn get_system_info(state: State<'_, AppState>) -> Result<SystemInfo, String> {
    let mut sys = state
        .sys
        .lock()
        .map_err(|_| "Failed to lock system info".to_string())?;

    // We rely on the frontend polling (every 10s) to provide the time delta
    // sysinfo will compute the CPU usage since the *last* time this was called.
    sys.refresh_cpu_all();
    sys.refresh_memory();

    // Compute CPU from per-core values (more reliable than global_cpu_usage on Windows)
    let cpus = sys.cpus();
    let cpu = if cpus.is_empty() {
        sys.global_cpu_usage()
    } else {
        let total: f32 = cpus.iter().map(|c| c.cpu_usage()).sum();
        total / cpus.len() as f32
    };

    // Debug print backend-side
    println!(
        "DEBUG CPU: {} cores, {}% global, {}% per-core",
        cpus.len(),
        sys.global_cpu_usage(),
        cpu
    );

    let disks = Disks::new_with_refreshed_list();
    let mut total_disk = 0u64;
    let mut available_disk = 0u64;

    for disk in disks.list() {
        total_disk += disk.total_space();
        available_disk += disk.available_space();
    }

    let used_disk = total_disk.saturating_sub(available_disk);

    Ok(SystemInfo {
        cpu_usage: (cpu * 100.0).round() / 100.0,
        ram_usage: ((sys.used_memory() as f64) / (1024.0 * 1024.0 * 1024.0) * 100.0).round()
            / 100.0,
        ram_total: ((sys.total_memory() as f64) / (1024.0 * 1024.0 * 1024.0) * 100.0).round()
            / 100.0,
        disk_usage: ((used_disk as f64) / (1024.0 * 1024.0 * 1024.0) * 100.0).round() / 100.0,
        disk_total: ((total_disk as f64) / (1024.0 * 1024.0 * 1024.0) * 100.0).round() / 100.0,
    })
}

#[tauri::command]
pub async fn select_folder(app: tauri::AppHandle, title: String) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let file_path = app.dialog().file().set_title(title).blocking_pick_folder();

    Ok(file_path.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn select_file(
    app: tauri::AppHandle,
    title: String,
    extensions: Option<Vec<String>>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let mut dialog = app.dialog().file().set_title(title);

    if let Some(ref exts) = extensions {
        let ext_slices: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();
        dialog = dialog.add_filter("Files", &ext_slices);
    }

    let file_path = dialog.blocking_pick_file();

    Ok(file_path.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn select_plugin_zip(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let file_path = app
        .dialog()
        .file()
        .add_filter("Plugin Archives", &["zip", "7z", "rar", "tar.gz", "tar"])
        .set_title("Select Plugin Archive File")
        .blocking_pick_file();

    Ok(file_path.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn get_setting(
    state: State<'_, AppState>,
    key: String,
) -> Result<Option<String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_setting(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_setting(
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_setting(&key, &value).map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct DiagnosticResult {
    pub steamcmd_installed: bool,
    pub internet_connected: bool,
    pub disk_space_ok: bool,
    pub memory_ok: bool,
    pub issues: Vec<String>,
}

#[tauri::command]
pub async fn run_diagnostics(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<DiagnosticResult, String> {
    let mut issues = Vec::new();

    // Check SteamCMD (supports custom path override)
    let steamcmd_dir = crate::services::resolve_steamcmd_dir_from_state(&state, &app)
        .unwrap_or_else(|_| {
            app.path().app_data_dir().unwrap_or_default().join("steamcmd")
        });
    let steamcmd_path = steamcmd_dir.join("steamcmd.exe");
    let steamcmd_installed = steamcmd_path.exists();
    if !steamcmd_installed {
        issues.push("SteamCMD is missing. Server installation will fail.".to_string());
    }

    // Check Memory
    let (total_ram_gb, memory_ok) = {
        let sys = state
            .sys
            .lock()
            .map_err(|_| "Failed to lock system".to_string())?;
        let total = (sys.total_memory() as f64) / (1024.0 * 1024.0 * 1024.0);
        (total, total >= 16.0)
    };

    if !memory_ok {
        issues.push(format!(
            "Low RAM detected ({:.1} GB). 16GB+ recommended for ASA Servers.",
            total_ram_gb
        ));
    }

    // Check Disk (using available space on C: or app drive)
    let disks = Disks::new_with_refreshed_list();
    // Simple check: do we have at least 50GB free on ANY drive? (Approximation)
    let mut disk_space_ok = false;
    for disk in disks.list() {
        if disk.available_space() > 50u64 * 1024 * 1024 * 1024 {
            disk_space_ok = true;
            break;
        }
    }
    // Specific check for app dir drive would be better but this is a quick "one button" health check covers most cases
    if !disk_space_ok {
        issues.push("Low disk space. Less than 50GB free on all drives.".to_string());
    }

    // Check Internet (Ping Google DNS)
    // Use spawn_blocking to avoid blocking the async runtime
    let internet_connected = tauri::async_runtime::spawn_blocking(|| {
        std::net::TcpStream::connect_timeout(
            &std::net::SocketAddr::from(([8, 8, 8, 8], 53)),
            std::time::Duration::from_secs(2),
        )
        .is_ok()
    })
    .await
    .unwrap_or(false);

    if !internet_connected {
        issues
            .push("No Internet connection detected. Cannot download SteamCMD or Mods.".to_string());
    }

    Ok(DiagnosticResult {
        steamcmd_installed,
        internet_connected,
        disk_space_ok,
        memory_ok,
        issues,
    })
}

#[tauri::command]
pub async fn install_steamcmd(app: tauri::AppHandle) -> Result<String, String> {
    use std::io::Write;

    // Resolve SteamCMD directory (supports custom path override)
    let steamcmd_dir = if let Some(state_ref) = app.try_state::<AppState>() {
        crate::services::resolve_steamcmd_dir_from_state(&state_ref, &app)
            .unwrap_or_else(|_| app.path().app_data_dir().unwrap_or_default().join("steamcmd"))
    } else {
        app.path().app_data_dir().map_err(|e| e.to_string())?.join("steamcmd")
    };

    // Create directory
    if !steamcmd_dir.exists() {
        std::fs::create_dir_all(&steamcmd_dir).map_err(|e| e.to_string())?;
    }

    let zip_path = steamcmd_dir.join("steamcmd.zip");

    // 1. Download
    println!("Downloading SteamCMD...");
    let response = reqwest::get("https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip")
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    let content = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read bytes: {}", e))?;

    let mut file = std::fs::File::create(&zip_path).map_err(|e| e.to_string())?;
    file.write_all(&content).map_err(|e| e.to_string())?;

    // 2. Extract
    println!("Extracting SteamCMD...");
    let file = std::fs::File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid ZIP: {}", e))?;

    archive
        .extract(&steamcmd_dir)
        .map_err(|e| format!("Extraction failed: {}", e))?;

    // 3. Cleanup
    let _ = std::fs::remove_file(&zip_path);

    Ok("SteamCMD installed successfully.".to_string())
}

/// Validate whether a path contains non-ASCII characters that SteamCMD cannot handle.
#[tauri::command]
pub fn validate_steamcmd_path(path: String) -> Result<bool, String> {
    Ok(!crate::services::has_non_ascii_chars(&path))
}

/// Get the currently resolved SteamCMD directory path.
#[tauri::command]
pub async fn get_steamcmd_dir(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let dir = crate::services::resolve_steamcmd_dir_from_state(&state, &app)?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn optimize_memory() -> Result<(), String> {
    #[cfg(windows)]
    {
        // Using SetProcessWorkingSetSize with -1 (usize::MAX) trims the working set
        use windows_sys::Win32::System::Threading::{GetCurrentProcess, SetProcessWorkingSetSize};
        unsafe {
            let process = GetCurrentProcess();
            let _ = SetProcessWorkingSetSize(process, usize::MAX, usize::MAX);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn set_process_priority(_high: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::Threading::{
            GetCurrentProcess, SetPriorityClass, HIGH_PRIORITY_CLASS, NORMAL_PRIORITY_CLASS,
        };
        unsafe {
            let process = GetCurrentProcess();
            let priority = if _high {
                HIGH_PRIORITY_CLASS
            } else {
                NORMAL_PRIORITY_CLASS
            };
            if SetPriorityClass(process, priority) == 0 {
                return Err("Failed to set process priority".to_string());
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn toggle_eco_mode(enable: bool) -> Result<(), String> {
    ECO_MODE_ACTIVE.store(enable, Ordering::Relaxed);

    if enable {
        // Spawn a background task to aggressively trim memory
        tauri::async_runtime::spawn(async move {
            while ECO_MODE_ACTIVE.load(Ordering::Relaxed) {
                let _ = optimize_memory().await;
                sleep(Duration::from_secs(5)).await; // Trim every 5 seconds
            }
        });
    }

    Ok(())
}

#[tauri::command]
pub async fn request_admin_privileges(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::UI::Shell::ShellExecuteW;
        use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOW;

        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;

        let operation: Vec<u16> = OsStr::new("runas")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let file: Vec<u16> = exe_path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let parameters: Vec<u16> = OsStr::new("")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        unsafe {
            let result = ShellExecuteW(
                std::ptr::null_mut(),
                operation.as_ptr(),
                file.as_ptr(),
                parameters.as_ptr(),
                std::ptr::null(),
                SW_SHOW,
            );

            if result as isize > 32 {
                // Small delay to allow WebView2 to cleanup properly
                // This prevents the Chrome_WidgetWin_0 error 1412
                // Close all windows first to ensure WebView2 cleans up nicely
                let windows = app.webview_windows();
                for (_, window) in windows {
                    let _ = window.close();
                }

                // Give a moment for windows to close
                tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                app.exit(0);
                Ok(())
            } else {
                Err("Failed to request admin privileges".to_string())
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Err("Admin elevation is only supported on Windows".to_string())
    }
}

#[tauri::command]
pub async fn set_startup_shortcut(enabled: bool, minimized: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        crate::utils::startup_helper::set_windows_registry_run(enabled, minimized)
            .map_err(|e| format!("Failed to configure Windows registry run: {}", e))
    }
    #[cfg(not(windows))]
    {
        let _ = enabled;
        let _ = minimized;
        Err("Registry startup is only supported on Windows".to_string())
    }
}

#[tauri::command]
pub async fn set_startup_task_scheduler(enabled: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        crate::utils::startup_helper::set_windows_task_scheduler(enabled)
            .map_err(|e| format!("Failed to configure Windows Task Scheduler: {}", e))
    }
    #[cfg(not(windows))]
    {
        let _ = enabled;
        Err("Task Scheduler startup is only supported on Windows".to_string())
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoStartConfig {
    pub global_auto_start_enabled: bool,
    pub global_boot_delay: u64,
    pub start_minimized_to_tray: bool,
    pub silent_headless_startup: bool,
    pub windows_startup_shortcut: bool,
    pub loop_prevention_max_crashes: u64,
    pub loop_prevention_time_window_mins: u64,
}

#[tauri::command]
pub async fn get_auto_start_config(state: State<'_, AppState>) -> Result<AutoStartConfig, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let get_val = |key: &str, default: &str| -> String {
        conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            [key],
            |row| row.get::<_, String>(0)
        ).unwrap_or_else(|_| default.to_string())
    };

    Ok(AutoStartConfig {
        global_auto_start_enabled: get_val("global_auto_start_enabled", "false") == "true",
        global_boot_delay: get_val("global_boot_delay", "0").parse::<u64>().unwrap_or(0),
        start_minimized_to_tray: get_val("start_minimized_to_tray", "false") == "true",
        silent_headless_startup: get_val("silent_headless_startup", "false") == "true",
        windows_startup_shortcut: get_val("windows_startup_shortcut", "false") == "true",
        loop_prevention_max_crashes: get_val("loop_prevention_max_crashes", "3").parse::<u64>().unwrap_or(3),
        loop_prevention_time_window_mins: get_val("loop_prevention_time_window_mins", "15").parse::<u64>().unwrap_or(15),
    })
}

#[tauri::command]
pub async fn set_auto_start_config(config: AutoStartConfig, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let set_val = |key: &str, value: &str| -> Result<(), rusqlite::Error> {
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            [key, value]
        )?;
        Ok(())
    };

    set_val("global_auto_start_enabled", &config.global_auto_start_enabled.to_string()).map_err(|e| e.to_string())?;
    set_val("global_boot_delay", &config.global_boot_delay.to_string()).map_err(|e| e.to_string())?;
    set_val("start_minimized_to_tray", &config.start_minimized_to_tray.to_string()).map_err(|e| e.to_string())?;
    set_val("silent_headless_startup", &config.silent_headless_startup.to_string()).map_err(|e| e.to_string())?;
    set_val("windows_startup_shortcut", &config.windows_startup_shortcut.to_string()).map_err(|e| e.to_string())?;
    set_val("loop_prevention_max_crashes", &config.loop_prevention_max_crashes.to_string()).map_err(|e| e.to_string())?;
    set_val("loop_prevention_time_window_mins", &config.loop_prevention_time_window_mins.to_string()).map_err(|e| e.to_string())?;

    // Apply Registry Startup setting on Windows!
    #[cfg(windows)]
    {
        let _ = crate::utils::startup_helper::set_windows_registry_run(
            config.windows_startup_shortcut,
            config.start_minimized_to_tray,
        );
    }

    Ok(())
}

#[tauri::command]
pub async fn set_server_startup_config(
    server_id: i64,
    delay: i64,
    priority: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE servers SET startup_delay = ?1, startup_priority = ?2 WHERE id = ?3",
        rusqlite::params![delay, priority, server_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_player_counts(state: State<'_, AppState>) -> Result<std::collections::HashMap<i64, i32>, String> {
    Ok(state.player_intelligence.get_player_counts().await)
}

#[tauri::command]
pub fn get_app_logs_dir(app: tauri::AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rollback_to_version(version: String) -> Result<(), String> {
    let url = format!(
        "https://github.com/sanjay-m6/ARK-ASA-SERVER-MANAGER-2.0/releases/download/v{}/ASA.Server.Manager_{}_x64-setup.exe",
        version, version
    );
    
    let temp_dir = std::env::temp_dir();
    let file_name = format!("ASA.Server.Manager_{}_setup.exe", version);
    let file_path = temp_dir.join(file_name);
    
    println!("Downloading rollback installer from {} to {:?}", url, file_path);
    
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;
        
    let response = client.get(&url)
        .header("User-Agent", "ARK-ASA-Server-Manager")
        .send()
        .await
        .map_err(|e| format!("Failed to download update: {}", e))?;
        
    if !response.status().is_success() {
        return Err(format!("Server returned error status: {}", response.status()));
    }
    
    let bytes = response.bytes().await
        .map_err(|e| format!("Failed to read update bytes: {}", e))?;
        
    std::fs::write(&file_path, bytes)
        .map_err(|e| format!("Failed to write update file: {}", e))?;
        
    println!("Launching installer: {:?}", file_path);
    
    std::process::Command::new(&file_path)
        .spawn()
        .map_err(|e| format!("Failed to execute installer: {}", e))?;
        
    std::process::exit(0);
}

#[tauri::command]
pub async fn uninstall_application() -> Result<(), String> {
    let current_exe = std::env::current_exe()
        .map_err(|e| format!("Failed to get current exe path: {}", e))?;
    let install_dir = current_exe.parent()
        .ok_or_else(|| "Failed to get install directory.".to_string())?;
    
    let uninstaller = install_dir.join("Uninstall.exe");
    if uninstaller.exists() {
        std::process::Command::new(uninstaller)
            .spawn()
            .map_err(|e| format!("Failed to run uninstaller: {}", e))?;
        std::process::exit(0);
    } else {
        Err("Uninstall.exe not found in app directory. Please uninstall via Windows Control Panel / Settings.".to_string())
    }
}

#[derive(Debug, Serialize, serde::Deserialize)]
pub struct AppUpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub release_notes: String,
    pub release_date: String,
    pub download_url: Option<String>,
}

#[tauri::command]
pub async fn check_app_update(app: tauri::AppHandle) -> Result<AppUpdateInfo, String> {
    let current_version = app.package_info().version.to_string();

    let client = reqwest::Client::builder()
        .user_agent("ARK-ASA-Server-Manager-Updater")
        .build()
        .map_err(|e| e.to_string())?;

    let url = "https://api.github.com/repos/sanjay-m6/ARK-ASA-SERVER-MANAGER-2.0/releases/latest";
    let resp = client.get(url).send().await;

    match resp {
        Ok(res) if res.status().is_success() => {
            let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;

            let tag_name = json["tag_name"]
                .as_str()
                .unwrap_or("")
                .trim_start_matches('v')
                .to_string();
            
            let release_notes = json["body"].as_str().unwrap_or("No release notes available.").to_string();
            let release_date = json["published_at"].as_str().unwrap_or("").to_string();
            let html_url = json["html_url"].as_str().map(|s| s.to_string());

            let update_available = if !tag_name.is_empty() {
                tag_name != current_version
            } else {
                false
            };

            Ok(AppUpdateInfo {
                current_version,
                latest_version: if tag_name.is_empty() { "4.6.3".to_string() } else { tag_name },
                update_available,
                release_notes,
                release_date,
                download_url: html_url,
            })
        }
        _ => {
            Ok(AppUpdateInfo {
                current_version: current_version.clone(),
                latest_version: current_version,
                update_available: false,
                release_notes: "Application is up to date.".to_string(),
                release_date: "".to_string(),
                download_url: None,
            })
        }
    }
}

#[tauri::command]
pub async fn install_app_update(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    
    if let Ok(updater) = app.updater() {
        if let Ok(Some(update)) = updater.check().await {
            let mut downloaded = 0;
            let _ = update
                .download_and_install(
                    move |chunk_length, content_length| {
                        downloaded += chunk_length;
                        println!("downloaded {downloaded} from {content_length:?}");
                    },
                    || {
                        println!("download finished");
                    },
                )
                .await;

            app.restart();
        }
    }

    // Fallback: Open release download page in browser
    let url = "https://github.com/sanjay-m6/ARK-ASA-SERVER-MANAGER-2.0/releases/latest";
    use tauri_plugin_opener::OpenerExt;
    let _ = app.opener().open_url(url, None::<&str>);
    Ok(())
}

#[derive(serde::Serialize)]
pub struct PlatformInfoResponse {
    pub os: &'static str,
    pub is_windows: bool,
    pub is_linux: bool,
    pub default_backup_dir: String,
    pub default_cluster_dir: String,
    pub steamcmd_executable: &'static str,
}

#[tauri::command]
pub async fn get_platform_info() -> Result<PlatformInfoResponse, String> {
    use crate::platform::{OperatingSystem, Platform};

    let os = OperatingSystem::current();
    Ok(PlatformInfoResponse {
        os: os.as_str(),
        is_windows: os.is_windows(),
        is_linux: os.is_linux(),
        default_backup_dir: Platform::default_backup_dir().to_string_lossy().to_string(),
        default_cluster_dir: Platform::default_cluster_dir().to_string_lossy().to_string(),
        steamcmd_executable: Platform::steamcmd_executable_name(),
    })
}


