use crate::services::anti_cheat::{ActionConfig, AntiCheatConfig, ViolationEvent};
use crate::AppState;
use rusqlite::params;
use tauri::State;

/// Get anti-cheat configuration for a server
#[tauri::command]
pub async fn get_anti_cheat_config(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<AntiCheatConfig, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let result = conn.query_row(
        "SELECT enabled, sensitivity, log_only, kick_enabled, ban_enabled, discord_alert, 
                mesh_enabled, mesh_threshold, mesh_notify,
                command_enabled, command_blacklisted, command_whitelist
         FROM anti_cheat_config WHERE server_id = ?1",
        params![server_id],
        |row| {
            // Helper for lists
            let bl_str: String = row.get(10).unwrap_or_default();
            let wl_str: String = row.get(11).unwrap_or_default();

            Ok(AntiCheatConfig {
                enabled: row.get::<_, i32>(0)? == 1,
                sensitivity: row.get(1)?,
                actions: ActionConfig {
                    log_only: row.get::<_, i32>(2)? == 1,
                    kick_enabled: row.get::<_, i32>(3)? == 1,
                    ban_enabled: row.get::<_, i32>(4)? == 1,
                    discord_alert: row.get::<_, i32>(5)? == 1,
                },
                mesh_protection: crate::services::anti_cheat::MeshConfig {
                    enabled: row.get::<_, i32>(6).unwrap_or(0) == 1,
                    threshold: row.get::<_, f32>(7).unwrap_or(0.6),
                    notify_player: row.get::<_, i32>(8).unwrap_or(1) == 1,
                },
                command_protection: crate::services::anti_cheat::CommandProtectionConfig {
                    enabled: row.get::<_, i32>(9).unwrap_or(0) == 1,
                    blacklisted_commands: if bl_str.is_empty() {
                        vec![]
                    } else {
                        bl_str.split(',').map(|s| s.to_string()).collect()
                    },
                    whitelist_admin_ids: if wl_str.is_empty() {
                        vec![]
                    } else {
                        wl_str.split(',').map(|s| s.to_string()).collect()
                    },
                },
            })
        },
    );

    match result {
        Ok(config) => Ok(config),
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            // Return default config if not found
            Ok(AntiCheatConfig {
                enabled: false,
                sensitivity: 1.0,
                actions: ActionConfig {
                    log_only: true,
                    kick_enabled: false,
                    ban_enabled: false,
                    discord_alert: false,
                },
                mesh_protection: crate::services::anti_cheat::MeshConfig {
                    enabled: false,
                    threshold: 0.6,
                    notify_player: true,
                },
                command_protection: crate::services::anti_cheat::CommandProtectionConfig {
                    enabled: false,
                    blacklisted_commands: vec![],
                    whitelist_admin_ids: vec![],
                },
            })
        }
        Err(e) => Err(format!("Failed to get anti-cheat config: {}", e)),
    }
}

/// Save anti-cheat configuration for a server
#[tauri::command]
pub async fn save_anti_cheat_config(
    state: State<'_, AppState>,
    server_id: i64,
    config: AntiCheatConfig,
) -> Result<(), String> {
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        // Upsert: insert or update existing
        // Serialize lists
        let bl_str = config.command_protection.blacklisted_commands.join(",");
        let wl_str = config.command_protection.whitelist_admin_ids.join(",");

        conn.execute(
            "INSERT INTO anti_cheat_config (server_id, enabled, sensitivity, log_only, kick_enabled, ban_enabled, discord_alert, 
                mesh_enabled, mesh_threshold, mesh_notify, command_enabled, command_blacklisted, command_whitelist)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
             ON CONFLICT(server_id) DO UPDATE SET
                enabled = excluded.enabled,
                sensitivity = excluded.sensitivity,
                log_only = excluded.log_only,
                kick_enabled = excluded.kick_enabled,
                ban_enabled = excluded.ban_enabled,
                discord_alert = excluded.discord_alert,
                mesh_enabled = excluded.mesh_enabled,
                mesh_threshold = excluded.mesh_threshold,
                mesh_notify = excluded.mesh_notify,
                command_enabled = excluded.command_enabled,
                command_blacklisted = excluded.command_blacklisted,
                command_whitelist = excluded.command_whitelist",
            params![
                server_id,
                if config.enabled { 1 } else { 0 },
                config.sensitivity,
                if config.actions.log_only { 1 } else { 0 },
                if config.actions.kick_enabled { 1 } else { 0 },
                if config.actions.ban_enabled { 1 } else { 0 },
                if config.actions.discord_alert { 1 } else { 0 },
                if config.mesh_protection.enabled { 1 } else { 0 },
                config.mesh_protection.threshold,
                if config.mesh_protection.notify_player { 1 } else { 0 },
                if config.command_protection.enabled { 1 } else { 0 },
                bl_str,
                wl_str,
            ],
        )
        .map_err(|e| format!("Failed to save anti-cheat config: {}", e))?;
    }

    // Update service cache
    state
        .anti_cheat
        .update_cache(server_id, config.clone())
        .await;

    println!(
        "✅ Anti-cheat config saved for server {}: enabled={}",
        server_id, config.enabled
    );

    Ok(())
}

/// Get anti-cheat violation logs for a server
#[tauri::command]
pub async fn get_anti_cheat_logs(
    state: State<'_, AppState>,
    server_id: i64,
    limit: i32,
) -> Result<Vec<ViolationEvent>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT server_id, player_name, steam_id, violation_type, severity, details, 
                    strftime('%s', created_at) as timestamp
             FROM anti_cheat_logs 
             WHERE server_id = ?1 
             ORDER BY created_at DESC 
             LIMIT ?2",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let logs = stmt
        .query_map(params![server_id, limit], |row| {
            Ok(ViolationEvent {
                server_id: row.get(0)?,
                player_name: row.get(1)?,
                steam_id: row.get(2)?,
                violation_type: row.get(3)?,
                severity: row.get(4)?,
                details: row.get(5)?,
                timestamp: row.get::<_, String>(6)?.parse().unwrap_or(0),
            })
        })
        .map_err(|e| format!("Failed to query logs: {}", e))?;

    let result: Vec<ViolationEvent> = logs.filter_map(|l| l.ok()).collect();

    Ok(result)
}
