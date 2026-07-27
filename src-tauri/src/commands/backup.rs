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

    // For automated backups, skip if server is offline
    if backup_type.to_lowercase() == "auto" {
        let is_running = state.process_manager.is_running(server_id);
        let db_status = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            conn.query_row(
                "SELECT status FROM servers WHERE id = ?1",
                [server_id],
                |row| row.get::<_, String>(0),
            ).ok()
        };
        let is_online = is_running || matches!(db_status.as_deref().map(|s| s.to_lowercase()).as_deref(), Some("running" | "online" | "starting"));
        if !is_online {
            println!("  ⏭️ Auto backup skipped for server {}: Server is offline", server_id);
            return Err("Server is offline. Automated backup skipped.".to_string());
        }
    }

    // Get server info from database
    let (install_path, app_data_dir, server_name) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let (install_path, server_name): (String, String) = conn
            .query_row(
                "SELECT install_path, name FROM servers WHERE id = ?1",
                [server_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| format!("Server not found: {}", e))?;

        // Get app data dir for backups
        let app_data_dir = crate::platform::Platform::default_backup_dir();
        (install_path, app_data_dir, server_name)
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

    let backup_res = BackupService::create_backup(
        &PathBuf::from(&install_path),
        &backup_dir,
        server_id,
        backup_type_enum,
        &backup_options,
    );

    let mut backup = match backup_res {
        Ok(b) => b,
        Err(e) => {
            let app_handle = state.app_handle.clone();
            let name_clone = server_name.clone();
            let backup_type_str = backup_type.clone();
            let err_msg = e.clone();
            tauri::async_runtime::spawn(async move {
                crate::services::discord::send_discord_webhook(
                    &app_handle,
                    "backupCompletion",
                    crate::services::discord::DiscordEmbed::backup_completed(
                        &name_clone,
                        &backup_type_str,
                        &format!("Failed: {}", err_msg),
                        false,
                    ),
                ).await;
            });
            return Err(e);
        }
    };

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

    // Send Discord notification for backup completion
    let app_handle = state.app_handle.clone();
    let name_clone = server_name.clone();
    let size_bytes = backup.size;
    let backup_type_str = backup_type.clone();
    tauri::async_runtime::spawn(async move {
        // Human readable size
        let size_mb = size_bytes as f64 / 1024.0 / 1024.0;
        let size_str = if size_mb >= 1024.0 {
            format!("{:.2} GB", size_mb / 1024.0)
        } else {
            format!("{:.2} MB", size_mb)
        };

        crate::services::discord::send_discord_webhook(
            &app_handle,
            "backupCompletion",
            crate::services::discord::DiscordEmbed::backup_completed(
                &name_clone,
                &backup_type_str,
                &size_str,
                true,
            ),
        ).await;
    });

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
                        includes_saves, includes_cluster, verified, created_at, label, notes, is_protected, status, hash
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
                    label: row.get(11).ok(),
                    notes: row.get(12).ok(),
                    is_protected: row.get(13).unwrap_or(false),
                    status: row.get(14).unwrap_or_else(|_| "completed".to_string()),
                    hash: row.get(15).ok(),
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
    let (backup_path, install_path, server_id) = {
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

        (PathBuf::from(result.0), install_path, result.1)
    };

    let restore_options = options.unwrap_or_default();

    // Create a fast pre-restore backup
    let rollback_opts = BackupOptions {
        include_configs: restore_options.restore_configs,
        include_mods: false,
        include_saves: restore_options.restore_saves,
        include_cluster: false,
        compression_level: 1, // fast
    };
    
    // We create the rollback backup. If it fails, we still proceed to restore.
    println!("  Creating pre-restore rollback...");
    if let Ok(rollback) = create_backup(state.clone(), server_id, "manual".to_string(), Some(rollback_opts)).await {
        // Label it
        let _ = update_backup_label(state.clone(), rollback.id, Some("Pre-Restore Rollback".to_string())).await;
        let _ = toggle_backup_protection(state.clone(), rollback.id, true).await;
    }

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

/// Cleanup old backups, keeping quotas and protection in mind
#[tauri::command]
pub async fn cleanup_old_backups(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Vec<String>, String> {
    println!("🧹 Running intelligent cleanup for server {}", server_id);

    // Get policy
    let policy = get_backup_policy(state.clone(), server_id).await?;
    if !policy.enabled {
        println!("  Cleanup skipped (policy disabled)");
        return Ok(Vec::new());
    }

    let mut deleted_paths = Vec::new();

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    // 1. Get all unprotected backups
    let mut stmt = conn.prepare("SELECT id, file_path, size, created_at FROM backups WHERE server_id = ?1 AND is_protected = 0 ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    
    struct BackupMeta {
        id: i64,
        path: String,
        size: i64,
        created_at: String,
    }
    
    let mut unprotected: Vec<BackupMeta> = stmt.query_map([server_id], |row| {
        Ok(BackupMeta {
            id: row.get(0)?,
            path: row.get(1)?,
            size: row.get(2)?,
            created_at: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    // 2. Retention Count
    if unprotected.len() as i32 > policy.retention_count {
        let to_delete = unprotected.split_off(policy.retention_count as usize);
        for b in to_delete {
            if std::fs::remove_file(&b.path).is_ok() || !std::path::Path::new(&b.path).exists() {
                conn.execute("DELETE FROM backups WHERE id = ?1", [b.id]).ok();
                deleted_paths.push(b.path.clone());
            }
        }
    }

    // 3. Retention Days
    let now = chrono::Local::now();
    let mut i = 0;
    while i < unprotected.len() {
        if let Ok(created) = chrono::DateTime::parse_from_rfc3339(&unprotected[i].created_at) {
            let age_days = (now.signed_duration_since(created)).num_days();
            if age_days > policy.retention_days as i64 {
                let b = unprotected.remove(i);
                if std::fs::remove_file(&b.path).is_ok() || !std::path::Path::new(&b.path).exists() {
                    conn.execute("DELETE FROM backups WHERE id = ?1", [b.id]).ok();
                    deleted_paths.push(b.path);
                }
                continue;
            }
        }
        i += 1;
    }

    // 4. Storage Quota (GB)
    let quota_bytes = (policy.storage_quota_gb * 1024.0 * 1024.0 * 1024.0) as i64;
    let total_size: i64 = unprotected.iter().map(|b| b.size).sum();
    
    if total_size > quota_bytes {
        let mut current_size = total_size;
        // Delete oldest first (unprotected is sorted newest first, so reverse iterate)
        while current_size > quota_bytes && !unprotected.is_empty() {
            let b = unprotected.pop().unwrap(); // Remove oldest
            if std::fs::remove_file(&b.path).is_ok() || !std::path::Path::new(&b.path).exists() {
                conn.execute("DELETE FROM backups WHERE id = ?1", [b.id]).ok();
                deleted_paths.push(b.path);
                current_size -= b.size;
            }
        }
    }

    println!("  Deleted {} old backups", deleted_paths.len());
    Ok(deleted_paths)
}

use crate::models::BackupPolicy;

#[tauri::command]
pub async fn get_backup_policy(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<BackupPolicy, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let policy = conn.query_row(
        "SELECT enabled, interval_hours, retention_days, retention_count, storage_quota_gb, 
                backup_before_update, backup_before_restart, compression_enabled, 
                cloud_sync_enabled, discord_webhook 
         FROM backup_policies WHERE server_id = ?1",
        [server_id],
        |row| {
            Ok(BackupPolicy {
                server_id,
                enabled: row.get(0)?,
                interval_hours: row.get(1)?,
                retention_days: row.get(2)?,
                retention_count: row.get(3)?,
                storage_quota_gb: row.get(4)?,
                backup_before_update: row.get(5)?,
                backup_before_restart: row.get(6)?,
                compression_enabled: row.get(7)?,
                cloud_sync_enabled: row.get(8)?,
                discord_webhook: row.get(9)?,
            })
        },
    ).unwrap_or_else(|_| BackupPolicy {
        server_id,
        enabled: false,
        interval_hours: 24,
        retention_days: 7,
        retention_count: 10,
        storage_quota_gb: 50.0,
        backup_before_update: true,
        backup_before_restart: true,
        compression_enabled: true,
        cloud_sync_enabled: false,
        discord_webhook: None,
    });

    Ok(policy)
}

#[tauri::command]
pub async fn save_backup_policy(
    state: State<'_, AppState>,
    policy: BackupPolicy,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO backup_policies (
            server_id, enabled, interval_hours, retention_days, retention_count, storage_quota_gb,
            backup_before_update, backup_before_restart, compression_enabled, cloud_sync_enabled, discord_webhook
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT(server_id) DO UPDATE SET
            enabled=excluded.enabled, interval_hours=excluded.interval_hours, 
            retention_days=excluded.retention_days, retention_count=excluded.retention_count,
            storage_quota_gb=excluded.storage_quota_gb, backup_before_update=excluded.backup_before_update,
            backup_before_restart=excluded.backup_before_restart, compression_enabled=excluded.compression_enabled,
            cloud_sync_enabled=excluded.cloud_sync_enabled, discord_webhook=excluded.discord_webhook",
        rusqlite::params![
            policy.server_id, policy.enabled, policy.interval_hours, policy.retention_days,
            policy.retention_count, policy.storage_quota_gb, policy.backup_before_update,
            policy.backup_before_restart, policy.compression_enabled, policy.cloud_sync_enabled,
            policy.discord_webhook
        ]
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn update_backup_label(state: State<'_, AppState>, backup_id: i64, label: Option<String>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    conn.execute("UPDATE backups SET label = ?1 WHERE id = ?2", rusqlite::params![label, backup_id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_backup_notes(state: State<'_, AppState>, backup_id: i64, notes: Option<String>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    conn.execute("UPDATE backups SET notes = ?1 WHERE id = ?2", rusqlite::params![notes, backup_id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn toggle_backup_protection(state: State<'_, AppState>, backup_id: i64, is_protected: bool) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    conn.execute("UPDATE backups SET is_protected = ?1 WHERE id = ?2", rusqlite::params![is_protected, backup_id]).map_err(|e| e.to_string())?;
    Ok(())
}

