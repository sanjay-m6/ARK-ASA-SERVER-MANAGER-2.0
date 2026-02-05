use crate::models::{Cluster, ClusterStatus, ServerStatus, ServerStatusInfo};
use crate::AppState;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub async fn create_cluster(
    state: State<'_, AppState>,
    name: String,
    server_ids: Vec<i64>,
) -> Result<Cluster, String> {
    println!(
        "🔗 Creating cluster: {} with {} servers",
        name,
        server_ids.len()
    );

    // Get app data dir for cluster path
    let cluster_dir = format!("C:/ASA_Clusters/{}", name.replace(" ", "_"));

    // Create a cluster directory
    std::fs::create_dir_all(&cluster_dir)
        .map_err(|e| format!("Failed to create cluster directory: {}", e))?;

    // Insert into database
    let cluster_id: i64 = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        // Serialize server_ids as JSON array
        let server_ids_json = serde_json::to_string(&server_ids)
            .map_err(|e| format!("Failed to serialize server_ids: {}", e))?;

        conn.execute(
            "INSERT INTO clusters (name, cluster_path, server_ids) VALUES (?1, ?2, ?3)",
            rusqlite::params![name, cluster_dir, server_ids_json],
        )
        .map_err(|e| e.to_string())?;

        conn.last_insert_rowid()
    };

    // Link servers to cluster
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        for server_id in &server_ids {
            // Insert into cluster_servers junction table
            conn.execute(
                "INSERT OR REPLACE INTO cluster_servers (cluster_id, server_id) VALUES (?1, ?2)",
                rusqlite::params![cluster_id, server_id],
            )
            .map_err(|e| e.to_string())?;

            // Set cluster_id on the server for startup arg lookup
            conn.execute(
                "UPDATE servers SET cluster_id = ?1 WHERE id = ?2",
                rusqlite::params![cluster_id, server_id],
            )
            .map_err(|e| e.to_string())?;

            // Update server's GameUserSettings.ini with ClusterDirOverride
            if let Ok(install_path) = conn.query_row::<String, _, _>(
                "SELECT install_path FROM servers WHERE id = ?1",
                [server_id],
                |row| row.get(0),
            ) {
                update_cluster_config(&install_path, &cluster_dir);
            }
        }
    }

    let cluster = Cluster {
        id: cluster_id,
        name,
        cluster_path: PathBuf::from(&cluster_dir),
        server_ids,
        created_at: chrono::Local::now().to_rfc3339(),
    };

    println!("  ✅ Cluster created: ID {}", cluster_id);
    Ok(cluster)
}

#[tauri::command]
pub async fn get_clusters(state: State<'_, AppState>) -> Result<Vec<Cluster>, String> {
    println!("📋 Getting all clusters");

    let clusters = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare("SELECT id, name, cluster_path, created_at FROM clusters")
            .map_err(|e| e.to_string())?;

        let cluster_iter = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut clusters = Vec::new();
        for cluster_result in cluster_iter {
            if let Ok((id, name, cluster_path, created_at)) = cluster_result {
                // Get linked server IDs
                let server_ids: Vec<i64> = conn
                    .prepare("SELECT server_id FROM cluster_servers WHERE cluster_id = ?1")
                    .map_err(|e| e.to_string())?
                    .query_map([id], |row| row.get(0))
                    .map_err(|e| e.to_string())?
                    .filter_map(|r| r.ok())
                    .collect();

                clusters.push(Cluster {
                    id,
                    name,
                    cluster_path: PathBuf::from(cluster_path),
                    server_ids,
                    created_at,
                });
            }
        }
        clusters
    };

    println!("  Found {} clusters", clusters.len());
    Ok(clusters)
}

#[tauri::command]
pub async fn delete_cluster(state: State<'_, AppState>, cluster_id: i64) -> Result<(), String> {
    println!("🗑️ Deleting cluster: {}", cluster_id);

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        // Remove cluster-server links
        conn.execute(
            "DELETE FROM cluster_servers WHERE cluster_id = ?1",
            [cluster_id],
        )
        .map_err(|e| e.to_string())?;

        // Remove cluster
        conn.execute("DELETE FROM clusters WHERE id = ?1", [cluster_id])
            .map_err(|e| e.to_string())?;
    }

    println!("  ✅ Cluster deleted");
    Ok(())
}

#[tauri::command]
#[allow(dead_code)]
pub async fn add_server_to_cluster(
    state: State<'_, AppState>,
    cluster_id: i64,
    server_id: i64,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO cluster_servers (cluster_id, server_id) VALUES (?1, ?2)",
        rusqlite::params![cluster_id, server_id],
    )
    .map_err(|e| e.to_string())?;

    // Get cluster path and update server config
    if let Ok((cluster_path, install_path)) = conn.query_row::<(String, String), _, _>(
        "SELECT c.cluster_path, s.install_path FROM clusters c, servers s WHERE c.id = ?1 AND s.id = ?2",
        rusqlite::params![cluster_id, server_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ) {
        update_cluster_config(&install_path, &cluster_path);
    }

    Ok(())
}

#[tauri::command]
#[allow(dead_code)]
pub async fn remove_server_from_cluster(
    state: State<'_, AppState>,
    cluster_id: i64,
    server_id: i64,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM cluster_servers WHERE cluster_id = ?1 AND server_id = ?2",
        rusqlite::params![cluster_id, server_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Update GameUserSettings.ini with ClusterDirOverride
fn update_cluster_config(install_path: &str, cluster_path: &str) {
    let config_path = PathBuf::from(install_path)
        .join("ShooterGame/Saved/Config/WindowsServer/GameUserSettings.ini");

    if let Ok(content) = std::fs::read_to_string(&config_path) {
        let cluster_line = format!("ClusterDirOverride={}", cluster_path);

        let new_content = if content.contains("ClusterDirOverride=") {
            content
                .lines()
                .map(|line| {
                    if line.starts_with("ClusterDirOverride=") {
                        cluster_line.as_str()
                    } else {
                        line
                    }
                })
                .collect::<Vec<_>>()
                .join("\n")
        } else {
            let mut result = String::new();
            let mut added = false;
            for line in content.lines() {
                result.push_str(line);
                result.push('\n');
                if line.starts_with("[ServerSettings]") && !added {
                    result.push_str(&cluster_line);
                    result.push('\n');
                    added = true;
                }
            }
            result
        };

        let _ = std::fs::write(&config_path, new_content);
        println!("  📝 Updated cluster config for server at {}", install_path);
    }
}

/// Get the status of all servers in a cluster
#[tauri::command]
pub async fn get_cluster_status(
    state: State<'_, AppState>,
    cluster_id: i64,
) -> Result<ClusterStatus, String> {
    println!("📊 Getting cluster status for {}", cluster_id);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    // Get cluster info
    let cluster_name: String = conn
        .query_row(
            "SELECT name FROM clusters WHERE id = ?1",
            [cluster_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Cluster not found: {}", e))?;

    // Get all servers in this cluster
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.name, s.status FROM servers s
             INNER JOIN cluster_servers cs ON s.id = cs.server_id
             WHERE cs.cluster_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let server_iter = stmt
        .query_map([cluster_id], |row| {
            let id: i64 = row.get(0)?;
            let name: String = row.get(1)?;
            let status_str: String = row.get(2)?;
            let status = match status_str.as_str() {
                "running" => ServerStatus::Running,
                "starting" => ServerStatus::Starting,
                "stopped" => ServerStatus::Stopped,
                "crashed" => ServerStatus::Crashed,
                "updating" => ServerStatus::Updating,
                "restarting" => ServerStatus::Restarting,
                _ => ServerStatus::Stopped,
            };
            Ok((id, name, status))
        })
        .map_err(|e| e.to_string())?;

    let mut server_statuses: Vec<ServerStatusInfo> = Vec::new();
    let mut running_servers = 0;
    let total_players = 0;

    for server_result in server_iter {
        if let Ok((id, name, status)) = server_result {
            if matches!(status, ServerStatus::Running) {
                running_servers += 1;
            }
            // For now, player count is 0 - would need RCON integration to get real count
            server_statuses.push(ServerStatusInfo {
                server_id: id,
                server_name: name,
                status,
                player_count: 0,
            });
        }
    }

    let status = ClusterStatus {
        cluster_id,
        cluster_name,
        total_servers: server_statuses.len() as i32,
        running_servers,
        total_players,
        server_statuses,
    };

    println!(
        "  ✅ Cluster has {} servers, {} running",
        status.total_servers, running_servers
    );
    Ok(status)
}

/// Start all servers in a cluster
#[tauri::command]
pub async fn start_cluster(state: State<'_, AppState>, cluster_id: i64) -> Result<(), String> {
    println!("▶️ Starting all servers in cluster {}", cluster_id);

    // Get cluster info first
    let (cluster_name, cluster_path): (String, String) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.query_row(
            "SELECT name, cluster_path FROM clusters WHERE id = ?1",
            [cluster_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Cluster not found: {}", e))?
    };

    // Get all server info for this cluster
    let servers: Vec<(
        i64,
        String,
        String,
        String,
        u16,
        u16,
        u16,
        i32,
        Option<String>,
        String,
        Option<String>,
        Option<String>,
    )> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT s.id, s.install_path, s.map_name, s.session_name, s.game_port, 
                        s.query_port, s.rcon_port, s.max_players, s.server_password, s.admin_password, s.ip_address, s.custom_args
                 FROM servers s
                 INNER JOIN cluster_servers cs ON s.id = cs.server_id
                 WHERE cs.cluster_id = ?1 AND s.status = 'stopped'",
            )
            .map_err(|e| e.to_string())?;

        let mut result = Vec::new();
        let mut rows = stmt.query([cluster_id]).map_err(|e| e.to_string())?;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            result.push((
                row.get::<_, i64>(0).unwrap_or(0),
                row.get::<_, String>(1).unwrap_or_default(),
                row.get::<_, String>(2).unwrap_or_default(),
                row.get::<_, String>(3).unwrap_or_default(),
                row.get::<_, u16>(4).unwrap_or(7777),
                row.get::<_, u16>(5).unwrap_or(27015),
                row.get::<_, u16>(6).unwrap_or(27020),
                row.get::<_, i32>(7).unwrap_or(70),
                row.get::<_, Option<String>>(8).unwrap_or(None),
                row.get::<_, String>(9).unwrap_or_default(),
                row.get::<_, Option<String>>(10).unwrap_or(None),
                row.get::<_, Option<String>>(11).unwrap_or(None),
            ));
        }
        result
    };

    // Start each server with cluster args
    for (
        server_id,
        install_path,
        map_name,
        session_name,
        game_port,
        query_port,
        rcon_port,
        max_players,
        server_password,
        admin_password,
        ip_address,
        custom_args,
    ) in servers
    {
        // Get enabled mods for this server
        let enabled_mods: Vec<String> = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;

            let mut stmt = conn.prepare(
                "SELECT mod_id FROM mods WHERE server_id = ?1 AND enabled = 1 ORDER BY load_order ASC"
            ).map_err(|e| e.to_string())?;

            let mut rows = stmt.query([server_id]).map_err(|e| e.to_string())?;
            let mut mods = Vec::new();
            while let Some(row) = rows.next().map_err(|e| e.to_string())? {
                if let Ok(mod_id) = row.get::<_, String>(0) {
                    mods.push(mod_id);
                }
            }
            mods
        };

        if !enabled_mods.is_empty() {
            println!(
                "  🧩 Found {} enabled mods for server {}",
                enabled_mods.len(),
                server_id
            );
        }

        let install_path = PathBuf::from(&install_path);
        let server_password_ref = server_password.as_deref();
        let ip_address_ref = ip_address.as_deref();
        let mods_option = if enabled_mods.is_empty() {
            None
        } else {
            Some(enabled_mods.as_slice())
        };

        if let Err(e) = state.process_manager.start_server(
            server_id,
            "ASA",
            &install_path,
            &map_name,
            &session_name,
            game_port,
            query_port,
            rcon_port,
            max_players,
            server_password_ref,
            &admin_password,
            ip_address_ref,
            Some(&cluster_name),
            Some(&cluster_path),
            mods_option,
            custom_args.as_deref(),
        ) {
            println!("  ⚠️ Failed to start server {}: {}", server_id, e);
        } else {
            // Update status in database
            if let Ok(db) = state.db.lock() {
                if let Ok(conn) = db.get_connection() {
                    let _ = conn.execute(
                        "UPDATE servers SET status = 'starting' WHERE id = ?1",
                        [server_id],
                    );
                }
            }
            println!("  ✅ Started server {}", server_id);
        }
        // Small delay between starts to prevent overwhelming the system
        std::thread::sleep(std::time::Duration::from_secs(5));
    }

    Ok(())
}

/// Stop all servers in a cluster
#[tauri::command]
pub async fn stop_cluster(state: State<'_, AppState>, cluster_id: i64) -> Result<(), String> {
    println!("⏹️ Stopping all servers in cluster {}", cluster_id);

    let server_ids: Vec<i64> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT s.id FROM servers s
                 INNER JOIN cluster_servers cs ON s.id = cs.server_id
                 WHERE cs.cluster_id = ?1 AND s.status = 'running'",
            )
            .map_err(|e| e.to_string())?;

        let mut result = Vec::new();
        let mut rows = stmt.query([cluster_id]).map_err(|e| e.to_string())?;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            if let Ok(id) = row.get::<_, i64>(0) {
                result.push(id);
            }
        }
        result
    };

    // Stop each server
    for server_id in server_ids {
        if let Err(e) = state.process_manager.stop_server(server_id) {
            println!("  ⚠️ Failed to stop server {}: {}", server_id, e);
        } else {
            // Update status in database
            if let Ok(db) = state.db.lock() {
                if let Ok(conn) = db.get_connection() {
                    let _ = conn.execute(
                        "UPDATE servers SET status = 'stopped' WHERE id = ?1",
                        [server_id],
                    );
                }
            }
            println!("  ✅ Stopped server {}", server_id);
        }
    }

    Ok(())
}

/// Toggle cross-server chat for a cluster
/// EXPERIMENTAL FEATURE
#[tauri::command]
pub async fn toggle_cluster_cross_chat(
    state: State<'_, AppState>,
    cluster_id: i64,
    enabled: bool,
) -> Result<(), String> {
    println!(
        "💬 {} cross-chat for cluster {}",
        if enabled { "Enabling" } else { "Disabling" },
        cluster_id
    );

    // Store setting in database
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        // First check if setting exists
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM cluster_settings WHERE cluster_id = ?1 AND key = 'cross_chat_enabled'",
                [cluster_id],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if exists {
            conn.execute(
                "UPDATE cluster_settings SET value = ?1 WHERE cluster_id = ?2 AND key = 'cross_chat_enabled'",
                rusqlite::params![if enabled { "true" } else { "false" }, cluster_id],
            )
            .map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "INSERT INTO cluster_settings (cluster_id, key, value) VALUES (?1, 'cross_chat_enabled', ?2)",
                rusqlite::params![cluster_id, if enabled { "true" } else { "false" }],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    println!(
        "  ✅ Cross-chat {} for cluster {}",
        if enabled { "enabled" } else { "disabled" },
        cluster_id
    );
    Ok(())
}

/// Get cross-chat status for a cluster
#[tauri::command]
pub async fn get_cluster_cross_chat_status(
    state: State<'_, AppState>,
    cluster_id: i64,
) -> Result<bool, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let enabled: bool = conn
        .query_row(
            "SELECT value = 'true' FROM cluster_settings WHERE cluster_id = ?1 AND key = 'cross_chat_enabled'",
            [cluster_id],
            |row| row.get(0),
        )
        .unwrap_or(false);

    Ok(enabled)
}

// ============================================================================
// Discord Bridge Commands
// ============================================================================

/// Discord bridge configuration for frontend
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct DiscordBridgeConfigDto {
    pub cluster_id: i64,
    pub enabled: bool,
    pub bot_token: String,
    pub guild_id: String,
    pub channel_id: String,
    pub game_to_discord: bool,
    pub discord_to_game: bool,
}

/// Save Discord bridge configuration for a cluster
#[tauri::command]
pub async fn save_discord_bridge_config(
    state: State<'_, AppState>,
    config: DiscordBridgeConfigDto,
) -> Result<(), String> {
    println!(
        "💾 Saving Discord bridge config for cluster {}",
        config.cluster_id
    );

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    // Upsert config
    conn.execute(
        "INSERT INTO discord_bridge_config 
         (cluster_id, enabled, bot_token, guild_id, channel_id, game_to_discord, discord_to_game, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, CURRENT_TIMESTAMP)
         ON CONFLICT(cluster_id) DO UPDATE SET
             enabled = excluded.enabled,
             bot_token = excluded.bot_token,
             guild_id = excluded.guild_id,
             channel_id = excluded.channel_id,
             game_to_discord = excluded.game_to_discord,
             discord_to_game = excluded.discord_to_game,
             updated_at = CURRENT_TIMESTAMP",
        rusqlite::params![
            config.cluster_id,
            config.enabled as i32,
            config.bot_token,
            config.guild_id,
            config.channel_id,
            config.game_to_discord as i32,
            config.discord_to_game as i32,
        ],
    )
    .map_err(|e| format!("Failed to save config: {}", e))?;

    println!("  ✅ Discord bridge config saved");
    Ok(())
}

/// Get Discord bridge configuration for a cluster
#[tauri::command]
pub async fn get_discord_bridge_config(
    state: State<'_, AppState>,
    cluster_id: i64,
) -> Result<Option<DiscordBridgeConfigDto>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let result = conn.query_row(
        "SELECT cluster_id, enabled, bot_token, guild_id, channel_id, game_to_discord, discord_to_game
         FROM discord_bridge_config WHERE cluster_id = ?1",
        [cluster_id],
        |row| {
            Ok(DiscordBridgeConfigDto {
                cluster_id: row.get(0)?,
                enabled: row.get::<_, i32>(1)? != 0,
                bot_token: row.get(2)?,
                guild_id: row.get(3)?,
                channel_id: row.get(4)?,
                game_to_discord: row.get::<_, i32>(5)? != 0,
                discord_to_game: row.get::<_, i32>(6)? != 0,
            })
        },
    );

    match result {
        Ok(config) => Ok(Some(config)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Failed to get config: {}", e)),
    }
}

/// Test Discord connection
#[tauri::command]
pub async fn test_discord_connection(
    bot_token: String,
    channel_id: String,
) -> Result<String, String> {
    println!("🧪 Testing Discord connection...");

    if bot_token.is_empty() {
        return Err("Bot token is required".to_string());
    }

    if channel_id.is_empty() {
        return Err("Channel ID is required".to_string());
    }

    let client = reqwest::Client::new();
    let url = format!("https://discord.com/api/v10/channels/{}", channel_id);

    let response = client
        .get(&url)
        .header("Authorization", format!("Bot {}", bot_token))
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    if response.status().is_success() {
        let channel: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        let channel_name = channel["name"].as_str().unwrap_or("Unknown");
        let guild_name = channel["guild_id"].as_str().unwrap_or("Unknown");

        println!(
            "  ✅ Connected to #{} (Guild: {})",
            channel_name, guild_name
        );
        Ok(format!("Connected to #{}", channel_name))
    } else {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();

        let error_msg = if status.as_u16() == 401 {
            "Invalid bot token".to_string()
        } else if status.as_u16() == 404 {
            "Channel not found or bot doesn't have access".to_string()
        } else {
            format!("Discord API error {}: {}", status, body)
        };

        println!("  ❌ Connection failed: {}", error_msg);
        Err(error_msg)
    }
}
