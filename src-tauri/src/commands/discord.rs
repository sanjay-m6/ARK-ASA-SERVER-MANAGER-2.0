use crate::models::ServerStatus;
use crate::services::discord::{send_discord_webhook, DiscordEmbed};
use crate::services::discord_bridge::DiscordBridgeConfig;
use crate::AppState;
use tauri::State;

/// Save Discord Bridge configuration to database and update service
#[tauri::command]
pub async fn save_discord_bridge_config(
    state: State<'_, AppState>,
    config: DiscordBridgeConfig,
) -> Result<(), String> {
    // 1. Save to Database
    {
        let cx_db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = cx_db.get_connection().map_err(|e| e.to_string())?;

        // 0. Verify Cluster Exists
        let cluster_exists: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM clusters WHERE id = ?1",
                [config.cluster_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if cluster_exists == 0 {
            return Err(format!(
                "Cluster ID {} not found. Please create a cluster first.",
                config.cluster_id
            ));
        }

        // Check if config exists for this cluster
        let exists: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM discord_bridge_config WHERE cluster_id = ?1",
                [config.cluster_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // Ensure columns exist (Migrations)
        let _ = conn.execute(
            "ALTER TABLE discord_bridge_config ADD COLUMN admin_channel_id TEXT DEFAULT ''",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE discord_bridge_config ADD COLUMN admin_role_ids TEXT DEFAULT '[]'",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE discord_bridge_config ADD COLUMN moderator_role_ids TEXT DEFAULT '[]'",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE discord_bridge_config ADD COLUMN notifications_channel_id TEXT DEFAULT ''",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE discord_bridge_config ADD COLUMN notify_player_join_leave INTEGER DEFAULT 1",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE discord_bridge_config ADD COLUMN notify_server_crashes INTEGER DEFAULT 1",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE discord_bridge_config ADD COLUMN notify_server_recovery INTEGER DEFAULT 1",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE discord_bridge_config ADD COLUMN notify_scheduled_restarts INTEGER DEFAULT 1",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE discord_bridge_config ADD COLUMN notify_backup_completion INTEGER DEFAULT 1",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE discord_bridge_config ADD COLUMN notify_performance_alerts INTEGER DEFAULT 1",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE discord_bridge_config ADD COLUMN notify_mod_watchdog INTEGER DEFAULT 1",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE discord_bridge_config ADD COLUMN notify_anti_cheat INTEGER DEFAULT 1",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE discord_bridge_config ADD COLUMN status_update_interval INTEGER DEFAULT 60",
            [],
        );

        let admin_roles_json = serde_json::to_string(&config.admin_role_ids).unwrap_or_else(|_| "[]".to_string());
        let mod_roles_json = serde_json::to_string(&config.moderator_role_ids).unwrap_or_else(|_| "[]".to_string());

        if exists > 0 {
            conn.execute(
                "UPDATE discord_bridge_config SET 
                    enabled = ?1, bot_token = ?2, guild_id = ?3, channel_id = ?4,
                    game_to_discord = ?5, discord_to_game = ?6,
                    server_list_enabled = ?7, server_list_channel_id = ?8, server_list_message_id = ?9,
                    player_list_enabled = ?10, player_list_channel_id = ?11, player_list_message_id = ?12,
                    show_tribe_names = ?13, show_playtime = ?14, admin_channel_id = ?15,
                    admin_role_ids = ?16, moderator_role_ids = ?17,
                    notifications_channel_id = ?18, notify_player_join_leave = ?19, notify_server_crashes = ?20,
                    notify_server_recovery = ?21, notify_scheduled_restarts = ?22, notify_backup_completion = ?23,
                    notify_performance_alerts = ?24, notify_mod_watchdog = ?25, notify_anti_cheat = ?26,
                    status_update_interval = ?27,
                    updated_at = CURRENT_TIMESTAMP
                WHERE cluster_id = ?28",
                rusqlite::params![
                    config.enabled,
                    config.bot_token,
                    config.guild_id,
                    config.channel_id,
                    config.game_to_discord,
                    config.discord_to_game,
                    config.server_list_enabled,
                    config.server_list_channel_id,
                    config.server_list_message_id,
                    config.player_list_enabled,
                    config.player_list_channel_id,
                    config.player_list_message_id,
                    config.show_tribe_names,
                    config.show_playtime,
                    config.admin_channel_id,
                    admin_roles_json,
                    mod_roles_json,
                    config.notifications_channel_id,
                    config.notify_player_join_leave,
                    config.notify_server_crashes,
                    config.notify_server_recovery,
                    config.notify_scheduled_restarts,
                    config.notify_backup_completion,
                    config.notify_performance_alerts,
                    config.notify_mod_watchdog,
                    config.notify_anti_cheat,
                    config.status_update_interval,
                    config.cluster_id
                ],
            )
            .map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "INSERT INTO discord_bridge_config (
                    cluster_id, enabled, bot_token, guild_id, channel_id,
                    game_to_discord, discord_to_game,
                    server_list_enabled, server_list_channel_id, server_list_message_id,
                    player_list_enabled, player_list_channel_id, player_list_message_id,
                    show_tribe_names, show_playtime, admin_channel_id,
                    admin_role_ids, moderator_role_ids,
                    notifications_channel_id, notify_player_join_leave, notify_server_crashes,
                    notify_server_recovery, notify_scheduled_restarts, notify_backup_completion,
                    notify_performance_alerts, notify_mod_watchdog, notify_anti_cheat, status_update_interval
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28)",
                rusqlite::params![
                    config.cluster_id,
                    config.enabled,
                    config.bot_token,
                    config.guild_id,
                    config.channel_id,
                    config.game_to_discord,
                    config.discord_to_game,
                    config.server_list_enabled,
                    config.server_list_channel_id,
                    config.server_list_message_id,
                    config.player_list_enabled,
                    config.player_list_channel_id,
                    config.player_list_message_id,
                    config.show_tribe_names,
                    config.show_playtime,
                    config.admin_channel_id,
                    admin_roles_json,
                    mod_roles_json,
                    config.notifications_channel_id,
                    config.notify_player_join_leave,
                    config.notify_server_crashes,
                    config.notify_server_recovery,
                    config.notify_scheduled_restarts,
                    config.notify_backup_completion,
                    config.notify_performance_alerts,
                    config.notify_mod_watchdog,
                    config.notify_anti_cheat,
                    config.status_update_interval
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    // 2. Update In-Memory Service Config
    state.discord_bridge.configure(config.clone()).await;

    // 3. Restart Service if enabled (always restart to apply config changes + gateway)
    if config.enabled {
        // Stop first to reset state, then start fresh with new config
        state.discord_bridge.stop();
        // Wait for the old gateway connection to fully shut down before reconnecting
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        state.discord_bridge.clone().start();
    } else {
        state.discord_bridge.stop();
    }

    Ok(())
}

/// Get Discord Bridge configuration
#[tauri::command]
pub async fn get_discord_bridge_config(
    state: State<'_, AppState>,
    cluster_id: i64,
) -> Result<Option<DiscordBridgeConfig>, String> {
    // 1. Try Memory First
    if let Some(cfg) = state.discord_bridge.get_config().await {
        if cfg.cluster_id == cluster_id {
            return Ok(Some(cfg));
        }
    }

    // 2. Fallback to DB
    let result = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.query_row(
            "SELECT cluster_id, enabled, bot_token, guild_id, channel_id,
                    game_to_discord, discord_to_game,
                    server_list_enabled, server_list_channel_id, server_list_message_id,
                    player_list_enabled, player_list_channel_id, player_list_message_id,
                    show_tribe_names, show_playtime, admin_channel_id,
                    admin_role_ids, moderator_role_ids,
                    notifications_channel_id, notify_player_join_leave, notify_server_crashes,
                    notify_server_recovery, notify_scheduled_restarts, notify_backup_completion,
                    notify_performance_alerts, notify_mod_watchdog, notify_anti_cheat, status_update_interval
             FROM discord_bridge_config WHERE cluster_id = ?1",
            [cluster_id],
            |row| {
                let admin_roles_json: Option<String> = row.get(16)?;
                let mod_roles_json: Option<String> = row.get(17)?;
                
                let admin_role_ids = admin_roles_json
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or_default();
                    
                let moderator_role_ids = mod_roles_json
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or_default();

                let interval: u64 = row.get::<_, Option<i64>>(27)?.unwrap_or(60) as u64;

                Ok(DiscordBridgeConfig {
                    cluster_id: row.get(0)?,
                    enabled: row.get::<_, i32>(1)? != 0,
                    bot_token: row.get(2)?,
                    guild_id: row.get(3)?,
                    channel_id: row.get(4)?,
                    game_to_discord: row.get::<_, i32>(5)? != 0,
                    discord_to_game: row.get::<_, i32>(6)? != 0,
                    server_list_enabled: row.get::<_, i32>(7)? != 0,
                    server_list_channel_id: row.get(8)?,
                    server_list_message_id: row.get(9)?,
                    player_list_enabled: row.get::<_, i32>(10)? != 0,
                    player_list_channel_id: row.get(11)?,
                    player_list_message_id: row.get(12)?,
                    show_tribe_names: row.get::<_, i32>(13)? != 0,
                    show_playtime: row.get::<_, i32>(14)? != 0,
                    admin_channel_id: row.get::<_, Option<String>>(15)?.unwrap_or_default(),
                    admin_role_ids,
                    moderator_role_ids,
                    notifications_channel_id: row.get::<_, Option<String>>(18)?.unwrap_or_default(),
                    notify_player_join_leave: row.get::<_, i32>(19)? != 0,
                    notify_server_crashes: row.get::<_, i32>(20)? != 0,
                    notify_server_recovery: row.get::<_, i32>(21)? != 0,
                    notify_scheduled_restarts: row.get::<_, i32>(22)? != 0,
                    notify_backup_completion: row.get::<_, i32>(23)? != 0,
                    notify_performance_alerts: row.get::<_, i32>(24)? != 0,
                    notify_mod_watchdog: row.get::<_, i32>(25)? != 0,
                    notify_anti_cheat: row.get::<_, i32>(26)? != 0,
                    status_update_interval: if interval == 0 { 60 } else { interval },
                })
            },
        )
    };

    match result {
        Ok(config) => {
            // Populate memory cache
            state.discord_bridge.configure(config.clone()).await;
            Ok(Some(config))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Start the Discord Bridge manually
#[tauri::command]
pub async fn start_discord_bridge(state: State<'_, AppState>) -> Result<(), String> {
    if !state.discord_bridge.is_running() {
        state.discord_bridge.clone().start();
        Ok(())
    } else {
        Ok(()) // Already running
    }
}

/// Stop the Discord Bridge manually
#[tauri::command]
pub async fn stop_discord_bridge(state: State<'_, AppState>) -> Result<(), String> {
    state.discord_bridge.stop();
    Ok(())
}

/// Test connection with current config
/// Test connection with current config or provided credentials
#[tauri::command]
pub async fn test_discord_bridge_connection(
    state: State<'_, AppState>,
    bot_token: String,
    channel_id: String,
) -> Result<String, String> {
    state
        .discord_bridge
        .test_connection_with_credentials(&bot_token, &channel_id)
        .await
}

/// Generate the correct bot invite URL with proper permissions
#[tauri::command]
pub async fn generate_bot_invite_url(bot_token: String) -> Result<String, String> {
    if bot_token.is_empty() {
        return Err("Bot token is required".to_string());
    }

    // Fetch bot's application ID via /users/@me
    let client = reqwest::Client::new();
    let response = client
        .get("https://discord.com/api/v10/users/@me")
        .header("Authorization", format!("Bot {}", bot_token))
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    if !response.status().is_success() {
        return Err(
            "Invalid bot token. Check your token in Discord Developer Portal → Bot → Reset Token."
                .to_string(),
        );
    }

    let bot_info: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse bot info: {}", e))?;

    let bot_id = bot_info["id"].as_str().unwrap_or("");
    if bot_id.is_empty() {
        return Err("Could not determine bot application ID.".to_string());
    }

    // Permissions: Administrator (8) or Comprehensive Server Management (395137263680)
    // Scope: bot + applications.commands for Slash Command support
    let invite_url = format!(
        "https://discord.com/api/oauth2/authorize?client_id={}&permissions=8&scope=bot%20applications.commands",
        bot_id
    );

    Ok(invite_url)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DiscordPlayerLink {
    pub discord_user_id: String,
    pub steam_id: String,
    pub player_name: Option<String>,
    pub cluster_id: i64,
    pub linked_at: String,
    pub verified: bool,
}

/// Get all linked Discord player accounts
#[tauri::command]
pub async fn get_discord_player_links(
    state: State<'_, AppState>,
    cluster_id: Option<i64>,
) -> Result<Vec<DiscordPlayerLink>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let sql = if let Some(cid) = cluster_id {
        format!("SELECT discord_user_id, steam_id, player_name, cluster_id, linked_at, verified FROM discord_player_links WHERE cluster_id = {} ORDER BY linked_at DESC", cid)
    } else {
        "SELECT discord_user_id, steam_id, player_name, cluster_id, linked_at, verified FROM discord_player_links ORDER BY linked_at DESC".to_string()
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let links = stmt
        .query_map([], |row| {
            Ok(DiscordPlayerLink {
                discord_user_id: row.get(0)?,
                steam_id: row.get(1)?,
                player_name: row.get(2)?,
                cluster_id: row.get(3)?,
                linked_at: row.get(4)?,
                verified: row.get::<_, i32>(5)? != 0,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(links)
}

/// Unlink a Discord player account
#[tauri::command]
pub async fn unlink_discord_player(
    state: State<'_, AppState>,
    discord_user_id: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM discord_player_links WHERE discord_user_id = ?1",
        rusqlite::params![discord_user_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Send a Discord webhook status update with live server data from the backend.
/// Reads all servers from DB, fetches live player counts, and sends a rich embed.
#[tauri::command]
pub async fn send_discord_status_update(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // 1. Read all servers from DB (including max_players)
    let servers = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare("SELECT id, name, status, map_name, max_players FROM servers")
            .map_err(|e| e.to_string())?;

        let mut servers = Vec::new();
        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;

        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let id: i64 = row.get(0).unwrap_or(0);
            let name: String = row.get(1).unwrap_or_default();
            let status_str: String = row.get(2).unwrap_or_else(|_| "stopped".to_string());
            let map_name: String = row.get(3).unwrap_or_else(|_| "Unknown".to_string());
            let max_players: i32 = row.get(4).unwrap_or(70);

            let status = match status_str.as_str() {
                "running" => ServerStatus::Running,
                "online" => ServerStatus::Online,
                "starting" => ServerStatus::Starting,
                "stopped" => ServerStatus::Stopped,
                "crashed" => ServerStatus::Crashed,
                "updating" => ServerStatus::Updating,
                "restarting" => ServerStatus::Restarting,
                _ => ServerStatus::Stopped,
            };

            servers.push((id, name, status, map_name, max_players));
        }
        servers
    };

    // 2. Get live player counts from PlayerIntelligenceService
    let player_counts = state.player_intelligence.get_player_counts().await;

    // 3. Count online servers and collect details with player counts
    let total_count = servers.len();
    let online_servers: Vec<(String, String, i32, i32)> = servers
        .iter()
        .filter(|(_, _, status, _, _)| {
            matches!(status, ServerStatus::Running | ServerStatus::Online)
        })
        .map(|(id, name, _, map, max)| {
            let current_players = player_counts.get(id).copied().unwrap_or(0);
            (name.clone(), map.clone(), current_players, *max)
        })
        .collect();
    let online_count = online_servers.len();

    log::info!(
        "[Discord] Sending status update: {} / {} servers online, players: {:?}",
        online_count,
        total_count,
        online_servers
            .iter()
            .map(|(n, _, p, m)| format!("{}:{}/{}", n, p, m))
            .collect::<Vec<_>>()
    );

    // 4. Build and send the embed
    let embed = DiscordEmbed::status_update(online_count, total_count, online_servers);
    send_discord_webhook(&app_handle, "statusUpdate", embed).await;

    Ok(())
}

/// Get Discord rate limit configuration for a cluster
#[tauri::command]
pub async fn get_discord_rate_limit_config(
    state: State<'_, AppState>,
    cluster_id: i64,
) -> Result<Option<(i32, i32)>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let result = conn.query_row(
        "SELECT max_messages_per_window, window_seconds FROM discord_rate_limits WHERE cluster_id = ?1",
        [cluster_id],
        |row| {
            let max_msgs: i32 = row.get(0)?;
            let window: i32 = row.get(1)?;
            Ok((max_msgs, window))
        },
    );

    match result {
        Ok(config) => Ok(Some(config)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Set Discord rate limit configuration for a cluster
#[tauri::command]
pub async fn set_discord_rate_limit_config(
    state: State<'_, AppState>,
    cluster_id: i64,
    max_messages_per_window: i32,
    window_seconds: i32,
) -> Result<(), String> {
    if max_messages_per_window < 1 {
        return Err("max_messages_per_window must be at least 1".to_string());
    }
    if window_seconds < 1 {
        return Err("window_seconds must be at least 1".to_string());
    }    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        // Check if record exists
        let exists: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM discord_rate_limits WHERE cluster_id = ?1",
                [cluster_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if exists > 0 {
            conn.execute(
                "UPDATE discord_rate_limits SET max_messages_per_window = ?1, window_seconds = ?2, updated_at = CURRENT_TIMESTAMP WHERE cluster_id = ?3",
                rusqlite::params![max_messages_per_window, window_seconds, cluster_id],
            )
        } else {
            conn.execute(
                "INSERT INTO discord_rate_limits (cluster_id, max_messages_per_window, window_seconds) VALUES (?1, ?2, ?3)",
                rusqlite::params![cluster_id, max_messages_per_window, window_seconds],
            )
        }
        .map_err(|e| e.to_string())?;
    }

    // If the bridge is running for this cluster, reload rate limit config
    if let Some(cfg) = state.discord_bridge.get_config().await {
        if cfg.cluster_id == cluster_id {
            log::info!("[Discord] Reloading rate limit config for cluster {}", cluster_id);
            if let Some((max_msgs, window_secs)) = state.discord_bridge.load_rate_limit_config(cluster_id) {
                let mut limiter = state.discord_bridge.rate_limiter.lock().await;
                limiter.update_config(max_msgs, window_secs);
            }
        }
    }

    Ok(())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordAuditLogEntry {
    pub id: i64,
    pub discord_user_id: String,
    pub discord_username: String,
    pub guild_id: String,
    pub server_id: Option<i64>,
    pub action_type: String,
    pub details: Option<String>,
    pub result: String,
    pub error_message: Option<String>,
    pub created_at: String,
}

/// Get audit logs for Discord bot operations
#[tauri::command]
pub async fn get_discord_audit_logs(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<DiscordAuditLogEntry>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let max_rows = limit.unwrap_or(100).clamp(1, 500);
    let mut stmt = conn.prepare(
        "SELECT id, discord_user_id, discord_username, guild_id, server_id, action_type, details, result, error_message, created_at 
         FROM discord_audit_logs 
         ORDER BY id DESC LIMIT ?1"
    ).map_err(|e| e.to_string())?;

    let entries = stmt.query_map([max_rows], |row| {
        Ok(DiscordAuditLogEntry {
            id: row.get(0)?,
            discord_user_id: row.get(1)?,
            discord_username: row.get(2)?,
            guild_id: row.get(3)?,
            server_id: row.get(4)?,
            action_type: row.get(5)?,
            details: row.get(6)?,
            result: row.get(7)?,
            error_message: row.get(8)?,
            created_at: row.get(9)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(entries)
}

/// Clear all audit logs for Discord operations
#[tauri::command]
pub async fn clear_discord_audit_logs(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM discord_audit_logs", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordDiagnosticsInfo {
    pub is_running: bool,
    pub gateway_connected: bool,
    pub commands_processed: u64,
    pub uptime_seconds: u64,
    pub guild_id: String,
    pub status_channel_id: String,
    pub player_channel_id: String,
    pub cross_chat_channel_id: String,
    pub alerts_channel_id: String,
    pub admin_channel_id: String,
    pub pending_actions_count: i64,
    pub linked_players_count: i64,
}

/// Get detailed diagnostics for the Discord bridge
#[tauri::command]
pub async fn get_discord_diagnostics(
    state: State<'_, AppState>,
    cluster_id: i64,
) -> Result<DiscordDiagnosticsInfo, String> {
    let is_running = state.discord_bridge.is_running();
    let gateway_connected = state.discord_bridge.gateway_running.load(std::sync::atomic::Ordering::Relaxed);
    let commands_processed = state.discord_bridge.commands_processed.load(std::sync::atomic::Ordering::Relaxed);
    
    let uptime_seconds = {
        let started = state.discord_bridge.started_at.lock().await;
        started.map(|t| t.elapsed().as_secs()).unwrap_or(0)
    };

    let config_opt = state.discord_bridge.get_config().await;

    let (pending_actions_count, linked_players_count) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        let pending: i64 = conn.query_row(
            "SELECT COUNT(*) FROM discord_pending_actions WHERE status = 'pending'",
            [],
            |r| r.get(0),
        ).unwrap_or(0);
        let linked: i64 = conn.query_row(
            "SELECT COUNT(*) FROM discord_player_links WHERE cluster_id = ?1",
            [cluster_id],
            |r| r.get(0),
        ).unwrap_or(0);
        (pending, linked)
    };

    let cfg = config_opt.unwrap_or(DiscordBridgeConfig {
        cluster_id,
        enabled: false,
        bot_token: String::new(),
        guild_id: String::new(),
        channel_id: String::new(),
        game_to_discord: false,
        discord_to_game: false,
        server_list_enabled: false,
        server_list_channel_id: String::new(),
        server_list_message_id: String::new(),
        player_list_enabled: false,
        player_list_channel_id: String::new(),
        player_list_message_id: String::new(),
        show_tribe_names: false,
        show_playtime: false,
        admin_channel_id: String::new(),
        admin_role_ids: vec![],
        moderator_role_ids: vec![],
        notifications_channel_id: String::new(),
        notify_player_join_leave: true,
        notify_server_crashes: true,
        notify_server_recovery: true,
        notify_scheduled_restarts: true,
        notify_backup_completion: true,
        notify_performance_alerts: true,
        notify_mod_watchdog: true,
        notify_anti_cheat: true,
        status_update_interval: 60,
    });

    Ok(DiscordDiagnosticsInfo {
        is_running,
        gateway_connected,
        commands_processed,
        uptime_seconds,
        guild_id: cfg.guild_id,
        status_channel_id: cfg.server_list_channel_id,
        player_channel_id: cfg.player_list_channel_id,
        cross_chat_channel_id: cfg.channel_id,
        alerts_channel_id: cfg.notifications_channel_id,
        admin_channel_id: cfg.admin_channel_id,
        pending_actions_count,
        linked_players_count,
    })
}

/// Trigger automated channel setup via desktop UI
#[tauri::command]
pub async fn trigger_discord_setup(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    cluster_id: i64,
    guild_id: String,
) -> Result<serde_json::Value, String> {
    let bot_token = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT bot_token FROM discord_bridge_config WHERE cluster_id = ?1",
            [cluster_id],
            |row| row.get::<_, String>(0),
        ).map_err(|_| "No bot token configured for this cluster. Please set bot token first.".to_string())?
    };

    if bot_token.is_empty() {
        return Err("Bot token is empty. Please set bot token first.".to_string());
    }

    if guild_id.is_empty() {
        return Err("Guild ID is required for setup.".to_string());
    }

    let result = crate::services::discord::setup::SetupOrchestrator::execute_from_desktop(
        &app_handle,
        &bot_token,
        &guild_id,
        cluster_id,
    ).await.map_err(|e| format!("Setup failed: {}", e))?;

    // Also update in-memory config
    if let Ok(Some(cfg)) = get_discord_bridge_config(state.clone(), cluster_id).await {
        state.discord_bridge.configure(cfg).await;
    }

    Ok(result)
}

/// Force immediate refresh of Discord live status dashboard
#[tauri::command]
pub async fn refresh_discord_dashboard(
    state: State<'_, AppState>,
    _cluster_id: Option<i64>,
) -> Result<(), String> {
    state.discord_bridge.trigger_dashboard_refresh().await
}
