// Discord Component Interaction Dispatcher & Handlers (Buttons, Select Menus, Modals)
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tauri::{AppHandle, Manager};
use serenity::all::{
    ComponentInteraction, ModalInteraction, Context, CreateEmbed, CreateEmbedFooter,
    CreateInteractionResponse, CreateInteractionResponseMessage,
    CreateModal, CreateInputText, InputTextStyle, CreateActionRow,
    EditInteractionResponse
};

use super::auth::AuthGuard;
use super::types::RoleTier;
use super::rate_limit::RateLimiter;
use super::dashboard::DashboardBuilder;
use super::audit::AuditLogger;
use crate::services::discord_bridge::DiscordBridgeConfig;
use crate::AppState;

pub struct ComponentHandler;

impl ComponentHandler {
    /// Handle Component interactions (Button clicks & Select Menu changes)
    pub async fn handle_component(
        ctx: &Context,
        interaction: &ComponentInteraction,
        app_handle: &AppHandle,
        config_arc: &Arc<Mutex<Option<DiscordBridgeConfig>>>,
        _rate_limiter: &RateLimiter,
    ) {
        let custom_id = interaction.data.custom_id.as_str();
        let user_id = interaction.user.id;
        let guild_id = interaction.guild_id;

        let config = {
            let cfg = config_arc.lock().await;
            match cfg.clone() {
                Some(c) => c,
                None => {
                    let resp = CreateInteractionResponseMessage::new()
                        .content("⚠️ Discord Bridge configuration is not loaded.")
                        .ephemeral(true);
                    let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                    return;
                }
            }
        };

        let user_tier = AuthGuard::resolve_role_tier(
            interaction.member.as_ref(),
            user_id,
            None,
            &config,
        );

        // 1. Select Menu: Server Selector for Dashboard
        if custom_id == "select_server_dashboard" {
            if let serenity::all::ComponentInteractionDataKind::StringSelect { values } = &interaction.data.kind {
                if let Some(selected_id_str) = values.first() {
                    if let Ok(srv_id) = selected_id_str.parse::<i64>() {
                        match DashboardBuilder::build_server_controls_response(app_handle, srv_id).await {
                            Ok((embed, action_rows)) => {
                                let resp = CreateInteractionResponseMessage::new()
                                    .embed(embed)
                                    .components(action_rows)
                                    .ephemeral(true);
                                let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                            }
                            Err(e) => {
                                let resp = CreateInteractionResponseMessage::new()
                                    .content(format!("❌ Failed to open control panel: {}", e))
                                    .ephemeral(true);
                                let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                            }
                        }
                        return;
                    }
                }
            }
        }

        // 2. Cluster Quick Actions
        if custom_id == "cluster_refresh" {
            let defer = CreateInteractionResponseMessage::new()
                .content("🔄 **Refreshing cluster status dashboard...**")
                .ephemeral(true);
            let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::Message(defer)).await;

            // Trigger dashboard refresh on running bridge
            if let Some(state) = app_handle.try_state::<AppState>() {
                let _ = state.discord_bridge.trigger_dashboard_refresh().await;
            }

            let _ = interaction.edit_response(
                &ctx.http,
                EditInteractionResponse::new().content("✅ **Dashboard refreshed successfully.**")
            ).await;
            return;
        }

        if custom_id.starts_with("cluster_") {
            let action_name = custom_id.trim_start_matches("cluster_");
            let (allowed, msg) = AuthGuard::can_execute_action(action_name, user_tier);
            if !allowed {
                let resp = CreateInteractionResponseMessage::new()
                    .content(format!("❌ **Access Denied:** {}", msg))
                    .ephemeral(true);
                let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                return;
            }

            let action_id = format!("cluster_{}_{}", action_name, chrono::Utc::now().timestamp_millis());
            let label = format!("CLUSTER {}", action_name.replace('_', " ").to_uppercase());
            let (embed, button_row) = DashboardBuilder::build_confirmation_prompt(
                &action_id,
                &label,
                "All Servers in Cluster",
            );

            // Record pending action in SQLite
            if let Some(state) = app_handle.try_state::<AppState>() {
                if let Ok(db) = state.db.lock() {
                    if let Ok(conn) = db.get_connection() {
                        let expires_at = (chrono::Utc::now() + chrono::Duration::seconds(60)).to_rfc3339();
                        let payload = serde_json::json!({
                            "action": format!("cluster_{}", action_name),
                            "cluster_id": config.cluster_id
                        }).to_string();

                        let _ = conn.execute(
                            "INSERT INTO discord_pending_actions (id, action_type, guild_id, discord_user_id, server_id, payload_json, expires_at, status)
                             VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, 'pending')",
                            rusqlite::params![
                                action_id,
                                format!("cluster_{}", action_name),
                                guild_id.map(|g| g.to_string()).unwrap_or_default(),
                                user_id.to_string(),
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
            let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
            return;
        }

        // 3. Server Actions from Quick Action Panel
        if custom_id.starts_with("srv_") {
            let parts: Vec<&str> = custom_id.split('_').collect();
            if parts.len() >= 3 {
                let action = parts[1];
                let srv_id = parts[2].parse::<i64>().unwrap_or(0);

                if srv_id == 0 {
                    let resp = CreateInteractionResponseMessage::new()
                        .content("❌ Invalid server identifier.")
                        .ephemeral(true);
                    let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                    return;
                }

                // Non-destructive actions executed directly
                if action == "bcast" {
                    let modal = CreateModal::new(format!("modal_bcast_{}", srv_id), format!("📢 Broadcast to Server #{}", srv_id))
                        .components(vec![
                            CreateActionRow::InputText(
                                CreateInputText::new(InputTextStyle::Paragraph, "Announcement Message", "bcast_message")
                                    .placeholder("Type the announcement to display in-game...")
                                    .required(true),
                            ),
                        ]);
                    let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::Modal(modal)).await;
                    return;
                }

                if action == "backup" {
                    let (allowed, msg) = AuthGuard::can_execute_action("backup", user_tier);
                    if !allowed {
                        let resp = CreateInteractionResponseMessage::new()
                            .content(format!("❌ **Access Denied:** {}", msg))
                            .ephemeral(true);
                        let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                        return;
                    }

                    let defer = CreateInteractionResponseMessage::new()
                        .content(format!("⏳ **Initiating instant world backup for Server #{}...**", srv_id))
                        .ephemeral(true);
                    let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::Message(defer)).await;

                    let ah = app_handle.clone();
                    let g_str = guild_id.map(|g| g.to_string()).unwrap_or_default();
                    let u_str = user_id.to_string();
                    let http = ctx.http.clone();
                    let int_clone = interaction.clone();

                    tokio::spawn(async move {
                        let start_time = std::time::Instant::now();
                        if let Some(rcon) = ah.try_state::<crate::commands::rcon::RconState>() {
                            let _ = rcon.inner().0.send_command(srv_id, "SaveWorld").await;
                            tokio::time::sleep(Duration::from_secs(3)).await;
                        }

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
                                        .title("✅ Backup Complete")
                                        .description(format!(
                                            "**Server:** `#{}`\n\
                                            **Size:** `{:.2} MB`\n\
                                            **Duration:** `{}s`\n\
                                            **Status:** Saved & Archived",
                                            srv_id, size_mb, duration
                                        ))
                                        .color(0x10B981)
                                        .timestamp(serenity::model::Timestamp::now());

                                    let _ = int_clone.edit_response(&http, EditInteractionResponse::new().embed(embed)).await;
                                }
                                Err(e) => {
                                    let _ = int_clone.edit_response(
                                        &http,
                                        EditInteractionResponse::new().content(format!("❌ Backup failed: {}", e))
                                    ).await;
                                }
                            }
                        }
                    });
                    return;
                }

                // Destructive actions (start, stop, restart, update) require 2-step confirmation
                let (allowed, msg) = AuthGuard::can_execute_action(action, user_tier);
                if !allowed {
                    let resp = CreateInteractionResponseMessage::new()
                        .content(format!("❌ **Access Denied:** {}", msg))
                        .ephemeral(true);
                    let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                    return;
                }

                let action_id = format!("{}_{}_{}", action, srv_id, chrono::Utc::now().timestamp_millis());
                let action_label = match action {
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

                // Save pending action
                if let Some(state) = app_handle.try_state::<AppState>() {
                    if let Ok(db) = state.db.lock() {
                        if let Ok(conn) = db.get_connection() {
                            let expires_at = (chrono::Utc::now() + chrono::Duration::seconds(60)).to_rfc3339();
                            let payload = serde_json::json!({
                                "action": action,
                                "server_id": srv_id
                            }).to_string();

                            let _ = conn.execute(
                                "INSERT INTO discord_pending_actions (id, action_type, guild_id, discord_user_id, server_id, payload_json, expires_at, status)
                                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending')",
                                rusqlite::params![
                                    action_id,
                                    action,
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
                let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                return;
            }
        }

        // 4. Confirmation Flow Actions
        if custom_id.starts_with("cancel_") {
            let action_id = custom_id.trim_start_matches("cancel_");
            // Mark pending action cancelled
            if let Some(state) = app_handle.try_state::<AppState>() {
                if let Ok(db) = state.db.lock() {
                    if let Ok(conn) = db.get_connection() {
                        let _ = conn.execute(
                            "UPDATE discord_pending_actions SET status = 'cancelled' WHERE id = ?1",
                            [action_id],
                        );
                    }
                }
            }

            let resp = CreateInteractionResponseMessage::new()
                .content("❌ **Action cancelled.** No changes were made.")
                .components(vec![])
                .ephemeral(true);
            let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::UpdateMessage(resp)).await;
            return;
        }

        if custom_id.starts_with("confirm_") {
            let action_id = custom_id.trim_start_matches("confirm_");

            // Look up and validate pending action from SQLite
            let pending_opt = if let Some(state) = app_handle.try_state::<AppState>() {
                if let Ok(db) = state.db.lock() {
                    if let Ok(conn) = db.get_connection() {
                        conn.query_row(
                            "SELECT action_type, guild_id, discord_user_id, server_id, payload_json, expires_at, status 
                             FROM discord_pending_actions WHERE id = ?1",
                            [action_id],
                            |row| Ok((
                                row.get::<_, String>(0)?,
                                row.get::<_, String>(1)?,
                                row.get::<_, String>(2)?,
                                row.get::<_, Option<i64>>(3)?,
                                row.get::<_, Option<String>>(4)?,
                                row.get::<_, String>(5)?,
                                row.get::<_, String>(6)?,
                            ))
                        ).ok()
                    } else { None }
                } else { None }
            } else { None };

            let (action_type, g_id_str, creator_user_id, srv_id_opt, payload_json_opt, expires_at_str, status) = match pending_opt {
                Some(p) => p,
                None => {
                    let resp = CreateInteractionResponseMessage::new()
                        .content("❌ **Confirmation Expired or Invalid.** The requested action is no longer pending.")
                        .components(vec![])
                        .ephemeral(true);
                    let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::UpdateMessage(resp)).await;
                    return;
                }
            };

            // Verify status and expiration
            if status != "pending" {
                let resp = CreateInteractionResponseMessage::new()
                    .content(format!("⚠️ This action has already been processed (status: `{}`).", status))
                    .components(vec![])
                    .ephemeral(true);
                let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::UpdateMessage(resp)).await;
                return;
            }

            if let Ok(exp_dt) = chrono::DateTime::parse_from_rfc3339(&expires_at_str) {
                if chrono::Utc::now() > exp_dt.with_timezone(&chrono::Utc) {
                    let resp = CreateInteractionResponseMessage::new()
                        .content("⏳ **Confirmation Expired.** Please trigger the action again.")
                        .components(vec![])
                        .ephemeral(true);
                    let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::UpdateMessage(resp)).await;
                    return;
                }
            }

            // Verify authorized user
            if creator_user_id != user_id.to_string() && user_tier < RoleTier::Owner {
                let resp = CreateInteractionResponseMessage::new()
                    .content("❌ Only the user who initiated this action or the Server Owner can confirm it.")
                    .ephemeral(true);
                let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                return;
            }

            // Mark as executing
            if let Some(state) = app_handle.try_state::<AppState>() {
                if let Ok(db) = state.db.lock() {
                    if let Ok(conn) = db.get_connection() {
                        let _ = conn.execute(
                            "UPDATE discord_pending_actions SET status = 'executed' WHERE id = ?1",
                            [action_id],
                        );
                    }
                }
            }

            let defer = CreateInteractionResponseMessage::new()
                .content(format!("⚡ **Executing `{}`...**", action_type))
                .components(vec![])
                .ephemeral(true);
            let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::UpdateMessage(defer)).await;

            let ah = app_handle.clone();
            let http = ctx.http.clone();
            let int_clone = interaction.clone();

            tokio::spawn(async move {
                let mut exec_result = Ok("Operation completed successfully.".to_string());

                if action_type.starts_with("cluster_") {
                    let sub_action = action_type.trim_start_matches("cluster_");
                    if let Some(state) = ah.try_state::<AppState>() {
                        match sub_action {
                            "start_all" => {
                                let _ = crate::commands::cluster::start_cluster(state, config.cluster_id, None).await;
                            }
                            "stop_all" => {
                                let _ = crate::commands::cluster::stop_cluster(state, config.cluster_id).await;
                            }
                            "restart_all" => {
                                let _ = crate::commands::cluster::restart_cluster(state, config.cluster_id, None).await;
                            }
                            "update_all" => {
                                let server_ids = {
                                    if let Ok(db) = state.db.lock() {
                                        if let Ok(conn) = db.get_connection() {
                                            if let Ok(mut stmt) = conn.prepare("SELECT id FROM servers WHERE cluster_id = ?1") {
                                                if let Ok(rows) = stmt.query_map([config.cluster_id], |r| r.get::<_, i64>(0)) {
                                                    rows.flatten().collect::<Vec<_>>()
                                                } else {
                                                    Vec::new()
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
                                for sid in server_ids {
                                    let _ = crate::commands::server::update_server(ah.clone(), state.clone(), sid).await;
                                }
                            }
                            _ => {}
                        }
                    }
                } else if let Some(srv_id) = srv_id_opt {
                    if let Some(state) = ah.try_state::<AppState>() {
                        match action_type.as_str() {
                            "start" => {
                                if let Err(e) = crate::commands::server::start_server(ah.clone(), srv_id, false).await {
                                    exec_result = Err(e);
                                }
                            }
                            "stop" => {
                                if let Err(e) = crate::commands::server::stop_server(state, srv_id).await {
                                    exec_result = Err(e);
                                }
                            }
                            "restart" => {
                                if let Err(e) = crate::commands::server::restart_server(state, srv_id, None).await {
                                    exec_result = Err(e);
                                }
                            }
                            "update" => {
                                if let Err(e) = crate::commands::server::update_server(ah.clone(), state, srv_id).await {
                                    exec_result = Err(e);
                                }
                            }
                            _ => {}
                        }
                    }
                }

                // Log audit
                let status_str = if exec_result.is_ok() { "SUCCESS" } else { "FAILED" };
                AuditLogger::log(
                    &ah,
                    &g_str_clone(&g_id_str),
                    &creator_user_id,
                    srv_id_opt,
                    &action_type,
                    None,
                    status_str,
                    None,
                    payload_json_opt.as_deref().and_then(|p| serde_json::from_str(p).ok()).as_ref(),
                );

                // Notify Discord user
                let msg = match exec_result {
                    Ok(m) => format!("✅ **Execution Complete:** {}", m),
                    Err(e) => format!("❌ **Execution Failed:** {}", e),
                };
                let _ = int_clone.edit_response(&http, EditInteractionResponse::new().content(msg)).await;

                // Trigger live dashboard refresh
                if let Some(state) = ah.try_state::<AppState>() {
                    let _ = state.discord_bridge.trigger_dashboard_refresh().await;
                }
            });
            return;
        }

        // 5. Mod Watchdog Alert Buttons
        if custom_id.starts_with("mod_") {
            let parts: Vec<&str> = custom_id.split('_').collect();
            if parts.len() >= 3 {
                let action = parts[1];
                let srv_id = parts[2].parse::<i64>().unwrap_or(0);

                if action == "dismiss" {
                    let resp = CreateInteractionResponseMessage::new()
                        .content("🗑️ **Mod update alert dismissed.**")
                        .components(vec![])
                        .ephemeral(true);
                    let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::UpdateMessage(resp)).await;
                    return;
                }

                if action == "update" {
                    let (allowed, msg) = AuthGuard::can_execute_action("update", user_tier);
                    if !allowed {
                        let resp = CreateInteractionResponseMessage::new()
                            .content(format!("❌ **Access Denied:** {}", msg))
                            .ephemeral(true);
                        let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                        return;
                    }

                    let defer = CreateInteractionResponseMessage::new()
                        .content(format!("🚀 **Initiating graceful update sequence for Server #{}...**", srv_id))
                        .components(vec![])
                        .ephemeral(true);
                    let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::UpdateMessage(defer)).await;

                    let ah = app_handle.clone();
                    tokio::spawn(async move {
                        if let Some(state) = ah.try_state::<AppState>() {
                            let _ = crate::commands::server::update_server(ah.clone(), state, srv_id).await;
                        }
                    });
                    return;
                }
            }
        }
    }

    /// Handle Modal Submissions
    pub async fn handle_modal(
        ctx: &Context,
        interaction: &ModalInteraction,
        app_handle: &AppHandle,
        config_arc: &Arc<Mutex<Option<DiscordBridgeConfig>>>,
    ) {
        let custom_id = interaction.data.custom_id.as_str();
        let user_id = interaction.user.id;
        let guild_id = interaction.guild_id;

        let config = {
            let cfg = config_arc.lock().await;
            match cfg.clone() {
                Some(c) => c,
                None => {
                    let resp = CreateInteractionResponseMessage::new()
                        .content("⚠️ Discord Bridge configuration is not loaded.")
                        .ephemeral(true);
                    let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                    return;
                }
            }
        };

        let user_tier = AuthGuard::resolve_role_tier(
            interaction.member.as_ref(),
            user_id,
            None,
            &config,
        );

        if custom_id == "modal_rcon_exec" {
            let mut srv_id: i64 = 1;
            let mut cmd_str = String::new();
            let mut reason_note: Option<String> = None;

            for row in &interaction.data.components {
                for comp in &row.components {
                    match comp {
                        serenity::all::ActionRowComponent::InputText(input) => {
                            match input.custom_id.as_str() {
                                "rcon_server_id" => {
                                    if let Some(val) = &input.value {
                                        srv_id = val.trim().parse::<i64>().unwrap_or(1);
                                    }
                                }
                                "rcon_command_text" => {
                                    if let Some(val) = &input.value {
                                        cmd_str = val.trim().to_string();
                                    }
                                }
                                "rcon_reason_note" => {
                                    if let Some(val) = &input.value {
                                        if !val.trim().is_empty() {
                                            reason_note = Some(val.trim().to_string());
                                        }
                                    }
                                }
                                _ => {}
                            }
                        }
                        _ => {}
                    }
                }
            }

            if cmd_str.is_empty() {
                let resp = CreateInteractionResponseMessage::new()
                    .content("❌ Command string cannot be empty.")
                    .ephemeral(true);
                let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                return;
            }

            let (allowed, msg) = AuthGuard::is_allowed_rcon_command(&cmd_str, user_tier);
            if !allowed {
                let resp = CreateInteractionResponseMessage::new()
                    .content(format!("❌ **RCON Restricted:** {}", msg))
                    .ephemeral(true);
                let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
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
                            reason_note.as_deref(),
                            Some(&serde_json::json!({ "command": cmd_str })),
                        );

                        let embed = CreateEmbed::new()
                            .title(format!("⌨️ RCON Console — Server #{}", srv_id))
                            .description(format!("**Executed:** `{}`\n```\n{}\n```", cmd_str, sanitized))
                            .color(0x3B82F6)
                            .footer(CreateEmbedFooter::new("ARK Server Manager • Remote RCON"))
                            .timestamp(serenity::model::Timestamp::now());

                        let resp = CreateInteractionResponseMessage::new().embed(embed).ephemeral(true);
                        let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                    }
                    Err(e) => {
                        let resp = CreateInteractionResponseMessage::new()
                            .content(format!("❌ **RCON Error:** {}", e))
                            .ephemeral(true);
                        let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                    }
                }
            }
            return;
        }

        if custom_id.starts_with("modal_bcast_") {
            let srv_id = custom_id.trim_start_matches("modal_bcast_").parse::<i64>().unwrap_or(1);
            let mut message_text = String::new();

            for row in &interaction.data.components {
                for comp in &row.components {
                    if let serenity::all::ActionRowComponent::InputText(input) = comp {
                        if input.custom_id == "bcast_message" {
                            if let Some(val) = &input.value {
                                message_text = val.trim().to_string();
                            }
                        }
                    }
                }
            }

            if message_text.is_empty() {
                let resp = CreateInteractionResponseMessage::new()
                    .content("❌ Broadcast message cannot be empty.")
                    .ephemeral(true);
                let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                return;
            }

            let rcon_state = app_handle.try_state::<crate::commands::rcon::RconState>();
            if let Some(rcon) = rcon_state {
                let rcon_service = &rcon.inner().0;
                let bcast_cmd = format!("Broadcast {}", message_text);
                match rcon_service.send_command(srv_id, &bcast_cmd).await {
                    Ok(_) => {
                        AuditLogger::log(
                            app_handle,
                            &guild_id.map(|g| g.to_string()).unwrap_or_default(),
                            &user_id.to_string(),
                            Some(srv_id),
                            "BROADCAST",
                            Some(&message_text),
                            "SUCCESS",
                            None,
                            None,
                        );

                        let resp = CreateInteractionResponseMessage::new()
                            .content(format!("📢 **In-Game Broadcast Sent to Server #{}:**\n> {}", srv_id, message_text))
                            .ephemeral(true);
                        let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                    }
                    Err(e) => {
                        let resp = CreateInteractionResponseMessage::new()
                            .content(format!("❌ Failed to send broadcast: {}", e))
                            .ephemeral(true);
                        let _ = interaction.create_response(&ctx.http, CreateInteractionResponse::Message(resp)).await;
                    }
                }
            }
            return;
        }
    }
}

fn g_str_clone(s: &str) -> String {
    s.to_string()
}
