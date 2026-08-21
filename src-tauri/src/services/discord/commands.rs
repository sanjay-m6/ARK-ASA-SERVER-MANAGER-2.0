// Discord Slash Command Dispatcher & Handlers
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tauri::{AppHandle, Manager};
use serenity::all::{
    CommandInteraction, Context, CreateEmbed, CreateEmbedFooter,
    CreateInteractionResponse, CreateInteractionResponseMessage,
    CreateModal, CreateInputText, InputTextStyle, CreateActionRow
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

        let config = {
            let cfg = config_arc.lock().await;
            match cfg.clone() {
                Some(c) => c,
                None => {
                    let resp = CreateInteractionResponseMessage::new()
                        .content("⚠️ Discord Bridge configuration is not loaded.")
                        .ephemeral(true);
                    let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                    return;
                }
            }
        };

        let user_tier = AuthGuard::resolve_role_tier(
            command.member.as_deref(),
            user_id,
            None,
            &config,
        );

        // Helper to extract options
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

        let player_name = command.data.options.iter()
            .find(|opt| opt.name == "player_name")
            .and_then(|opt| match &opt.value {
                serenity::all::CommandDataOptionValue::String(s) => Some(s.clone()),
                _ => None,
            });

        let query = command.data.options.iter()
            .find(|opt| opt.name == "query")
            .and_then(|opt| match &opt.value {
                serenity::all::CommandDataOptionValue::String(s) => Some(s.clone()),
                _ => None,
            });

        let rcon_command = command.data.options.iter()
            .find(|opt| opt.name == "command")
            .and_then(|opt| match &opt.value {
                serenity::all::CommandDataOptionValue::String(s) => Some(s.clone()),
                _ => None,
            });

        let reason = command.data.options.iter()
            .find(|opt| opt.name == "reason")
            .and_then(|opt| match &opt.value {
                serenity::all::CommandDataOptionValue::String(s) => Some(s.clone()),
                _ => None,
            });

        // 1. Rate Limiting Check (Rate limit per action)
        let rate_limit_window = Duration::from_secs(10);
        let max_calls = match cmd_name {
            "rcon" | "start" | "stop" | "restart" | "update" | "backup" => 3,
            "kick" | "ban" | "whitelist" => 5,
            _ => 10,
        };

        if !rate_limiter.check_and_record(cmd_name, &user_id.to_string(), max_calls, rate_limit_window).await {
            let resp = CreateInteractionResponseMessage::new()
                .content("⏳ **Rate limit exceeded.** Please wait a few seconds before trying this command again.")
                .ephemeral(true);
            let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
            return;
        }

        // 2. Permission Check
        let (can_execute, reason_msg) = AuthGuard::can_execute_action(cmd_name, user_tier);
        if !can_execute {
            let resp = CreateInteractionResponseMessage::new()
                .content(format!("❌ **Access Denied:** {}", reason_msg))
                .ephemeral(true);
            let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
            return;
        }

        // 3. Command Execution
        match cmd_name {
            "setup" => {
                let g_id = match guild_id {
                    Some(g) => g,
                    None => {
                        let resp = CreateInteractionResponseMessage::new()
                            .content("❌ The `/setup` command can only be executed in a Discord server.")
                            .ephemeral(true);
                        let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                        return;
                    }
                };

                let defer = CreateInteractionResponseMessage::new()
                    .content("⏳ **Provisioning category and specialized channels for ARK Server Manager...**")
                    .ephemeral(true);
                let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(defer)).await;

                let mut cfg_copy = config.clone();
                match SetupWizard::execute(ctx, g_id, user_id, app_handle, &mut cfg_copy).await {
                    Ok(embed) => {
                        // Update in-memory config
                        {
                            let mut cfg_lock = config_arc.lock().await;
                            *cfg_lock = Some(cfg_copy);
                        }
                        let _ = command.edit_response(&ctx.http, serenity::all::EditInteractionResponse::new().embed(embed)).await;
                    }
                    Err(e) => {
                        let err_embed = CreateEmbed::new()
                            .title("❌ Setup Failed")
                            .description(format!("Failed to auto-configure channels: {}", e))
                            .color(0xEF4444);
                        let _ = command.edit_response(&ctx.http, serenity::all::EditInteractionResponse::new().embed(err_embed)).await;
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

                        let resp = CreateInteractionResponseMessage::new().embed(embed).ephemeral(true);
                        let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                    }
                    Err(e) => {
                        let resp = CreateInteractionResponseMessage::new()
                            .content(format!("❌ Error generating status overview: {}", e))
                            .ephemeral(true);
                        let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                    }
                }
            }

            "rcon" => {
                if let (Some(srv_id), Some(cmd_str)) = (server_id, rcon_command) {
                    // Check allowed commands
                    let (allowed, msg) = AuthGuard::is_allowed_rcon_command(&cmd_str, user_tier);
                    if !allowed {
                        let resp = CreateInteractionResponseMessage::new()
                            .content(format!("❌ **RCON Restricted:** {}", msg))
                            .ephemeral(true);
                        let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
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

                                let resp = CreateInteractionResponseMessage::new().embed(embed).ephemeral(true);
                                let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                            }
                            Err(e) => {
                                let resp = CreateInteractionResponseMessage::new()
                                    .content(format!("❌ **RCON Execution Failed:** {}", e))
                                    .ephemeral(true);
                                let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                            }
                        }
                    } else {
                        let resp = CreateInteractionResponseMessage::new()
                            .content("❌ RCON Service is currently unavailable.")
                            .ephemeral(true);
                        let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                    }
                } else {
                    // Open Modal for interactive RCON input
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

                    let _ = command.create_response(&ctx.http, CreateInteractionResponse::Modal(modal)).await;
                }
            }

            "backup" => {
                if let Some(srv_id) = server_id {
                    let defer = CreateInteractionResponseMessage::new()
                        .content(format!("⏳ **Initiating SaveWorld and backup sequence for Server #{}...**", srv_id))
                        .ephemeral(true);
                    let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(defer)).await;

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

                                    let _ = cmd_clone.edit_response(&http, serenity::all::EditInteractionResponse::new().embed(embed)).await;
                                }
                                Err(e) => {
                                    let embed = CreateEmbed::new()
                                        .title("❌ Backup Failed")
                                        .description(format!("Failed to generate server backup: {}", e))
                                        .color(0xEF4444);
                                    let _ = cmd_clone.edit_response(&http, serenity::all::EditInteractionResponse::new().embed(embed)).await;
                                }
                            }
                        }
                    });
                } else {
                    let resp = CreateInteractionResponseMessage::new()
                        .content("❌ Missing required option `server_id`.")
                        .ephemeral(true);
                    let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                }
            }

            "player" => {
                if let Some(ref q) = query {
                    match PlayerManager::build_player_dossier(app_handle, q).await {
                        Ok(embed) => {
                            let resp = CreateInteractionResponseMessage::new().embed(embed).ephemeral(true);
                            let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                        }
                        Err(e) => {
                            let resp = CreateInteractionResponseMessage::new()
                                .content(format!("❌ {}", e))
                                .ephemeral(true);
                            let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                        }
                    }
                } else {
                    let resp = CreateInteractionResponseMessage::new()
                        .content("❌ Missing required parameter `query` (character name or Steam/EOS ID).")
                        .ephemeral(true);
                    let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
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

                            let resp = CreateInteractionResponseMessage::new().embed(embed).ephemeral(true);
                            let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                        }
                        Err(e) => {
                            let resp = CreateInteractionResponseMessage::new()
                                .content(format!("❌ **Account Link Failed:** {}", e))
                                .ephemeral(true);
                            let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                        }
                    }
                } else {
                    let resp = CreateInteractionResponseMessage::new()
                        .content("❌ Missing required option `steam_id`.")
                        .ephemeral(true);
                    let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
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
                            let resp = CreateInteractionResponseMessage::new().embed(embed).ephemeral(true);
                            let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                        }
                        Err(e) => {
                            let resp = CreateInteractionResponseMessage::new()
                                .content(format!("❌ **Whitelist Failed:** {}", e))
                                .ephemeral(true);
                            let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                        }
                    }
                } else {
                    let resp = CreateInteractionResponseMessage::new()
                        .content("❌ Missing required option `steam_id`.")
                        .ephemeral(true);
                    let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                }
            }

            "kick" => {
                if let (Some(srv_id), Some(sid)) = (server_id, steam_id) {
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
                            let resp = CreateInteractionResponseMessage::new().content(msg).ephemeral(true);
                            let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                        }
                        Err(e) => {
                            let resp = CreateInteractionResponseMessage::new()
                                .content(format!("❌ **Kick Failed:** {}", e))
                                .ephemeral(true);
                            let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                        }
                    }
                } else {
                    let resp = CreateInteractionResponseMessage::new()
                        .content("❌ Missing required options `server_id` and `steam_id`.")
                        .ephemeral(true);
                    let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                }
            }

            "ban" => {
                if let (Some(srv_id), Some(sid)) = (server_id, steam_id) {
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
                            let resp = CreateInteractionResponseMessage::new().content(msg).ephemeral(true);
                            let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                        }
                        Err(e) => {
                            let resp = CreateInteractionResponseMessage::new()
                                .content(format!("❌ **Ban Failed:** {}", e))
                                .ephemeral(true);
                            let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                        }
                    }
                } else {
                    let resp = CreateInteractionResponseMessage::new()
                        .content("❌ Missing required options `server_id` and `steam_id`.")
                        .ephemeral(true);
                    let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
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

                    let resp = CreateInteractionResponseMessage::new()
                        .embed(embed)
                        .components(vec![button_row])
                        .ephemeral(true);
                    let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                } else {
                    let resp = CreateInteractionResponseMessage::new()
                        .content("❌ Missing required option `server_id`.")
                        .ephemeral(true);
                    let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                }
            }

            _ => {
                let resp = CreateInteractionResponseMessage::new()
                    .content("❌ Command not recognized.")
                    .ephemeral(true);
                let _ = command.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
            }
        }
    }
}
