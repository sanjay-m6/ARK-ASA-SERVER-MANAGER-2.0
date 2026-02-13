// Discord Bridge Service for Cross-Server Chat
// Enables two-way chat sync between ARK servers and Discord
// EXPERIMENTAL FEATURE

#![allow(dead_code)]

use reqwest::Client;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;

/// Discord bridge configuration
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DiscordBridgeConfig {
    pub cluster_id: i64,
    pub enabled: bool,
    pub bot_token: String,
    pub guild_id: String,
    pub channel_id: String,
    pub game_to_discord: bool,
    pub discord_to_game: bool,
    pub server_list_enabled: bool,
    pub server_list_channel_id: String,
    pub server_list_message_id: String,
    pub player_list_enabled: bool,
    pub player_list_channel_id: String,
    pub player_list_message_id: String,
    pub show_tribe_names: bool,
    pub show_playtime: bool,
}

impl Default for DiscordBridgeConfig {
    fn default() -> Self {
        Self {
            cluster_id: 0,
            enabled: false,
            bot_token: String::new(),
            guild_id: String::new(),
            channel_id: String::new(),
            game_to_discord: true,
            discord_to_game: true,
            server_list_enabled: false,
            server_list_channel_id: String::new(),
            server_list_message_id: String::new(),
            player_list_enabled: false,
            player_list_channel_id: String::new(),
            player_list_message_id: String::new(),
            show_tribe_names: true,
            show_playtime: true,
        }
    }
}

/// Rate limiter for messages
struct RateLimiter {
    messages: HashMap<String, Vec<Instant>>,
    max_messages: usize,
    window_seconds: u64,
}

impl RateLimiter {
    fn new(max_messages: usize, window_seconds: u64) -> Self {
        Self {
            messages: HashMap::new(),
            max_messages,
            window_seconds,
        }
    }

    fn is_allowed(&mut self, user_id: &str) -> bool {
        let now = Instant::now();
        let timestamps = self.messages.entry(user_id.to_string()).or_default();

        // Remove old entries
        timestamps.retain(|t| now.duration_since(*t).as_secs() < self.window_seconds);

        if timestamps.len() < self.max_messages {
            timestamps.push(now);
            true
        } else {
            false
        }
    }
}

use crate::services::player_intelligence::PlayerIntelligenceService;
use crate::AppState;
use serenity::all::{
    Client as SerenityClient, EventHandler as SerenityEventHandler, GatewayIntents, Ready,
};
use tauri::{AppHandle, Manager};

/// Server info for cluster display
struct ClusterServerInfo {
    id: i64,
    name: String,
    status: String,
    max_players: i32,
    last_started: Option<String>,
}

/// Minimal serenity event handler just to keep the bot online
struct GatewayHandler;

#[serenity::async_trait]
impl SerenityEventHandler for GatewayHandler {
    async fn ready(&self, _ctx: serenity::all::Context, ready: Ready) {
        println!("🟢 Discord bot '{}' is now ONLINE", ready.user.name);
    }
}

/// Discord Bridge Service
#[derive(Clone)]
pub struct DiscordBridgeService {
    app_handle: AppHandle,
    player_intelligence: Arc<PlayerIntelligenceService>,
    http_client: Client,
    config: Arc<Mutex<Option<DiscordBridgeConfig>>>,
    running: Arc<AtomicBool>,
    gateway_running: Arc<AtomicBool>,
    rate_limiter: Arc<Mutex<RateLimiter>>,
    sent_messages: Arc<Mutex<Vec<String>>>,
}

impl DiscordBridgeService {
    pub fn new(app_handle: AppHandle, player_intelligence: Arc<PlayerIntelligenceService>) -> Self {
        Self {
            app_handle,
            player_intelligence,
            http_client: Client::new(),
            config: Arc::new(Mutex::new(None)),
            running: Arc::new(AtomicBool::new(false)),
            gateway_running: Arc::new(AtomicBool::new(false)),
            rate_limiter: Arc::new(Mutex::new(RateLimiter::new(5, 10))), // 5 msgs per 10 seconds
            sent_messages: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Configure the bridge
    pub async fn configure(&self, config: DiscordBridgeConfig) {
        let mut cfg = self.config.lock().await;
        *cfg = Some(config);
    }

    /// Get current configuration
    pub async fn get_config(&self) -> Option<DiscordBridgeConfig> {
        let cfg = self.config.lock().await;
        cfg.clone()
    }

    /// Test Discord connection by fetching channel info
    pub async fn test_connection(&self) -> Result<String, String> {
        let config = self.config.lock().await;
        let config = config.as_ref().ok_or("No configuration set")?;

        self.test_connection_with_credentials(&config.bot_token, &config.channel_id)
            .await
    }

    /// Test Discord connection with specific credentials (for setup verification)
    /// Tests in 3 stages: token validity, guild membership, channel access
    pub async fn test_connection_with_credentials(
        &self,
        bot_token: &str,
        channel_id: &str,
    ) -> Result<String, String> {
        if bot_token.is_empty() {
            return Err("Bot token is required".to_string());
        }

        if channel_id.is_empty() {
            return Err("Channel ID is required".to_string());
        }

        // Stage 1: Validate bot token by checking /users/@me
        let me_url = "https://discord.com/api/v10/users/@me";
        let me_response = self
            .http_client
            .get(me_url)
            .header("Authorization", format!("Bot {}", bot_token))
            .send()
            .await
            .map_err(|e| format!("Connection failed: {}", e))?;

        if !me_response.status().is_success() {
            let status = me_response.status();
            if status.as_u16() == 401 {
                return Err("Invalid bot token. Please check your token in the Discord Developer Portal → Bot → Reset Token.".to_string());
            }
            let body = me_response.text().await.unwrap_or_default();
            return Err(format!(
                "Bot token validation failed ({}): {}",
                status, body
            ));
        }

        let bot_info: serde_json::Value = me_response
            .json()
            .await
            .map_err(|e| format!("Failed to parse bot info: {}", e))?;
        let bot_name = bot_info["username"].as_str().unwrap_or("Unknown Bot");

        // Stage 2: Check channel access
        let channel_url = format!("https://discord.com/api/v10/channels/{}", channel_id);
        let channel_response = self
            .http_client
            .get(&channel_url)
            .header("Authorization", format!("Bot {}", bot_token))
            .send()
            .await
            .map_err(|e| format!("Connection failed: {}", e))?;

        if channel_response.status().is_success() {
            let channel: serde_json::Value = channel_response
                .json()
                .await
                .map_err(|e| format!("Failed to parse response: {}", e))?;

            let channel_name = channel["name"].as_str().unwrap_or("Unknown");
            Ok(format!(
                "✅ Bot \"{}\" connected to #{}",
                bot_name, channel_name
            ))
        } else {
            let status = channel_response.status();
            if status.as_u16() == 403 {
                return Err(
                    "Bot does not have access to this channel. Fix:\n\
                    1. Re-invite the bot: Go to Discord Developer Portal → OAuth2 → URL Generator → Select 'bot' scope + permissions (View Channels, Send Messages, Read Message History, Manage Messages) → Copy URL → Open in browser → Select your server.\n\
                    2. Check channel permissions: Right-click the channel → Edit Channel → Permissions → Ensure the bot role has 'View Channel' and 'Send Messages' enabled."
                    .to_string()
                );
            }
            if status.as_u16() == 404 {
                return Err("Channel not found. Please check the Channel ID. Right-click the channel in Discord → Copy Channel ID.".to_string());
            }
            let body = channel_response.text().await.unwrap_or_default();
            Err(format!("Discord API error {}: {}", status, body))
        }
    }

    /// Send a message to Discord (Game → Discord)
    pub async fn send_to_discord(
        &self,
        server_name: &str,
        player_name: &str,
        message: &str,
    ) -> Result<(), String> {
        let config = self.config.lock().await;
        let config = config.as_ref().ok_or("No configuration set")?;

        if !config.enabled || !config.game_to_discord {
            return Ok(());
        }

        // Format: **[ServerName]** PlayerName: message
        let formatted = format!("**[{}]** {}: {}", server_name, player_name, message);

        // Track this message to prevent echo
        {
            let mut sent = self.sent_messages.lock().await;
            sent.push(formatted.clone());
            // Keep only last 100 messages
            if sent.len() > 100 {
                sent.remove(0);
            }
        }

        let url = format!(
            "https://discord.com/api/v10/channels/{}/messages",
            config.channel_id
        );

        let payload = json!({
            "content": formatted
        });

        let response = self
            .http_client
            .post(&url)
            .header("Authorization", format!("Bot {}", config.bot_token))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Failed to send message: {}", e))?;

        if response.status().is_success() {
            println!("📤 Sent to Discord: {}", formatted);
            Ok(())
        } else {
            let error = response.text().await.unwrap_or_default();
            Err(format!("Discord API error: {}", error))
        }
    }

    /// Check if a message should be relayed (not from us, passes rate limit)
    pub async fn should_relay_from_discord(
        &self,
        author_id: &str,
        content: &str,
        is_bot: bool,
    ) -> bool {
        let config = self.config.lock().await;
        let config = match config.as_ref() {
            Some(c) => c,
            None => return false,
        };

        if !config.enabled || !config.discord_to_game {
            return false;
        }

        // Skip bot messages
        if is_bot {
            return false;
        }

        // Check if this is our own message (echo prevention)
        {
            let sent = self.sent_messages.lock().await;
            if sent.iter().any(|m| m.contains(content)) {
                return false;
            }
        }

        // Rate limit check
        let mut limiter = self.rate_limiter.lock().await;
        limiter.is_allowed(author_id)
    }

    /// Format a Discord message for in-game display
    pub fn format_for_game(username: &str, message: &str) -> String {
        format!("[Discord] {}: {}", username, message)
    }

    /// Start the bridge (HTTP updates loop + Gateway for online status)
    pub fn start(self: Arc<Self>) {
        if self.running.load(Ordering::Relaxed) {
            return;
        }
        self.running.store(true, Ordering::Relaxed);
        println!("🌉 Discord bridge started");

        // Spawn HTTP-based live updates loop
        let service = self.clone();
        tauri::async_runtime::spawn(async move {
            service.start_live_updates_loop().await;
        });

        // Spawn Gateway connection to make bot appear online
        let service2 = self.clone();
        tauri::async_runtime::spawn(async move {
            service2.start_gateway_connection().await;
        });
    }

    /// Connect to Discord Gateway via serenity so the bot appears online
    async fn start_gateway_connection(&self) {
        if self.gateway_running.load(Ordering::Relaxed) {
            println!("🟢 Gateway already connected");
            return;
        }

        let token = {
            let config = self.config.lock().await;
            match config.as_ref() {
                Some(c) if !c.bot_token.is_empty() => c.bot_token.clone(),
                _ => {
                    println!("⚠️ No bot token configured, skipping Gateway connection");
                    return;
                }
            }
        };

        self.gateway_running.store(true, Ordering::Relaxed);

        // Only use non-privileged intents to appear online
        // MESSAGE_CONTENT is privileged and requires Portal activation
        let intents = GatewayIntents::GUILDS;

        let gateway_running = self.gateway_running.clone();

        match SerenityClient::builder(&token, intents)
            .event_handler(GatewayHandler)
            .await
        {
            Ok(mut client) => {
                println!("🔌 Connecting to Discord Gateway...");
                if let Err(e) = client.start().await {
                    println!("❌ Discord Gateway error: {:?}", e);
                }
                gateway_running.store(false, Ordering::Relaxed);
            }
            Err(e) => {
                println!("❌ Failed to build Discord client: {:?}", e);
                gateway_running.store(false, Ordering::Relaxed);
            }
        }
    }

    /// Stop the bridge
    pub fn stop(&self) {
        self.running.store(false, Ordering::Relaxed);
        self.gateway_running.store(false, Ordering::Relaxed);
        println!("🌉 Discord bridge stopped");
    }

    /// Main loop for live updates
    async fn start_live_updates_loop(&self) {
        println!("🔄 Discord Live Updates loop started");

        loop {
            if !self.running.load(Ordering::Relaxed) {
                break;
            }

            // 1. Get Config
            let config = self.get_config().await;
            if let Some(config) = config {
                if config.enabled {
                    // 2. Server List Update
                    if config.server_list_enabled && !config.server_list_channel_id.is_empty() {
                        if let Err(e) = self.update_server_list(&config).await {
                            eprintln!("❌ Failed to update Discord Server List: {}", e);
                        }
                    }

                    // 3. Player List Update
                    if config.player_list_enabled && !config.player_list_channel_id.is_empty() {
                        if let Err(e) = self.update_player_list(&config).await {
                            eprintln!("❌ Failed to update Discord Player List: {}", e);
                        }
                    }
                }
            }

            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
        }
    }

    async fn update_server_list(&self, config: &DiscordBridgeConfig) -> Result<(), String> {
        // Fetch servers synchronously to avoid non-Send across await
        let servers = self.fetch_cluster_servers(config.cluster_id)?;

        let mut message_lines = Vec::new();
        message_lines.push("**__🦖 CLUSTER STATUS__**".to_string());
        message_lines.push(format!("Updated: <t:{}:R>", chrono::Utc::now().timestamp()));
        message_lines.push("".to_string());

        let player_counts = self.player_intelligence.get_player_counts().await;

        for s in servers {
            let player_count = player_counts.get(&s.id).unwrap_or(&0);

            // Native status check (no plugin)
            let (status_icon, _status_text) = match s.status.as_str() {
                "online" => ("🟢", "Online"),
                "running" => ("🟢", "Online"),
                "starting" => ("🟡", "Starting"),
                "stopped" => ("🔴", "Offline"),
                "crashed" => ("💥", "Crashed"),
                "updating" | "updates" => ("🔄", "Updating"),
                "restarting" => ("�", "Restarting"),
                "repairing" => ("�", "Repairing"),
                "startup_timeout" => ("⏰", "Timed Out"),
                _ => ("🔴", "Offline"),
            };

            let uptime_str = if s.status == "running" || s.status == "online" {
                if let Some(started_at_str) = s.last_started {
                    // Try to parse naive datetime from SQL string "YYYY-MM-DD HH:MM:SS"
                    if let Ok(dt) =
                        chrono::NaiveDateTime::parse_from_str(&started_at_str, "%Y-%m-%d %H:%M:%S")
                    {
                        // sqlite CURRENT_TIMESTAMP is UTC
                        let started_ts = dt.and_utc().timestamp();
                        format!("<t:{}:R>", started_ts)
                    } else {
                        "Online".to_string()
                    }
                } else {
                    "Online".to_string()
                }
            } else {
                s.status.to_uppercase()
            };

            message_lines.push(format!(
                "{} **{}** — {} — `[ {} / {} ]`",
                status_icon, s.name, uptime_str, player_count, s.max_players
            ));
        }

        let content = message_lines.join("\n");
        self.update_discord_message(
            &config.server_list_channel_id,
            &config.server_list_message_id,
            &content,
            "server_list",
        )
        .await
    }

    async fn update_player_list(&self, config: &DiscordBridgeConfig) -> Result<(), String> {
        let active_sessions = self.player_intelligence.get_all_active_sessions().await;

        // Fetch server names synchronously to avoid non-Send across await
        let server_names = self.fetch_server_names(config.cluster_id)?;

        let mut message_lines = Vec::new();
        message_lines.push(format!(
            "**__👥 ONLINE PLAYERS ({})__**",
            active_sessions.len()
        ));
        message_lines.push(format!("Updated: <t:{}:R>", chrono::Utc::now().timestamp()));
        message_lines.push("".to_string());

        if active_sessions.is_empty() {
            message_lines.push("*No players online*".to_string());
        } else {
            // Group players
            let mut players_by_server: HashMap<i64, Vec<String>> = HashMap::new();
            for (_steam_id, server_id, name) in active_sessions {
                players_by_server.entry(server_id).or_default().push(name);
            }

            for (server_id, name) in &server_names {
                if let Some(players) = players_by_server.get(server_id) {
                    message_lines.push(format!("**{} ({})**", name, players.len()));
                    for p in players {
                        message_lines.push(format!("• {}", p));
                    }
                    message_lines.push("".to_string());
                }
            }
        }

        let content = message_lines.join("\n");
        self.update_discord_message(
            &config.player_list_channel_id,
            &config.player_list_message_id,
            &content,
            "player_list",
        )
        .await
    }

    async fn update_discord_message(
        &self,
        channel_id: &str,
        message_id: &str,
        content: &str,
        msg_type: &str,
    ) -> Result<(), String> {
        let config_guard = self.config.lock().await;
        let (bot_token, cluster_id) = if let Some(c) = config_guard.as_ref() {
            (c.bot_token.clone(), c.cluster_id)
        } else {
            return Err("No config".to_string());
        };
        drop(config_guard);

        // Determine column name upfront
        let col_name = if msg_type == "server_list" {
            "server_list_message_id"
        } else {
            "player_list_message_id"
        };

        if message_id.is_empty() {
            let new_id = self
                .send_discord_message(channel_id, &bot_token, content)
                .await?;
            // Update DB with new message ID
            self.save_message_id_to_db(cluster_id, col_name, &new_id);
        } else {
            if let Err(_) = self
                .edit_discord_message(channel_id, message_id, &bot_token, content)
                .await
            {
                println!("⚠️ Failed to edit Discord message, sending new one.");
                let new_id = self
                    .send_discord_message(channel_id, &bot_token, content)
                    .await?;
                // Update DB with new message ID
                self.save_message_id_to_db(cluster_id, col_name, &new_id);
            }
        }
        Ok(())
    }

    /// Helper to save message ID to database (sync, no await)
    fn save_message_id_to_db(&self, cluster_id: i64, col_name: &str, new_id: &str) {
        let state = self.app_handle.state::<AppState>();
        if let Ok(db) = state.db.lock() {
            if let Ok(conn) = db.get_connection() {
                let sql = format!(
                    "UPDATE discord_bridge_config SET {} = ?1 WHERE cluster_id = ?2",
                    col_name
                );
                let _ = conn.execute(&sql, params![new_id, cluster_id]);
            };
        };
    }

    /// Fetch servers for a cluster (sync helper to avoid non-Send across await)
    fn fetch_cluster_servers(&self, cluster_id: i64) -> Result<Vec<ClusterServerInfo>, String> {
        let state = self.app_handle.state::<AppState>();
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, name, status, max_players, last_started FROM servers WHERE cluster_id = ?1"
        ).map_err(|e| e.to_string())?;

        let servers = stmt
            .query_map([cluster_id], |row| {
                Ok(ClusterServerInfo {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    status: row.get(2)?,
                    max_players: row.get(3)?,
                    last_started: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(servers)
    }

    /// Fetch server id->name map for a cluster (sync helper)
    fn fetch_server_names(&self, cluster_id: i64) -> Result<HashMap<i64, String>, String> {
        let state = self.app_handle.state::<AppState>();
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, name FROM servers WHERE cluster_id = ?1")
            .map_err(|e| e.to_string())?;

        let map = stmt
            .query_map([cluster_id], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(map)
    }

    async fn send_discord_message(
        &self,
        channel_id: &str,
        token: &str,
        content: &str,
    ) -> Result<String, String> {
        let url = format!(
            "https://discord.com/api/v10/channels/{}/messages",
            channel_id
        );
        let payload = json!({ "content": content });

        let response = self
            .http_client
            .post(&url)
            .header("Authorization", format!("Bot {}", token))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if response.status().is_success() {
            let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
            let id = json["id"].as_str().ok_or("No ID in response")?.to_string();
            Ok(id)
        } else {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            Err(format!(
                "Status: {} (channel: {}) - {}",
                status, channel_id, body
            ))
        }
    }

    async fn edit_discord_message(
        &self,
        channel_id: &str,
        message_id: &str,
        token: &str,
        content: &str,
    ) -> Result<(), String> {
        let url = format!(
            "https://discord.com/api/v10/channels/{}/messages/{}",
            channel_id, message_id
        );
        let payload = json!({ "content": content });

        // Use PATCH for editing
        let response = self
            .http_client
            .patch(&url)
            .header("Authorization", format!("Bot {}", token))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if response.status().is_success() {
            Ok(())
        } else {
            Err(format!("Status: {}", response.status()))
        }
    }

    /// Check if running
    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::Relaxed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rate_limiter() {
        let mut limiter = RateLimiter::new(2, 10);

        assert!(limiter.is_allowed("user1"));
        assert!(limiter.is_allowed("user1"));
        assert!(!limiter.is_allowed("user1")); // Third message blocked

        assert!(limiter.is_allowed("user2")); // Different user ok
    }

    #[test]
    fn test_message_format() {
        let formatted = DiscordBridgeService::format_for_game("TestUser", "Hello world");
        assert_eq!(formatted, "[Discord] TestUser: Hello world");
    }
}
