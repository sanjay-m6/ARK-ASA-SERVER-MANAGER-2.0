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
    pub admin_channel_id: String, // New field for Admin Commands
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
            admin_channel_id: String::new(),
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
    Client as SerenityClient, Context, EventHandler as SerenityEventHandler, GatewayIntents,
    Message, Ready, ShardManager,
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

/// Gateway Handler with AppHandle access
struct GatewayHandler {
    app_handle: AppHandle,
    config: Arc<Mutex<Option<DiscordBridgeConfig>>>,
}

#[serenity::async_trait]
impl SerenityEventHandler for GatewayHandler {
    async fn ready(&self, _ctx: Context, ready: Ready) {
        log::info!("🟢 Discord bot '{}' is now ONLINE", ready.user.name);
    }

    async fn message(&self, ctx: Context, msg: Message) {
        // Ignore own messages
        if msg.author.bot {
            return;
        }

        // Get config to check admin channel
        let admin_channel_id = {
            let cfg = self.config.lock().await;
            if let Some(c) = cfg.as_ref() {
                if c.admin_channel_id.is_empty() {
                    return; // No admin channel configured
                }
                c.admin_channel_id.clone()
            } else {
                return;
            }
        };

        // Check if message is in Admin Channel
        if msg.channel_id.to_string() != admin_channel_id {
            return;
        }

        // Check for command prefix
        if !msg.content.starts_with('!') {
            return;
        }

        log::info!("🔔 Admin Command received: {}", msg.content);

        let parts: Vec<&str> = msg.content.split_whitespace().collect();
        if parts.is_empty() {
            return;
        }

        let command = parts[0];
        let args = &parts[1..];

        match command {
            "!ping" => {
                let _ = msg.reply(&ctx.http, "Pong! 🦖").await;
            }
            "!help" => {
                let help_text = concat!(
                    "**🦖 ARK Manager Admin Commands**\n",
                    "`!list` - List all servers and status\n",
                    "`!start <id>` - Start a server\n",
                    "`!stop <id>` - Stop a server\n",
                    "`!restart <id>` - Restart a server\n",
                    "`!update <id>` - Update a server\n",
                    "`!kick <id> <steam_id>` - Kick a player\n",
                    "`!broadcast <id> <msg>` - Broadcast message\n",
                    "`!status` - Show cluster status"
                );
                let _ = msg.reply(&ctx.http, help_text).await;
            }
            "!list" | "!status" => {
                // List servers.
                let state = self.app_handle.state::<AppState>();
                let servers = match get_all_servers_status(&state).await {
                    Ok(s) => s,
                    Err(e) => {
                        let _ = msg.reply(&ctx.http, format!("❌ Error: {}", e)).await;
                        return;
                    }
                };

                let mut response = String::from("**🦖 Server List**\n");
                for s in servers {
                    let status_icon = match s.status.as_str() {
                        "online" | "running" => "🟢",
                        "starting" => "🟡",
                        "stopped" => "🔴",
                        "crashed" => "💥",
                        _ => "⚪",
                    };
                    response.push_str(&format!(
                        "`{}` {} **{}** - {}\n",
                        s.id, status_icon, s.name, s.status
                    ));
                }
                let _ = msg.reply(&ctx.http, response).await;
            }
            "!start" => {
                if args.is_empty() {
                    let _ = msg.reply(&ctx.http, "❌ Usage: `!start <server_id>`").await;
                    return;
                }
                if let Ok(id) = args[0].parse::<i64>() {
                    // Check current server status before starting (avoid double-start)
                    let current_status: Option<String> = {
                        let state = self.app_handle.state::<AppState>();
                        let locked = state.db.lock().ok();
                        locked.as_ref().and_then(|db| {
                            db.get_connection()
                                .ok()
                                .map(|conn| {
                                    conn.query_row(
                                        "SELECT status FROM servers WHERE id = ?1",
                                        [id],
                                        |row| row.get::<_, String>(0),
                                    )
                                    .ok()
                                })
                                .flatten()
                        })
                    };

                    match current_status.as_deref() {
                        Some("running") | Some("online") | Some("starting") => {
                            let _ = msg.reply(
                                &ctx.http,
                                format!("⚠️ Server {} is already running (status: `{}`). No action taken.", id, current_status.unwrap_or_default()),
                            ).await;
                            return;
                        }
                        None => {
                            let _ = msg
                                .reply(&ctx.http, format!("❌ Server ID {} not found.", id))
                                .await;
                            return;
                        }
                        _ => {}
                    }

                    let _ = msg
                        .reply(&ctx.http, format!("🚀 Starting server {}...", id))
                        .await;
                    let app = self.app_handle.clone();
                    let http = ctx.http.clone();
                    let channel_id = msg.channel_id;

                    tauri::async_runtime::spawn(async move {
                        match crate::commands::server::start_server(app, id, false).await {
                            Ok(_) => {
                                log::info!("✅ Discord !start: Server {} started successfully", id);
                                let _ = channel_id.say(&http, format!("✅ Server {} started successfully.", id)).await;
                            }
                            Err(e) => {
                                log::error!("❌ Discord !start: Failed to start server {}: {}", id, e);
                                let _ = channel_id.say(&http, format!("❌ Failed to start server {}: {}", id, e)).await;
                            }
                        }
                    });
                } else {
                    let _ = msg.reply(&ctx.http, "❌ Invalid Server ID").await;
                }
            }
            "!stop" => {
                if args.is_empty() {
                    let _ = msg.reply(&ctx.http, "❌ Usage: `!stop <server_id>`").await;
                    return;
                }
                if let Ok(id) = args[0].parse::<i64>() {
                    let _ = msg
                        .reply(&ctx.http, format!("🛑 Stopping server {}...", id))
                        .await;
                    let app = self.app_handle.clone();
                    let http = ctx.http.clone();
                    let channel_id = msg.channel_id;

                    tauri::async_runtime::spawn(async move {
                        let state = app.state::<AppState>();
                        match crate::commands::server::stop_server(state, id).await {
                            Ok(_) => {
                                log::info!("✅ Discord !stop: Server {} stopped successfully", id);
                                let _ = channel_id.say(&http, format!("✅ Server {} stopped.", id)).await;
                            }
                            Err(e) => {
                                log::error!("❌ Discord !stop: Failed to stop server {}: {}", id, e);
                                let _ = channel_id.say(&http, format!("❌ Failed to stop server {}: {}", id, e)).await;
                            }
                        }
                    });
                } else {
                    let _ = msg.reply(&ctx.http, "❌ Invalid Server ID").await;
                }
            }
            "!restart" => {
                if args.is_empty() {
                    let _ = msg
                        .reply(&ctx.http, "❌ Usage: `!restart <server_id>`")
                        .await;
                    return;
                }
                if let Ok(id) = args[0].parse::<i64>() {
                    let _ = msg
                        .reply(&ctx.http, format!("🔄 Restarting server {}...", id))
                        .await;
                    let app = self.app_handle.clone();
                    let http = ctx.http.clone();
                    let channel_id = msg.channel_id;

                    tauri::async_runtime::spawn(async move {
                        let state = app.state::<AppState>();
                        match crate::commands::server::restart_server(state, id).await {
                            Ok(_) => {
                                log::info!("✅ Discord !restart: Server {} restarted successfully", id);
                                let _ = channel_id.say(&http, format!("✅ Server {} restarted.", id)).await;
                            }
                            Err(e) => {
                                log::error!("❌ Discord !restart: Failed to restart server {}: {}", id, e);
                                let _ = channel_id.say(&http, format!("❌ Failed to restart server {}: {}", id, e)).await;
                            }
                        }
                    });
                } else {
                    let _ = msg.reply(&ctx.http, "❌ Invalid Server ID").await;
                }
            }
            "!update" => {
                if args.is_empty() {
                    let _ = msg
                        .reply(&ctx.http, "❌ Usage: `!update <server_id>`")
                        .await;
                    return;
                }
                if let Ok(id) = args[0].parse::<i64>() {
                    let _ = msg
                        .reply(&ctx.http, format!("⬇️ Updating server {}...", id))
                        .await;
                    let app = self.app_handle.clone();
                    let http = ctx.http.clone();
                    let channel_id = msg.channel_id;

                    tauri::async_runtime::spawn(async move {
                        let state = app.state::<AppState>();
                        match crate::commands::server::update_server(app.clone(), state, id).await {
                            Ok(_) => {
                                log::info!("✅ Discord !update: Server {} updated successfully", id);
                                let _ = channel_id.say(&http, format!("✅ Server {} updated.", id)).await;
                            }
                            Err(e) => {
                                log::error!("❌ Discord !update: Failed to update server {}: {}", id, e);
                                let _ = channel_id.say(&http, format!("❌ Failed to update server {}: {}", id, e)).await;
                            }
                        }
                    });
                } else {
                    let _ = msg.reply(&ctx.http, "❌ Invalid Server ID").await;
                }
            }
            "!broadcast" | "!say" => {
                if args.len() < 2 {
                    let _ = msg
                        .reply(&ctx.http, "❌ Usage: `!broadcast <server_id> <message>`")
                        .await;
                    return;
                }
                if let Ok(server_id) = args[0].parse::<i64>() {
                    let message = args[1..].join(" ");
                    let _ = msg
                        .reply(
                            &ctx.http,
                            format!("📢 Broadcasting to server {}: {}", server_id, message),
                        )
                        .await;

                    let rcon_state = self.app_handle.state::<crate::commands::rcon::RconState>();
                    let rcon_service = &rcon_state.0;

                    match rcon_service.broadcast(server_id, &message).await {
                        Ok(_) => {
                            let _ = msg.reply(&ctx.http, "✅ Message sent.").await;
                        }
                        Err(e) => {
                            let _ = msg.reply(&ctx.http, format!("❌ Failed: {}", e)).await;
                        }
                    }
                } else {
                    let _ = msg.reply(&ctx.http, "❌ Invalid Server ID").await;
                }
            }
            "!kick" => {
                if args.len() < 2 {
                    let _ = msg
                        .reply(&ctx.http, "❌ Usage: `!kick <server_id> <steam_id>`")
                        .await;
                    return;
                }
                if let Ok(server_id) = args[0].parse::<i64>() {
                    let steam_id = args[1];
                    let _ = msg
                        .reply(
                            &ctx.http,
                            format!(
                                "👢 Kicking player {} from server {}...",
                                steam_id, server_id
                            ),
                        )
                        .await;

                    let rcon_state = self.app_handle.state::<crate::commands::rcon::RconState>();
                    let rcon_service = &rcon_state.0;

                    match rcon_service
                        .kick_player(server_id, steam_id, Some("Kicked by Admin via Discord"))
                        .await
                    {
                        Ok(_) => {
                            let _ = msg.reply(&ctx.http, "✅ Player kicked.").await;
                        }
                        Err(e) => {
                            let _ = msg.reply(&ctx.http, format!("❌ Failed: {}", e)).await;
                        }
                    };
                } else {
                    let _ = msg.reply(&ctx.http, "❌ Invalid Server ID").await;
                }
            }
            _ => {
                // Unknown command, ignore
            }
        }
    }
}

// Helper to get all servers status
async fn get_all_servers_status(state: &AppState) -> Result<Vec<ClusterServerInfo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, status FROM servers")
        .map_err(|e| e.to_string())?;

    let servers = stmt
        .query_map([], |row| {
            Ok(ClusterServerInfo {
                id: row.get(0)?,
                name: row.get(1)?,
                status: row.get(2)?,
                max_players: 0, // Not needed for simple list
                last_started: None,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(servers)
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
    /// Handle to the active serenity ShardManager, used to shut down the gateway on stop()
    shard_manager: Arc<Mutex<Option<Arc<ShardManager>>>>,
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
            shard_manager: Arc::new(Mutex::new(None)),
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

    /// Load the first enabled bridge config from the database.
    /// Used at startup to auto-load config without waiting for a frontend call.
    pub fn load_config_from_db(&self) -> Option<DiscordBridgeConfig> {
        use tauri::Manager;
        let state = self.app_handle.try_state::<crate::AppState>()?;
        let db = state.db.lock().ok()?;
        let conn = db.get_connection().ok()?;

        conn.query_row(
            "SELECT cluster_id, enabled, bot_token, guild_id, channel_id,
                    game_to_discord, discord_to_game,
                    server_list_enabled, server_list_channel_id, server_list_message_id,
                    player_list_enabled, player_list_channel_id, player_list_message_id,
                    show_tribe_names, show_playtime, admin_channel_id
             FROM discord_bridge_config WHERE enabled = 1 LIMIT 1",
            [],
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
                    admin_channel_id: row.get::<_, Option<String>>(15)?.unwrap_or_default(),
                })
            },
        )
        .ok()
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
        // Atomic swap: only proceed if we transition from false → true
        if self.running.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
            log::info!("🌉 Discord bridge already running, skipping duplicate start");
            return;
        }
        log::info!("🌉 Discord bridge started");

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
            log::info!("🟢 Gateway already connected");
            return;
        }

        let token = {
            let config = self.config.lock().await;
            match config.as_ref() {
                Some(c) if !c.bot_token.is_empty() => c.bot_token.clone(),
                _ => {
                    log::warn!("⚠️ No bot token configured, skipping Gateway connection");
                    return;
                }
            }
        };

        self.gateway_running.store(true, Ordering::Relaxed);

        // MESSAGE_CONTENT is a privileged intent.
        // It MUST be enabled in the Discord Developer Portal:
        //   https://discord.com/developers/applications → Your App → Bot → Privileged Gateway Intents → Message Content Intent → ON
        let intents = GatewayIntents::GUILDS
            | GatewayIntents::GUILD_MESSAGES
            | GatewayIntents::MESSAGE_CONTENT;

        let gateway_running = self.gateway_running.clone();

        // Clone for handler
        let app_handle = self.app_handle.clone();
        let config = self.config.clone();

        match SerenityClient::builder(&token, intents)
            .event_handler(GatewayHandler { app_handle, config })
            .await
        {
            Ok(mut client) => {
                log::info!("🔌 Connecting to Discord Gateway...");

                // Store the ShardManager so stop() can shut down the gateway
                {
                    let mut sm = self.shard_manager.lock().await;
                    *sm = Some(client.shard_manager.clone());
                }

                if let Err(e) = client.start().await {
                    let err_str = format!("{:?}", e);
                    if err_str.contains("DisallowedGatewayIntents") {
                        log::error!(
                            "❌ Discord Gateway error: DisallowedGatewayIntents\n\
                            ➡️  FIX: The bot requires the 'Message Content' privileged intent.\n\
                            ➡️  Go to: https://discord.com/developers/applications\n\
                            ➡️  Select your app → Bot → Privileged Gateway Intents\n\
                            ➡️  Enable: ✅ MESSAGE CONTENT INTENT → Save Changes\n\
                            ➡️  Then restart the Discord Bridge."
                        );
                    } else {
                        log::error!("❌ Discord Gateway error: {:?}", e);
                    }
                }
                // Clear stored shard manager after disconnect
                {
                    let mut sm = self.shard_manager.lock().await;
                    *sm = None;
                }
                gateway_running.store(false, Ordering::Relaxed);
            }
            Err(e) => {
                log::error!("❌ Failed to build Discord client: {:?}", e);
                gateway_running.store(false, Ordering::Relaxed);
            }
        }
    }

    /// Stop the bridge — shuts down the live serenity Gateway connection
    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
        self.gateway_running.store(false, Ordering::SeqCst);

        // Shut down the actual serenity Gateway so the old handler stops receiving messages
        let sm = self.shard_manager.clone();
        tauri::async_runtime::spawn(async move {
            let mut guard = sm.lock().await;
            if let Some(manager) = guard.take() {
                log::info!("🔌 Shutting down Discord Gateway shards...");
                manager.shutdown_all().await;
                log::info!("✅ Discord Gateway shards shut down");
            }
        });

        log::info!("🌉 Discord bridge stopped");
    }

    /// Main loop for live updates
    async fn start_live_updates_loop(&self) {
        log::info!("🔄 Discord Live Updates loop started");

        // Auto-load config from DB if not already in memory
        if self.get_config().await.is_none() {
            log::info!("[Discord] No config in memory, attempting DB auto-load...");
            if let Some(loaded) = self.load_config_from_db() {
                if loaded.enabled {
                    log::info!(
                        "[Discord] Auto-loaded config for cluster {}",
                        loaded.cluster_id
                    );
                    self.configure(loaded).await;
                } else {
                    log::info!(
                        "[Discord] Auto-loaded config but bridge is disabled, stopping loop"
                    );
                    return;
                }
            } else {
                log::warn!("[Discord] No bridge config found in DB, live updates loop idle");
            }
        }

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
                            log::error!("❌ Failed to update Discord Server List: {}", e);
                        }
                    }

                    // 3. Player List Update
                    if config.player_list_enabled && !config.player_list_channel_id.is_empty() {
                        if let Err(e) = self.update_player_list(&config).await {
                            log::error!("❌ Failed to update Discord Player List: {}", e);
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
