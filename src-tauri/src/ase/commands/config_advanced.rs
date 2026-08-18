use std::path::PathBuf;
use tauri::State;
use crate::AppState;
use crate::ase::ini_parser::IniData;
use std::fs;
use chrono::Utc;
use walkdir::WalkDir;
use zip::write::FileOptions;
use std::fs::File;

fn get_config_dir(install_path: &str) -> PathBuf {
    PathBuf::from(install_path)
        .join("ShooterGame")
        .join("Saved")
        .join("Config")
        .join("WindowsServer")
}

#[tauri::command]
pub async fn read_ase_ini(server_id: i64, filename: String, state: State<'_, AppState>) -> Result<IniData, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let install_path: String = conn
        .query_row(
            "SELECT install_path FROM ase_servers WHERE id = ?1",
            [server_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Server not found: {}", e))?;

    let config_dir = get_config_dir(&install_path);
    let target_file = config_dir.join(&filename);

    if !target_file.exists() {
        return Ok(IniData::new());
    }

    let content = crate::services::ini_parser::IniParser::read_file_to_string(&target_file)
        .map_err(|e| format!("Failed to read {}: {}", filename, e))?;

    Ok(IniData::parse(&content))
}

#[tauri::command]
pub async fn write_ase_ini(server_id: i64, filename: String, data: IniData, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let install_path: String = conn
        .query_row(
            "SELECT install_path FROM ase_servers WHERE id = ?1",
            [server_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Server not found: {}", e))?;

    let config_dir = get_config_dir(&install_path);
    
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    let target_file = config_dir.join(&filename);
    let content = data.serialize();

    fs::write(&target_file, content)
        .map_err(|e| format!("Failed to write {}: {}", filename, e))?;

    Ok(())
}

#[tauri::command]
pub async fn read_ase_ini_raw(server_id: i64, filename: String, state: State<'_, AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let install_path: String = conn
        .query_row(
            "SELECT install_path FROM ase_servers WHERE id = ?1",
            [server_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Server not found: {}", e))?;

    let config_dir = get_config_dir(&install_path);
    let target_file = config_dir.join(&filename);

    if !target_file.exists() {
        return Ok(String::new());
    }

    let content = crate::services::ini_parser::IniParser::read_file_to_string(&target_file)
        .map_err(|e| format!("Failed to read {}: {}", filename, e))?;

    Ok(content)
}

#[tauri::command]
pub async fn write_ase_ini_raw(server_id: i64, filename: String, content: String, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let install_path: String = conn
        .query_row(
            "SELECT install_path FROM ase_servers WHERE id = ?1",
            [server_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Server not found: {}", e))?;

    let config_dir = get_config_dir(&install_path);
    
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    let target_file = config_dir.join(&filename);

    fs::write(&target_file, content)
        .map_err(|e| format!("Failed to write {}: {}", filename, e))?;

    Ok(())
}

#[tauri::command]
pub async fn create_ase_config_backup(server_id: i64, state: State<'_, AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let install_path: String = conn
        .query_row(
            "SELECT install_path FROM ase_servers WHERE id = ?1",
            [server_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Server not found: {}", e))?;

    let config_dir = get_config_dir(&install_path);
    if !config_dir.exists() {
        return Err("Config directory does not exist".to_string());
    }

    let backup_dir = PathBuf::from(&install_path).join("ShooterGame").join("Saved").join("ConfigBackups");
    if !backup_dir.exists() {
        fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
    }

    let timestamp = Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let backup_filename = format!("ConfigBackup_{}.zip", timestamp);
    let backup_path = backup_dir.join(&backup_filename);

    let file = File::create(&backup_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = FileOptions::<()>::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o755);

    for entry in WalkDir::new(&config_dir) {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        
        let name = path.strip_prefix(&config_dir)
            .map_err(|e| e.to_string())?
            .to_str()
            .unwrap()
            .to_string();

        if path.is_file() {
            #[allow(deprecated)]
            zip.start_file(name, options).map_err(|e| e.to_string())?;
            let mut f = File::open(path).map_err(|e| e.to_string())?;
            std::io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;
        }
    }
    
    zip.finish().map_err(|e| e.to_string())?;

    Ok(backup_filename)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigBackupInfo {
    pub filename: String,
    pub size_bytes: u64,
    pub created_at: String,
}

#[tauri::command]
pub async fn list_ase_config_backups(server_id: i64, state: State<'_, AppState>) -> Result<Vec<ConfigBackupInfo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let install_path: String = conn
        .query_row(
            "SELECT install_path FROM ase_servers WHERE id = ?1",
            [server_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Server not found: {}", e))?;

    let backup_dir = PathBuf::from(&install_path).join("ShooterGame").join("Saved").join("ConfigBackups");
    if !backup_dir.exists() {
        return Ok(Vec::new());
    }

    let mut backups = Vec::new();
    if let Ok(entries) = fs::read_dir(backup_dir) {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_file() && entry.path().extension().unwrap_or_default() == "zip" {
                    let filename = entry.file_name().to_string_lossy().to_string();
                    let size_bytes = metadata.len();
                    
                    let created_at = if let Ok(time) = metadata.modified() {
                        let datetime: chrono::DateTime<chrono::Utc> = time.into();
                        datetime.to_rfc3339()
                    } else {
                        String::new()
                    };

                    backups.push(ConfigBackupInfo {
                        filename,
                        size_bytes,
                        created_at,
                    });
                }
            }
        }
    }

    // Sort by newest first
    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(backups)
}

#[tauri::command]
pub async fn restore_ase_config_backup(server_id: i64, filename: String, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let install_path: String = conn
        .query_row(
            "SELECT install_path FROM ase_servers WHERE id = ?1",
            [server_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Server not found: {}", e))?;

    let backup_dir = PathBuf::from(&install_path).join("ShooterGame").join("Saved").join("ConfigBackups");
    let backup_file = backup_dir.join(&filename);

    if !backup_file.exists() {
        return Err(format!("Backup file not found: {}", filename));
    }

    let config_dir = get_config_dir(&install_path);
    if config_dir.exists() {
        fs::remove_dir_all(&config_dir).map_err(|e| format!("Failed to clean current config dir: {}", e))?;
    }
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;

    let file = File::open(&backup_file).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = match file.enclosed_name() {
            Some(path) => config_dir.join(path),
            None => continue,
        };

        if file.name().ends_with('/') {
            fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p).map_err(|e| e.to_string())?;
                }
            }
            let mut outfile = File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}
