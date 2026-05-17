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
                    updated_at = CURRENT_TIMESTAMP
                WHERE cluster_id = ?27",
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
                    notify_performance_alerts, notify_mod_watchdog, notify_anti_cheat
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27)",
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
                    config.notify_anti_cheat
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
                    notify_performance_alerts, notify_mod_watchdog, notify_anti_cheat
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

    // Permissions: View Channels (1024) + Send Messages (2048) + Manage Messages (8192) + Read Message History (65536) = 76800
    let invite_url = format!(
        "https://discord.com/api/oauth2/authorize?client_id={}&permissions=76800&scope=bot",
        bot_id
    );

    Ok(invite_url)
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
    }

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
