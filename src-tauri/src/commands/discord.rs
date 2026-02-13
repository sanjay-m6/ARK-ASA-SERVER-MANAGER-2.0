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

        if exists > 0 {
            conn.execute(
                "UPDATE discord_bridge_config SET 
                    enabled = ?1, bot_token = ?2, guild_id = ?3, channel_id = ?4,
                    game_to_discord = ?5, discord_to_game = ?6,
                    server_list_enabled = ?7, server_list_channel_id = ?8, server_list_message_id = ?9,
                    player_list_enabled = ?10, player_list_channel_id = ?11, player_list_message_id = ?12,
                    show_tribe_names = ?13, show_playtime = ?14, updated_at = CURRENT_TIMESTAMP
                WHERE cluster_id = ?15",
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
                    show_tribe_names, show_playtime
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
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
                    config.show_playtime
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
                    show_tribe_names, show_playtime
             FROM discord_bridge_config WHERE cluster_id = ?1",
            [cluster_id],
            |row| {
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
