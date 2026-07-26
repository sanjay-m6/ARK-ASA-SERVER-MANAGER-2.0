// RCON Commands for ASA Server Manager
// Exposes RCON functionality to the frontend

use crate::models::{RconPlayer, RconResponse};
use crate::services::rcon::RconService;
use tauri::State;

pub struct RconState(pub RconService);

/// Connect to a server's RCON
#[tauri::command]
pub async fn rcon_connect(
    state: State<'_, RconState>,
    server_id: i64,
    address: String,
    port: u16,
    password: String,
) -> Result<RconResponse, String> {
    let service = &state.inner().0;
    // Sanitize any corrupted ?ServerPassword= suffixes from the database
    let clean_password = password
        .split("?ServerPassword=")
        .next()
        .unwrap_or(&password)
        .to_string();
    service
        .connect(server_id, &address, port, &clean_password)
        .await
}

/// Disconnect from a server's RCON
#[tauri::command]
pub async fn rcon_disconnect(
    state: State<'_, RconState>,
    server_id: i64,
) -> Result<RconResponse, String> {
    let service = &state.inner().0;
    service.disconnect(server_id).await
}

/// Send a raw RCON command
#[tauri::command]
pub async fn rcon_send_command(
    app: tauri::AppHandle,
    state: State<'_, RconState>,
    server_id: i64,
    command: String,
) -> Result<RconResponse, String> {
    if command.trim().eq_ignore_ascii_case("DoExit") {
        use tauri::Manager;
        if let Some(guardian) = app.try_state::<crate::services::guardian::GuardianState>() {
            let guard = guardian.0.lock().await;
            guard.mark_as_stopping(server_id).await;
        }
        if let Some(state) = app.try_state::<crate::AppState>() {
            state.process_manager.set_pending_stop_reason(server_id, crate::services::process_manager::StopReason::UserAction);
        }
    }
    let service = &state.inner().0;
    service.send_command(server_id, &command).await
}

/// Get list of online players
#[tauri::command]
pub async fn rcon_get_players(
    state: State<'_, RconState>,
    server_id: i64,
) -> Result<Vec<RconPlayer>, String> {
    let service = &state.inner().0;
    service.get_players(server_id).await
}

/// Broadcast a message to all players
#[tauri::command]
pub async fn rcon_broadcast(
    state: State<'_, RconState>,
    server_id: i64,
    message: String,
) -> Result<RconResponse, String> {
    let service = &state.inner().0;
    service.broadcast(server_id, &message).await
}

/// Kick a player from the server
#[tauri::command]
pub async fn rcon_kick_player(
    state: State<'_, RconState>,
    server_id: i64,
    steam_id: String,
    reason: Option<String>,
) -> Result<RconResponse, String> {
    let service = &state.inner().0;
    service
        .kick_player(server_id, &steam_id, reason.as_deref())
        .await
}

/// Ban a player from the server
#[tauri::command]
pub async fn rcon_ban_player(
    state: State<'_, RconState>,
    server_id: i64,
    steam_id: String,
) -> Result<RconResponse, String> {
    let service = &state.inner().0;
    service.ban_player(server_id, &steam_id).await
}

/// Unban a player
#[tauri::command]
pub async fn rcon_unban_player(
    state: State<'_, RconState>,
    server_id: i64,
    steam_id: String,
) -> Result<RconResponse, String> {
    let service = &state.inner().0;
    service.unban_player(server_id, &steam_id).await
}

/// Save the world
#[tauri::command]
pub async fn rcon_save_world(
    state: State<'_, RconState>,
    server_id: i64,
) -> Result<RconResponse, String> {
    let service = &state.inner().0;
    service.save_world(server_id).await
}

/// Destroy all wild dinos
#[tauri::command]
pub async fn rcon_destroy_wild_dinos(
    state: State<'_, RconState>,
    server_id: i64,
) -> Result<RconResponse, String> {
    let service = &state.inner().0;
    service.destroy_wild_dinos(server_id).await
}

/// Set the time of day
#[tauri::command]
pub async fn rcon_set_time(
    state: State<'_, RconState>,
    server_id: i64,
    hour: u8,
    minute: u8,
) -> Result<RconResponse, String> {
    let service = &state.inner().0;
    service.set_time(server_id, hour, minute).await
}

/// Send a private message to a player
#[tauri::command]
pub async fn rcon_message_player(
    state: State<'_, RconState>,
    server_id: i64,
    steam_id: String,
    message: String,
) -> Result<RconResponse, String> {
    let service = &state.inner().0;
    service.message_player(server_id, &steam_id, &message).await
}

/// Check if RCON is connected to a server
#[tauri::command]
pub async fn rcon_is_connected(
    state: State<'_, RconState>,
    server_id: i64,
) -> Result<bool, String> {
    let service = &state.inner().0;
    Ok(service.is_connected(server_id).await)
}

#[tauri::command]
pub async fn start_log_stream(
    state: State<'_, crate::AppState>,
    server_id: i64,
) -> Result<(), String> {
    // 1. Ensure log watcher is watching the server's logs
    let needs_watch = !state.log_watcher.is_watching(server_id);

    if needs_watch {
        let install_path: String = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            conn.query_row(
                "SELECT install_path FROM servers WHERE id = ?1",
                [server_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to find server install path in DB: {}", e))?
        };
        
        let has_mods = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            conn.query_row(
                "SELECT COUNT(*) FROM mods WHERE server_id = ?1 AND enabled = 1",
                [server_id],
                |row| row.get::<_, i64>(0)
            ).map(|count| count > 0).unwrap_or(false)
        };

        let _ = state.log_watcher.start_watching(server_id, std::path::PathBuf::from(install_path), has_mods);
    }

    state.log_watcher.enable_streaming(server_id);
    Ok(())
}

#[tauri::command]
pub async fn stop_log_stream(
    state: State<'_, crate::AppState>,
    server_id: i64,
) -> Result<(), String> {
    state.log_watcher.disable_streaming(server_id);
    Ok(())
}

#[tauri::command]
pub async fn rcon_execute_cluster_command(
    state: State<'_, RconState>,
    server_ids: Vec<i64>,
    command: String,
) -> Result<std::collections::HashMap<i64, RconResponse>, String> {
    let service = &state.inner().0;
    let mut futures = Vec::new();
    for id in server_ids {
        let cmd = command.clone();
        futures.push(async move {
            let res = service.send_command(id, &cmd).await;
            (id, res)
        });
    }
    let results = futures_util::future::join_all(futures).await;
    let mut map = std::collections::HashMap::new();
    for (id, res) in results {
        match res {
            Ok(resp) => {
                map.insert(id, resp);
            }
            Err(e) => {
                map.insert(id, RconResponse {
                    success: false,
                    message: format!("Error: {}", e),
                    data: None,
                });
            }
        }
    }
    Ok(map)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveValidationInfo {
    pub last_modified: String,
    pub file_size: u64,
    pub file_name: String,
    pub exists: bool,
}

#[tauri::command]
pub async fn rcon_validate_save(
    state: State<'_, crate::AppState>,
    server_id: i64,
) -> Result<SaveValidationInfo, String> {
    let db = state
        .db
        .lock()
        .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
    let conn = db
        .get_connection()
        .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

    // Query server details
    let (install_path_str, _map_name): (String, String) = conn
        .query_row(
            "SELECT install_path, map_name FROM servers WHERE id = ?1",
            [server_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Server not found: {}", e))?;

    let install_path = std::path::PathBuf::from(install_path_str);
    
    // Construct SavedArks directory
    let saved_arks = install_path.join("ShooterGame/Saved/SavedArks");
    
    if !saved_arks.exists() {
        return Ok(SaveValidationInfo {
            last_modified: "".to_string(),
            file_size: 0,
            file_name: "".to_string(),
            exists: false,
        });
    }

    // Look for the .ark files in SavedArks directory
    let mut latest_file: Option<(std::time::SystemTime, u64, String)> = None;

    if let Ok(entries) = std::fs::read_dir(saved_arks) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("ark") {
                if let Ok(metadata) = std::fs::metadata(&path) {
                    if let Ok(modified) = metadata.modified() {
                        let size = metadata.len();
                        let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
                        if let Some((best_time, _, _)) = latest_file {
                            if modified > best_time {
                                latest_file = Some((modified, size, name));
                            }
                        } else {
                            latest_file = Some((modified, size, name));
                        }
                    }
                }
            }
        }
    }

    if let Some((modified, size, name)) = latest_file {
        let datetime: chrono::DateTime<chrono::Utc> = modified.into();
        Ok(SaveValidationInfo {
            last_modified: datetime.to_rfc3339(),
            file_size: size,
            file_name: name,
            exists: true,
        })
    } else {
        Ok(SaveValidationInfo {
            last_modified: "".to_string(),
            file_size: 0,
            file_name: "".to_string(),
            exists: false,
        })
    }
}

/// Automatically resolve SteamID/EOS/Platform IDs of players to their internal 9-digit UE4 Player IDs by parsing their .arkprofile save files.
#[tauri::command]
pub async fn rcon_resolve_player_ids(
    state: State<'_, crate::AppState>,
    server_id: i64,
    platform_ids: Vec<String>,
) -> Result<std::collections::HashMap<String, u64>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let install_path_str: String = if server_id > 0 {
        conn.query_row(
            "SELECT install_path FROM servers WHERE id = ?1",
            [server_id],
            |row| row.get(0),
        ).map_err(|e| format!("ASA Server not found: {}", e))?
    } else {
        conn.query_row(
            "SELECT install_path FROM ase_servers WHERE id = ?1",
            [-server_id],
            |row| row.get(0),
        ).map_err(|e| format!("ASE Server not found: {}", e))?
    };

    let saved_arks = std::path::PathBuf::from(&install_path_str)
        .join("ShooterGame")
        .join("Saved")
        .join("SavedArks");

    let mut resolved = std::collections::HashMap::new();

    if !saved_arks.exists() {
        return Ok(resolved);
    }

    if platform_ids.is_empty() {
        // Scan all .arkprofile files in the folder
        if let Ok(entries) = std::fs::read_dir(saved_arks) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("arkprofile") {
                    if let Some(file_stem) = path.file_stem().and_then(|s| s.to_str()) {
                        let platform_id = file_stem.to_string();
                        if let Ok(data) = std::fs::read(&path) {
                            if let Some(player_id) = parse_player_id_from_bytes(&data) {
                                resolved.insert(platform_id, player_id);
                            }
                        }
                    }
                }
            }
        }
    } else {
        // Scan only the requested platform_ids
        for platform_id in platform_ids {
            if platform_id.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-') {
                let profile_file = saved_arks.join(format!("{}.arkprofile", platform_id));
                if profile_file.exists() && profile_file.is_file() {
                    if let Ok(data) = std::fs::read(&profile_file) {
                        if let Some(player_id) = parse_player_id_from_bytes(&data) {
                            resolved.insert(platform_id, player_id);
                        }
                    }
                }
            }
        }
    }

    Ok(resolved)
}

/// Helper function to extract PlayerDataID (the internal UE4 Player ID) from binary data of .arkprofile
fn parse_player_id_from_bytes(data: &[u8]) -> Option<u64> {
    let pattern_name = b"PlayerDataID";
    let pos_name = data.windows(pattern_name.len()).position(|w| w == pattern_name)?;
    
    let search_slice = &data[pos_name..];
    let pattern_type = b"UInt64Property";
    
    if let Some(pos_type_offset) = search_slice.windows(pattern_type.len()).position(|w| w == pattern_type) {
        let pos_type = pos_name + pos_type_offset;
        let type_end = pos_type + pattern_type.len();
        
        // Find the null terminator of "UInt64Property"
        let mut null_pos = type_end;
        while null_pos < data.len() && data[null_pos] != 0 {
            null_pos += 1;
        }
        let after_null = null_pos + 1;
        
        if after_null + 8 + 4 + 1 + 8 <= data.len() {
            let value_size = i64::from_le_bytes(data[after_null..after_null+8].try_into().unwrap());
            if value_size == 8 {
                let id_bytes = data[after_null + 8 + 4 + 1..after_null + 8 + 4 + 1 + 8].try_into().ok()?;
                return Some(u64::from_le_bytes(id_bytes));
            }
        }
    }
    
    // Fallback check for "Int64Property"
    let pattern_type_alt = b"Int64Property";
    if let Some(pos_type_offset) = search_slice.windows(pattern_type_alt.len()).position(|w| w == pattern_type_alt) {
        let pos_type = pos_name + pos_type_offset;
        let type_end = pos_type + pattern_type_alt.len();
        
        let mut null_pos = type_end;
        while null_pos < data.len() && data[null_pos] != 0 {
            null_pos += 1;
        }
        let after_null = null_pos + 1;
        
        if after_null + 8 + 4 + 1 + 8 <= data.len() {
            let value_size = i64::from_le_bytes(data[after_null..after_null+8].try_into().unwrap());
            if value_size == 8 {
                let id_bytes = data[after_null + 8 + 4 + 1..after_null + 8 + 4 + 1 + 8].try_into().ok()?;
                return Some(u64::from_le_bytes(id_bytes));
            }
        }
    }

    None
}

