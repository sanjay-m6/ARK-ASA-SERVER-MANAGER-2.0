use crate::services::config_generator::{ConfigGenerator, MapProfile, ServerConfig};
use crate::services::ini_parser::IniParser;
use crate::AppState;
use chrono::Local;
use std::fs;
use std::path::PathBuf;
use tauri::State;

/// Helper to get server install path from database
fn get_server_install_path(state: &State<'_, AppState>, server_id: i64) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT install_path FROM servers WHERE id = ?1",
        [server_id],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

/// Get config file path
fn get_config_path(install_path: &str, config_type: &str) -> PathBuf {
    PathBuf::from(install_path)
        .join("ShooterGame/Saved/Config/WindowsServer")
        .join(format!("{}.ini", config_type))
}

/// Get backup directory path
fn get_backup_dir(install_path: &str) -> PathBuf {
    PathBuf::from(install_path).join("ShooterGame/Saved/Config/WindowsServer/Backups")
}

#[tauri::command]
pub async fn read_config(
    state: State<'_, AppState>,
    server_id: i64,
    config_type: String,
) -> Result<String, String> {
    let install_path = get_server_install_path(&state, server_id)?;
    let path = get_config_path(&install_path, &config_type);

    if path.exists() {
        println!("📖 Reading config from: {:?}", path);
        fs::read_to_string(path).map_err(|e| e.to_string())
    } else {
        // Return default/empty config if file doesn't exist
        Ok(String::new())
    }
}

#[tauri::command]
pub async fn save_config(
    state: State<'_, AppState>,
    server_id: i64,
    config_type: String,
    content: String,
) -> Result<(), String> {
    let install_path = get_server_install_path(&state, server_id)?;

    let dir_path = PathBuf::from(&install_path).join("ShooterGame/Saved/Config/WindowsServer");

    fs::create_dir_all(&dir_path).map_err(|e| e.to_string())?;

    let file_path = dir_path.join(format!("{}.ini", config_type));

    // Use merge strategy to preserve existing keys (like per-level stats)
    let final_content = if file_path.exists() {
        let existing_content = fs::read_to_string(&file_path).unwrap_or_default();
        if !existing_content.is_empty() {
            // Merge: existing keys are preserved, new content takes precedence on conflicts
            println!("  🔄 Merging INI config (preserving existing keys)...");
            IniParser::merge(&existing_content, &content)
        } else {
            content.clone()
        }
    } else {
        content.clone()
    };

    fs::write(&file_path, &final_content).map_err(|e| e.to_string())?;
    println!("  ✅ Saved {} to {:?}", config_type, file_path);

    // If we're saving GameUserSettings.ini, we need to sync critical values to the database
    // because the start_server command reads from the DB, not the INI files
    if config_type == "GameUserSettings" {
        let mut session_name: Option<String> = None;
        let mut map_name: Option<String> = None;
        let mut max_players: Option<i32> = None;
        let mut server_password: Option<String> = None;
        let mut admin_password: Option<String> = None;
        let mut rcon_enabled: Option<bool> = None;
        let mut rcon_port: Option<u16> = None;
        let mut game_port: Option<u16> = None;
        let mut query_port: Option<u16> = None;

        let mut current_section = String::new();

        for line in content.lines() {
            let line = line.trim();

            // Section header
            if line.starts_with('[') && line.ends_with(']') {
                current_section = line[1..line.len() - 1].to_string();
                continue;
            }

            // Key=Value pair
            if let Some((key, value)) = line.split_once('=') {
                let key = key.trim();
                let raw_value = value.trim();

                // Remove surrounding quotes if present
                let value = if raw_value.starts_with('"')
                    && raw_value.ends_with('"')
                    && raw_value.len() >= 2
                {
                    &raw_value[1..raw_value.len() - 1]
                } else {
                    raw_value
                };

                if current_section == "ServerSettings"
                    || current_section == "/Script/ShooterGame.ShooterGameMode"
                {
                    match key {
                        "SessionName" | "ServerName" => session_name = Some(value.to_string()),
                        "MapName" => map_name = Some(value.to_string()),
                        "MaxPlayers" => max_players = value.parse().ok(),
                        "ServerPassword" => server_password = Some(value.to_string()),
                        "ServerAdminPassword" => admin_password = Some(value.to_string()),
                        "RCONEnabled" => rcon_enabled = Some(value.to_uppercase() == "TRUE"),
                        "RCONPort" => rcon_port = value.parse().ok(),
                        _ => {}
                    }
                }

                if current_section == "URL" || current_section == "/Script/Engine.GameSession" {
                    match key {
                        "Port" => game_port = value.parse().ok(),
                        "QueryPort" => query_port = value.parse().ok(),
                        _ => {}
                    }
                }
            }
        }

        // Perform the update
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let mut query = "UPDATE servers SET ".to_string();
        let mut updates = Vec::new();
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(v) = session_name {
            updates.push("session_name = ?");
            params.push(Box::new(v));
        }
        if let Some(v) = map_name {
            updates.push("map_name = ?");
            params.push(Box::new(v));
        }
        if let Some(v) = max_players {
            updates.push("max_players = ?");
            params.push(Box::new(v));
        }
        // Handle password specially - empty string means remove it (set to null in DB context usually, but here we might wrap)
        // But for strings we usually just overwrite.
        if let Some(v) = server_password {
            updates.push("server_password = ?");
            if v.is_empty() {
                params.push(Box::new(None::<String>));
            } else {
                params.push(Box::new(Some(v)));
            }
        }
        if let Some(v) = admin_password {
            updates.push("admin_password = ?");
            params.push(Box::new(v));
        }
        if let Some(v) = rcon_enabled {
            updates.push("rcon_enabled = ?");
            params.push(Box::new(v));
        }
        if let Some(v) = rcon_port {
            updates.push("rcon_port = ?");
            params.push(Box::new(v));
        }
        if let Some(v) = game_port {
            updates.push("game_port = ?");
            params.push(Box::new(v));
        }
        if let Some(v) = query_port {
            updates.push("query_port = ?");
            params.push(Box::new(v));
        }

        if !updates.is_empty() {
            query.push_str(&updates.join(", "));
            query.push_str(" WHERE id = ?");
            params.push(Box::new(server_id));

            let params_refs: Vec<&dyn rusqlite::ToSql> =
                params.iter().map(|p| p.as_ref()).collect();

            conn.execute(&query, params_refs.as_slice())
                .map_err(|e| format!("Failed to update database: {}", e))?;

            println!(
                "✅ Synced settings from INI to Database for server {}",
                server_id
            );
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn backup_config(
    state: State<'_, AppState>,
    server_id: i64,
    config_type: String,
) -> Result<String, String> {
    let install_path = get_server_install_path(&state, server_id)?;
    let config_path = get_config_path(&install_path, &config_type);

    if !config_path.exists() {
        return Ok("No config file to backup".to_string());
    }

    let backup_dir = get_backup_dir(&install_path);
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

    // Create timestamped backup filename
    let timestamp = Local::now().format("%Y%m%d_%H%M%S");
    let backup_filename = format!("{}_{}.ini.bak", config_type, timestamp);
    let backup_path = backup_dir.join(&backup_filename);

    fs::copy(&config_path, &backup_path).map_err(|e| e.to_string())?;

    println!("📦 Created backup: {:?}", backup_path);
    Ok(backup_filename)
}

#[tauri::command]
pub async fn restore_config(
    state: State<'_, AppState>,
    server_id: i64,
    config_type: String,
    backup_filename: String,
) -> Result<(), String> {
    let install_path = get_server_install_path(&state, server_id)?;
    let backup_dir = get_backup_dir(&install_path);
    let backup_path = backup_dir.join(&backup_filename);

    if !backup_path.exists() {
        return Err(format!("Backup file not found: {}", backup_filename));
    }

    let config_path = get_config_path(&install_path, &config_type);

    fs::copy(&backup_path, &config_path).map_err(|e| e.to_string())?;

    println!("🔄 Restored config from: {:?}", backup_path);
    Ok(())
}

#[tauri::command]
pub async fn list_config_backups(
    state: State<'_, AppState>,
    server_id: i64,
    config_type: String,
) -> Result<Vec<String>, String> {
    let install_path = get_server_install_path(&state, server_id)?;
    let backup_dir = get_backup_dir(&install_path);

    if !backup_dir.exists() {
        return Ok(vec![]);
    }

    let prefix = format!("{}_", config_type);
    let mut backups: Vec<String> = fs::read_dir(&backup_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(&prefix) && name.ends_with(".ini.bak") {
                Some(name)
            } else {
                None
            }
        })
        .collect();

    // Sort by newest first
    backups.sort();
    backups.reverse();

    Ok(backups)
}

// ===============================================
// Config Generator Commands
// ===============================================

/// Get all available map profiles with recommended settings
#[tauri::command]
pub async fn get_map_profiles() -> Result<Vec<MapProfile>, String> {
    Ok(ConfigGenerator::get_map_profiles())
}

/// Get profile for a specific map
#[tauri::command]
pub async fn get_map_profile(map_id: String) -> Result<Option<MapProfile>, String> {
    Ok(ConfigGenerator::get_profile_for_map(&map_id))
}

/// Generate GameUserSettings.ini content preview
#[tauri::command]
pub async fn preview_game_user_settings(config: ServerConfig) -> Result<String, String> {
    Ok(ConfigGenerator::generate_game_user_settings(&config))
}

/// Generate Game.ini content preview
#[tauri::command]
pub async fn preview_game_ini(config: ServerConfig) -> Result<String, String> {
    Ok(ConfigGenerator::generate_game_ini(&config))
}

/// Generate startup command for server
#[tauri::command]
pub async fn generate_startup_command(
    config: ServerConfig,
    install_path: String,
) -> Result<String, String> {
    let path = PathBuf::from(install_path);
    Ok(ConfigGenerator::generate_startup_command(&config, &path))
}

/// Apply map profile to server config and return updated config
#[tauri::command]
pub async fn apply_map_profile_to_config(
    mut config: ServerConfig,
    map_id: String,
) -> Result<ServerConfig, String> {
    if let Some(profile) = ConfigGenerator::get_profile_for_map(&map_id) {
        ConfigGenerator::apply_map_profile(&mut config, &profile);
        config.map_name = map_id;
    }
    Ok(config)
}

/// Write config files to server directory
#[tauri::command]
pub async fn write_server_configs(
    state: State<'_, AppState>,
    server_id: i64,
    install_path: String,
    config: ServerConfig,
    backup: bool,
) -> Result<(), String> {
    let path = PathBuf::from(install_path);
    ConfigGenerator::write_configs(&path, &config, backup)?;

    // Sync config values to database so UI reflects the changes
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE servers SET max_players = ?1, map_name = ?2, session_name = ?3, 
         game_port = ?4, query_port = ?5, rcon_port = ?6, admin_password = ?7,
         server_password = ?8, rcon_enabled = ?9 WHERE id = ?10",
        rusqlite::params![
            config.max_players,
            config.map_name,
            config.session_name,
            config.game_port,
            config.query_port,
            config.rcon_port,
            config.admin_password,
            config.server_password,
            config.rcon_enabled,
            server_id,
        ],
    )
    .map_err(|e| e.to_string())?;

    println!(
        "✅ Config saved and synced to database for server {}",
        server_id
    );
    Ok(())
}

/// Backup all config files for a server
#[tauri::command]
pub async fn backup_all_configs(
    _state: State<'_, AppState>,
    install_path: String,
) -> Result<String, String> {
    let path = PathBuf::from(install_path);
    let backup_path = ConfigGenerator::backup_configs(&path)?;
    Ok(backup_path.to_string_lossy().to_string())
}

/// Get default server config
#[tauri::command]
pub async fn get_default_config() -> Result<ServerConfig, String> {
    Ok(ServerConfig::default())
}
