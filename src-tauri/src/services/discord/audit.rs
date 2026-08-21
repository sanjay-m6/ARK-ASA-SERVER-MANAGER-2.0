// Centralized Audit Logger for Discord administrative & remote operations
#![allow(dead_code)]
use super::types::DiscordAuditLog;
use crate::AppState;
use tauri::{AppHandle, Emitter, Manager};

pub struct AuditLogger;

impl AuditLogger {
    /// Log an administrative action to SQLite discord_audit_log table and emit IPC event
    pub fn log(
        app_handle: &AppHandle,
        guild_id: &str,
        discord_user_id: &str,
        server_id: Option<i64>,
        action: &str,
        target: Option<&str>,
        status: &str,
        reason: Option<&str>,
        metadata: Option<&serde_json::Value>,
    ) {
        let metadata_str = metadata.map(|m| m.to_string());
        
        println!(
            "📝 [Discord Audit] Guild: {}, User: {}, Action: {}, Server: {:?}, Status: {}",
            guild_id, discord_user_id, action, server_id, status
        );

        if let Some(state) = app_handle.try_state::<AppState>() {
            if let Ok(db) = state.db.lock() {
                if let Ok(conn) = db.get_connection() {
                    let _ = conn.execute(
                        "INSERT INTO discord_audit_log 
                        (guild_id, discord_user_id, server_id, action, target, status, reason, metadata_json) 
                        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                        rusqlite::params![
                            guild_id,
                            discord_user_id,
                            server_id,
                            action,
                            target,
                            status,
                            reason,
                            metadata_str
                        ],
                    );
                }
            }
        }

        // Notify desktop UI about new audit entry
        let event_payload = serde_json::json!({
            "guild_id": guild_id,
            "discord_user_id": discord_user_id,
            "server_id": server_id,
            "action": action,
            "target": target,
            "status": status,
            "reason": reason,
            "timestamp": chrono::Utc::now().to_rfc3339()
        });
        let _ = app_handle.emit("discord-audit-entry", event_payload);
    }

    /// Retrieve audit logs from SQLite
    pub fn get_logs(
        app_handle: &AppHandle,
        limit: usize,
        guild_filter: Option<String>,
    ) -> Result<Vec<DiscordAuditLog>, String> {
        let state = app_handle.try_state::<AppState>().ok_or("AppState not found")?;
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let sql = if let Some(ref gid) = guild_filter {
            format!(
                "SELECT id, guild_id, discord_user_id, server_id, action, target, status, reason, created_at, metadata_json 
                 FROM discord_audit_log WHERE guild_id = '{}' ORDER BY id DESC LIMIT {}",
                gid.replace('\'', "''"), limit
            )
        } else {
            format!(
                "SELECT id, guild_id, discord_user_id, server_id, action, target, status, reason, created_at, metadata_json 
                 FROM discord_audit_log ORDER BY id DESC LIMIT {}",
                limit
            )
        };

        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            Ok(DiscordAuditLog {
                id: row.get(0)?,
                guild_id: row.get(1)?,
                discord_user_id: row.get(2)?,
                server_id: row.get(3)?,
                action: row.get(4)?,
                target: row.get(5)?,
                status: row.get(6)?,
                reason: row.get(7)?,
                created_at: row.get(8)?,
                metadata_json: row.get(9)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut logs = Vec::new();
        for r in rows.flatten() {
            logs.push(r);
        }

        Ok(logs)
    }

    /// Clear all or old audit logs
    pub fn clear_logs(app_handle: &AppHandle, guild_filter: Option<String>) -> Result<(), String> {
        let state = app_handle.try_state::<AppState>().ok_or("AppState not found")?;
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        if let Some(ref gid) = guild_filter {
            conn.execute("DELETE FROM discord_audit_log WHERE guild_id = ?1", [gid])
                .map_err(|e| e.to_string())?;
        } else {
            conn.execute("DELETE FROM discord_audit_log", [])
                .map_err(|e| e.to_string())?;
        }

        Ok(())
    }
}
