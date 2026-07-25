pub mod advanced_config;
pub mod anti_cheat;
pub mod api_key_manager;
pub mod ark_rcon;
pub mod backup_service;
pub mod config_generator;
pub mod cross_chat;
pub mod discord;
pub mod discord_bridge;
pub mod file_watcher;
pub mod log_watcher;
pub mod guardian;
pub mod ini_parser;
pub mod mod_scraper;
pub mod network;
pub mod player_intelligence;
pub mod plugin_manager;
pub mod process_manager;
pub mod rcon;
pub mod scheduler;
pub mod server_installer;
pub mod steamcmd;
pub mod mod_watchdog;
pub mod mod_validator;
pub mod workshop_metadata;
pub mod server_organization;
pub mod system_analyzer;

pub mod ase_discord_bridge;

use std::path::PathBuf;

/// Check if a path contains non-ASCII characters that SteamCMD cannot handle.
pub fn has_non_ascii_chars(path: &str) -> bool {
    path.chars().any(|c| !c.is_ascii())
}

/// Resolve the SteamCMD directory, checking the DB `custom_steamcmd_path` setting first.
/// Falls back to `<app_data_dir>/steamcmd` if no custom path is configured.
#[allow(dead_code)]
pub fn resolve_steamcmd_dir(
    db: &crate::db::Database,
    app_handle: &tauri::AppHandle,
) -> Result<PathBuf, String> {
    resolve_steamcmd_dir_for_target(db, app_handle, None)
}

/// Target-aware SteamCMD path resolver.
/// If `custom_steamcmd_path` is not set and the default AppData drive (C:) has insufficient disk space (< 50GB)
/// for SteamCMD's temporary download staging cache, this automatically relocates SteamCMD to the target server drive.
pub fn resolve_steamcmd_dir_for_target(
    db: &crate::db::Database,
    app_handle: &tauri::AppHandle,
    target_install_path: Option<&std::path::Path>,
) -> Result<PathBuf, String> {
    if let Ok(Some(custom_path)) = db.get_setting("custom_steamcmd_path") {
        // Strip surrounding quotes/whitespace that can slip in from manual entry.
        let trimmed = custom_path.trim().trim_matches('"').trim();
        if !trimmed.is_empty() {
            let p = PathBuf::from(trimmed);
            // The setting is meant to be a folder. If the user pointed it directly
            // at steamcmd.exe (or any file), use its parent directory instead.
            let is_exe = p
                .file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.eq_ignore_ascii_case("steamcmd.exe"))
                .unwrap_or(false);
            if is_exe || p.is_file() {
                if let Some(parent) = p.parent() {
                    return Ok(parent.to_path_buf());
                }
            }
            return Ok(p);
        }
    }

    // Default: app_data_dir/steamcmd
    use tauri::Manager;
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let default_path = app_dir.join("steamcmd");
    
    // Self-heal: SteamCMD fails to run/update if its path contains non-ASCII characters (e.g. Cyrillic/Turkish names)
    if has_non_ascii_chars(&default_path.to_string_lossy()) {
        let safe_fallback = PathBuf::from("C:\\ARKServerManager\\steamcmd");
        println!("[SteamCMD Path Resolver] ⚠️ Default SteamCMD path contains non-ASCII characters! Falling back to safe path: {:?}", safe_fallback);
        return Ok(safe_fallback);
    }

    // Disk space fallback: If default AppData drive has low space (< 50 GB) and target drive is available with more space
    let default_free_gb = crate::services::steamcmd::get_available_disk_space(&default_path);
    if default_free_gb < 50.0 {
        if let Some(target) = target_install_path {
            let target_buf = target.to_path_buf();
            let target_free_gb = crate::services::steamcmd::get_available_disk_space(&target_buf);
            if target_free_gb > default_free_gb && target_free_gb >= 30.0 {
                // Determine target drive root or base folder
                let fallback_dir = if let Some(parent) = target.parent() {
                    if parent.parent().is_some() {
                        parent.parent().unwrap().join("steamcmd")
                    } else {
                        parent.join("steamcmd")
                    }
                } else {
                    target.join("steamcmd")
                };

                println!(
                    "[SteamCMD Path Resolver] ⚠️ Default AppData drive (C:) has low free space ({:.1} GB < 50 GB). Auto-relocating SteamCMD staging folder to target drive: {:?}",
                    default_free_gb, fallback_dir
                );
                return Ok(fallback_dir);
            }
        }
    }

    Ok(default_path)
}

/// Resolve the SteamCMD directory using AppState (convenience wrapper).
pub fn resolve_steamcmd_dir_from_state(
    state: &crate::AppState,
    app_handle: &tauri::AppHandle,
) -> Result<PathBuf, String> {
    resolve_steamcmd_dir_from_state_for_target(state, app_handle, None)
}

/// Resolve the SteamCMD directory using AppState with target path awareness.
pub fn resolve_steamcmd_dir_from_state_for_target(
    state: &crate::AppState,
    app_handle: &tauri::AppHandle,
    target_install_path: Option<&std::path::Path>,
) -> Result<PathBuf, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    resolve_steamcmd_dir_for_target(&db, app_handle, target_install_path)
}
