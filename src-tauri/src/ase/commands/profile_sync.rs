use crate::AppState;
use std::path::PathBuf;
use std::fs;
use tauri::State;
use serde::Serialize;

#[derive(Serialize)]
pub struct AseProfileInfo {
    pub file_name: String,
    pub file_size: u64,
    pub last_modified: String,
    pub file_type: String, // "profile" or "tribe"
}

#[tauri::command]
pub async fn list_ase_profiles(
    server_id: i64,
    state: State<'_, AppState>
) -> Result<Vec<AseProfileInfo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let install_path: String = conn.query_row(
        "SELECT install_path FROM ase_servers WHERE id = ?1",
        [server_id],
        |row| row.get(0),
    ).map_err(|e| format!("Server not found: {}", e))?;

    let saved_arks = PathBuf::from(&install_path)
        .join("ShooterGame")
        .join("Saved")
        .join("SavedArks");

    if !saved_arks.exists() {
        return Ok(vec![]);
    }

    let mut profiles = Vec::new();
    let entries = fs::read_dir(saved_arks).map_err(|e| e.to_string())?;

    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            if path.is_file() {
                let extension = path.extension().and_then(|ext| ext.to_str()).unwrap_or("");
                let file_type = match extension {
                    "arkprofile" => "profile",
                    "arktribe" => "tribe",
                    _ => continue,
                };

                let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                let metadata = entry.metadata().map_err(|e| e.to_string())?;
                let file_size = metadata.len();
                
                let last_modified = metadata.modified()
                    .ok()
                    .and_then(|t| {
                        let datetime: chrono::DateTime<chrono::Local> = t.into();
                        Some(datetime.to_rfc3339())
                    })
                    .unwrap_or_default();

                profiles.push(AseProfileInfo {
                    file_name,
                    file_size,
                    last_modified,
                    file_type: file_type.to_string(),
                });
            }
        }
    }

    // Sort by last modified descending so active players are at the top
    profiles.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));

    Ok(profiles)
}

#[tauri::command]
pub async fn copy_ase_profiles(
    source_server_id: i64,
    target_server_id: i64,
    file_names: Vec<String>,
    state: State<'_, AppState>
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let source_path: String = conn.query_row(
        "SELECT install_path FROM ase_servers WHERE id = ?1",
        [source_server_id],
        |row| row.get(0),
    ).map_err(|e| format!("Source server not found: {}", e))?;

    let target_path: String = conn.query_row(
        "SELECT install_path FROM ase_servers WHERE id = ?1",
        [target_server_id],
        |row| row.get(0),
    ).map_err(|e| format!("Target server not found: {}", e))?;

    let source_arks = PathBuf::from(&source_path)
        .join("ShooterGame")
        .join("Saved")
        .join("SavedArks");

    let target_arks = PathBuf::from(&target_path)
        .join("ShooterGame")
        .join("Saved")
        .join("SavedArks");

    if !source_arks.exists() {
        return Err("Source SavedArks directory does not exist".to_string());
    }

    if !target_arks.exists() {
        fs::create_dir_all(&target_arks).map_err(|e| e.to_string())?;
    }

    for file_name in file_names {
        // Simple sanitization to prevent path traversal
        let file_name = PathBuf::from(file_name).file_name().unwrap_or_default().to_os_string();
        let src_file = source_arks.join(&file_name);
        let dest_file = target_arks.join(&file_name);

        if src_file.exists() && src_file.is_file() {
            fs::copy(&src_file, &dest_file).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn sync_ase_lists(
    source_server_id: i64,
    target_server_ids: Vec<i64>,
    sync_whitelist: bool,
    sync_admins: bool,
    sync_bans: bool,
    state: State<'_, AppState>
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let source_path: String = conn.query_row(
        "SELECT install_path FROM ase_servers WHERE id = ?1",
        [source_server_id],
        |row| row.get(0),
    ).map_err(|e| format!("Source server not found: {}", e))?;

    let source_saved = PathBuf::from(&source_path)
        .join("ShooterGame")
        .join("Saved");

    let files_to_sync = {
        let mut list = Vec::new();
        if sync_whitelist {
            list.push("PlayersExclusiveJoinList.txt");
        }
        if sync_admins {
            list.push("AllowedCheaterSteamIDs.txt");
        }
        if sync_bans {
            list.push("BanList.txt");
        }
        list
    };

    for target_id in target_server_ids {
        let target_path: String = conn.query_row(
            "SELECT install_path FROM ase_servers WHERE id = ?1",
            [target_id],
            |row| row.get(0),
        ).map_err(|e| format!("Target server not found: {}", e))?;

        let target_saved = PathBuf::from(&target_path)
            .join("ShooterGame")
            .join("Saved");

        if !target_saved.exists() {
            fs::create_dir_all(&target_saved).map_err(|e| e.to_string())?;
        }

        for file_name in &files_to_sync {
            let src_file = source_saved.join(file_name);
            let dest_file = target_saved.join(file_name);

            if src_file.exists() && src_file.is_file() {
                fs::copy(&src_file, &dest_file).map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(())
}
