// RCON Service for ASA Server Manager
// Handles remote console connections to ARK: Survival Ascended servers
//
// Uses a custom ArkRconClient to correctly handle ASA's quirks:
// 1. Lossy UTF-8 parsing to prevent crashes from garbage bytes/foreign characters.
// 2. Fragment-based multi-packet aggregation since ASA doesn't send sentinel empty packets.
// (File updated by AI - IDE sync trigger)

use crate::models::{RconPlayer, RconResponse};
use crate::services::ark_rcon::ArkRconClient;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;
use tokio::time::Duration;

/// Maximum number of retry attempts when connecting
const MAX_RETRIES: u32 = 10;

/// Base delay between retries (multiplied by attempt number for linear backoff)
const RETRY_BASE_DELAY: Duration = Duration::from_secs(2);

struct RconSession {
    connection: ArkRconClient,
    address: String,
    port: u16,
    password: String,
}

#[derive(Clone)]
pub struct RconService {
    sessions: Arc<Mutex<HashMap<i64, RconSession>>>,
    app_handle: Arc<Mutex<Option<tauri::AppHandle>>>,
}

impl RconService {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            app_handle: Arc::new(Mutex::new(None)),
        }
    }

    pub fn with_app_handle(app_handle: tauri::AppHandle) -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            app_handle: Arc::new(Mutex::new(Some(app_handle))),
        }
    }

    /// Connect to a server's RCON with timeout and retry logic.
    /// ARK: ASA servers can take 30–120s to fully start RCON, so we retry
    /// up to MAX_RETRIES times with linear backoff before giving up.
    pub async fn connect(
        &self,
        server_id: i64,
        address: &str,
        port: u16,
        password: &str,
    ) -> Result<RconResponse, String> {
        let addr = format!("{}:{}", address, port);
        log::info!(
            "[RCON] Attempting to connect to server {} at {}",
            server_id,
            addr
        );

        let mut last_error = String::new();

        for attempt in 1..=MAX_RETRIES {
            log::info!(
                "[RCON] Connection attempt {}/{} for server {} at {}",
                attempt,
                MAX_RETRIES,
                server_id,
                addr
            );

            match ArkRconClient::connect(&addr, password).await {
                Ok(conn) => {
                    let mut sessions = self.sessions.lock().await;
                    sessions.insert(
                        server_id,
                        RconSession {
                            connection: conn,
                            address: address.to_string(),
                            port,
                            password: password.to_string(),
                        },
                    );
                    log::info!(
                        "[RCON] Successfully connected and authenticated to server {} at {} on attempt {}",
                        server_id,
                        addr,
                        attempt
                    );
                    return Ok(RconResponse {
                        success: true,
                        message: format!("Connected to RCON at {}", addr),
                        data: None,
                    });
                }
                Err(err_str) => {
                    if err_str.contains("Authentication Failed") {
                        log::error!(
                            "[RCON] Authentication failed for server {} at {} — wrong admin password",
                            server_id,
                            addr
                        );
                        return Err(
                            "Authentication Failed: The admin password was rejected by the server."
                                .to_string(),
                        );
                    }
                    last_error = err_str;
                    log::warn!(
                        "[RCON] Attempt {}/{} failed for server {}: {}",
                        attempt,
                        MAX_RETRIES,
                        server_id,
                        last_error
                    );
                }
            }

            // Don't sleep after the last attempt
            if attempt < MAX_RETRIES {
                let delay = RETRY_BASE_DELAY * attempt;
                log::info!(
                    "[RCON] Waiting {}s before retry for server {}...",
                    delay.as_secs(),
                    server_id
                );
                tokio::time::sleep(delay).await;
            }
        }

        log::error!(
            "[RCON] All {} connection attempts exhausted for server {} at {}. Last error: {}",
            MAX_RETRIES,
            server_id,
            addr,
            last_error
        );
        Err(format!(
            "Failed to connect to RCON after {} attempts. Last error: {}",
            MAX_RETRIES, last_error
        ))
    }

    /// Disconnect from a server's RCON
    pub async fn disconnect(&self, server_id: i64) -> Result<RconResponse, String> {
        let mut sessions = self.sessions.lock().await;
        if sessions.remove(&server_id).is_some() {
            log::info!("[RCON] Disconnected from server {}", server_id);
            Ok(RconResponse {
                success: true,
                message: "Disconnected from RCON".to_string(),
                data: None,
            })
        } else {
            log::warn!(
                "[RCON] Disconnect requested but no active connection for server {}",
                server_id
            );
            Err("No active RCON connection for this server".to_string())
        }
    }

    /// Send an RCON command with timeout protection.
    /// If the connection is stale (server restarted), attempts auto-reconnect ONCE.
    pub async fn send_command(
        &self,
        server_id: i64,
        command: &str,
    ) -> Result<RconResponse, String> {
        let trimmed = command.trim();
        let lower = trimmed.to_lowercase();
        let mut command_owned = trimmed.to_string();
        let mut broadcast_msg: Option<String> = None;

        if lower.starts_with("broadcast ") {
            let msg_trimmed = trimmed[10..].trim();
            if !msg_trimmed.is_empty() {
                let clean = msg_trimmed.trim_matches('"');
                broadcast_msg = Some(clean.to_string());
                if !msg_trimmed.starts_with('"') || !msg_trimmed.ends_with('"') {
                    command_owned = format!("Broadcast \"{}\"", clean);
                }
            }
        } else if lower.starts_with("cheat broadcast ") {
            let msg_trimmed = trimmed[16..].trim();
            if !msg_trimmed.is_empty() {
                let clean = msg_trimmed.trim_matches('"');
                broadcast_msg = Some(clean.to_string());
                if !msg_trimmed.starts_with('"') || !msg_trimmed.ends_with('"') {
                    command_owned = format!("Broadcast \"{}\"", clean);
                }
            }
        } else if lower.starts_with("admincheat broadcast ") {
            let msg_trimmed = trimmed[21..].trim();
            if !msg_trimmed.is_empty() {
                let clean = msg_trimmed.trim_matches('"');
                broadcast_msg = Some(clean.to_string());
                if !msg_trimmed.starts_with('"') || !msg_trimmed.ends_with('"') {
                    command_owned = format!("Broadcast \"{}\"", clean);
                }
            }
        } else if lower.starts_with("serverchat ") {
            let msg_trimmed = trimmed[11..].trim();
            if !msg_trimmed.is_empty() && (!msg_trimmed.starts_with('"') || !msg_trimmed.ends_with('"')) {
                command_owned = format!("ServerChat \"{}\"", msg_trimmed.trim_matches('"'));
            }
        } else if lower.starts_with("cheat serverchat ") {
            let msg_trimmed = trimmed[17..].trim();
            if !msg_trimmed.is_empty() && (!msg_trimmed.starts_with('"') || !msg_trimmed.ends_with('"')) {
                command_owned = format!("ServerChat \"{}\"", msg_trimmed.trim_matches('"'));
            }
        } else if lower.starts_with("admincheat serverchat ") {
            let msg_trimmed = trimmed[22..].trim();
            if !msg_trimmed.is_empty() && (!msg_trimmed.starts_with('"') || !msg_trimmed.ends_with('"')) {
                command_owned = format!("ServerChat \"{}\"", msg_trimmed.trim_matches('"'));
            }
        } else if lower.starts_with("serverchatsilent ") {
            let msg_trimmed = trimmed[17..].trim();
            if !msg_trimmed.is_empty() && (!msg_trimmed.starts_with('"') || !msg_trimmed.ends_with('"')) {
                command_owned = format!("ServerChatSilent \"{}\"", msg_trimmed.trim_matches('"'));
            }
        } else if lower.starts_with("cheat serverchatsilent ") {
            let msg_trimmed = trimmed[23..].trim();
            if !msg_trimmed.is_empty() && (!msg_trimmed.starts_with('"') || !msg_trimmed.ends_with('"')) {
                command_owned = format!("ServerChatSilent \"{}\"", msg_trimmed.trim_matches('"'));
            }
        } else if lower.starts_with("admincheat serverchatsilent ") {
            let msg_trimmed = trimmed[28..].trim();
            if !msg_trimmed.is_empty() && (!msg_trimmed.starts_with('"') || !msg_trimmed.ends_with('"')) {
                command_owned = format!("ServerChatSilent \"{}\"", msg_trimmed.trim_matches('"'));
            }
        }

        let mut sessions = self.sessions.lock().await;

        if let Some(session) = sessions.get_mut(&server_id) {
            log::info!(
                "[RCON] Sending command to server {}: '{}'",
                server_id,
                command_owned
            );

            // In ASA, native RCON Broadcast commands are bugged/suppressed in ArkAscendedServer.exe.
            // Dual-dispatch ServerChat so announcements render reliably in the in-game chat box for players.
            if let Some(clean_msg) = &broadcast_msg {
                if !clean_msg.is_empty() {
                    let chat_cmd = format!("ServerChat \"[ANNOUNCEMENT] {}\"", clean_msg);
                    log::info!("[RCON] Dual-dispatching ServerChat for ASA announcement on server {}: '{}'", server_id, chat_cmd);
                    let _ = session.connection.send_command(&chat_cmd).await;
                }
            }

            match session.connection.send_command(&command_owned).await {
                Ok(response) => {
                    log::info!(
                        "[RCON] Command '{}' executed on server {}, response length: {} bytes",
                        command_owned,
                        server_id,
                        response.len()
                    );
                    log::debug!(
                        "[RCON] Response body for '{}' on server {}: {:?}",
                        command_owned,
                        server_id,
                        &response[..response.len().min(500)]
                    );
                    Ok(RconResponse {
                        success: true,
                        message: "Command executed".to_string(),
                        data: Some(response),
                    })
                }
                Err(e) => {
                    // Command returned an error — connection is likely dead
                    log::warn!(
                        "[RCON] Command '{}' failed on server {}: {}. Attempting auto-reconnect...",
                        command_owned,
                        server_id,
                        e
                    );

                    let addr = format!("{}:{}", session.address, session.port);
                    let password = session.password.clone();
                    drop(sessions);

                    self.try_reconnect_and_retry(server_id, &addr, &password, &command_owned)
                        .await
                }
            }
        } else {
            // Check if we can automatically establish the connection
            let mut auto_connected = false;
            let mut ip = String::new();
            let mut port = 0u16;
            let mut pwd = String::new();

            if let Some(app_handle) = self.app_handle.try_lock().ok().and_then(|guard| guard.clone()) {
                if let Some(state) = app_handle.try_state::<crate::AppState>() {
                    if let Ok(db) = state.db.lock() {
                        if let Ok(conn) = db.get_connection() {
                            if server_id > 0 {
                                // ASA
                                if let Ok(mut stmt) = conn.prepare("SELECT COALESCE(ip_address, '127.0.0.1'), rcon_port, admin_password FROM servers WHERE id = ?1") {
                                    if let Ok(mut rows) = stmt.query([server_id]) {
                                        if let Ok(Some(row)) = rows.next() {
                                            if let (Ok(db_ip), Ok(db_port), Ok(db_pwd)) = (row.get::<_, String>(0), row.get::<_, i64>(1), row.get::<_, String>(2)) {
                                                ip = db_ip;
                                                port = db_port as u16;
                                                pwd = db_pwd;
                                                auto_connected = true;
                                            }
                                        }
                                    }
                                }
                            } else {
                                // ASE (negative ID)
                                let clean_id = server_id.abs();
                                if let Ok(mut stmt) = conn.prepare("SELECT '127.0.0.1', rcon_port, admin_password FROM ase_servers WHERE id = ?1") {
                                    if let Ok(mut rows) = stmt.query([clean_id]) {
                                        if let Ok(Some(row)) = rows.next() {
                                            if let (Ok(db_ip), Ok(db_port), Ok(db_pwd)) = (row.get::<_, String>(0), row.get::<_, i64>(1), row.get::<_, String>(2)) {
                                                ip = db_ip;
                                                port = db_port as u16;
                                                pwd = db_pwd;
                                                auto_connected = true;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if auto_connected && !pwd.is_empty() {
                log::info!(
                    "[RCON] No active session for server {}. Attempting auto-connect to {}:{}...",
                    server_id,
                    ip,
                    port
                );
                // Sanitize any corrupted ?ServerPassword= suffixes from the database
                let clean_password = pwd
                    .split("?ServerPassword=")
                    .next()
                    .unwrap_or(&pwd)
                    .to_string();

                drop(sessions); // Drop mutex guard before calling connect to avoid deadlock!

                if let Ok(resp) = self.connect(server_id, &ip, port, &clean_password).await {
                    if resp.success {
                        log::info!("[RCON] Auto-connect successful for server {}. Retrying command...", server_id);
                        // Re-acquire lock and retry send
                        let mut sessions = self.sessions.lock().await;
                        if let Some(session) = sessions.get_mut(&server_id) {
                            match session.connection.send_command(&command_owned).await {
                                Ok(response) => {
                                    return Ok(RconResponse {
                                        success: true,
                                        message: "Command executed after auto-connect".to_string(),
                                        data: Some(response),
                                    });
                                }
                                Err(e) => {
                                    return Err(format!("Command failed after auto-connect: {}", e));
                                }
                            }
                        }
                    }
                }
                // If auto-connect or retry failed:
                return Err("No active RCON connection, and auto-connection failed".to_string());
            }

            log::warn!(
                "[RCON] Command '{}' rejected — no active connection for server {}",
                command_owned,
                server_id
            );
            Err("No active RCON connection for this server".to_string())
        }
    }

    /// Attempt a single reconnection and retry the command.
    async fn try_reconnect_and_retry(
        &self,
        server_id: i64,
        addr: &str,
        password: &str,
        command: &str,
    ) -> Result<RconResponse, String> {
        match ArkRconClient::connect(addr, password).await {
            Ok(new_conn) => {
                log::info!("[RCON] Auto-reconnect successful for server {}", server_id);
                let mut sessions = self.sessions.lock().await;

                if let Some(s) = sessions.get_mut(&server_id) {
                    s.connection = new_conn;

                    // Retry the command once
                    match s.connection.send_command(command).await {
                        Ok(response) => {
                            log::info!(
                                "[RCON] Command '{}' executed successfully after auto-reconnect for server {}",
                                command,
                                server_id
                            );
                            Ok(RconResponse {
                                success: true,
                                message: "Command executed after auto-reconnect".to_string(),
                                data: Some(response),
                            })
                        }
                        Err(retry_err) => {
                            log::error!(
                                "[RCON] Command failed again after auto-reconnect for server {}: {}",
                                server_id,
                                retry_err
                            );
                            sessions.remove(&server_id);
                            Err(format!(
                                "Connection lost and recovery failed: {}",
                                retry_err
                            ))
                        }
                    }
                } else {
                    Err("RCON session lost during auto-reconnect.".to_string())
                }
            }
            Err(e) => {
                log::error!(
                    "[RCON] Auto-reconnect authentication failed for server {}: {}",
                    server_id,
                    e
                );
                let mut sessions = self.sessions.lock().await;
                sessions.remove(&server_id);
                Err(format!("Connection lost — reconnect failed: {}", e))
            }
        }
    }

    /// Get list of online players
    pub async fn get_players(&self, server_id: i64) -> Result<Vec<RconPlayer>, String> {
        let response = self.send_command(server_id, "ListPlayers").await?;

        if let Some(data) = response.data {
            let players = parse_player_list(&data);
            Ok(players)
        } else {
            Ok(vec![])
        }
    }

    /// Broadcast a message to all players
    pub async fn broadcast(&self, server_id: i64, message: &str) -> Result<RconResponse, String> {
        let trimmed = message.trim();
        let command = if trimmed.starts_with('"') && trimmed.ends_with('"') {
            format!("Broadcast {}", trimmed)
        } else {
            format!("Broadcast \"{}\"", trimmed)
        };
        self.send_command(server_id, &command).await
    }

    /// Kick a player
    pub async fn kick_player(
        &self,
        server_id: i64,
        steam_id: &str,
        reason: Option<&str>,
    ) -> Result<RconResponse, String> {
        let command = match reason {
            Some(r) => format!("KickPlayer {} {}", steam_id, r),
            None => format!("KickPlayer {}", steam_id),
        };
        self.send_command(server_id, &command).await
    }

    /// Ban a player
    pub async fn ban_player(&self, server_id: i64, steam_id: &str) -> Result<RconResponse, String> {
        let command = format!("BanPlayer {}", steam_id);
        self.send_command(server_id, &command).await
    }

    /// Unban a player
    pub async fn unban_player(
        &self,
        server_id: i64,
        steam_id: &str,
    ) -> Result<RconResponse, String> {
        let command = format!("UnbanPlayer {}", steam_id);
        self.send_command(server_id, &command).await
    }

    /// Save the world
    pub async fn save_world(&self, server_id: i64) -> Result<RconResponse, String> {
        self.send_command(server_id, "SaveWorld").await
    }

    /// Destroy all wild dinos
    pub async fn destroy_wild_dinos(&self, server_id: i64) -> Result<RconResponse, String> {
        self.send_command(server_id, "DestroyWildDinos").await
    }

    /// Set time of day
    pub async fn set_time(
        &self,
        server_id: i64,
        hour: u8,
        minute: u8,
    ) -> Result<RconResponse, String> {
        let command = format!("SetTimeOfDay {:02}:{:02}", hour, minute);
        self.send_command(server_id, &command).await
    }

    /// Send a private message to a player
    pub async fn message_player(
        &self,
        server_id: i64,
        steam_id: &str,
        message: &str,
    ) -> Result<RconResponse, String> {
        let command = format!("ServerChatTo {} {}", steam_id, message);
        self.send_command(server_id, &command).await
    }

    /// Check if connected to a server
    pub async fn is_connected(&self, server_id: i64) -> bool {
        let sessions = self.sessions.lock().await;
        sessions.contains_key(&server_id)
    }

    pub fn spawn_heartbeat(&self, app_handle: tauri::AppHandle) {
        {
            if let Ok(mut handle) = self.app_handle.try_lock() {
                *handle = Some(app_handle.clone());
            }
        }
        let service = self.clone();
        tauri::async_runtime::spawn(async move {
            log::info!("[RCON] Starting background player count heartbeat task...");
            // Initial delay to let servers finish starting
            tokio::time::sleep(Duration::from_secs(10)).await;
            let mut interval = tokio::time::interval(Duration::from_secs(30));

            loop {
                interval.tick().await;

                // Step 1: Query DB for all running/online servers with RCON enabled
                let servers_to_poll: Vec<(i64, String, u16, String)> = {
                    let state_opt = app_handle.try_state::<crate::AppState>();
                    if let Some(state) = state_opt {
                        if let Ok(db) = state.db.lock() {
                            if let Ok(conn) = db.get_connection() {
                                let mut stmt = match conn.prepare(
                                    "SELECT id, COALESCE(ip_address, '127.0.0.1') AS ip_address, rcon_port, admin_password \
                                     FROM servers \
                                     WHERE status IN ('running', 'online') \
                                       AND rcon_enabled = 1 \
                                       AND admin_password IS NOT NULL \
                                       AND admin_password != '' \
                                     UNION ALL \
                                     SELECT -id AS id, '127.0.0.1' AS ip_address, rcon_port, admin_password \
                                     FROM ase_servers \
                                     WHERE status IN ('running', 'online') \
                                       AND admin_password IS NOT NULL \
                                       AND admin_password != ''"
                                ) {
                                    Ok(s) => s,
                                    Err(e) => {
                                        log::warn!("[RCON Heartbeat] Failed to prepare query: {}", e);
                                        continue;
                                    }
                                };
                                let rows = stmt.query_map([], |row| {
                                    Ok((
                                        row.get::<_, i64>(0)?,
                                        row.get::<_, String>(1)?,
                                        row.get::<_, u16>(2)?,
                                        row.get::<_, String>(3)?,
                                    ))
                                });
                                match rows {
                                    Ok(iter) => iter.filter_map(|r| r.ok()).collect(),
                                    Err(_) => Vec::new(),
                                }
                            } else {
                                Vec::new()
                            }
                        } else {
                            Vec::new()
                        }
                    } else {
                        Vec::new()
                    }
                };

                if servers_to_poll.is_empty() {
                    // Clear player intelligence for all servers when none are running
                    continue;
                }

                // Step 2: For each running server, auto-connect if needed, then poll ListPlayers
                for (server_id, address, rcon_port, password) in &servers_to_poll {
                    // Sanitize password (same as rcon_connect command)
                    let clean_password = password
                        .split("?ServerPassword=")
                        .next()
                        .unwrap_or(password)
                        .to_string();

                    // Auto-connect if no active session exists
                    if !service.is_connected(*server_id).await {
                        log::info!(
                            "[RCON Heartbeat] Auto-connecting to server {} at {}:{} for player tracking",
                            server_id, address, rcon_port
                        );
                        // Use a single attempt (not full retry loop) to avoid blocking the heartbeat
                        let addr = format!("{}:{}", address, rcon_port);
                        match crate::services::ark_rcon::ArkRconClient::connect(&addr, &clean_password).await {
                            Ok(conn) => {
                                let mut sessions = service.sessions.lock().await;
                                sessions.insert(
                                    *server_id,
                                    RconSession {
                                        connection: conn,
                                        address: address.clone(),
                                        port: *rcon_port,
                                        password: clean_password.clone(),
                                    },
                                );
                                log::info!(
                                    "[RCON Heartbeat] Auto-connected to server {} for player tracking",
                                    server_id
                                );
                            }
                            Err(e) => {
                                log::debug!(
                                    "[RCON Heartbeat] Could not auto-connect to server {}: {} (will retry next cycle)",
                                    server_id, e
                                );
                                continue;
                            }
                        }
                    }

                    // Now poll ListPlayers
                    match service.send_command(*server_id, "ListPlayers").await {
                        Ok(response) => {
                            if let Some(data) = response.data {
                                let players = parse_player_list(&data);
                                let player_intel = app_handle.state::<Arc<crate::services::player_intelligence::PlayerIntelligenceService>>();
                                player_intel.inner().sync_players(*server_id, players).await;
                            }
                        }
                        Err(e) => {
                            log::debug!(
                                "[RCON Heartbeat] ListPlayers failed for server {}: {}",
                                server_id, e
                            );
                        }
                    }
                }

                // Step 3: Clean up sessions for servers that are no longer running
                let running_ids: std::collections::HashSet<i64> = servers_to_poll.iter().map(|(id, _, _, _)| *id).collect();
                let stale_ids: Vec<i64> = {
                    let sessions = service.sessions.lock().await;
                    sessions.keys()
                        .filter(|id| !running_ids.contains(id))
                        .cloned()
                        .collect()
                };

                for stale_id in stale_ids {
                    // Clear player sessions for stopped servers
                    let player_intel = app_handle.state::<Arc<crate::services::player_intelligence::PlayerIntelligenceService>>();
                    player_intel.inner().clear_server_sessions(stale_id).await;

                    // Remove RCON session
                    let mut sessions = service.sessions.lock().await;
                    sessions.remove(&stale_id);
                }
            }
        });
    }
}

/// Parse the ListPlayers response into player objects
fn parse_player_list(data: &str) -> Vec<RconPlayer> {
    let mut players = Vec::new();

    // Format: "0. PlayerName, SteamID"
    for line in data.lines() {
        let line = line.trim();
        if line.is_empty() || line == "No Players Connected" {
            continue;
        }

        // Try to parse the player line
        if let Some(dot_pos) = line.find('.') {
            let id_str = &line[..dot_pos];
            let rest = &line[dot_pos + 1..].trim();

            if let Ok(id) = id_str.trim().parse::<i64>() {
                // Split by comma to get name and steam id
                let parts: Vec<&str> = rest.splitn(2, ',').collect();
                if parts.len() >= 2 {
                    let name = parts[0].trim().to_string();
                    let steam_id = parts[1].trim().to_string();

                    players.push(RconPlayer { id, name, steam_id });
                }
            }
        }
    }

    players
}

impl Default for RconService {
    fn default() -> Self {
        Self::new()
    }
}
