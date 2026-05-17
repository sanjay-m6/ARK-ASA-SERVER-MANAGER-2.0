// Discord Control Panel Commands
// Extensions to commands/discord.rs for the premium control panel UI

use crate::AppState;
use tauri::State;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerHealthInfo {
    pub id: i64,
    pub name: String,
    pub status: String,
    pub player_count: i32,
    pub max_players: i32,
    pub cpu_usage: f64,
    pub ram_usage: f64,
    pub fps: f64,
    pub uptime: String,
    pub last_started: Option<String>,
    pub mods: Vec<String>,
    pub crashed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerInfoForPanel {
    pub steam_id: String,
    pub name: String,
    pub server_id: i64,
    pub level: i32,
    pub tribe: String,
    pub playtime_minutes: i32,
    pub location: String,
    pub ping: i32,
}

/// Get cluster servers with full health metrics
#[tauri::command]
pub async fn get_cluster_servers_health(
    state: State<'_, AppState>,
    cluster_id: i64,
) -> Result<Vec<ServerHealthInfo>, String> {
    // Get player counts before opening DB connection to avoid holding non-Send types across await
    let player_counts = state.player_intelligence.get_player_counts().await;

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, status, max_players, last_started FROM servers WHERE cluster_id = ?1"
        )
        .map_err(|e| e.to_string())?;

    let mut servers = Vec::new();
    let mut rows = stmt.query([cluster_id]).map_err(|e| e.to_string())?;

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let id: i64 = row.get(0).map_err(|e| e.to_string())?;
        let name: String = row.get(1).unwrap_or_default();
        let status: String = row.get(2).unwrap_or_default();
        let max_players: i32 = row.get(3).unwrap_or(0);
        let last_started: Option<String> = row.get(4).unwrap_or_default();

        let player_count = player_counts.get(&id).copied().unwrap_or(0);

        // Calculate uptime
        let uptime = if let Some(started_ts_str) = &last_started {
            if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(started_ts_str, "%Y-%m-%d %H:%M:%S") {
                let started_ts = dt.and_utc().timestamp();
                let now_ts = chrono::Utc::now().timestamp();
                let elapsed = now_ts - started_ts;
                let hours = elapsed / 3600;
                let minutes = (elapsed % 3600) / 60;
                format!("{}h {}m", hours, minutes)
            } else {
                "Unknown".to_string()
            }
        } else {
            "Not running".to_string()
        };

        // Get mods for this server
        let mods: Vec<String> = conn
            .prepare("SELECT name FROM mods WHERE server_id = ?1 AND enabled = 1")
            .ok()
            .and_then(|mut stmt| {
                stmt.query_map([id], |row| row.get::<_, String>(0))
                    .ok()
                    .map(|rows| rows.filter_map(|r| r.ok()).collect())
            })
            .unwrap_or_default();

        // Check if crashed (for now, use status; could be enhanced with monitoring)
        let crashed = status.contains("crashed");

        // Get system metrics (CPU, RAM, FPS)
        let (cpu_usage, ram_usage, fps) = get_server_metrics(&state, id);

        servers.push(ServerHealthInfo {
            id,
            name,
            status,
            player_count,
            max_players,
            cpu_usage,
            ram_usage,
            fps,
            uptime,
            last_started,
            mods,
            crashed,
        });
    }

    Ok(servers)
}

fn resolve_player_infos(
    state: &AppState,
    active_sessions: Vec<(String, i64, String)>,
    server_id: Option<i64>,
) -> Result<Vec<PlayerInfoForPanel>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let mut players = Vec::new();

    for (steam_id, sess_server_id, player_name) in active_sessions {
        // Filter by server if specified
        if let Some(srv_id) = server_id {
            if sess_server_id != srv_id {
                continue;
            }
        }

        // Get player stats
        let (level, tribe, playtime_minutes, location, ping) = conn
            .query_row(
                "SELECT COALESCE((SELECT json_extract(notes, '$.level') FROM player_stats WHERE steam_id = ?1), 1),
                        COALESCE((SELECT json_extract(notes, '$.tribe') FROM player_stats WHERE steam_id = ?1), ''),
                        COALESCE(total_playtime_minutes, 0),
                        COALESCE((SELECT json_extract(notes, '$.location') FROM player_stats WHERE steam_id = ?1), ''),
                        COALESCE((SELECT json_extract(notes, '$.ping') FROM player_stats WHERE steam_id = ?1), 0)
                 FROM player_stats WHERE steam_id = ?1",
                [&steam_id],
                |row| {
                    Ok((
                        row.get::<_, i32>(0).unwrap_or(1),
                        row.get::<_, String>(1).unwrap_or_default(),
                        row.get::<_, i32>(2).unwrap_or(0),
                        row.get::<_, String>(3).unwrap_or_default(),
                        row.get::<_, i32>(4).unwrap_or(0),
                    ))
                },
            )
            .unwrap_or((1, String::new(), 0, String::new(), 0));

        players.push(PlayerInfoForPanel {
            steam_id: steam_id.clone(),
            name: player_name,
            server_id: sess_server_id,
            level,
            tribe,
            playtime_minutes,
            location,
            ping,
        });
    }

    Ok(players)
}

/// Get active players, optionally filtered by server
#[tauri::command]
pub async fn get_active_players(
    state: State<'_, AppState>,
    _cluster_id: i64,
    server_id: Option<i64>,
) -> Result<Vec<PlayerInfoForPanel>, String> {
    // Get active sessions first to avoid holding DB lock across await
    let active_sessions = state.player_intelligence.get_all_active_sessions().await;
    resolve_player_infos(&state, active_sessions, server_id)
}

/// Get Discord bridge status
#[tauri::command]
pub async fn get_discord_bridge_status(
    state: State<'_, AppState>,
    cluster_id: i64,
) -> Result<crate::services::discord_bridge::DiscordBridgeStatus, String> {
    let cfg = state.discord_bridge.get_config().await;
    if cfg.is_none() || cfg.as_ref().unwrap().cluster_id != cluster_id {
        return Err("Bridge not configured for this cluster".to_string());
    }

    Ok(state.discord_bridge.get_status().await)
}

// Helper function to get server metrics (CPU, RAM, FPS)
// In a real implementation, these would come from system monitoring
fn get_server_metrics(state: &AppState, _server_id: i64) -> (f64, f64, f64) {
    let mut sys = state.sys.lock().unwrap();
    sys.refresh_cpu_usage();
    let cpus = sys.cpus();
    let cpu_usage = if !cpus.is_empty() {
        cpus.iter().map(|c| c.cpu_usage()).sum::<f32>() as f64 / cpus.len() as f64
    } else {
        0.0
    };
    let total_memory = sys.total_memory() as f64;
    let used_memory = sys.used_memory() as f64;
    let ram_usage = (used_memory / total_memory) * 100.0;
    let fps = 60.0; // Placeholder; would fetch from actual server data

    (cpu_usage, ram_usage, fps)
}
