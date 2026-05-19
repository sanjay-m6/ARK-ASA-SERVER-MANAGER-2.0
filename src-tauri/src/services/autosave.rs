#![allow(dead_code)]
// Auto-Save Management Service
// Core business logic for save browsing, restoration, validation, and management

use rusqlite::{Connection, params};
use std::fs;
use std::path::Path;
use chrono::Utc;

use crate::models::autosave::*;

pub struct AutoSaveService;

impl AutoSaveService {
    // ========================================================================
    // Auto-Save CRUD Operations
    // ========================================================================

    pub fn register_auto_save(
        conn: &Connection,
        req: &AutoSaveRequest,
    ) -> Result<AutoSave, String> {
        let now = Utc::now().to_rfc3339();
        
        conn.execute(
            "INSERT INTO auto_saves (
                server_id, file_name, file_path, file_size, created_at,
                player_count, uptime_seconds, server_version, mod_count, map_name,
                indexed_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                req.server_id, &req.file_name, &req.file_path, req.file_size, &now,
                req.player_count, req.uptime_seconds, &req.server_version, req.mod_count,
                &req.map_name, &now, &now
            ],
        )
        .map_err(|e| format!("Failed to register auto-save: {}", e))?;

        let id = conn.last_insert_rowid();
        Self::get_auto_save(conn, id)
    }

    pub fn get_auto_save(conn: &Connection, id: i64) -> Result<AutoSave, String> {
        conn.query_row(
            "SELECT id, server_id, file_name, file_path, file_size, checksum,
                    created_at, save_timestamp, is_valid, is_corrupted, corruption_reason,
                    player_count, uptime_seconds, server_version, mod_count, map_name,
                    is_protected, custom_label, notes, is_favorite, folder_id,
                    created_by, indexed_at, updated_at
             FROM auto_saves WHERE id = ?",
            [id],
            |row| {
                Ok(AutoSave {
                    id: row.get(0)?,
                    server_id: row.get(1)?,
                    file_name: row.get(2)?,
                    file_path: row.get(3)?,
                    file_size: row.get(4)?,
                    checksum: row.get(5)?,
                    created_at: row.get(6)?,
                    save_timestamp: row.get(7)?,
                    is_valid: row.get::<_, i32>(8)? != 0,
                    is_corrupted: row.get::<_, i32>(9)? != 0,
                    corruption_reason: row.get(10)?,
                    player_count: row.get(11)?,
                    uptime_seconds: row.get(12)?,
                    server_version: row.get(13)?,
                    mod_count: row.get(14)?,
                    map_name: row.get(15)?,
                    is_protected: row.get::<_, i32>(16)? != 0,
                    custom_label: row.get(17)?,
                    notes: row.get(18)?,
                    is_favorite: row.get::<_, i32>(19)? != 0,
                    folder_id: row.get(20)?,
                    created_by: row.get(21)?,
                    indexed_at: row.get(22)?,
                    updated_at: row.get(23)?,
                })
            },
        )
        .map_err(|e| format!("Failed to get auto-save: {}", e))
    }

    pub fn list_saves_for_server(
        conn: &Connection,
        server_id: i64,
        limit: i32,
        offset: i32,
    ) -> Result<Vec<AutoSave>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, server_id, file_name, file_path, file_size, checksum,
                        created_at, save_timestamp, is_valid, is_corrupted, corruption_reason,
                        player_count, uptime_seconds, server_version, mod_count, map_name,
                        is_protected, custom_label, notes, is_favorite, folder_id,
                        created_by, indexed_at, updated_at
                 FROM auto_saves WHERE server_id = ? ORDER BY created_at DESC
                 LIMIT ? OFFSET ?",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let saves = stmt
            .query_map(params![server_id, limit, offset], |row| {
                Ok(AutoSave {
                    id: row.get(0)?,
                    server_id: row.get(1)?,
                    file_name: row.get(2)?,
                    file_path: row.get(3)?,
                    file_size: row.get(4)?,
                    checksum: row.get(5)?,
                    created_at: row.get(6)?,
                    save_timestamp: row.get(7)?,
                    is_valid: row.get::<_, i32>(8)? != 0,
                    is_corrupted: row.get::<_, i32>(9)? != 0,
                    corruption_reason: row.get(10)?,
                    player_count: row.get(11)?,
                    uptime_seconds: row.get(12)?,
                    server_version: row.get(13)?,
                    mod_count: row.get(14)?,
                    map_name: row.get(15)?,
                    is_protected: row.get::<_, i32>(16)? != 0,
                    custom_label: row.get(17)?,
                    notes: row.get(18)?,
                    is_favorite: row.get::<_, i32>(19)? != 0,
                    folder_id: row.get(20)?,
                    created_by: row.get(21)?,
                    indexed_at: row.get(22)?,
                    updated_at: row.get(23)?,
                })
            })
            .map_err(|e| format!("Failed to query saves: {}", e))?
            .collect::<Result<Vec<_>, rusqlite::Error>>()
            .map_err(|e| format!("Failed to collect saves: {}", e))?;

        Ok(saves)
    }

    pub fn search_saves(
        conn: &Connection,
        filter: &SaveSearchFilter,
    ) -> Result<Vec<AutoSave>, String> {
        let mut query = "SELECT id, server_id, file_name, file_path, file_size, checksum,
                                created_at, save_timestamp, is_valid, is_corrupted, corruption_reason,
                                player_count, uptime_seconds, server_version, mod_count, map_name,
                                is_protected, custom_label, notes, is_favorite, folder_id,
                                created_by, indexed_at, updated_at
                         FROM auto_saves WHERE 1=1".to_string();
        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(server_id) = filter.server_id {
            query.push_str(" AND server_id = ?");
            params_vec.push(Box::new(server_id));
        }

        if let Some(search) = &filter.search_query {
            query.push_str(" AND (file_name LIKE ? OR custom_label LIKE ? OR notes LIKE ?)");
            let pattern = format!("%{}%", search);
            params_vec.push(Box::new(pattern.clone()));
            params_vec.push(Box::new(pattern.clone()));
            params_vec.push(Box::new(pattern));
        }

        if let Some(status_filters) = &filter.status {
            let mut status_query = String::new();
            for status in status_filters {
                match status.as_str() {
                    "corrupted" => status_query.push_str(" OR is_corrupted = 1"),
                    "protected" => status_query.push_str(" OR is_protected = 1"),
                    "favorite" => status_query.push_str(" OR is_favorite = 1"),
                    "valid" => status_query.push_str(" OR (is_valid = 1 AND is_corrupted = 0)"),
                    _ => {}
                }
            }
            if !status_query.is_empty() {
                query.push_str(&format!(" AND ({})", &status_query[4..]));
            }
        }

        let mut stmt = conn
            .prepare(&query)
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter()
            .map(|b| b.as_ref() as &dyn rusqlite::ToSql)
            .collect();

        let saves = stmt
            .query_map(&params_refs[..], |row| {
                Ok(AutoSave {
                    id: row.get(0)?,
                    server_id: row.get(1)?,
                    file_name: row.get(2)?,
                    file_path: row.get(3)?,
                    file_size: row.get(4)?,
                    checksum: row.get(5)?,
                    created_at: row.get(6)?,
                    save_timestamp: row.get(7)?,
                    is_valid: row.get::<_, i32>(8)? != 0,
                    is_corrupted: row.get::<_, i32>(9)? != 0,
                    corruption_reason: row.get(10)?,
                    player_count: row.get(11)?,
                    uptime_seconds: row.get(12)?,
                    server_version: row.get(13)?,
                    mod_count: row.get(14)?,
                    map_name: row.get(15)?,
                    is_protected: row.get::<_, i32>(16)? != 0,
                    custom_label: row.get(17)?,
                    notes: row.get(18)?,
                    is_favorite: row.get::<_, i32>(19)? != 0,
                    folder_id: row.get(20)?,
                    created_by: row.get(21)?,
                    indexed_at: row.get(22)?,
                    updated_at: row.get(23)?,
                })
            })
            .map_err(|e| format!("Failed to query saves: {}", e))?
            .collect::<Result<Vec<_>, rusqlite::Error>>()
            .map_err(|e| format!("Failed to collect saves: {}", e))?;

        Ok(saves)
    }

    pub fn update_save_label(
        conn: &Connection,
        save_id: i64,
        label: &str,
    ) -> Result<(), String> {
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE auto_saves SET custom_label = ?, updated_at = ? WHERE id = ?",
            params![label, &now, save_id],
        )
        .map_err(|e| format!("Failed to update save label: {}", e))?;
        Ok(())
    }

    pub fn update_save_notes(
        conn: &Connection,
        save_id: i64,
        notes: &str,
    ) -> Result<(), String> {
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE auto_saves SET notes = ?, updated_at = ? WHERE id = ?",
            params![notes, &now, save_id],
        )
        .map_err(|e| format!("Failed to update save notes: {}", e))?;
        Ok(())
    }

    // ========================================================================
    // Save Protection and Favorites
    // ========================================================================

    pub fn toggle_save_protection(
        conn: &Connection,
        save_id: i64,
        is_protected: bool,
    ) -> Result<(), String> {
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE auto_saves SET is_protected = ?, updated_at = ? WHERE id = ?",
            params![is_protected as i32, &now, save_id],
        )
        .map_err(|e| format!("Failed to toggle protection: {}", e))?;
        Ok(())
    }

    pub fn toggle_favorite(
        conn: &Connection,
        save_id: i64,
        is_favorite: bool,
    ) -> Result<(), String> {
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE auto_saves SET is_favorite = ?, updated_at = ? WHERE id = ?",
            params![is_favorite as i32, &now, save_id],
        )
        .map_err(|e| format!("Failed to toggle favorite: {}", e))?;
        Ok(())
    }

    pub fn move_save_to_folder(
        conn: &Connection,
        save_id: i64,
        folder_id: Option<i64>,
    ) -> Result<(), String> {
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE auto_saves SET folder_id = ?, updated_at = ? WHERE id = ?",
            params![folder_id, &now, save_id],
        )
        .map_err(|e| format!("Failed to move save: {}", e))?;
        Ok(())
    }

    // ========================================================================
    // Save Validation
    // ========================================================================

    pub fn validate_save_file(
        conn: &Connection,
        save_id: i64,
        file_path: &str,
    ) -> Result<SaveValidationResult, String> {
        let path = Path::new(file_path);
        
        let mut result = SaveValidationResult {
            is_valid: true,
            is_corrupted: false,
            corruption_reason: None,
            warnings: Vec::new(),
            errors: Vec::new(),
            file_size_ok: false,
            checksum_ok: None,
            compatible: true,
        };

        // Check file existence
        if !path.exists() {
            result.is_valid = false;
            result.is_corrupted = true;
            result.corruption_reason = Some("File does not exist".to_string());
            result.errors.push("Save file not found on disk".to_string());
        }

        // Check file size
        if let Ok(metadata) = fs::metadata(file_path) {
            result.file_size_ok = metadata.len() > 0;
            if metadata.len() == 0 {
                result.is_valid = false;
                result.errors.push("Save file is empty".to_string());
            }
        }

        // Log validation
        let now = Utc::now().to_rfc3339();
        let details = serde_json::json!({
            "errors": result.errors,
            "warnings": result.warnings,
        });
        
        conn.execute(
            "INSERT INTO save_validation_logs (auto_save_id, check_type, check_status, details, checked_at)
             VALUES (?, ?, ?, ?, ?)",
            params![save_id, "integrity", if result.is_valid { "passed" } else { "failed" },
                    details.to_string(), &now],
        )
        .map_err(|e| format!("Failed to log validation: {}", e))?;

        // Update save status
        if !result.is_valid {
            conn.execute(
                "UPDATE auto_saves SET is_corrupted = ?, corruption_reason = ?, updated_at = ? WHERE id = ?",
                params![1, result.corruption_reason.as_ref().unwrap_or(&"Unknown".to_string()),
                        &now, save_id],
            )
            .map_err(|e| format!("Failed to update save status: {}", e))?;
        }

        Ok(result)
    }

    pub fn get_validation_logs(
        conn: &Connection,
        save_id: i64,
    ) -> Result<Vec<SaveValidationLog>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, auto_save_id, check_type, check_status, details, checked_at
                 FROM save_validation_logs WHERE auto_save_id = ?
                 ORDER BY checked_at DESC",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let logs = stmt
            .query_map([save_id], |row| {
                Ok(SaveValidationLog {
                    id: row.get(0)?,
                    auto_save_id: row.get(1)?,
                    check_type: row.get(2)?,
                    check_status: row.get(3)?,
                    details: serde_json::from_str(&row.get::<_, String>(4)?)
                        .unwrap_or_default(),
                    checked_at: row.get(5)?,
                })
            })
            .map_err(|e| format!("Failed to query logs: {}", e))?
            .collect::<Result<Vec<_>, rusqlite::Error>>()
            .map_err(|e| format!("Failed to collect logs: {}", e))?;

        Ok(logs)
    }

    // ========================================================================
    // Save Restoration
    // ========================================================================

    pub fn create_restore_backup(
        conn: &Connection,
        server_id: i64,
        restore_history_id: i64,
        backup_path: &str,
    ) -> Result<SaveBackupSnapshot, String> {
        let now = Utc::now().to_rfc3339();
        let file_size = fs::metadata(backup_path)
            .ok()
            .map(|m| m.len() as i64)
            .unwrap_or(0);

        conn.execute(
            "INSERT INTO save_backup_snapshots (server_id, restore_history_id, backup_path, backup_size, created_at)
             VALUES (?, ?, ?, ?, ?)",
            params![server_id, restore_history_id, backup_path, file_size, &now],
        )
        .map_err(|e| format!("Failed to create backup snapshot: {}", e))?;

        let id = conn.last_insert_rowid();
        Ok(SaveBackupSnapshot {
            id,
            server_id,
            restore_history_id: Some(restore_history_id),
            backup_path: backup_path.to_string(),
            backup_size: file_size,
            created_at: now,
            is_valid: true,
        })
    }

    pub fn log_restore_history(
        conn: &Connection,
        server_id: i64,
        to_save_id: i64,
        from_save_id: Option<i64>,
        restore_method: &str,
        restored_by: Option<&str>,
    ) -> Result<SaveRestoreHistory, String> {
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO save_restore_history (server_id, from_save_id, to_save_id, restored_at, restored_by, restore_method)
             VALUES (?, ?, ?, ?, ?, ?)",
            params![server_id, from_save_id, to_save_id, &now, restored_by, restore_method],
        )
        .map_err(|e| format!("Failed to log restore: {}", e))?;

        let id = conn.last_insert_rowid();
        Ok(SaveRestoreHistory {
            id,
            server_id,
            from_save_id,
            to_save_id,
            restored_at: now,
            restored_by: restored_by.map(|s| s.to_string()),
            restore_duration_seconds: None,
            restore_method: restore_method.to_string(),
            success: true,
            error_message: None,
            notes: None,
        })
    }

    pub fn get_restore_history(
        conn: &Connection,
        server_id: i64,
        limit: i32,
    ) -> Result<Vec<SaveRestoreHistory>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, server_id, from_save_id, to_save_id, restored_at, restored_by,
                        restore_duration_seconds, restore_method, success, error_message, notes
                 FROM save_restore_history WHERE server_id = ?
                 ORDER BY restored_at DESC LIMIT ?",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let history = stmt
            .query_map(params![server_id, limit], |row| {
                Ok(SaveRestoreHistory {
                    id: row.get(0)?,
                    server_id: row.get(1)?,
                    from_save_id: row.get(2)?,
                    to_save_id: row.get(3)?,
                    restored_at: row.get(4)?,
                    restored_by: row.get(5)?,
                    restore_duration_seconds: row.get(6)?,
                    restore_method: row.get(7)?,
                    success: row.get::<_, i32>(8)? != 0,
                    error_message: row.get(9)?,
                    notes: row.get(10)?,
                })
            })
            .map_err(|e| format!("Failed to query history: {}", e))?
            .collect::<Result<Vec<_>, rusqlite::Error>>()
            .map_err(|e| format!("Failed to collect history: {}", e))?;

        Ok(history)
    }

    // ========================================================================
    // Timeline System
    // ========================================================================

    pub fn create_timeline_event(
        conn: &Connection,
        server_id: i64,
        event_type: &str,
        description: &str,
        save_id: Option<i64>,
        restore_history_id: Option<i64>,
        importance_level: &str,
    ) -> Result<TimelineEvent, String> {
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO save_timeline_events 
             (server_id, event_type, description, auto_save_id, restore_history_id, event_time, importance_level, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            params![server_id, event_type, description, save_id, restore_history_id, &now, importance_level, &now],
        )
        .map_err(|e| format!("Failed to create timeline event: {}", e))?;

        let id = conn.last_insert_rowid();
        Ok(TimelineEvent {
            id,
            server_id,
            event_type: event_type.to_string(),
            auto_save_id: save_id,
            restore_history_id,
            event_time: now.clone(),
            description: description.to_string(),
            metadata: Default::default(),
            importance_level: importance_level.to_string(),
            created_at: now,
        })
    }

    pub fn get_timeline_events(
        conn: &Connection,
        server_id: i64,
        limit: i32,
    ) -> Result<TimelineResponse, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, server_id, event_type, auto_save_id, restore_history_id, event_time,
                        description, metadata, importance_level, created_at
                 FROM save_timeline_events WHERE server_id = ?
                 ORDER BY event_time DESC LIMIT ?",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let events = stmt
            .query_map(params![server_id, limit], |row| {
                Ok(TimelineEvent {
                    id: row.get(0)?,
                    server_id: row.get(1)?,
                    event_type: row.get(2)?,
                    auto_save_id: row.get(3)?,
                    restore_history_id: row.get(4)?,
                    event_time: row.get(5)?,
                    description: row.get(6)?,
                    metadata: serde_json::from_str(&row.get::<_, String>(7)?)
                        .unwrap_or_default(),
                    importance_level: row.get(8)?,
                    created_at: row.get(9)?,
                })
            })
            .map_err(|e| format!("Failed to query events: {}", e))?
            .collect::<Result<Vec<_>, rusqlite::Error>>()
            .map_err(|e| format!("Failed to collect events: {}", e))?;

        let total_events = events.len() as i32;
        Ok(TimelineResponse {
            events,
            total_events,
            server_id,
        })
    }

    // ========================================================================
    // Save Statistics
    // ========================================================================

    pub fn get_save_statistics(
        conn: &Connection,
        server_id: i64,
    ) -> Result<SaveStatistics, String> {
        let (total_saves, protected_saves, corrupted_saves, total_storage): (i32, i32, i32, i64) = conn
            .query_row(
                "SELECT COUNT(*), SUM(CASE WHEN is_protected = 1 THEN 1 ELSE 0 END),
                        SUM(CASE WHEN is_corrupted = 1 THEN 1 ELSE 0 END),
                        SUM(file_size)
                 FROM auto_saves WHERE server_id = ?",
                [server_id],
                |row| {
                    Ok((
                        row.get::<_, i32>(0).unwrap_or(0),
                        row.get::<_, i32>(1).unwrap_or(0),
                        row.get::<_, i32>(2).unwrap_or(0),
                        row.get::<_, i64>(3).unwrap_or(0),
                    ))
                },
            )
            .map_err(|e| format!("Failed to get counts: {}", e))?;

        let (oldest, newest): (Option<String>, Option<String>) = conn
            .query_row(
                "SELECT MIN(created_at), MAX(created_at) FROM auto_saves WHERE server_id = ?",
                [server_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| format!("Failed to get dates: {}", e))?;

        let (restore_count, last_restore): (i32, Option<String>) = conn
            .query_row(
                "SELECT COUNT(*), MAX(restored_at) FROM save_restore_history WHERE server_id = ?",
                [server_id],
                |row| Ok((row.get::<_, i32>(0).unwrap_or(0), row.get(1)?)),
            )
            .map_err(|e| format!("Failed to get restores: {}", e))?;

        let favorite_count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM auto_saves WHERE server_id = ? AND is_favorite = 1",
                [server_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let average_size = if total_saves > 0 {
            total_storage / total_saves as i64
        } else {
            0
        };

        Ok(SaveStatistics {
            server_id,
            total_saves,
            protected_saves,
            corrupted_saves,
            total_storage_used: total_storage,
            oldest_save_date: oldest,
            newest_save_date: newest,
            average_save_size: average_size,
            total_restores: restore_count,
            last_restore_date: last_restore,
            favorite_count,
        })
    }

    pub fn get_save_health_status(
        conn: &Connection,
        server_id: i64,
    ) -> Result<SaveHealthStatus, String> {
        let stats = Self::get_save_statistics(conn, server_id)?;

        let corruption_rate = if stats.total_saves > 0 {
            (stats.corrupted_saves as f64 / stats.total_saves as f64) * 100.0
        } else {
            0.0
        };

        let mut health_score = 100.0;
        let mut warnings = Vec::new();
        let mut recommendations = Vec::new();

        if corruption_rate > 10.0 {
            health_score -= 30.0;
            warnings.push(format!("{:.1}% saves are corrupted", corruption_rate));
            recommendations.push("Run save validation to identify corrupted files".to_string());
        }

        if stats.total_saves == 0 {
            health_score -= 20.0;
            warnings.push("No auto-saves available".to_string());
            recommendations.push("Ensure auto-save is enabled on the server".to_string());
        }

        if stats.total_storage_used > 100 * 1024 * 1024 * 1024 {
            // 100GB
            health_score -= 15.0;
            warnings.push("Save storage exceeds 100GB".to_string());
            recommendations.push("Consider archiving or deleting old saves".to_string());
        }

        let status = match health_score {
            s if s >= 90.0 => "excellent",
            s if s >= 75.0 => "good",
            s if s >= 50.0 => "fair",
            s if s >= 25.0 => "poor",
            _ => "critical",
        };

        Ok(SaveHealthStatus {
            health_score,
            status: status.to_string(),
            issues_count: warnings.len() as i32,
            warnings,
            recommendations,
        })
    }

    // ========================================================================
    // Restore Points
    // ========================================================================

    pub fn create_restore_point(
        conn: &Connection,
        req: &CreateRestorePointRequest,
    ) -> Result<RestorePoint, String> {
        let now = Utc::now().to_rfc3339();
        let point_type = req.point_type.clone().unwrap_or_else(|| "manual".to_string());

        conn.execute(
            "INSERT INTO restore_points (server_id, auto_save_id, point_name, description, point_type, created_at, is_protected)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![
                req.server_id, req.save_id, &req.point_name, &req.description,
                &point_type, &now, 1
            ],
        )
        .map_err(|e| format!("Failed to create restore point: {}", e))?;

        let id = conn.last_insert_rowid();
        Ok(RestorePoint {
            id,
            server_id: req.server_id,
            auto_save_id: req.save_id,
            point_name: req.point_name.clone(),
            description: req.description.clone(),
            point_type,
            created_at: now,
            is_protected: true,
            created_by: None,
        })
    }

    pub fn get_restore_points(
        conn: &Connection,
        server_id: i64,
    ) -> Result<Vec<RestorePoint>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, server_id, auto_save_id, point_name, description, point_type, created_at, is_protected, created_by
                 FROM restore_points WHERE server_id = ? ORDER BY created_at DESC",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let points = stmt
            .query_map([server_id], |row| {
                Ok(RestorePoint {
                    id: row.get(0)?,
                    server_id: row.get(1)?,
                    auto_save_id: row.get(2)?,
                    point_name: row.get(3)?,
                    description: row.get(4)?,
                    point_type: row.get(5)?,
                    created_at: row.get(6)?,
                    is_protected: row.get::<_, i32>(7)? != 0,
                    created_by: row.get(8)?,
                })
            })
            .map_err(|e| format!("Failed to query points: {}", e))?
            .collect::<Result<Vec<_>, rusqlite::Error>>()
            .map_err(|e| format!("Failed to collect points: {}", e))?;

        Ok(points)
    }

    // ========================================================================
    // Preferences Management
    // ========================================================================

    pub fn get_preferences(
        conn: &Connection,
        server_id: i64,
    ) -> Result<AutosavePreferences, String> {
        let res = conn.query_row(
            "SELECT id, server_id, auto_index_enabled, auto_validate_enabled,
                    auto_compress_old_saves, compress_after_days, auto_cleanup_enabled,
                    cleanup_after_days, keep_minimum_saves, create_restore_points,
                    restore_point_frequency, notify_on_restore, notify_on_corruption,
                    index_metadata, created_at, updated_at
             FROM autosave_preferences WHERE server_id = ?",
            [server_id],
            |row| -> rusqlite::Result<AutosavePreferences> {
                Ok(AutosavePreferences {
                    id: row.get(0)?,
                    server_id: row.get(1)?,
                    auto_index_enabled: row.get::<_, i32>(2)? != 0,
                    auto_validate_enabled: row.get::<_, i32>(3)? != 0,
                    auto_compress_old_saves: row.get::<_, i32>(4)? != 0,
                    compress_after_days: row.get(5)?,
                    auto_cleanup_enabled: row.get::<_, i32>(6)? != 0,
                    cleanup_after_days: row.get(7)?,
                    keep_minimum_saves: row.get(8)?,
                    create_restore_points: row.get::<_, i32>(9)? != 0,
                    restore_point_frequency: row.get(10)?,
                    notify_on_restore: row.get::<_, i32>(11)? != 0,
                    notify_on_corruption: row.get::<_, i32>(12)? != 0,
                    index_metadata: row.get::<_, i32>(13)? != 0,
                    created_at: row.get(14)?,
                    updated_at: row.get(15)?,
                })
            },
        );

        match res {
            Ok(prefs) => Ok(prefs),
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                // Create default preferences if not exists
                let now = Utc::now().to_rfc3339();
                conn.execute(
                    "INSERT INTO autosave_preferences 
                     (server_id, auto_index_enabled, auto_validate_enabled, auto_compress_old_saves,
                      compress_after_days, auto_cleanup_enabled, cleanup_after_days, keep_minimum_saves,
                      create_restore_points, restore_point_frequency, notify_on_restore,
                      notify_on_corruption, index_metadata, created_at, updated_at)
                     VALUES (?, 1, 1, 0, 30, 1, 90, 10, 1, 'daily', 1, 1, 1, ?, ?)",
                    params![server_id, &now, &now],
                )
                .ok();

                Ok(AutosavePreferences {
                    id: 0,
                    server_id,
                    auto_index_enabled: true,
                    auto_validate_enabled: true,
                    auto_compress_old_saves: false,
                    compress_after_days: 30,
                    auto_cleanup_enabled: true,
                    cleanup_after_days: 90,
                    keep_minimum_saves: 10,
                    create_restore_points: true,
                    restore_point_frequency: "daily".to_string(),
                    notify_on_restore: true,
                    notify_on_corruption: true,
                    index_metadata: true,
                    created_at: now.clone(),
                    updated_at: now,
                })
            }
            Err(e) => Err(format!("Failed to get preferences: {}", e)),
        }
    }

    pub fn update_preferences(
        conn: &Connection,
        req: &UpdatePreferencesRequest,
    ) -> Result<AutosavePreferences, String> {
        let now = Utc::now().to_rfc3339();
        let mut updates = Vec::new();
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(v) = req.auto_index_enabled {
            updates.push("auto_index_enabled = ?");
            params.push(Box::new(v as i32));
        }
        if let Some(v) = req.auto_validate_enabled {
            updates.push("auto_validate_enabled = ?");
            params.push(Box::new(v as i32));
        }
        if let Some(v) = req.auto_cleanup_enabled {
            updates.push("auto_cleanup_enabled = ?");
            params.push(Box::new(v as i32));
        }
        if let Some(v) = req.cleanup_after_days {
            updates.push("cleanup_after_days = ?");
            params.push(Box::new(v));
        }
        if let Some(v) = req.keep_minimum_saves {
            updates.push("keep_minimum_saves = ?");
            params.push(Box::new(v));
        }

        updates.push("updated_at = ?");
        params.push(Box::new(&now));
        params.push(Box::new(req.server_id));

        let query = format!(
            "UPDATE autosave_preferences SET {} WHERE server_id = ?",
            updates.join(", ")
        );

        let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter()
            .map(|b| b.as_ref() as &dyn rusqlite::ToSql)
            .collect();

        conn.execute(&query, &params_refs[..])
            .map_err(|e| format!("Failed to update preferences: {}", e))?;

        Self::get_preferences(conn, req.server_id)
    }

    // ========================================================================
    // Save Deletion
    // ========================================================================

    pub fn delete_save(
        conn: &Connection,
        save_id: i64,
    ) -> Result<(), String> {
        // Check if protected
        let is_protected: i32 = conn
            .query_row(
                "SELECT is_protected FROM auto_saves WHERE id = ?",
                [save_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to check protection: {}", e))?;

        if is_protected != 0 {
            return Err("Cannot delete protected save".to_string());
        }

        conn.execute(
            "DELETE FROM auto_saves WHERE id = ?",
            [save_id],
        )
        .map_err(|e| format!("Failed to delete save: {}", e))?;

        Ok(())
    }

    pub fn delete_old_saves(
        conn: &Connection,
        server_id: i64,
        days_old: i32,
        keep_minimum: i32,
    ) -> Result<i32, String> {
        // Get count of non-protected, old saves
        let cutoff = chrono::Utc::now()
            .checked_sub_signed(chrono::Duration::days(days_old as i64))
            .unwrap()
            .to_rfc3339();

        let mut stmt = conn
            .prepare(
                "SELECT id FROM auto_saves
                 WHERE server_id = ? AND is_protected = 0 AND created_at < ?
                 ORDER BY created_at ASC
                 LIMIT (SELECT COUNT(*) FROM auto_saves WHERE server_id = ? AND is_protected = 0) - ?",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let save_ids: Vec<i64> = stmt
            .query_map(params![server_id, &cutoff, server_id, keep_minimum], |row| {
                row.get(0)
            })
            .map_err(|e| format!("Failed to query saves: {}", e))?
            .collect::<Result<Vec<_>, rusqlite::Error>>()
            .map_err(|e| format!("Failed to collect saves: {}", e))?;

        let count = save_ids.len() as i32;

        for id in save_ids {
            conn.execute("DELETE FROM auto_saves WHERE id = ?", [id])
                .map_err(|e| format!("Failed to delete save: {}", e))?;
        }

        Ok(count)
    }
}
