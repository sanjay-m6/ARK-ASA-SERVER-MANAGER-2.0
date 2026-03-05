// RCON Service for ASA Server Manager
// Handles remote console connections to ARK: Survival Ascended servers

use crate::models::{RconPlayer, RconResponse};
use rcon::Connection;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::net::TcpStream;
use tokio::sync::Mutex;
use tokio::time::{timeout, Duration};

/// Maximum time to wait for a single RCON connection attempt
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

/// Maximum number of retry attempts when connecting
const MAX_RETRIES: u32 = 10;

/// Base delay between retries (multiplied by attempt number for linear backoff)
const RETRY_BASE_DELAY: Duration = Duration::from_secs(2);

struct RconSession {
    connection: Connection<TcpStream>,
    address: String,
    port: u16,
    password: String,
}

#[derive(Clone)]
pub struct RconService {
    sessions: Arc<Mutex<HashMap<i64, RconSession>>>,
}

impl RconService {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
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

            match timeout(
                CONNECT_TIMEOUT,
                Connection::<TcpStream>::builder().connect(&addr, password),
            )
            .await
            {
                Ok(Ok(conn)) => {
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
                        "[RCON] Successfully connected to server {} at {} on attempt {}",
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
                Ok(Err(e)) => {
                    last_error = format!("{}", e);
                    log::warn!(
                        "[RCON] Attempt {}/{} failed for server {}: {}",
                        attempt,
                        MAX_RETRIES,
                        server_id,
                        last_error
                    );
                }
                Err(_) => {
                    last_error = "Connection timed out".to_string();
                    log::warn!(
                        "[RCON] Attempt {}/{} timed out for server {} ({}s limit)",
                        attempt,
                        MAX_RETRIES,
                        server_id,
                        CONNECT_TIMEOUT.as_secs()
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

    /// Send an RCON command. If the connection is stale (server restarted),
    /// the backend attempts to reconnect automatically ONCE before returning an error.
    pub async fn send_command(
        &self,
        server_id: i64,
        command: &str,
    ) -> Result<RconResponse, String> {
        let mut sessions = self.sessions.lock().await;

        if let Some(session) = sessions.get_mut(&server_id) {
            log::info!(
                "[RCON] Sending command to server {}: {}",
                server_id,
                command
            );

            match session.connection.cmd(command).await {
                Ok(response) => {
                    log::info!(
                        "[RCON] Command '{}' executed on server {}, response length: {}",
                        command,
                        server_id,
                        response.len()
                    );
                    Ok(RconResponse {
                        success: true,
                        message: "Command executed".to_string(),
                        data: Some(response),
                    })
                }
                Err(e) => {
                    // Connection is likely dead — try auto-reconnect
                    log::warn!(
                        "[RCON] Command '{}' failed on server {}: {}. Attempting auto-reconnect...",
                        command,
                        server_id,
                        e
                    );

                    let addr = format!("{}:{}", session.address, session.port);
                    let password = session.password.clone();

                    // Drop lock before trying to connect (avoid deadlocks if connect uses it,
                    // though connect currently uses its own local variables until the end)
                    drop(sessions);

                    // Attempt a fresh connection (single attempt, no loop here to keep it fast)
                    match timeout(
                        CONNECT_TIMEOUT,
                        Connection::<TcpStream>::builder().connect(&addr, &password),
                    )
                    .await
                    {
                        Ok(Ok(new_conn)) => {
                            log::info!("[RCON] Auto-reconnect successful for server {}", server_id);
                            let mut sessions = self.sessions.lock().await;

                            // Update the session connection
                            if let Some(s) = sessions.get_mut(&server_id) {
                                s.connection = new_conn;

                                // Retry the command once
                                match s.connection.cmd(command).await {
                                    Ok(response) => {
                                        log::info!(
                                            "[RCON] Command '{}' executed successfully after auto-reconnect for server {}",
                                            command,
                                            server_id
                                        );
                                        return Ok(RconResponse {
                                            success: true,
                                            message: "Command executed after auto-reconnect"
                                                .to_string(),
                                            data: Some(response),
                                        });
                                    }
                                    Err(retry_err) => {
                                        log::error!("[RCON] Command failed again after auto-reconnect for server {}: {}", server_id, retry_err);
                                        sessions.remove(&server_id);
                                        return Err(format!(
                                            "RCON connection lost and recovery failed ({}).",
                                            retry_err
                                        ));
                                    }
                                }
                            } else {
                                // Session was removed while we were reconnecting?
                                return Err("RCON session lost during auto-reconnect.".to_string());
                            }
                        }
                        _ => {
                            log::error!(
                                "[RCON] Auto-reconnect failed for server {}. Removing stale session.",
                                server_id
                            );
                            let mut sessions = self.sessions.lock().await;
                            sessions.remove(&server_id);
                            return Err(format!("RCON connection lost and auto-reconnect failed."));
                        }
                    }
                }
            }
        } else {
            log::warn!(
                "[RCON] Command '{}' rejected — no active connection for server {}",
                command,
                server_id
            );
            Err("No active RCON connection for this server".to_string())
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
        let command = format!("ServerChat {}", message);
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

    pub fn spawn_heartbeat(&self) {
        let service = self.clone();
        tauri::async_runtime::spawn(async move {
            log::info!("[RCON] Starting background keep-alive heartbeat task...");
            let mut interval = tokio::time::interval(Duration::from_secs(60));

            loop {
                interval.tick().await;

                let server_ids: Vec<i64> = {
                    let sessions = service.sessions.lock().await;
                    sessions.keys().cloned().collect()
                };

                if server_ids.is_empty() {
                    continue;
                }

                for server_id in server_ids {
                    // We use send_command here because it already has auto-reconnect logic!
                    // Sending a simple 'ListPlayers' acts as a perfect keep-alive.
                    let _ = service.send_command(server_id, "ListPlayers").await;
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
