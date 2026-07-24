// Discord Bridge Service for Cross-Server Chat
// Enables two-way chat sync between ARK servers and Discord
// EXPERIMENTAL FEATURE

#![allow(dead_code)]

use reqwest::Client;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Sha256, Digest};
use base64::Engine;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;

use serenity::all::{
    CreateEmbed, CreateEmbedFooter, CreateMessage,
};

fn default_true() -> bool {
    true
}

fn discord_embed_to_serenity(e: crate::services::discord::DiscordEmbed) -> CreateEmbed {
    let mut embed = CreateEmbed::new()
        .title(e.title)
        .description(e.description)
        .color(e.color);

    if let Some(footer) = e.footer {
        embed = embed.footer(CreateEmbedFooter::new(footer));
    }

    if let Some(ts) = e.timestamp {
        if let Ok(timestamp) = serenity::model::Timestamp::parse(&ts) {
            embed = embed.timestamp(timestamp);
        }
    }

    for field in e.fields {
        embed = embed.field(field.name, field.value, field.inline);
    }

    embed
}

/// Discord bridge configuration
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DiscordBridgeConfig {
    pub cluster_id: i64,
    pub enabled: bool,
    pub bot_token: String,
    pub guild_id: String,
    pub channel_id: String,
    pub admin_channel_id: String,
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
    #[serde(default)]
    pub admin_role_ids: Vec<String>,
    #[serde(default)]
    pub moderator_role_ids: Vec<String>,

    // Phase 1: Real-time notification fields
    #[serde(default)]
    pub notifications_channel_id: String,
    #[serde(default = "default_true")]
    pub notify_player_join_leave: bool,
    #[serde(default = "default_true")]
    pub notify_server_crashes: bool,
    #[serde(default = "default_true")]
    pub notify_server_recovery: bool,
    #[serde(default = "default_true")]
    pub notify_scheduled_restarts: bool,
    #[serde(default = "default_true")]
    pub notify_backup_completion: bool,
    #[serde(default = "default_true")]
    pub notify_performance_alerts: bool,
    #[serde(default = "default_true")]
    pub notify_mod_watchdog: bool,
    #[serde(default = "default_true")]
    pub notify_anti_cheat: bool,
    #[serde(default = "default_interval")]
    pub status_update_interval: u64,
}

fn default_interval() -> u64 {
    60
}

/// Tracks a command executed via Discord for the activity feed
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DiscordCommandLog {
    pub command: String,
    pub user: String,
    pub result: String,
    pub timestamp: String,
}

/// Status snapshot exposed to the frontend
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DiscordBridgeStatus {
    pub is_running: bool,
    pub gateway_connected: bool,
    pub uptime_seconds: u64,
    pub commands_processed: u64,
    pub last_command: Option<String>,
    pub last_command_user: Option<String>,
    pub last_command_time: Option<String>,
    pub recent_commands: Vec<DiscordCommandLog>,
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
            admin_role_ids: Vec::new(),
            moderator_role_ids: Vec::new(),
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
        }
    }
}

/// Rate limiter for messages (configurable)
pub struct RateLimiter {
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

    /// Update rate limit parameters
    pub fn update_config(&mut self, max_messages: usize, window_seconds: u64) {
        self.max_messages = max_messages;
        self.window_seconds = window_seconds;
        // Clear the message history when config changes
        self.messages.clear();
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
    Message, Ready, ShardManager, Interaction, Command, CreateCommand, CreateCommandOption,
    CommandOptionType, CreateInteractionResponse, CreateInteractionResponseMessage,
};
use tauri::{AppHandle, Manager, Emitter};

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
    commands_processed: Arc<AtomicU64>,
    command_log: Arc<Mutex<Vec<DiscordCommandLog>>>,
}

/// Permission level required for a command
#[derive(PartialEq, Eq, PartialOrd, Ord)]
enum PermLevel {
    Moderator,
    Admin,
}

/// Build a branded embed with consistent footer/timestamp
fn build_embed(title: &str, description: &str, color: u32) -> CreateEmbed {
    CreateEmbed::new()
        .title(title)
        .description(description)
        .color(color)
        .footer(CreateEmbedFooter::new("ASA Server Manager 2.0"))
        .timestamp(serenity::model::Timestamp::now())
}

/// Build an error embed
fn error_embed(msg: &str) -> CreateEmbed {
    build_embed("❌ Error", msg, 0xEF4444)
}

impl GatewayHandler {
    /// Check if the message author has the required permission level
    async fn check_permission(&self, ctx: &Context, msg: &Message, level: PermLevel) -> bool {
        let cfg = self.config.lock().await;
        let cfg = match cfg.as_ref() {
            Some(c) => c,
            None => return false,
        };

        // If no roles configured, allow all (backward compatible)
        if cfg.admin_role_ids.is_empty() && cfg.moderator_role_ids.is_empty() {
            return true;
        }

        // Get member roles
        let member = match msg.member.as_ref() {
            Some(m) => m,
            None => {
                // Try fetching from guild
                if let Ok(guild_id) = cfg.guild_id.parse::<u64>() {
                    match ctx.http.get_member(
                        serenity::model::id::GuildId::new(guild_id),
                        msg.author.id,
                    ).await {
                        Ok(m) => {
                            let role_strs: Vec<String> = m.roles.iter().map(|r| r.to_string()).collect();
                            return Self::roles_match(&role_strs, cfg, level);
                        }
                        Err(_) => return false,
                    }
                }
                return false;
            }
        };

        let role_strs: Vec<String> = member.roles.iter().map(|r| r.to_string()).collect();
        Self::roles_match(&role_strs, cfg, level)
    }

    fn roles_match(user_roles: &[String], cfg: &DiscordBridgeConfig, level: PermLevel) -> bool {
        // Admin roles always have full access
        if user_roles.iter().any(|r| cfg.admin_role_ids.contains(r)) {
            return true;
        }
        // Moderator roles only for Moderator-level commands
        if level == PermLevel::Moderator {
            if user_roles.iter().any(|r| cfg.moderator_role_ids.contains(r)) {
                return true;
            }
        }
        false
    }

    /// Log a command execution for the activity feed
    async fn log_command(&self, user: &str, command: &str, result: &str) {
        self.commands_processed.fetch_add(1, Ordering::Relaxed);
        let entry = DiscordCommandLog {
            command: command.to_string(),
            user: user.to_string(),
            result: result.to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
        };
        let mut log = self.command_log.lock().await;
        log.push(entry.clone());
        if log.len() > 50 { log.remove(0); }

        // Emit event to frontend
        let _ = self.app_handle.emit("discord-command-executed", entry);
    }
}

#[serenity::async_trait]
impl SerenityEventHandler for GatewayHandler {
    async fn ready(&self, ctx: Context, ready: Ready) {
        log::info!("🟢 Discord bot '{}' is now ONLINE", ready.user.name);

        let commands = vec![
            CreateCommand::new("status").description("Get the status of all servers"),
            CreateCommand::new("start")
                .description("Start a server")
                .add_option(
                    CreateCommandOption::new(CommandOptionType::Integer, "server_id", "The ID of the server to start")
                        .required(true)
                ),
            CreateCommand::new("stop")
                .description("Stop a server")
                .add_option(
                    CreateCommandOption::new(CommandOptionType::Integer, "server_id", "The ID of the server to stop")
                        .required(true)
                ),
            CreateCommand::new("restart")
                .description("Restart a server")
                .add_option(
                    CreateCommandOption::new(CommandOptionType::Integer, "server_id", "The ID of the server to restart")
                        .required(true)
                ),
            CreateCommand::new("update")
                .description("Update a server")
                .add_option(
                    CreateCommandOption::new(CommandOptionType::Integer, "server_id", "The ID of the server to update")
                        .required(true)
                ),
            CreateCommand::new("players").description("List all online players across servers"),
            CreateCommand::new("kick")
                .description("Kick a player from a server")
                .add_option(
                    CreateCommandOption::new(CommandOptionType::Integer, "server_id", "The server ID where the player is")
                        .required(true)
                )
                .add_option(
                    CreateCommandOption::new(CommandOptionType::String, "steam_id", "The Steam/EOS ID of the player")
                        .required(true)
                ),
            CreateCommand::new("ban")
                .description("Ban a player from a server")
                .add_option(
                    CreateCommandOption::new(CommandOptionType::Integer, "server_id", "The server ID where the player is")
                        .required(true)
                )
                .add_option(
                    CreateCommandOption::new(CommandOptionType::String, "steam_id", "The Steam/EOS ID of the player")
                        .required(true)
                ),
        ];

        let guild_id_str = {
            let cfg = self.config.lock().await;
            cfg.as_ref().map(|c| c.guild_id.clone())
        };

        if let Some(gid_str) = guild_id_str {
            if let Ok(gid) = gid_str.parse::<u64>() {
                let guild_id = serenity::model::id::GuildId::new(gid);
                match guild_id.set_commands(&ctx.http, commands.clone()).await {
                    Ok(_) => log::info!("✅ Slash commands registered for guild {}", gid),
                    Err(e) => log::error!("❌ Failed to register slash commands for guild: {}", e),
                }
            } else {
                match Command::set_global_commands(&ctx.http, commands).await {
                    Ok(_) => log::info!("✅ Global slash commands registered successfully"),
                    Err(e) => log::error!("❌ Failed to register global slash commands: {}", e),
                }
            }
        }
    }

    async fn interaction_create(&self, ctx: Context, interaction: Interaction) {
        if let Interaction::Command(command) = interaction {
            let cmd_name = command.data.name.as_str();

            // Extract options helper
            let server_id = command.data.options.iter()
                .find(|opt| opt.name == "server_id")
                .and_then(|opt| match &opt.value {
                    serenity::all::CommandDataOptionValue::Integer(i) => Some(*i),
                    _ => None,
                });

            let steam_id = command.data.options.iter()
                .find(|opt| opt.name == "steam_id")
                .and_then(|opt| match &opt.value {
                    serenity::all::CommandDataOptionValue::String(s) => Some(s.clone()),
                    _ => None,
                });

            // Permission Check
            let is_admin = if let Some(member) = &command.member {
                let cfg = self.config.lock().await;
                if let Some(c) = cfg.as_ref() {
                    member.roles.iter().any(|r| c.admin_role_ids.contains(&r.to_string()))
                } else {
                    false
                }
            } else {
                false
            };

            // Require admin permission for control/moderation commands
            if !is_admin && cmd_name != "status" && cmd_name != "players" {
                let data = CreateInteractionResponseMessage::new()
                    .content("❌ You need an Admin role to perform this action.")
                    .ephemeral(true);
                let builder = CreateInteractionResponse::Message(data);
                let _ = command.create_response(&ctx.http, builder).await;
                return;
            }

            let content = match cmd_name {
                "status" => {
                    let state = self.app_handle.state::<AppState>();
                    match get_all_servers_status(&state).await {
                        Ok(servers) => {
                            let mut desc = String::new();
                            for s in &servers {
                                let icon = match s.status.as_str() { "online"|"running" => "🟢", "starting" => "🟡", "stopped" => "🔴", "crashed" => "💥", _ => "⚪" };
                                desc.push_str(&format!("{} `#{}` **{}** — {}\n", icon, s.id, s.name, s.status));
                            }
                            if desc.is_empty() { desc = "*No servers found*".to_string(); }
                            desc
                        },
                        Err(e) => format!("Error: {}", e),
                    }
                },
                "start" => {
                    if let Some(id) = server_id {
                        let app = self.app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = crate::commands::server::start_server(app, id, false).await;
                        });
                        format!("🚀 Initiated START for server `#{}`.", id)
                    } else {
                        "❌ Missing required option `server_id`.".to_string()
                    }
                },
                "stop" => {
                    if let Some(id) = server_id {
                        let app = self.app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            let state = app.state::<AppState>();
                            let _ = crate::commands::server::stop_server(state, id).await;
                        });
                        format!("🛑 Initiated STOP for server `#{}`.", id)
                    } else {
                        "❌ Missing required option `server_id`.".to_string()
                    }
                },
                "restart" => {
                    if let Some(id) = server_id {
                        let app = self.app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            let state = app.state::<AppState>();
                            let _ = crate::commands::server::restart_server(state, id, None).await;
                        });
                        format!("🔄 Initiated RESTART for server `#{}`.", id)
                    } else {
                        "❌ Missing required option `server_id`.".to_string()
                    }
                },
                "update" => {
                    if let Some(id) = server_id {
                        let app = self.app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            let state = app.state::<AppState>();
                            let _ = crate::commands::server::update_server(app.clone(), state, id).await;
                        });
                        format!("🔄 Initiated UPDATE for server `#{}`.", id)
                    } else {
                        "❌ Missing required option `server_id`.".to_string()
                    }
                },
                "players" => {
                    let state = self.app_handle.state::<AppState>();
                    match get_all_servers_status(&state).await {
                        Ok(servers) => {
                            let rcon_state = self.app_handle.state::<crate::commands::rcon::RconState>();
                            let rcon_service = &rcon_state.0;
                            let mut lines = Vec::new();
                            for s in servers {
                                if s.status == "online" || s.status == "running" {
                                    match rcon_service.get_players(s.id).await {
                                        Ok(players) => {
                                            if !players.is_empty() {
                                                lines.push(format!("**🟢 {}** ({} online):", s.name, players.len()));
                                                for p in players {
                                                    lines.push(format!("  • **{}** (Steam/EOS: `{}`)", p.name, p.steam_id));
                                                }
                                            } else {
                                                lines.push(format!("**🟢 {}** (0 online)", s.name));
                                            }
                                        }
                                        Err(_) => {
                                            lines.push(format!("**🟢 {}** (RCON error/starting)", s.name));
                                        }
                                    }
                                } else {
                                    lines.push(format!("**⚪ {}** (Offline)", s.name));
                                }
                            }
                            if lines.is_empty() {
                                "👥 **Online Players:** No servers are currently running.".to_string()
                            } else {
                                format!("👥 **Online Players & Server Status:**\n\n{}", lines.join("\n"))
                            }
                        },
                        Err(e) => format!("Error retrieving status: {}", e),
                    }
                },
                "kick" => {
                    if let (Some(srv_id), Some(steam_id)) = (server_id, steam_id) {
                        let rcon_state = self.app_handle.state::<crate::commands::rcon::RconState>();
                        let rcon_service = &rcon_state.0;
                        match rcon_service.kick_player(srv_id, &steam_id, Some("Kicked via Discord Command")).await {
                            Ok(_) => format!("👢 Successfully kicked player `{}` from server `#{}`.", steam_id, srv_id),
                            Err(e) => format!("❌ Failed to kick player: {}", e),
                        }
                    } else {
                        "❌ Missing options `server_id` and/or `steam_id`.".to_string()
                    }
                },
                "ban" => {
                    if let (Some(srv_id), Some(steam_id)) = (server_id, steam_id) {
                        let rcon_state = self.app_handle.state::<crate::commands::rcon::RconState>();
                        let rcon_service = &rcon_state.0;
                        match rcon_service.ban_player(srv_id, &steam_id).await {
                            Ok(_) => format!("🚫 Successfully banned player `{}` from server `#{}`.", steam_id, srv_id),
                            Err(e) => format!("❌ Failed to ban player: {}", e),
                        }
                    } else {
                        "❌ Missing options `server_id` and/or `steam_id`.".to_string()
                    }
                },
                _ => "Unknown command".to_string(),
            };

            let data = CreateInteractionResponseMessage::new().content(content);
            let builder = CreateInteractionResponse::Message(data);
            if let Err(why) = command.create_response(&ctx.http, builder).await {
                log::error!("Cannot respond to slash command: {}", why);
            }
        } else if let Interaction::Component(component) = interaction {
            let custom_id = &component.data.custom_id;
            log::info!("Component interaction received: {}", custom_id);

            // Basic role check for Admin
            let is_admin = if let Some(member) = &component.member {
                let cfg = self.config.lock().await;
                if let Some(c) = cfg.as_ref() {
                    member.roles.iter().any(|r| c.admin_role_ids.contains(&r.to_string()))
                } else {
                    false
                }
            } else {
                false
            };

            if !is_admin {
                let data = CreateInteractionResponseMessage::new()
                    .content("❌ You need an Admin role to perform this action.")
                    .ephemeral(true);
                let builder = CreateInteractionResponse::Message(data);
                let _ = component.create_response(&ctx.http, builder).await;
                return;
            }

            let cluster_id = self.config.lock().await.as_ref().map(|c| c.cluster_id).unwrap_or(0);
            
            // Get all servers for this cluster
            let mut server_ids: Vec<i64> = Vec::new();
            {
                let state = self.app_handle.state::<AppState>();
                let db_result = state.db.lock();
                if let Ok(db) = db_result {
                    if let Ok(conn) = db.get_connection() {
                        if let Ok(mut stmt) = conn.prepare("SELECT id FROM servers WHERE cluster_id = ?1") {
                            if let Ok(rows) = stmt.query_map([cluster_id], |row| row.get(0)) {
                                server_ids = rows.filter_map(Result::ok).collect();
                            }
                        }
                    }
                }
            }

            let response_msg = match custom_id.as_str() {
                "start_all" => {
                    for id in server_ids {
                        let app = self.app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = crate::commands::server::start_server(app, id, false).await;
                        });
                    }
                    "🚀 Initiated START for all servers in the cluster."
                },
                "stop_all" => {
                    for id in server_ids {
                        let app = self.app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            let state = app.state::<AppState>();
                            let _ = crate::commands::server::stop_server(state, id).await;
                        });
                    }
                    "🛑 Initiated STOP for all servers in the cluster."
                },
                "restart_all" => {
                    for id in server_ids {
                        let app = self.app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            let state = app.state::<AppState>();
                            let _ = crate::commands::server::restart_server(state, id, None).await;
                        });
                    }
                    "🔄 Initiated RESTART for all servers in the cluster."
                },
                "update_all" => {
                    for id in server_ids {
                        let app = self.app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            let state = app.state::<AppState>();
                            let _ = crate::commands::server::update_server(app.clone(), state, id).await;
                        });
                    }
                    "🔄 Initiated UPDATE for all servers in the cluster."
                },
                _ => "Unknown action."
            };

            let data = CreateInteractionResponseMessage::new()
                .content(response_msg)
                .ephemeral(true);
            let builder = CreateInteractionResponse::Message(data);
            if let Err(why) = component.create_response(&ctx.http, builder).await {
                log::error!("Cannot respond to component interaction: {}", why);
            }
        }
    }

    async fn message(&self, ctx: Context, msg: Message) {
        if msg.author.bot {
            return;
        }

        let config = {
            let cfg = self.config.lock().await;
            cfg.clone()
        };
        let config = match config {
            Some(c) => c,
            None => return,
        };

        if !config.enabled {
            return;
        }

        if !config.admin_channel_id.is_empty() && msg.channel_id.to_string() == config.admin_channel_id {
            if !msg.content.starts_with('!') {
                return;
            }
        } else if !config.channel_id.is_empty() && msg.channel_id.to_string() == config.channel_id {
            let state = self.app_handle.state::<AppState>();
            let service = state.discord_bridge.clone();
            
            if service.should_relay_from_discord(&msg.author.id.to_string(), &msg.content, msg.author.bot).await {
                let formatted = DiscordBridgeService::format_for_game(&msg.author.name, &msg.content);
                
                let servers = match service.fetch_cluster_servers(config.cluster_id) {
                    Ok(s) => s,
                    Err(e) => {
                        log::error!("Failed to fetch cluster servers for Discord relay: {}", e);
                        return;
                    }
                };

                let rcon_state = self.app_handle.state::<crate::commands::rcon::RconState>();
                let rcon_service = &rcon_state.0;

                for server in servers {
                    if server.status == "online" || server.status == "running" {
                        let server_id = server.id;
                        let rcon = rcon_service.clone();
                        let msg_content = formatted.clone();
                        tokio::spawn(async move {
                            if let Err(e) = rcon.broadcast(server_id, &msg_content).await {
                                log::error!("Failed to relay Discord message to server {}: {}", server_id, e);
                            }
                        });
                    }
                }
            }
            return;
        } else {
            return;
        }

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
                let embed = build_embed("🏓 Pong!", "Bot is alive and connected! 🦖", 0x22C55E);
                let _ = msg.channel_id.send_message(&ctx.http, CreateMessage::new().embed(embed)).await;
                self.log_command(&msg.author.name, "!ping", "OK").await;
            }
            "!help" => {
                let embed = build_embed("🦖 ARK Manager — Command Reference", "", 0x3B82F6)
                    .field("📋 Information", "`!list` `!status` `!players <id>` `!cluster`", false)
                    .field("⚡ Server Control *(Admin)*", "`!start <id>` `!stop <id>` `!restart <id>` `!update <id>`", false)
                    .field("👥 Player Management", "`!kick <id> <steam_id>` `!ban <id> <steam_id> [reason]` `!unban <id> <steam_id>`", false)
                    .field("🔧 Utilities *(Admin)*", "`!broadcast <id> <msg>` `!save <id>` `!destroy_wild <id>` `!rcon <id> <cmd>`", false);
                let _ = msg.channel_id.send_message(&ctx.http, CreateMessage::new().embed(embed)).await;
            }
            "!list" | "!status" => {
                if !self.check_permission(&ctx, &msg, PermLevel::Moderator).await {
                    let _ = msg.channel_id.send_message(&ctx.http, CreateMessage::new().embed(error_embed("You don't have permission."))).await;
                    return;
                }
                let state = self.app_handle.state::<AppState>();
                let servers = match get_all_servers_status(&state).await {
                    Ok(s) => s,
                    Err(e) => {
                        let _ = msg.channel_id.send_message(&ctx.http, CreateMessage::new().embed(error_embed(&e))).await;
                        return;
                    }
                };
                let pi = state.player_intelligence.clone();
                let counts = pi.get_player_counts().await;
                let mut desc = String::new();
                for s in &servers {
                    let icon = match s.status.as_str() { "online"|"running" => "🟢", "starting" => "🟡", "stopped" => "🔴", "crashed" => "💥", _ => "⚪" };
                    let pc = counts.get(&s.id).unwrap_or(&0);
                    desc.push_str(&format!("{} `#{}` **{}** — {} — `{}/{}`\n", icon, s.id, s.name, s.status, pc, s.max_players));
                }
                if desc.is_empty() { desc = "*No servers found*".to_string(); }
                let online = servers.iter().filter(|s| s.status == "online" || s.status == "running").count();
                let embed = build_embed(&format!("🦖 Server Status ({}/{})", online, servers.len()), &desc, 0x3B82F6);
                let _ = msg.channel_id.send_message(&ctx.http, CreateMessage::new().embed(embed)).await;
                self.log_command(&msg.author.name, "!list", "OK").await;
            }
            "!start" => {
                if !self.check_permission(&ctx, &msg, PermLevel::Admin).await {
                    let _ = msg.channel_id.send_message(&ctx.http, CreateMessage::new().embed(error_embed("Admin permission required."))).await;
                    return;
                }
                if args.is_empty() {
                    let _ = msg.channel_id.send_message(&ctx.http, CreateMessage::new().embed(error_embed("Usage: `!start <server_id>`"))).await;
                    return;
                }
                if let Ok(id) = args[0].parse::<i64>() {
                    let current_status: Option<String> = {
                        let state = self.app_handle.state::<AppState>();
                        let locked = state.db.lock().ok();
                        locked.as_ref().and_then(|db| db.get_connection().ok().and_then(|conn| conn.query_row("SELECT status FROM servers WHERE id = ?1", [id], |row| row.get::<_, String>(0)).ok()))
                    };
                    match current_status.as_deref() {
                        Some("running") | Some("online") | Some("starting") => {
                            let _ = msg.channel_id.send_message(&ctx.http, CreateMessage::new().embed(build_embed("⚠️ Already Running", &format!("Server {} is already `{}`.", id, current_status.unwrap_or_default()), 0xF59E0B))).await;
                            return;
                        }
                        None => {
                            let _ = msg.channel_id.send_message(&ctx.http, CreateMessage::new().embed(error_embed(&format!("Server ID {} not found.", id)))).await;
                            return;
                        }
                        _ => {}
                    }
                    let _ = msg.channel_id.send_message(&ctx.http, CreateMessage::new().embed(build_embed("🚀 Starting Server", &format!("Server `{}` is starting...", id), 0x3B82F6))).await;
                    self.log_command(&msg.author.name, &format!("!start {}", id), "initiated").await;
                    let app = self.app_handle.clone();
                    let http = ctx.http.clone();
                    let channel_id = msg.channel_id;
                    tauri::async_runtime::spawn(async move {
                        match crate::commands::server::start_server(app, id, false).await {
                            Ok(_) => { let _ = channel_id.send_message(&http, CreateMessage::new().embed(build_embed("✅ Server Started", &format!("Server `{}` started successfully.", id), 0x22C55E))).await; }
                            Err(e) => { let _ = channel_id.send_message(&http, CreateMessage::new().embed(error_embed(&format!("Failed to start server {}: {}", id, e)))).await; }
                        }
                    });
                } else {
                    let _ = msg.channel_id.send_message(&ctx.http, CreateMessage::new().embed(error_embed("Invalid Server ID."))).await;
                }
            }
            "!stop" => {
                if !self.check_permission(&ctx, &msg, PermLevel::Admin).await {
                    let _ = msg.channel_id.send_message(&ctx.http, CreateMessage::new().embed(error_embed("Admin permission required."))).await;
                    return;
                }
                if args.is_empty() {
                    let _ = msg.channel_id.send_message(&ctx.http, CreateMessage::new().embed(error_embed("Usage: `!stop <server_id>`"))).await;
                    return;
                }
                if let Ok(id) = args[0].parse::<i64>() {
                    let _ = msg.channel_id.send_message(&ctx.http, CreateMessage::new().embed(build_embed("🛑 Stopping Server", &format!("Server `{}` is stopping...", id), 0xF59E0B))).await;
                    self.log_command(&msg.author.name, &format!("!stop {}", id), "initiated").await;
                    let app = self.app_handle.clone();
                    let http = ctx.http.clone();
                    let channel_id = msg.channel_id;
                    tauri::async_runtime::spawn(async move {
                        let state = app.state::<AppState>();
                        match crate::commands::server::stop_server(state, id).await {
                            Ok(_) => { let _ = channel_id.send_message(&http, CreateMessage::new().embed(build_embed("✅ Server Stopped", &format!("Server `{}` stopped.", id), 0x22C55E))).await; }
                            Err(e) => { let _ = channel_id.send_message(&http, CreateMessage::new().embed(error_embed(&format!("Failed to stop server {}: {}", id, e)))).await; }
                        }
                    });
                } else {
                    let _ = msg.channel_id.send_message(&ctx.http, CreateMessage::new().embed(error_embed("Invalid Server ID."))).await;
                }
            }
            "!restart" => {
                if !self.check_permission(&ctx, &msg, PermLevel::Admin).await {
                    let _ = msg.channel_id.send_message(&ctx.http, CreateMessage::new().embed(error_embed("Admin permission required."))).await;
                    return;
                }
                if args.is_empty() {
                    let _ = msg.channel_id.send_message(&ctx.http, CreateMessage::new().embed(error_embed("Usage: `!restart <server_id>`"))).await;
                    return;
                }
                if let Ok(id) = args[0].parse::<i64>() {
                    let _ = msg.channel_id.send_message(&ctx.http, CreateMessage::new().embed(build_embed("🔄 Restarting Server", &format!("Server `{}` is restarting...", id), 0xF59E0B))).await;
                    self.log_command(&msg.author.name, &format!("!restart {}", id), "initiated").await;
                    let app = self.app_handle.clone();
                    let http = ctx.http.clone();
                    let channel_id = msg.channel_id;
                    tauri::async_runtime::spawn(async move {
                        let state = app.state::<AppState>();
                        match crate::commands::server::restart_server(state, id, None).await {
                            Ok(_) => { let _ = channel_id.send_message(&http, CreateMessage::new().embed(build_embed("✅ Server Restarted", &format!("Server `{}` restarted.", id), 0x22C55E))).await; }
                            Err(e) => { let _ = channel_id.send_message(&http, CreateMessage::new().embed(error_embed(&format!("Failed to restart server {}: {}", id, e)))).await; }
                        }
                    });
                } else {
                    let _ = msg.channel_id.send_message(&ctx.http, CreateMessage::new().embed(error_embed("Invalid Server ID."))).await;
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
    pub gateway_running: Arc<AtomicBool>,
    pub rate_limiter: Arc<Mutex<RateLimiter>>,
    sent_messages: Arc<Mutex<Vec<String>>>,
    shard_manager: Arc<Mutex<Option<Arc<ShardManager>>>>,
    // Phase 4: Status tracking
    pub commands_processed: Arc<AtomicU64>,
    pub started_at: Arc<Mutex<Option<Instant>>>,
    pub command_log: Arc<Mutex<Vec<DiscordCommandLog>>>,
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
            rate_limiter: Arc::new(Mutex::new(RateLimiter::new(5, 10))),
            sent_messages: Arc::new(Mutex::new(Vec::new())),
            shard_manager: Arc::new(Mutex::new(None)),
            commands_processed: Arc::new(AtomicU64::new(0)),
            started_at: Arc::new(Mutex::new(None)),
            command_log: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Configure the bridge
    pub async fn configure(&self, config: DiscordBridgeConfig) {
        let is_enabled = config.enabled && !config.bot_token.is_empty();
        {
            let mut cfg = self.config.lock().await;
            *cfg = Some(config);
        }

        if is_enabled && !self.gateway_running.load(Ordering::Relaxed) {
            let app_handle = self.app_handle.clone();
            let config_arc = self.config.clone();
            let gateway_running = self.gateway_running.clone();
            let commands_processed = self.commands_processed.clone();
            let command_log = self.command_log.clone();
            let shard_manager = self.shard_manager.clone();

            gateway_running.store(true, Ordering::Relaxed);
            tauri::async_runtime::spawn(async move {
                let token = {
                    let config_guard = config_arc.lock().await;
                    match config_guard.as_ref() {
                        Some(c) if !c.bot_token.is_empty() => c.bot_token.clone(),
                        _ => {
                            gateway_running.store(false, Ordering::Relaxed);
                            return;
                        }
                    }
                };

                let intents = GatewayIntents::GUILDS
                    | GatewayIntents::GUILD_MESSAGES
                    | GatewayIntents::MESSAGE_CONTENT;

                match SerenityClient::builder(&token, intents)
                    .event_handler(GatewayHandler { 
                        app_handle, 
                        config: config_arc,
                        commands_processed,
                        command_log,
                    })
                    .await
                {
                    Ok(mut client) => {
                        log::info!("🔌 Connecting to Discord Gateway...");
                        {
                            let mut sm = shard_manager.lock().await;
                            *sm = Some(client.shard_manager.clone());
                        }

                        if let Err(e) = client.start().await {
                            log::error!("❌ Discord Gateway error: {:?}", e);
                        }
                        {
                            let mut sm = shard_manager.lock().await;
                            *sm = None;
                        }
                        gateway_running.store(false, Ordering::Relaxed);
                    }
                    Err(e) => {
                        log::error!("❌ Failed to build Discord client: {:?}", e);
                        gateway_running.store(false, Ordering::Relaxed);
                    }
                }
            });
        }
    }

    /// Get current configuration
    pub async fn get_config(&self) -> Option<DiscordBridgeConfig> {
        let cfg = self.config.lock().await;
        cfg.clone()
    }

    /// Send a DiscordEmbed notification to the dedicated notifications channel
    pub async fn send_notification(
        &self,
        event_key: &str,
        embed: crate::services::discord::DiscordEmbed,
    ) {
        let config = self.config.lock().await.clone();
        let config = match config {
            Some(c) => c,
            None => return,
        };

        if !config.enabled || config.notifications_channel_id.is_empty() {
            return;
        }

        // Check if event type is enabled
        let should_send = match event_key {
            "playerJoin" | "playerLeave" => config.notify_player_join_leave,
            "serverCrash" => config.notify_server_crashes,
            "serverRecovery" => config.notify_server_recovery,
            "scheduledTask" => config.notify_scheduled_restarts,
            "backupComplete" => config.notify_backup_completion,
            "performanceAlert" => config.notify_performance_alerts,
            "modWatchdog" => config.notify_mod_watchdog,
            "antiCheat" => config.notify_anti_cheat,
            _ => true,
        };

        if !should_send {
            return;
        }

        let channel_id_u64 = match config.notifications_channel_id.parse::<u64>() {
            Ok(id) => id,
            Err(_) => {
                log::error!("[Discord] Invalid notifications channel ID: {}", config.notifications_channel_id);
                return;
            }
        };

        let serenity_embed = discord_embed_to_serenity(embed);

        let http = serenity::all::Http::new(&config.bot_token);
        let channel = serenity::model::id::ChannelId::new(channel_id_u64);
        let message = serenity::all::CreateMessage::new().embed(serenity_embed);

        if let Err(e) = channel.send_message(&http, message).await {
            log::error!("[Discord] Failed to send bot notification: {:?}", e);
        }
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
                    show_tribe_names, show_playtime, admin_channel_id,
                    admin_role_ids, moderator_role_ids,
                    notifications_channel_id, notify_player_join_leave, notify_server_crashes,
                    notify_server_recovery, notify_scheduled_restarts, notify_backup_completion,
                    notify_performance_alerts, notify_mod_watchdog, notify_anti_cheat, status_update_interval
             FROM discord_bridge_config WHERE enabled = 1 LIMIT 1",
            [],
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
        .ok()
    }

    /// Load rate limit configuration for a cluster from the database
    pub fn load_rate_limit_config(&self, cluster_id: i64) -> Option<(usize, u64)> {
        let state = self.app_handle.try_state::<crate::AppState>()?;
        let db = state.db.lock().ok()?;
        let conn = db.get_connection().ok()?;

        conn.query_row(
            "SELECT max_messages_per_window, window_seconds FROM discord_rate_limits WHERE cluster_id = ?1 AND enabled = 1",
            [cluster_id],
            |row| {
                let max_msgs: i32 = row.get(0)?;
                let window: i32 = row.get(1)?;
                Ok((max_msgs as usize, window as u64))
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

            // Persist sent message to DB for cross-restart echo prevention
            if let Some(cfg) = self.config.lock().await.clone() {
                let cluster_id = cfg.cluster_id;
                // Compute a stable hash of the formatted message
                let mut hasher = Sha256::new();
                hasher.update(formatted.as_bytes());
                let digest = hasher.finalize();
                let hash_b64 = base64::engine::general_purpose::STANDARD.encode(digest);
                // Save to DB (best-effort)
                self.save_sent_message_to_db(cluster_id, &hash_b64, &formatted.chars().take(200).collect::<String>());
            }

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
        // First check in-memory recent messages
        {
            let sent = self.sent_messages.lock().await;
            if sent.iter().any(|m| m.contains(content)) {
                return false;
            }
        }

        // Then check persistent DB-backed recent messages (last 60s)
        if let Some(cfg) = self.config.lock().await.clone() {
            let cluster_id = cfg.cluster_id;
            // Compute hash of the incoming content to compare
            let mut hasher = Sha256::new();
            hasher.update(content.as_bytes());
            let digest = hasher.finalize();
            let hash_b64 = base64::engine::general_purpose::STANDARD.encode(digest);
            if self.recent_message_exists(cluster_id, &hash_b64, 60).unwrap_or(false) {
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
            .event_handler(GatewayHandler { 
                app_handle, 
                config,
                commands_processed: self.commands_processed.clone(),
                command_log: self.command_log.clone(),
            })
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
                    
                    // Also load rate limit config for this cluster
                    if let Some((max_msgs, window_secs)) = self.load_rate_limit_config(loaded.cluster_id) {
                        log::info!(
                            "[Discord] Loaded rate limit config: {} messages per {} seconds",
                            max_msgs, window_secs
                        );
                        let mut limiter = self.rate_limiter.lock().await;
                        limiter.update_config(max_msgs, window_secs);
                    }
                    
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

        self.run_status_loop().await;
    }

    // Status update loop
    async fn run_status_loop(&self) {
        loop {
            if !self.running.load(Ordering::Relaxed) {
                break;
            }

            // 1. Get Config
            let config = self.get_config().await;
            let mut interval_sec = 60;

            if let Some(config) = config {
                interval_sec = config.status_update_interval.clamp(10, 3600);
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

            tokio::time::sleep(std::time::Duration::from_secs(interval_sec)).await;
        }
    }

    async fn update_server_list(&self, config: &DiscordBridgeConfig) -> Result<(), String> {
        let servers = self.fetch_cluster_servers(config.cluster_id)?;
        let player_counts = self.player_intelligence.get_player_counts().await;

        // Fetch System Metrics
        let (cpu_usage, ram_usage) = {
            if let Some(state) = self.app_handle.try_state::<AppState>() {
                let mut sys = state.sys.lock().unwrap();
                sys.refresh_cpu_usage();
                let cpus = sys.cpus();
                let cpu_u = if !cpus.is_empty() {
                    cpus.iter().map(|c| c.cpu_usage()).sum::<f32>() as f64 / cpus.len() as f64
                } else {
                    0.0
                };
                let ram_u = (sys.used_memory() as f64 / sys.total_memory() as f64) * 100.0;
                (cpu_u, ram_u)
            } else {
                (0.0, 0.0)
            }
        };

        let mut desc = format!("Updated: <t:{}:R>\n\n", chrono::Utc::now().timestamp());

        for s in &servers {
            let player_count = player_counts.get(&s.id).unwrap_or(&0);

            let (status_icon, status_text) = match s.status.as_str() {
                "online" | "running" => ("🟢", "Online"),
                "starting" => ("🟡", "Starting"),
                "stopped" => ("🔴", "Offline"),
                "crashed" => ("💥", "Crashed"),
                "updating" | "updates" => ("🔄", "Updating"),
                "restarting" => ("🔁", "Restarting"),
                "repairing" => ("🔧", "Repairing"),
                "startup_timeout" => ("⏰", "Timed Out"),
                _ => ("🔴", "Offline"),
            };

            let uptime_str = if s.status == "running" || s.status == "online" {
                if let Some(started_at_str) = &s.last_started {
                    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(started_at_str, "%Y-%m-%d %H:%M:%S") {
                        let started_ts = dt.and_utc().timestamp();
                        format!("<t:{}:R>", started_ts)
                    } else {
                        "Online".to_string()
                    }
                } else {
                    "Online".to_string()
                }
            } else {
                status_text.to_string()
            };

            desc.push_str(&format!(
                "{} **{}**\n└ Status: `{}` | Players: `[ {} / {} ]` | Uptime: {}\n\n",
                status_icon, s.name, s.status.to_uppercase(), player_count, s.max_players, uptime_str
            ));
        }

        let payload = json!({
            "content": "",
            "embeds": [{
                "title": "🦖 CLUSTER STATUS DASHBOARD",
                "description": desc,
                "color": 0x3B82F6,
                "fields": [
                    {
                        "name": "💻 System Metrics",
                        "value": format!("`CPU: {:.1}%` | `RAM: {:.1}%`", cpu_usage, ram_usage),
                        "inline": false
                    }
                ],
                "footer": {
                    "text": "ASA Server Manager 2.0"
                }
            }],
            "components": [
                {
                    "type": 1,
                    "components": [
                        {
                            "type": 2,
                            "label": "Start All",
                            "style": 3,
                            "custom_id": "start_all"
                        },
                        {
                            "type": 2,
                            "label": "Stop All",
                            "style": 4,
                            "custom_id": "stop_all"
                        },
                        {
                            "type": 2,
                            "label": "Restart All",
                            "style": 1,
                            "custom_id": "restart_all"
                        },
                        {
                            "type": 2,
                            "label": "Update All",
                            "style": 2,
                            "custom_id": "update_all"
                        }
                    ]
                }
            ]
        });

        self.update_discord_message(
            &config.server_list_channel_id,
            &config.server_list_message_id,
            &payload,
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
        let payload = json!({
            "content": content
        });

        self.update_discord_message(
            &config.player_list_channel_id,
            &config.player_list_message_id,
            &payload,
            "player_list",
        )
        .await
    }

    async fn update_discord_message(
        &self,
        channel_id: &str,
        message_id: &str,
        payload: &serde_json::Value,
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
                .send_discord_message(channel_id, &bot_token, payload)
                .await?;
            // Update DB and in-memory config with new message ID
            self.save_message_id_to_db(cluster_id, col_name, &new_id);
            self.update_in_memory_message_id(msg_type, &new_id).await;
        } else if let Err(_) = self
            .edit_discord_message(channel_id, message_id, &bot_token, payload)
            .await
        {
            println!("⚠️ Failed to edit Discord message, sending new one.");
            let new_id = self
                .send_discord_message(channel_id, &bot_token, payload)
                .await?;
            // Update DB and in-memory config with new message ID
            self.save_message_id_to_db(cluster_id, col_name, &new_id);
            self.update_in_memory_message_id(msg_type, &new_id).await;
        }
        Ok(())
    }

    /// Update in-memory message ID so subsequent loop iterations use message.edit()
    async fn update_in_memory_message_id(&self, msg_type: &str, new_id: &str) {
        let mut config_guard = self.config.lock().await;
        if let Some(cfg) = config_guard.as_mut() {
            if msg_type == "server_list" {
                cfg.server_list_message_id = new_id.to_string();
            } else {
                cfg.player_list_message_id = new_id.to_string();
            }
        }
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

    /// Save a sent Discord message hash to the DB to prevent echo across restarts
    fn save_sent_message_to_db(&self, cluster_id: i64, message_hash: &str, excerpt: &str) {
        // Best-effort save: keep the DB lock scoped inside this block so it drops promptly
        if let Some(state) = self.app_handle.try_state::<AppState>() {
            if let Ok(db_guard) = state.db.lock() {
                if let Ok(conn) = db_guard.get_connection() {
                    let _ = conn.execute(
                        "INSERT INTO discord_sent_messages (cluster_id, message_hash, excerpt) VALUES (?1, ?2, ?3)",
                        params![cluster_id, message_hash, excerpt],
                    );
                    // Optionally prune old messages (keep recent 1000)
                    let _ = conn.execute(
                        "DELETE FROM discord_sent_messages WHERE id NOT IN (SELECT id FROM discord_sent_messages ORDER BY created_at DESC LIMIT 1000)",
                        [],
                    );
                }
            }
        }
    }

    /// Check whether a recent message with the same hash exists within `window_seconds`
    fn recent_message_exists(&self, cluster_id: i64, message_hash: &str, window_seconds: i64) -> Result<bool, String> {
        // Limit scope of DB guard so borrow doesn't live too long
        let count: i64 = {
            let state = self.app_handle.state::<AppState>();
            let db_guard = match state.db.lock() {
                Ok(g) => g,
                Err(e) => return Err(e.to_string()),
            };
            let conn = match db_guard.get_connection() {
                Ok(c) => c,
                Err(e) => return Err(e.to_string()),
            };
            let modifier = format!("-{} seconds", window_seconds);
            let sql = "SELECT COUNT(1) FROM discord_sent_messages WHERE cluster_id = ?1 AND message_hash = ?2 AND created_at > datetime('now', ?3)";
            match conn.query_row(sql, params![cluster_id, message_hash, modifier], |row| row.get(0)) {
                Ok(c) => c,
                Err(e) => return Err(e.to_string()),
            }
        };

        Ok(count > 0)
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
        payload: &serde_json::Value,
    ) -> Result<String, String> {
        let url = format!(
            "https://discord.com/api/v10/channels/{}/messages",
            channel_id
        );

        let response = self
            .http_client
            .post(&url)
            .header("Authorization", format!("Bot {}", token))
            .header("Content-Type", "application/json")
            .json(payload)
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
        payload: &serde_json::Value,
    ) -> Result<(), String> {
        let url = format!(
            "https://discord.com/api/v10/channels/{}/messages/{}",
            channel_id, message_id
        );

        // Use PATCH for editing
        let response = self
            .http_client
            .patch(&url)
            .header("Authorization", format!("Bot {}", token))
            .header("Content-Type", "application/json")
            .json(payload)
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

    /// Get active bridge status snapshot
    pub async fn get_status(&self) -> DiscordBridgeStatus {
        let is_running = self.is_running();
        let gateway_connected = self.gateway_running.load(Ordering::Relaxed);
        let commands_processed = self.commands_processed.load(Ordering::Relaxed);
        
        let started_at = self.started_at.lock().await;
        let uptime_seconds = started_at
            .map(|start| start.elapsed().as_secs())
            .unwrap_or(0);

        let command_log = self.command_log.lock().await;
        let (last_command, last_command_user, last_command_time) = command_log
            .last()
            .map(|cmd| {
                (
                    Some(cmd.command.clone()),
                    Some(cmd.user.clone()),
                    Some(cmd.timestamp.clone()),
                )
            })
            .unwrap_or_default();

        let recent_commands = command_log.iter().rev().take(10).cloned().collect();

        DiscordBridgeStatus {
            is_running,
            gateway_connected,
            uptime_seconds,
            commands_processed,
            last_command,
            last_command_user,
            last_command_time,
            recent_commands,
        }
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
