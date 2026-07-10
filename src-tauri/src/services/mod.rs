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
pub mod cloud_backup_service;
pub mod mod_watchdog;
pub mod mod_validator;
pub mod workshop_metadata;
pub mod autosave;
pub mod server_organization;
pub mod system_analyzer;

pub mod ase_discord_bridge;
pub mod combat_metrics_server;

use std::path::PathBuf;

/// Check if a path contains non-ASCII characters that SteamCMD cannot handle.
pub fn has_non_ascii_chars(path: &str) -> bool {
    path.chars().any(|c| !c.is_ascii())
}

/// Resolve the SteamCMD directory, checking the DB `custom_steamcmd_path` setting first.
/// Falls back to `<app_data_dir>/steamcmd` if no custom path is configured.
pub fn resolve_steamcmd_dir(
    db: &crate::db::Database,
    app_handle: &tauri::AppHandle,
) -> Result<PathBuf, String> {
    if let Ok(Some(custom_path)) = db.get_setting("custom_steamcmd_path") {
        let trimmed = custom_path.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed));
        }
    }

    // Default: app_data_dir/steamcmd
    use tauri::Manager;
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    Ok(app_dir.join("steamcmd"))
}

/// Resolve the SteamCMD directory using AppState (convenience wrapper).
pub fn resolve_steamcmd_dir_from_state(
    state: &crate::AppState,
    app_handle: &tauri::AppHandle,
) -> Result<PathBuf, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    resolve_steamcmd_dir(&db, app_handle)
}
