use crate::models::{Backup, BackupOptions, BackupPolicy, BackupType, RestoreOptions};
use crate::services::backup_service::BackupService;
use crate::AppState;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::State;

lazy_static::lazy_static! {
    static ref BACKUP_IN_PROGRESS: Arc<Mutex<HashSet<i64>>> = Arc::new(Mutex::new(HashSet::new()));
}

pub struct BackupLockGuard {
    server_id: i64,
}

impl BackupLockGuard {
    pub fn try_acquire(server_id: i64) -> Option<Self> {
        let mut set = BACKUP_IN_PROGRESS.lock().ok()?;
        if set.contains(&server_id) {
            None
        } else {
            set.insert(server_id);
            Some(Self { server_id })
        }
    }

    pub fn is_in_progress(server_id: i64) -> bool {
        if let Ok(set) = BACKUP_IN_PROGRESS.lock() {
            set.contains(&server_id)
        } else {
            false
        }
    }
}

impl Drop for BackupLockGuard {
    fn drop(&mut self) {
        if let Ok(mut set) = BACKUP_IN_PROGRESS.lock() {
            set.remove(&self.server_id);
        }
    }
}

pub fn parse_any_datetime(s: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    let trimmed = s.trim();
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(trimmed) {
        return Some(dt.with_timezone(&chrono::Utc));
    }
    if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S") {
        return Some(chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(naive, chrono::Utc));
    }
    if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%dT%H:%M:%S") {
        return Some(chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(naive, chrono::Utc));
    }
    None
}

/// Create a real backup of the server with atomic lock & retention policy enforcement
#[tauri::command]
pub async fn create_backup(
    state: State<'_, AppState>,
    server_id: i64,
    backup_type: String,
    options: Option<BackupOptions>,
) -> Result<Backup, String> {
    // 1. Concurrency Guard: Prevent overlapping/duplicate backups for the same server
    let _lock_guard = match BackupLockGuard::try_acquire(server_id) {
        Some(guard) => guard,
        None => {
            log::warn!("⚠️ Backup already in progress for server {}. Skipping duplicate trigger.", server_id);
            return Err("Backup already in progress for this server.".to_string());
        }
    };

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

    // Save backup to database & enforce retention policies immediately
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

        // Automatically enforce retention policies (Max Count, Expired Days, Disk Quota) per server
        if let Err(err) = enforce_retention_policy_conn(&conn, server_id) {
            log::error!("⚠️ Retention policy enforcement failed after backup for server {}: {}", server_id, err);
        }
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

/// Enforce retention policy per server:
/// 1. Delete backups older than retention_days
/// 2. Keep only N newest backups (retention_count / maxBackupCount)
/// 3. Enforce disk quota allocation in GB by deleting oldest backups until within limit
pub fn enforce_retention_policy_conn(conn: &rusqlite::Connection, server_id: i64) -> Result<Vec<String>, String> {
    log::info!("🧹 [RetentionEngine] Running policy enforcement for server {}", server_id);

    let policy = conn.query_row(
        "SELECT server_id, enabled, interval_hours, retention_days, retention_count, storage_quota_gb, 
                backup_before_update, backup_before_restart, compression_enabled, cloud_sync_enabled, discord_webhook 
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

    let mut deleted_paths = Vec::new();

    // Query all UNPROTECTED completed backups for this server, ordered newest -> oldest
    let mut stmt = conn.prepare(
        "SELECT id, file_path, size, created_at 
         FROM backups 
         WHERE server_id = ?1 AND is_protected = 0 AND (status = 'completed' OR status IS NULL)
         ORDER BY created_at DESC, id DESC"
    ).map_err(|e| e.to_string())?;

    struct BackupItem {
        id: i64,
        file_path: String,
        size: i64,
        created_at: String,
    }

    let mut items: Vec<BackupItem> = stmt.query_map([server_id], |row| {
        Ok(BackupItem {
            id: row.get(0)?,
            file_path: row.get(1)?,
            size: row.get(2)?,
            created_at: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let now_utc = chrono::Utc::now();
    let retention_days = policy.retention_days as i64;
    let quota_bytes = (policy.storage_quota_gb.max(1.0) * 1024.0 * 1024.0 * 1024.0) as i64;

    // 1. RETENTION DURATION (Days)
    if retention_days > 0 {
        let mut idx = 0;
        while idx < items.len() {
            let created_dt = parse_any_datetime(&items[idx].created_at);
            let should_expire = if let Some(created) = created_dt {
                let age_days = (now_utc - created).num_days();
                age_days >= retention_days
            } else {
                false
            };

            if should_expire {
                let item = items.remove(idx);
                log::info!("[Retention] Server {}: Deleting expired backup ID {} path {} (Reason: RETENTION_EXPIRED)", server_id, item.id, item.file_path);
                delete_backup_record_and_file(conn, item.id, &item.file_path);
                deleted_paths.push(item.file_path);
                continue;
            }
            idx += 1;
        }
    }

    // 2. MAX BACKUP COUNT (per server)
    if policy.retention_count > 0 {
        let max_count = policy.retention_count as usize;
        if items.len() > max_count {
            let to_delete: Vec<BackupItem> = items.drain(max_count..).collect();
            for item in to_delete {
                log::info!("[Retention] Server {}: Deleting excess backup ID {} path {} (Reason: MAX_COUNT)", server_id, item.id, item.file_path);
                delete_backup_record_and_file(conn, item.id, &item.file_path);
                deleted_paths.push(item.file_path);
            }
        }
    }

    // 3. DISK QUOTA ALLOCATION (per server)
    let mut total_size_bytes: i64 = items.iter().map(|item| {
        let p = std::path::Path::new(&item.file_path);
        if p.exists() {
            std::fs::metadata(p).map(|m| m.len() as i64).unwrap_or(item.size)
        } else {
            item.size
        }
    }).sum();

    if total_size_bytes > quota_bytes {
        log::warn!("[Retention] Server {}: Storage ({:.2} GB) exceeds quota ({:.2} GB). Trimming oldest backups...", 
            server_id, total_size_bytes as f64 / 1024.0 / 1024.0 / 1024.0, policy.storage_quota_gb);

        while total_size_bytes > quota_bytes && !items.is_empty() {
            let item = items.pop().unwrap(); // Delete oldest remaining item
            let actual_size = std::path::Path::new(&item.file_path)
                .metadata()
                .map(|m| m.len() as i64)
                .unwrap_or(item.size);

            log::info!("[Retention] Server {}: Deleting quota-exceeding backup ID {} path {} (Reason: DISK_QUOTA)", server_id, item.id, item.file_path);
            delete_backup_record_and_file(conn, item.id, &item.file_path);
            deleted_paths.push(item.file_path);
            total_size_bytes = (total_size_bytes - actual_size).max(0);
        }
    }

    log::info!("🧹 [RetentionEngine] Cleaned {} backups for server {}", deleted_paths.len(), server_id);
    Ok(deleted_paths)
}

fn delete_backup_record_and_file(conn: &rusqlite::Connection, id: i64, file_path: &str) {
    let path = std::path::Path::new(file_path);
    if path.exists() {
        let _ = std::fs::remove_file(path);
    }
    let _ = conn.execute("DELETE FROM backups WHERE id = ?1", [id]);
}

/// Cleanup old backups, keeping quotas, max count, retention days, and protection in mind
#[tauri::command]
pub async fn cleanup_old_backups(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Vec<String>, String> {
    println!("🧹 Running manual retention cleanup for server {}", server_id);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let deleted = enforce_retention_policy_conn(&conn, server_id)?;
    println!("  Deleted {} old backups", deleted.len());
    Ok(deleted)
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
            .map_err(|_| format!("Backup record #{} not found in database", backup_id))?;

        let install_path: String = conn
            .query_row(
                "SELECT install_path FROM servers WHERE id = ?1",
                [result.1],
                |row| row.get(0),
            )
            .map_err(|_| format!("Server #{} not found", result.1))?;

        (PathBuf::from(result.0), install_path, result.1)
    };

    // Check if server is running before attempting restore
    if state.process_manager.is_running(server_id) {
        return Err("Cannot restore backup while server is running. Please stop the server first.".to_string());
    }

    // Check if backup archive file exists on disk
    if !backup_path.exists() {
        return Err(format!("Backup archive file not found on disk at: {}", backup_path.to_string_lossy()));
    }

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
        let _ = update_backup_label(state.clone(), rollback.id, Some("Pre-Restore Rollback".to_string())).await;
        let _ = toggle_backup_protection(state.clone(), rollback.id, true).await;
    }

    BackupService::restore_backup(
        &backup_path,
        &PathBuf::from(&install_path),
        &restore_options,
    )?;

    println!("  ✅ Backup restored successfully");
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

