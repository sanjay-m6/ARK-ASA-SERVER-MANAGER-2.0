// Discord Slash Command Dispatcher & Handlers
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tauri::{AppHandle, Manager};
use serenity::all::{
    CommandInteraction, Context, CreateEmbed, CreateEmbedFooter,
    CreateInteractionResponse, CreateInteractionResponseMessage,
    CreateModal, CreateInputText, InputTextStyle, CreateActionRow,
    EditInteractionResponse
};

use super::auth::AuthGuard;
use super::rate_limit::RateLimiter;
use super::setup::SetupWizard;
use super::player::PlayerManager;
use super::whitelist::WhitelistService;
use super::dashboard::DashboardBuilder;
use super::audit::AuditLogger;
use crate::services::discord_bridge::DiscordBridgeConfig;
use crate::AppState;

pub struct CommandHandler;

impl CommandHandler {
    /// Check whether a server is currently reported as running/online in the database
    fn check_is_server_running(app_handle: &AppHandle, server_id: i64) -> bool {
        if let Some(state) = app_handle.try_state::<AppState>() {
            if let Ok(db) = state.db.lock() {
                if let Ok(conn) = db.get_connection() {
                    // 1. Check ASA servers
                    if let Ok(status) = conn.query_row(
                        "SELECT status FROM servers WHERE id = ?1",
                        [server_id],
                        |r| r.get::<_, String>(0),
                    ) {
                        return status == "online" || status == "running";
                    }
                    // 2. Check ASE servers
                    if let Ok(status) = conn.query_row(
                        "SELECT status FROM ase_servers WHERE id = ?1",
                        [server_id.abs()],
                        |r| r.get::<_, String>(0),
                    ) {
                        return status == "online" || status == "running";
                    }
                }
            }
        }
        false
    }

    pub async fn handle(
        ctx: &Context,
        command: &CommandInteraction,
        app_handle: &AppHandle,
        config_arc: &Arc<Mutex<Option<DiscordBridgeConfig>>>,
        rate_limiter: &RateLimiter,
    ) {
        let cmd_name = command.data.name.as_str();
        let user_id = command.user.id;
        let guild_id = command.guild_id;

        // Extract options supporting both String and Integer inputs
        let server_id = command.data.options.iter()
            .find(|opt| opt.name == "server_id")
            .and_then(|opt| match &opt.value {
                serenity::all::CommandDataOptionValue::Integer(i) => Some(*i),
                serenity::all::CommandDataOptionValue::String(s) => s.trim().parse::<i64>().ok(),
                _ => None,
            });

        let steam_id = command.data.options.iter()
            .find(|opt| opt.name == "steam_id")
            .and_then(|opt| match &opt.value {
                serenity::all::CommandDataOptionValue::String(s) => Some(s.trim().to_string()),
                serenity::all::CommandDataOptionValue::Integer(i) => Some(i.to_string()),
                _ => None,
            });

        let player_name = command.data.options.iter()
            .find(|opt| opt.name == "player_name")
            .and_then(|opt| match &opt.value {
                serenity::all::CommandDataOptionValue::String(s) => Some(s.trim().to_string()),
                serenity::all::CommandDataOptionValue::Integer(i) => Some(i.to_string()),
                _ => None,
            });

        let query = command.data.options.iter()
            .find(|opt| opt.name == "query")
            .and_then(|opt| match &opt.value {
                serenity::all::CommandDataOptionValue::String(s) => Some(s.trim().to_string()),
                serenity::all::CommandDataOptionValue::Integer(i) => Some(i.to_string()),
                _ => None,
            });

        let rcon_command = command.data.options.iter()
            .find(|opt| opt.name == "command")
            .and_then(|opt| match &opt.value {
                serenity::all::CommandDataOptionValue::String(s) => Some(s.trim().to_string()),
                _ => None,
            });

        let reason = command.data.options.iter()
            .find(|opt| opt.name == "reason")
            .and_then(|opt| match &opt.value {
                serenity::all::CommandDataOptionValue::String(s) => Some(s.trim().to_string()),
                _ => None,
            });

        // Interactive modal for empty /rcon must not be deferred (Discord requirement)
        let is_modal_interaction = cmd_name == "rcon" && (server_id.is_none() || rcon_command.is_none());

        // 1. Immediately acknowledge all other interactions to beat Discord's 3-second hard deadline
        if !is_modal_interaction {
            if let Err(e) = command.defer_ephemeral(&ctx.http).await {
                log::error!("❌ [Discord] Failed to defer ephemeral response for /{}: {}", cmd_name, e);
                return;
            }
        }

        // 2. Load Bridge Configuration
        let config = {
            let mut cfg_guard = config_arc.lock().await;
            if cfg_guard.is_none() {
                // Auto-load config from database if missing in memory
                if let Some(state) = app_handle.try_state::<AppState>() {
                    if let Some(loaded) = state.discord_bridge.load_config_from_db() {
                        *cfg_guard = Some(loaded);
                    }
                }
            }
            match cfg_guard.clone() {
                Some(c) => c,
                None => {
                    let msg = "⚠️ Discord Bridge configuration is not loaded.";
                    if is_modal_interaction {
                        let resp = CreateInteractionResponseMessage::new().content(msg).ephemeral(true);
                        let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                    } else {
                        let _ = command.edit_response(&ctx.http, EditInteractionResponse::new().content(msg)).await;
                    }
                    return;
                }
            }
        };

        // 3. Resolve Role Permissions
        let user_tier = AuthGuard::resolve_role_tier(
            command.member.as_deref(),
            user_id,
            None,
            &config,
        );

        // 4. Rate Limiting Check
        let rate_limit_window = Duration::from_secs(10);
        let max_calls = match cmd_name {
            "rcon" | "start" | "stop" | "restart" | "update" | "backup" => 3,
            "kick" | "ban" | "whitelist" => 5,
            _ => 10,
        };

        if !rate_limiter.check_and_record(cmd_name, &user_id.to_string(), max_calls, rate_limit_window).await {
            let limit_msg = "⏳ **Rate limit exceeded.** Please wait a few seconds before trying this command again.";
            if is_modal_interaction {
                let resp = CreateInteractionResponseMessage::new().content(limit_msg).ephemeral(true);
                let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
            } else {
                let _ = command.edit_response(&ctx.http, EditInteractionResponse::new().content(limit_msg)).await;
            }
            return;
        }

        // 5. Permission Check
        let (can_execute, reason_msg) = AuthGuard::can_execute_action(cmd_name, user_tier);
        if !can_execute {
            let denied_msg = format!("❌ **Access Denied:** {}", reason_msg);
            if is_modal_interaction {
                let resp = CreateInteractionResponseMessage::new().content(denied_msg).ephemeral(true);
                let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
            } else {
                let _ = command.edit_response(&ctx.http, EditInteractionResponse::new().content(denied_msg)).await;
            }
            return;
        }

        // 6. Command Execution
        match cmd_name {
            "setup" => {
                let g_id = match guild_id {
                    Some(g) => g,
                    None => {
                        let _ = command.edit_response(
                            &ctx.http,
                            EditInteractionResponse::new().content("❌ The `/setup` command can only be executed in a Discord server."),
                        ).await;
                        return;
                    }
                };

                let _ = command.edit_response(
                    &ctx.http,
                    EditInteractionResponse::new().content("⏳ **Provisioning category and specialized channels for ARK Server Manager...**"),
                ).await;

                let mut cfg_copy = config.clone();
                match SetupWizard::execute(ctx, g_id, user_id, app_handle, &mut cfg_copy).await {
                    Ok(embed) => {
                        // Update in-memory config
                        {
                            let mut cfg_lock = config_arc.lock().await;
                            *cfg_lock = Some(cfg_copy);
                        }
                        let _ = command.edit_response(&ctx.http, EditInteractionResponse::new().content("").embed(embed)).await;
                    }
                    Err(e) => {
                        let err_embed = CreateEmbed::new()
                            .title("❌ Setup Failed")
                            .description(format!("Failed to auto-configure channels: {}", e))
                            .color(0xEF4444);
                        let _ = command.edit_response(&ctx.http, EditInteractionResponse::new().content("").embed(err_embed)).await;
                    }
                }
            }

            "status" => {
                match DashboardBuilder::build_dashboard_payload(app_handle, config.cluster_id).await {
                    Ok(payload) => {
                        let embed_json = &payload["embeds"][0];
                        let title = embed_json["title"].as_str().unwrap_or("🦖 ARK SERVER MANAGER");
                        let desc = embed_json["description"].as_str().unwrap_or("");
                        let color = embed_json["color"].as_u64().unwrap_or(0x3B82F6) as u32;

                        let mut embed = CreateEmbed::new()
                            .title(title)
                            .description(desc)
                            .color(color)
                            .footer(CreateEmbedFooter::new("ARK: Survival Ascended Server Manager • Status Overview"))
                            .timestamp(serenity::model::Timestamp::now());

                        if let Some(fields) = embed_json["fields"].as_array() {
                            for f in fields {
                                let name = f["name"].as_str().unwrap_or("");
                                let val = f["value"].as_str().unwrap_or("");
                                let inline = f["inline"].as_bool().unwrap_or(false);
                                embed = embed.field(name, val, inline);
                            }
                        }

                        if let Err(e) = command.edit_response(&ctx.http, EditInteractionResponse::new().embed(embed)).await {
                            log::error!("❌ [Discord] Failed to send status response: {}", e);
                        }
                    }
                    Err(e) => {
                        let _ = command.edit_response(
                            &ctx.http,
                            EditInteractionResponse::new().content(format!("❌ Error generating status overview: {}", e)),
                        ).await;
                    }
                }
            }

            "players" => {
                let active_sessions = {
                    if let Some(state) = app_handle.try_state::<AppState>() {
                        state.player_intelligence.get_all_active_sessions().await
                    } else {
                        Vec::new()
                    }
                };

                let servers = DashboardBuilder::fetch_servers(app_handle, config.cluster_id).unwrap_or_default();

                let mut embed = CreateEmbed::new()
                    .title(format!("👥 Online Players ({})", active_sessions.len()))
                    .color(0x3B82F6)
                    .footer(CreateEmbedFooter::new("ARK Server Manager • Player Directory"))
                    .timestamp(serenity::model::Timestamp::now());

                if active_sessions.is_empty() {
                    embed = embed.description("*No players currently online across servers.*");
                } else {
                    let mut players_by_server: std::collections::HashMap<i64, Vec<String>> = std::collections::HashMap::new();
                    for (_steam_id, server_id, name) in active_sessions {
                        players_by_server.entry(server_id).or_default().push(name);
                    }

                    for s in &servers {
                        if let Some(players) = players_by_server.get(&s.id) {
                            let player_list = players.iter().map(|p| format!("• **{}**", p)).collect::<Vec<_>>().join("\n");
                            embed = embed.field(format!("🟢 {} ({})", s.name, players.len()), player_list, false);
                        }
                    }
                }

                if let Err(e) = command.edit_response(&ctx.http, EditInteractionResponse::new().embed(embed)).await {
                    log::error!("❌ [Discord] Failed to send players response: {}", e);
                }
            }

            "rcon" => {
                if let (Some(srv_id), Some(cmd_str)) = (server_id, rcon_command) {
                    // Check allowed commands
                    let (allowed, msg) = AuthGuard::is_allowed_rcon_command(&cmd_str, user_tier);
                    if !allowed {
                        let _ = command.edit_response(
                            &ctx.http,
                            EditInteractionResponse::new().content(format!("❌ **RCON Restricted:** {}", msg)),
                        ).await;
                        return;
                    }

                    // Pre-check server online status to avoid 90-second TCP timeouts
                    if !Self::check_is_server_running(app_handle, srv_id) {
                        let _ = command.edit_response(
                            &ctx.http,
                            EditInteractionResponse::new().content(format!("❌ **Server #{} is currently offline/stopped.** RCON commands can only be sent to running servers.", srv_id)),
                        ).await;
                        return;
                    }

                    let rcon_state = app_handle.try_state::<crate::commands::rcon::RconState>();
                    if let Some(rcon) = rcon_state {
                        let rcon_service = &rcon.inner().0;
                        match rcon_service.send_command(srv_id, &cmd_str).await {
                            Ok(output) => {
                                let raw_out = output.message.trim();
                                let sanitized = if raw_out.is_empty() {
                                    "Command executed successfully (no output returned)."
                                } else {
                                    raw_out
                                };

                                AuditLogger::log(
                                    app_handle,
                                    &guild_id.map(|g| g.to_string()).unwrap_or_default(),
                                    &user_id.to_string(),
                                    Some(srv_id),
                                    "RCON",
                                    Some(&cmd_str),
                                    "SUCCESS",
                                    reason.as_deref(),
                                    Some(&serde_json::json!({ "command": cmd_str })),
                                );

                                let embed = CreateEmbed::new()
                                    .title(format!("⌨️ RCON Console — Server #{}", srv_id))
                                    .description(format!("**Executed:** `{}`\n```\n{}\n```", cmd_str, sanitized))
                                    .color(0x3B82F6)
                                    .footer(CreateEmbedFooter::new("ARK Server Manager • Remote RCON"))
                                    .timestamp(serenity::model::Timestamp::now());

                                if let Err(e) = command.edit_response(&ctx.http, EditInteractionResponse::new().embed(embed)).await {
                                    log::error!("❌ [Discord] Failed to send RCON response: {}", e);
                                }
                            }
                            Err(e) => {
                                let _ = command.edit_response(
                                    &ctx.http,
                                    EditInteractionResponse::new().content(format!("❌ **RCON Execution Failed:** {}", e)),
                                ).await;
                            }
                        }
                    } else {
                        let _ = command.edit_response(
                            &ctx.http,
                            EditInteractionResponse::new().content("❌ RCON Service is currently unavailable."),
                        ).await;
                    }
                } else {
                    // Open Modal for interactive RCON input (initial non-deferred response)
                    let target_id_str = server_id.map(|s| s.to_string()).unwrap_or_else(|| "1".to_string());
                    let modal = CreateModal::new("modal_rcon_exec", "⌨️ Execute RCON Command")
                        .components(vec![
                            CreateActionRow::InputText(
                                CreateInputText::new(InputTextStyle::Short, "Target Server ID", "rcon_server_id")
                                    .placeholder("e.g. 1")
                                    .value(target_id_str)
                                    .required(true),
                            ),
                            CreateActionRow::InputText(
                                CreateInputText::new(InputTextStyle::Short, "Command String", "rcon_command_text")
                                    .placeholder("e.g. SaveWorld, Broadcast Server updating soon, ListPlayers")
                                    .required(true),
                            ),
                            CreateActionRow::InputText(
                                CreateInputText::new(InputTextStyle::Paragraph, "Reason / Audit Note (Optional)", "rcon_reason_note")
                                    .placeholder("Why this command is being executed...")
                                    .required(false),
                            ),
                        ]);

                    if let Err(e) = command.create_response(&ctx.http, CreateInteractionResponse::Modal(modal)).await {
                        log::error!("❌ [Discord] Failed to display RCON Modal: {}", e);
                    }
                }
            }

            "backup" => {
                if let Some(srv_id) = server_id {
                    let _ = command.edit_response(
                        &ctx.http,
                        EditInteractionResponse::new().content(format!("⏳ **Initiating SaveWorld and backup sequence for Server #{}...**", srv_id)),
                    ).await;

                    let ah = app_handle.clone();
                    let g_str = guild_id.map(|g| g.to_string()).unwrap_or_default();
                    let u_str = user_id.to_string();
                    let http = ctx.http.clone();
                    let cmd_clone = command.clone();

                    tokio::spawn(async move {
                        let start_time = std::time::Instant::now();
                        
                        // 1. Trigger SaveWorld via RCON if available
                        if let Some(rcon) = ah.try_state::<crate::commands::rcon::RconState>() {
                            let _ = rcon.inner().0.send_command(srv_id, "SaveWorld").await;
                            tokio::time::sleep(Duration::from_secs(3)).await;
                        }

                        // 2. Call backup creation
                        if let Some(state) = ah.try_state::<AppState>() {
                            match crate::commands::backup::create_backup(state, srv_id, "manual".to_string(), None).await {
                                Ok(backup_record) => {
                                    let duration = start_time.elapsed().as_secs();
                                    let size_mb = (backup_record.size as f64) / (1024.0 * 1024.0);

                                    let path_str = backup_record.file_path.to_string_lossy().to_string();
                                    AuditLogger::log(
                                        &ah,
                                        &g_str,
                                        &u_str,
                                        Some(srv_id),
                                        "BACKUP",
                                        Some(&path_str),
                                        "SUCCESS",
                                        None,
                                        Some(&serde_json::json!({
                                            "size_mb": size_mb,
                                            "duration_s": duration
                                        })),
                                    );

                                    let embed = CreateEmbed::new()
                                        .title("✅ Remote Backup Completed")
                                        .description(format!(
                                            "**Server:** `#{}`\n\
                                            **Archive Size:** `{:.2} MB`\n\
                                            **Duration:** `{}s`\n\
                                            **Local Archive:** ✅ Verified\n\
                                            **Path:** `{}`",
                                            srv_id, size_mb, duration, backup_record.file_path.display()
                                        ))
                                        .color(0x10B981)
                                        .footer(CreateEmbedFooter::new("ARK Server Manager • Backup Subsystem"))
                                        .timestamp(serenity::model::Timestamp::now());

                                    let _ = cmd_clone.edit_response(&http, EditInteractionResponse::new().content("").embed(embed)).await;
                                }
                                Err(e) => {
                                    let embed = CreateEmbed::new()
                                        .title("❌ Backup Failed")
                                        .description(format!("Failed to generate server backup: {}", e))
                                        .color(0xEF4444);
                                    let _ = cmd_clone.edit_response(&http, EditInteractionResponse::new().content("").embed(embed)).await;
                                }
                            }
                        }
                    });
                } else {
                    let _ = command.edit_response(
                        &ctx.http,
                        EditInteractionResponse::new().content("❌ Missing required option `server_id`."),
                    ).await;
                }
            }

            "player" => {
                if let Some(ref q) = query {
                    match PlayerManager::build_player_dossier(app_handle, q).await {
                        Ok(embed) => {
                            if let Err(e) = command.edit_response(&ctx.http, EditInteractionResponse::new().embed(embed)).await {
                                log::error!("❌ [Discord] Failed to send player dossier response: {}", e);
                            }
                        }
                        Err(e) => {
                            let _ = command.edit_response(
                                &ctx.http,
                                EditInteractionResponse::new().content(format!("❌ {}", e)),
                            ).await;
                        }
                    }
                } else {
                    let _ = command.edit_response(
                        &ctx.http,
                        EditInteractionResponse::new().content("❌ Missing required parameter `query` (character name or Steam/EOS ID)."),
                    ).await;
                }
            }

            "link" => {
                if let Some(ref sid) = steam_id {
                    let g_str = guild_id.map(|g| g.to_string()).unwrap_or_default();
                    match PlayerManager::link_player(
                        app_handle,
                        &g_str,
                        &user_id.to_string(),
                        &command.user.name,
                        sid,
                        config.cluster_id,
                    ) {
                        Ok(msg) => {
                            let embed = CreateEmbed::new()
                                .title("🔗 Player Account Linked")
                                .description(msg)
                                .color(0x10B981)
                                .footer(CreateEmbedFooter::new("ARK Server Manager • Identity & Access"))
                                .timestamp(serenity::model::Timestamp::now());

                            if let Err(e) = command.edit_response(&ctx.http, EditInteractionResponse::new().embed(embed)).await {
                                log::error!("❌ [Discord] Failed to send /link success response: {}", e);
                            }
                        }
                        Err(e) => {
                            if let Err(err) = command.edit_response(
                                &ctx.http,
                                EditInteractionResponse::new().content(format!("❌ **Account Link Failed:** {}", e)),
                            ).await {
                                log::error!("❌ [Discord] Failed to send /link error response: {}", err);
                            }
                        }
                    }
                } else {
                    let _ = command.edit_response(
                        &ctx.http,
                        EditInteractionResponse::new().content("❌ Missing required option `steam_id` (enter your SteamID64 or EOS ID)."),
                    ).await;
                }
            }

            "whitelist" => {
                if let Some(ref sid) = steam_id {
                    let g_str = guild_id.map(|g| g.to_string()).unwrap_or_default();
                    match WhitelistService::add_to_whitelist(
                        app_handle,
                        &g_str,
                        &user_id.to_string(),
                        sid,
                        player_name.as_deref(),
                        server_id,
                    ).await {
                        Ok(embed) => {
                            if let Err(e) = command.edit_response(&ctx.http, EditInteractionResponse::new().embed(embed)).await {
                                log::error!("❌ [Discord] Failed to send whitelist response: {}", e);
                            }
                        }
                        Err(e) => {
                            let _ = command.edit_response(
                                &ctx.http,
                                EditInteractionResponse::new().content(format!("❌ **Whitelist Failed:** {}", e)),
                            ).await;
                        }
                    }
                } else {
                    let _ = command.edit_response(
                        &ctx.http,
                        EditInteractionResponse::new().content("❌ Missing required option `steam_id`."),
                    ).await;
                }
            }

            "kick" => {
                if let (Some(srv_id), Some(sid)) = (server_id, steam_id) {
                    if !Self::check_is_server_running(app_handle, srv_id) {
                        let _ = command.edit_response(
                            &ctx.http,
                            EditInteractionResponse::new().content(format!("❌ **Server #{} is currently offline/stopped.** Cannot kick player.", srv_id)),
                        ).await;
                        return;
                    }

                    let g_str = guild_id.map(|g| g.to_string()).unwrap_or_default();
                    match PlayerManager::kick_player(
                        app_handle,
                        &g_str,
                        &user_id.to_string(),
                        srv_id,
                        &sid,
                        reason.as_deref(),
                    ).await {
                        Ok(msg) => {
                            let _ = command.edit_response(&ctx.http, EditInteractionResponse::new().content(msg)).await;
                        }
                        Err(e) => {
                            let _ = command.edit_response(
                                &ctx.http,
                                EditInteractionResponse::new().content(format!("❌ **Kick Failed:** {}", e)),
                            ).await;
                        }
                    }
                } else {
                    let _ = command.edit_response(
                        &ctx.http,
                        EditInteractionResponse::new().content("❌ Missing required options `server_id` and `steam_id`."),
                    ).await;
                }
            }

            "ban" => {
                if let (Some(srv_id), Some(sid)) = (server_id, steam_id) {
                    if !Self::check_is_server_running(app_handle, srv_id) {
                        let _ = command.edit_response(
                            &ctx.http,
                            EditInteractionResponse::new().content(format!("❌ **Server #{} is currently offline/stopped.** Cannot ban player.", srv_id)),
                        ).await;
                        return;
                    }

                    let g_str = guild_id.map(|g| g.to_string()).unwrap_or_default();
                    match PlayerManager::ban_player(
                        app_handle,
                        &g_str,
                        &user_id.to_string(),
                        srv_id,
                        &sid,
                        reason.as_deref(),
                    ).await {
                        Ok(msg) => {
                            let _ = command.edit_response(&ctx.http, EditInteractionResponse::new().content(msg)).await;
                        }
                        Err(e) => {
                            let _ = command.edit_response(
                                &ctx.http,
                                EditInteractionResponse::new().content(format!("❌ **Ban Failed:** {}", e)),
                            ).await;
                        }
                    }
                } else {
                    let _ = command.edit_response(
                        &ctx.http,
                        EditInteractionResponse::new().content("❌ Missing required options `server_id` and `steam_id`."),
                    ).await;
                }
            }

            "start" | "stop" | "restart" | "update" => {
                if let Some(srv_id) = server_id {
                    let action_id = format!("{}_{}_{}", cmd_name, srv_id, chrono::Utc::now().timestamp_millis());
                    let action_label = match cmd_name {
                        "start" => "START",
                        "stop" => "STOP",
                        "restart" => "RESTART",
                        "update" => "UPDATE FILES",
                        _ => "EXECUTE",
                    };

                    let (embed, button_row) = DashboardBuilder::build_confirmation_prompt(
                        &action_id,
                        action_label,
                        &format!("Server #{}", srv_id),
                    );

                    // Record pending action in SQLite
                    if let Some(state) = app_handle.try_state::<AppState>() {
                        if let Ok(db) = state.db.lock() {
                            if let Ok(conn) = db.get_connection() {
                                let expires_at = (chrono::Utc::now() + chrono::Duration::seconds(60)).to_rfc3339();
                                let payload = serde_json::json!({
                                    "action": cmd_name,
                                    "server_id": srv_id
                                }).to_string();

                                let _ = conn.execute(
                                    "INSERT INTO discord_pending_actions (id, action_type, guild_id, discord_user_id, server_id, payload_json, expires_at, status)
                                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending')",
                                    rusqlite::params![
                                        action_id,
                                        cmd_name,
                                        guild_id.map(|g| g.to_string()).unwrap_or_default(),
                                        user_id.to_string(),
                                        srv_id,
                                        payload,
                                        expires_at
                                    ],
                                );
                            }
                        }
                    }

                    if let Err(e) = command.edit_response(
                        &ctx.http,
                        EditInteractionResponse::new().embed(embed).components(vec![button_row]),
                    ).await {
                        log::error!("❌ [Discord] Failed to send action confirmation prompt: {}", e);
                    }
                } else {
                    let _ = command.edit_response(
                        &ctx.http,
                        EditInteractionResponse::new().content("❌ Missing required option `server_id`."),
                    ).await;
                }
            }

            _ => {
                let _ = command.edit_response(
                    &ctx.http,
                    EditInteractionResponse::new().content("❌ Command not recognized."),
                ).await;
            }
        }
    }
}
