use crate::models::{Backup, BackupOptions, BackupType, RestoreOptions};
use crate::services::backup_service::BackupService;
use crate::AppState;
use std::path::PathBuf;
use tauri::State;

/// Create a real backup of the server
#[tauri::command]
pub async fn create_backup(
    state: State<'_, AppState>,
    server_id: i64,
    backup_type: String,
    options: Option<BackupOptions>,
) -> Result<Backup, String> {
    println!(
        "💾 Creating {} backup for server {}",
        backup_type, server_id
    );

    // Get server info from database
    let (install_path, app_data_dir) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let install_path: String = conn
            .query_row(
                "SELECT install_path FROM servers WHERE id = ?1",
                [server_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Server not found: {}", e))?;

        // Get app data dir for backups
        let app_data_dir = PathBuf::from("C:/ASA_Backups");
        (install_path, app_data_dir)
    };

    let backup_type_enum = match backup_type.as_str() {
        "auto" => BackupType::Auto,
        "manual" => BackupType::Manual,
        "pre-update" => BackupType::PreUpdate,
        "pre-restart" => BackupType::PreRestart,
        _ => return Err("Invalid backup type".to_string()),
    };

    let backup_options = options.unwrap_or_default();
    let backup_dir = BackupService::get_backup_dir(&app_data_dir, server_id);

    let mut backup = BackupService::create_backup(
        &PathBuf::from(&install_path),
        &backup_dir,
        server_id,
        backup_type_enum,
        &backup_options,
    )?;

    // Save backup to database
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO backups (server_id, backup_type, file_path, size, includes_configs, includes_mods, includes_saves, includes_cluster, verified, created_at) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                backup.server_id,
                backup.backup_type.to_string(),
                backup.file_path.to_string_lossy().to_string(),
                backup.size,
                backup.includes_configs,
                backup.includes_mods,
                backup.includes_saves,
                backup.includes_cluster,
                backup.verified,
                backup.created_at,
            ],
        )
        .map_err(|e| e.to_string())?;

        backup.id = conn.last_insert_rowid();
    }

    println!("  ✅ Backup created: ID {}", backup.id);
    Ok(backup)
}

/// Get all backups for a server from the database
#[tauri::command]
pub async fn get_backups(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Vec<Backup>, String> {
    println!("📋 Getting backups for server {}", server_id);

    let backups: Vec<Backup> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT id, server_id, backup_type, file_path, size, includes_configs, includes_mods, 
                        includes_saves, includes_cluster, verified, created_at 
                 FROM backups WHERE server_id = ?1 ORDER BY created_at DESC",
            )
            .map_err(|e| e.to_string())?;

        let backup_iter = stmt
            .query_map([server_id], |row| {
                let backup_type_str: String = row.get(2)?;
                let backup_type = match backup_type_str.as_str() {
                    "auto" => BackupType::Auto,
                    "manual" => BackupType::Manual,
                    "pre-update" => BackupType::PreUpdate,
                    "pre-restart" => BackupType::PreRestart,
                    _ => BackupType::Manual,
                };

                Ok(Backup {
                    id: row.get(0)?,
                    server_id: row.get(1)?,
                    backup_type,
                    file_path: PathBuf::from(row.get::<_, String>(3)?),
                    size: row.get(4)?,
                    includes_configs: row.get(5)?,
                    includes_mods: row.get(6)?,
                    includes_saves: row.get(7)?,
                    includes_cluster: row.get(8)?,
                    verified: row.get(9)?,
                    created_at: row.get(10)?,
                })
            })
            .map_err(|e| e.to_string())?;

        backup_iter.filter_map(|b| b.ok()).collect::<Vec<Backup>>()
    };

    println!("  Found {} backups", backups.len());
    Ok(backups)
}

/// Restore a backup
#[tauri::command]
pub async fn restore_backup(
    state: State<'_, AppState>,
    backup_id: i64,
    options: Option<RestoreOptions>,
) -> Result<(), String> {
    println!("🔄 Restoring backup {}", backup_id);

    // Get backup and server info from database
    let (backup_path, install_path) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let result: (String, i64) = conn
            .query_row(
                "SELECT file_path, server_id FROM backups WHERE id = ?1",
                [backup_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| format!("Backup not found: {}", e))?;

        let install_path: String = conn
            .query_row(
                "SELECT install_path FROM servers WHERE id = ?1",
                [result.1],
                |row| row.get(0),
            )
            .map_err(|e| format!("Server not found: {}", e))?;

        (PathBuf::from(result.0), install_path)
    };

    let restore_options = options.unwrap_or_default();

    BackupService::restore_backup(
        &backup_path,
        &PathBuf::from(&install_path),
        &restore_options,
    )?;

    println!("  ✅ Backup restored");
    Ok(())
}

/// Delete a backup
#[tauri::command]
pub async fn delete_backup(state: State<'_, AppState>, backup_id: i64) -> Result<(), String> {
    println!("🗑️ Deleting backup {}", backup_id);

    // Get backup file path and delete from filesystem
    let file_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let path: String = conn
            .query_row(
                "SELECT file_path FROM backups WHERE id = ?1",
                [backup_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Backup not found: {}", e))?;

        path
    };

    // Delete file
    if let Err(e) = std::fs::remove_file(&file_path) {
        println!("  ⚠️ Could not delete backup file: {}", e);
    }

    // Delete from database
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.execute("DELETE FROM backups WHERE id = ?1", [backup_id])
            .map_err(|e| e.to_string())?;
    }

    println!("  ✅ Backup deleted");
    Ok(())
}

/// Verify backup integrity
#[tauri::command]
pub async fn verify_backup(state: State<'_, AppState>, backup_id: i64) -> Result<bool, String> {
    println!("🔍 Verifying backup {}", backup_id);

    let file_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let path: String = conn
            .query_row(
                "SELECT file_path FROM backups WHERE id = ?1",
                [backup_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Backup not found: {}", e))?;

        PathBuf::from(path)
    };

    let is_valid = BackupService::verify_backup(&file_path)?;

    // Update verified status in database
    if is_valid {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.execute("UPDATE backups SET verified = 1 WHERE id = ?1", [backup_id])
            .map_err(|e| e.to_string())?;
    }

    println!("  ✅ Backup verified: {}", is_valid);
    Ok(is_valid)
}

/// Get backup contents preview
#[tauri::command]
pub async fn get_backup_contents(
    state: State<'_, AppState>,
    backup_id: i64,
) -> Result<Vec<String>, String> {
    println!("📂 Getting backup contents for {}", backup_id);

    let file_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let path: String = conn
            .query_row(
                "SELECT file_path FROM backups WHERE id = ?1",
                [backup_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Backup not found: {}", e))?;

        PathBuf::from(path)
    };

    let contents = BackupService::get_backup_contents(&file_path)?;

    println!("  Found {} files in backup", contents.len());
    Ok(contents)
}

/// Cleanup old backups, keeping only the most recent N
#[tauri::command]
pub async fn cleanup_old_backups(
    _state: State<'_, AppState>,
    server_id: i64,
    keep_count: usize,
) -> Result<Vec<String>, String> {
    println!(
        "🧹 Cleaning up old backups for server {}, keeping {}",
        server_id, keep_count
    );

    let backup_dir = BackupService::get_backup_dir(&PathBuf::from("C:/ASA_Backups"), server_id);
    let deleted = BackupService::cleanup_old_backups(&backup_dir, server_id, keep_count)?;

    let deleted_paths: Vec<String> = deleted
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();

    println!("  Deleted {} old backups", deleted_paths.len());
    Ok(deleted_paths)
}
