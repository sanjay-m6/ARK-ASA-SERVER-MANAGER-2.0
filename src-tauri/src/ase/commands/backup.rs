use crate::ase::models::AseBackup;
use crate::AppState;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub async fn create_ase_backup(server_id: i64, state: State<'_, AppState>) -> Result<AseBackup, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let install_path: String = conn.query_row(
        "SELECT install_path FROM ase_servers WHERE id = ?1",
        [server_id], |row| row.get(0),
    ).map_err(|e| format!("Server not found: {}", e))?;

    let saved_dir = PathBuf::from(&install_path)
        .join("ShooterGame").join("Saved");
    let saved_arks = saved_dir.join("SavedArks");
    let config_dir = saved_dir.join("Config").join("WindowsServer");

    if !saved_arks.exists() {
        return Err("SavedArks directory not found — server may not have been started yet".to_string());
    }

    // Create backups directory
    let backup_base = PathBuf::from(&install_path).join("Backups");
    if !backup_base.exists() {
        std::fs::create_dir_all(&backup_base).map_err(|e| e.to_string())?;
    }

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let backup_name = format!("ase_backup_{}", timestamp);
    let backup_path = backup_base.join(&backup_name);
    std::fs::create_dir_all(&backup_path).map_err(|e| e.to_string())?;

    // Copy SavedArks
    let dest_arks = backup_path.join("SavedArks");
    copy_dir_recursive(&saved_arks, &dest_arks)?;

    // Copy config files
    if config_dir.exists() {
        let dest_config = backup_path.join("Config");
        std::fs::create_dir_all(&dest_config).map_err(|e| e.to_string())?;
        for entry in std::fs::read_dir(&config_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if entry.path().extension().map_or(false, |e| e == "ini") {
                std::fs::copy(entry.path(), dest_config.join(entry.file_name()))
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    // Calculate total size
    let size_bytes = dir_size(&backup_path);
    let backup_path_str = backup_path.to_string_lossy().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO ase_backups (server_id, path, size_bytes, created_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![server_id, backup_path_str, size_bytes as i64, now],
    ).map_err(|e| e.to_string())?;

    Ok(AseBackup {
        id: conn.last_insert_rowid(),
        server_id,
        path: backup_path_str,
        size_bytes,
        created_at: now,
    })
}

#[tauri::command]
pub async fn list_ase_backups(server_id: i64, state: State<'_, AppState>) -> Result<Vec<AseBackup>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, server_id, path, size_bytes, created_at FROM ase_backups WHERE server_id = ?1 ORDER BY created_at DESC"
    ).map_err(|e| e.to_string())?;

    let mut backups = Vec::new();
    let mut rows = stmt.query([server_id]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        backups.push(AseBackup {
            id: row.get(0).map_err(|e| e.to_string())?,
            server_id: row.get(1).map_err(|e| e.to_string())?,
            path: row.get(2).map_err(|e| e.to_string())?,
            size_bytes: row.get::<_, i64>(3).map_err(|e| e.to_string())? as u64,
            created_at: row.get(4).map_err(|e| e.to_string())?,
        });
    }
    Ok(backups)
}

#[tauri::command]
pub async fn restore_ase_backup(backup_id: i64, server_id: i64, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    // Check server is stopped
    let status: String = conn.query_row(
        "SELECT status FROM ase_servers WHERE id = ?1",
        [server_id], |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    if status != "stopped" {
        return Err("Server must be stopped before restoring a backup".to_string());
    }

    let (backup_path, install_path): (String, String) = conn.query_row(
        "SELECT b.path, s.install_path FROM ase_backups b JOIN ase_servers s ON b.server_id = s.id WHERE b.id = ?1",
        [backup_id], |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| format!("Backup not found: {}", e))?;

    let backup_dir = PathBuf::from(&backup_path);
    let saved_dir = PathBuf::from(&install_path).join("ShooterGame").join("Saved");

    // Restore SavedArks
    let src_arks = backup_dir.join("SavedArks");
    if src_arks.exists() {
        let dest_arks = saved_dir.join("SavedArks");
        if dest_arks.exists() {
            std::fs::remove_dir_all(&dest_arks).map_err(|e| e.to_string())?;
        }
        copy_dir_recursive(&src_arks, &dest_arks)?;
    }

    // Restore config
    let src_config = backup_dir.join("Config");
    if src_config.exists() {
        let dest_config = saved_dir.join("Config").join("WindowsServer");
        std::fs::create_dir_all(&dest_config).map_err(|e| e.to_string())?;
        for entry in std::fs::read_dir(&src_config).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            std::fs::copy(entry.path(), dest_config.join(entry.file_name()))
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_ase_backup(backup_id: i64, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let path: String = conn.query_row(
        "SELECT path FROM ase_backups WHERE id = ?1",
        [backup_id], |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let backup_dir = PathBuf::from(&path);
    if backup_dir.exists() {
        std::fs::remove_dir_all(&backup_dir).map_err(|e| e.to_string())?;
    }

    conn.execute("DELETE FROM ase_backups WHERE id = ?1", [backup_id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Recursively copy a directory
fn copy_dir_recursive(src: &PathBuf, dest: &PathBuf) -> Result<(), String> {
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let dest_path = dest.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir_recursive(&entry.path(), &dest_path)?;
        } else {
            std::fs::copy(entry.path(), &dest_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Calculate total size of a directory recursively
fn dir_size(path: &PathBuf) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                total += dir_size(&entry.path());
            } else if let Ok(meta) = entry.metadata() {
                total += meta.len();
            }
        }
    }
    total
}
