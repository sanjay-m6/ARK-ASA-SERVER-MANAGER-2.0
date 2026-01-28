use crate::models::SystemInfo;
use crate::AppState;
use serde::Serialize;
use sysinfo::Disks;
use tauri::Manager;
use tauri::State;

#[tauri::command]
pub async fn get_system_info(state: State<'_, AppState>) -> Result<SystemInfo, String> {
    let mut sys = state
        .sys
        .lock()
        .map_err(|_| "Failed to lock system info".to_string())?;
    sys.refresh_all();

    let disks = Disks::new_with_refreshed_list();
    let mut total_disk = 0u64;
    let mut available_disk = 0u64;

    for disk in disks.list() {
        total_disk += disk.total_space();
        available_disk += disk.available_space();
    }

    let used_disk = total_disk.saturating_sub(available_disk);

    Ok(SystemInfo {
        cpu_usage: sys.global_cpu_usage(),
        ram_usage: (sys.used_memory() as f64) / (1024.0 * 1024.0 * 1024.0), // Convert to GB
        ram_total: (sys.total_memory() as f64) / (1024.0 * 1024.0 * 1024.0), // Convert to GB
        disk_usage: (used_disk as f64) / (1024.0 * 1024.0 * 1024.0),        // Convert to GB
        disk_total: (total_disk as f64) / (1024.0 * 1024.0 * 1024.0),       // Convert to GB
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

    // Check SteamCMD
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let steamcmd_path = app_dir.join("steamcmd").join("steamcmd.exe");
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

    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let steamcmd_dir = app_dir.join("steamcmd");

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
