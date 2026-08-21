// Automated /setup wizard and channel provisioning engine
use crate::AppState;
use crate::services::discord_bridge::DiscordBridgeConfig;
use serenity::all::{
    ChannelType, Context, CreateChannel, CreateEmbed, CreateEmbedFooter,
    GuildId, PermissionOverwrite,
    PermissionOverwriteType, Permissions, RoleId, UserId,
};
use tauri::{AppHandle, Emitter, Manager};

pub struct SetupWizard;

impl SetupWizard {
    pub async fn execute(
        ctx: &Context,
        guild_id: GuildId,
        user_id: UserId,
        app_handle: &AppHandle,
        config: &mut DiscordBridgeConfig,
    ) -> Result<CreateEmbed, String> {
        println!("🚀 [Discord Setup] Initiating setup wizard for guild {}", guild_id);

        let channels = guild_id
            .channels(&ctx.http)
            .await
            .map_err(|e| format!("Failed to fetch guild channels: {}", e))?;

        let everyone_role_id = RoleId::new(guild_id.get());

        // 1. Find or create category "📁 ARK SERVER MANAGER"
        let mut category_id = None;
        for (c_id, channel) in &channels {
            if channel.kind == ChannelType::Category && (
                channel.name.eq_ignore_ascii_case("📁 ARK SERVER MANAGER") ||
                channel.name.eq_ignore_ascii_case("ARK SERVER MANAGER")
            ) {
                category_id = Some(*c_id);
                break;
            }
        }

        let cat_id = match category_id {
            Some(id) => {
                println!("📁 [Discord Setup] Reusing category: {:?}", id);
                id
            }
            None => {
                let builder = CreateChannel::new("📁 ARK SERVER MANAGER").kind(ChannelType::Category);
                let created = guild_id
                    .create_channel(&ctx.http, builder)
                    .await
                    .map_err(|e| format!("Failed to create category: {}", e))?;
                println!("📁 [Discord Setup] Created category: {:?}", created.id);
                created.id
            }
        };

        // 2. Helper to find or create channels under the category with specific permissions
        let get_or_create_channel = |name_str: &str, topic_str: &str, public_send: bool, public_view: bool| {
            let name = name_str.to_string();
            let topic = topic_str.to_string();
            let channels_clone = channels.clone();
            let http = ctx.http.clone();
            async move {
                for (_c_id, channel) in &channels_clone {
                    if channel.name.eq_ignore_ascii_case(&name) ||
                       channel.name.trim_start_matches(|c: char| !c.is_alphanumeric() && c != '-').eq_ignore_ascii_case(name.trim_start_matches(|c: char| !c.is_alphanumeric() && c != '-')) {
                        return Ok::<_, String>((channel.id, false)); // (channel_id, created_new)
                    }
                }

                // Build permission overwrites for @everyone
                let mut allow_perms = Permissions::empty();
                let mut deny_perms = Permissions::empty();

                if public_view {
                    allow_perms |= Permissions::VIEW_CHANNEL | Permissions::READ_MESSAGE_HISTORY;
                } else {
                    deny_perms |= Permissions::VIEW_CHANNEL;
                }

                if public_send {
                    allow_perms |= Permissions::SEND_MESSAGES;
                } else {
                    deny_perms |= Permissions::SEND_MESSAGES | Permissions::ADD_REACTIONS;
                }

                let overwrite = PermissionOverwrite {
                    allow: allow_perms,
                    deny: deny_perms,
                    kind: PermissionOverwriteType::Role(everyone_role_id),
                };

                let builder = CreateChannel::new(&name)
                    .kind(ChannelType::Text)
                    .category(cat_id)
                    .topic(&topic)
                    .permissions(vec![overwrite]);

                let ch = guild_id
                    .create_channel(&http, builder)
                    .await
                    .map_err(|e| format!("Failed to create channel {}: {}", name, e))?;
                Ok((ch.id, true))
            }
        };

        // Create or reuse 5 specialized channels
        let (status_ch, status_new) = get_or_create_channel("📊-status-dashboard", "Live real-time server dashboard & interactive controls", false, true).await?;
        let (roster_ch, roster_new) = get_or_create_channel("👥-player-roster", "Active online player roster & playtime statistics", false, true).await?;
        let (cross_chat_ch, cross_new) = get_or_create_channel("💬-cross-chat", "Two-way cross-server game chat bridge", true, true).await?;
        let (alerts_ch, alerts_new) = get_or_create_channel("🚨-server-alerts", "Server crash, recovery, and mod watchdog alerts", false, true).await?;
        let (admin_ch, admin_new) = get_or_create_channel("🔒-admin-console", "Restricted remote administration commands & RCON console", false, false).await?;

        // 3. Update configuration object
        config.guild_id = guild_id.to_string();
        config.channel_id = cross_chat_ch.to_string();
        config.server_list_channel_id = status_ch.to_string();
        config.server_list_enabled = true;
        config.player_list_channel_id = roster_ch.to_string();
        config.player_list_enabled = true;
        config.notifications_channel_id = alerts_ch.to_string();
        config.admin_channel_id = admin_ch.to_string();
        config.enabled = true;

        // 4. Persist to SQLite DB
        if let Some(state) = app_handle.try_state::<AppState>() {
            if let Ok(db) = state.db.lock() {
                if let Ok(conn) = db.get_connection() {
                    let _ = conn.execute(
                        "INSERT INTO discord_bridge_config (
                            cluster_id, enabled, bot_token, guild_id, channel_id, admin_channel_id,
                            game_to_discord, discord_to_game, server_list_enabled, server_list_channel_id,
                            player_list_enabled, player_list_channel_id, show_tribe_names, show_playtime,
                            notifications_channel_id, updated_at
                        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, CURRENT_TIMESTAMP)
                        ON CONFLICT(cluster_id) DO UPDATE SET
                            enabled=excluded.enabled,
                            guild_id=excluded.guild_id,
                            channel_id=excluded.channel_id,
                            admin_channel_id=excluded.admin_channel_id,
                            server_list_enabled=excluded.server_list_enabled,
                            server_list_channel_id=excluded.server_list_channel_id,
                            player_list_enabled=excluded.player_list_enabled,
                            player_list_channel_id=excluded.player_list_channel_id,
                            notifications_channel_id=excluded.notifications_channel_id,
                            updated_at=CURRENT_TIMESTAMP",
                        rusqlite::params![
                            config.cluster_id,
                            1,
                            config.bot_token,
                            config.guild_id,
                            config.channel_id,
                            config.admin_channel_id,
                            if config.game_to_discord { 1 } else { 0 },
                            if config.discord_to_game { 1 } else { 0 },
                            1,
                            config.server_list_channel_id,
                            1,
                            config.player_list_channel_id,
                            if config.show_tribe_names { 1 } else { 0 },
                            if config.show_playtime { 1 } else { 0 },
                            config.notifications_channel_id,
                        ],
                    );
                }
            }
        }

        // 5. Emit event to Tauri frontend
        let payload = serde_json::json!({
            "cluster_id": config.cluster_id,
            "guild_id": config.guild_id,
            "channel_id": config.channel_id,
            "server_list_channel_id": config.server_list_channel_id,
            "player_list_channel_id": config.player_list_channel_id,
            "notifications_channel_id": config.notifications_channel_id,
            "admin_channel_id": config.admin_channel_id,
        });
        let _ = app_handle.emit("discord-setup-completed", payload);

        // 6. Log audit entry
        super::audit::AuditLogger::log(
            app_handle,
            &guild_id.to_string(),
            &user_id.to_string(),
            None,
            "/setup",
            Some("ARK SERVER MANAGER Category & Channels"),
            "SUCCESS",
            None,
            Some(&serde_json::json!({
                "category_id": cat_id.to_string(),
                "status_channel_id": status_ch.to_string(),
                "roster_channel_id": roster_ch.to_string(),
                "cross_chat_channel_id": cross_chat_ch.to_string(),
                "alerts_channel_id": alerts_ch.to_string(),
                "admin_channel_id": admin_ch.to_string(),
            })),
        );

        // 7. Return detailed confirmation embed
        let format_badge = |created: bool| if created { "*(Created New)*" } else { "*(Reused Existing)*" };
        let embed = CreateEmbed::new()
            .title("✅ ARK Server Manager Discord Setup Complete")
            .description("Dedicated category and specialized channels have been configured and linked to the Server Manager.")
            .color(0x10B981)
            .field("📁 Category", "📁 **ARK SERVER MANAGER**", false)
            .field("📊 Status Dashboard", format!("<#{}> {}", status_ch, format_badge(status_new)), true)
            .field("👥 Player Roster", format!("<#{}> {}", roster_ch, format_badge(roster_new)), true)
            .field("💬 Cross-Chat", format!("<#{}> {}", cross_chat_ch, format_badge(cross_new)), true)
            .field("🚨 Server Alerts", format!("<#{}> {}", alerts_ch, format_badge(alerts_new)), true)
            .field("🔒 Admin Console", format!("<#{}> {}", admin_ch, format_badge(admin_new)), true)
            .footer(CreateEmbedFooter::new("ARK: Survival Ascended Server Manager • Real-Time Operations"))
            .timestamp(serenity::model::Timestamp::now());

        Ok(embed)
    }

    /// Triggered from desktop UI or Tauri command
    pub async fn execute_from_desktop(
        app_handle: &AppHandle,
        bot_token: &str,
        guild_id_str: &str,
        cluster_id: i64,
    ) -> Result<serde_json::Value, String> {
        let guild_id_u64 = guild_id_str.parse::<u64>().map_err(|_| "Invalid Discord Server/Guild ID".to_string())?;
        let guild_id = GuildId::new(guild_id_u64);
        let http = std::sync::Arc::new(serenity::all::Http::new(bot_token));

        let channels = guild_id
            .channels(http.as_ref())
            .await
            .map_err(|e| format!("Failed to fetch guild channels: {}", e))?;

        let everyone_role_id = RoleId::new(guild_id.get());

        // 1. Find or create category
        let mut category_id = None;
        for (c_id, channel) in &channels {
            if channel.kind == ChannelType::Category && (
                channel.name.eq_ignore_ascii_case("📁 ARK SERVER MANAGER") ||
                channel.name.eq_ignore_ascii_case("ARK SERVER MANAGER")
            ) {
                category_id = Some(*c_id);
                break;
            }
        }

        let cat_id = match category_id {
            Some(id) => id,
            None => {
                let builder = CreateChannel::new("📁 ARK SERVER MANAGER").kind(ChannelType::Category);
                let created = guild_id
                    .create_channel(http.as_ref(), builder)
                    .await
                    .map_err(|e| format!("Failed to create category: {}", e))?;
                created.id
            }
        };

        // 2. Channel provision helper
        let get_or_create_channel = |name_str: &str, topic_str: &str, public_send: bool, public_view: bool| {
            let name = name_str.to_string();
            let topic = topic_str.to_string();
            let channels_clone = channels.clone();
            let http_clone = http.clone();
            async move {
                for (_c_id, ch) in channels_clone {
                    if ch.name == name {
                        return Ok::<_, String>((ch.id, false));
                    }
                }

                let mut permissions = vec![
                    PermissionOverwrite {
                        allow: Permissions::VIEW_CHANNEL | Permissions::SEND_MESSAGES | Permissions::EMBED_LINKS | Permissions::ATTACH_FILES | Permissions::READ_MESSAGE_HISTORY | Permissions::USE_APPLICATION_COMMANDS,
                        deny: Permissions::empty(),
                        kind: PermissionOverwriteType::Member(http_clone.get_current_user().await.map(|u| u.id).unwrap_or(UserId::new(0))),
                    },
                ];

                if !public_view {
                    permissions.push(PermissionOverwrite {
                        allow: Permissions::empty(),
                        deny: Permissions::VIEW_CHANNEL,
                        kind: PermissionOverwriteType::Role(everyone_role_id),
                    });
                } else if !public_send {
                    permissions.push(PermissionOverwrite {
                        allow: Permissions::VIEW_CHANNEL | Permissions::READ_MESSAGE_HISTORY,
                        deny: Permissions::SEND_MESSAGES | Permissions::ADD_REACTIONS | Permissions::CREATE_PUBLIC_THREADS,
                        kind: PermissionOverwriteType::Role(everyone_role_id),
                    });
                }

                let builder = CreateChannel::new(&name)
                    .kind(ChannelType::Text)
                    .category(cat_id)
                    .topic(&topic)
                    .permissions(permissions);

                let created = guild_id
                    .create_channel(http_clone.as_ref(), builder)
                    .await
                    .map_err(|e| format!("Failed to create channel {}: {}", name, e))?;

                Ok((created.id, true))
            }
        };

        let (status_ch, _) = get_or_create_channel("📊-status-dashboard", "Real-time ARK cluster status and remote control center", false, true).await?;
        let (roster_ch, _) = get_or_create_channel("👥-player-roster", "Active online survivors roster & statistics", false, true).await?;
        let (cross_chat_ch, _) = get_or_create_channel("💬-cross-chat", "Two-way in-game cross chat relay", true, true).await?;
        let (alerts_ch, _) = get_or_create_channel("🚨-server-alerts", "Automated crash, recovery, and mod watchdog alerts", false, true).await?;
        let (admin_ch, _) = get_or_create_channel("🔒-admin-console", "Restricted remote RCON administrative console", true, false).await?;

        // 3. Update DB
        {
            if let Some(state) = app_handle.try_state::<AppState>() {
                if let Ok(db) = state.db.lock() {
                    if let Ok(conn) = db.get_connection() {
                        let _ = conn.execute(
                            "UPDATE discord_bridge_config SET 
                                guild_id = ?1,
                                channel_id = ?2,
                                admin_channel_id = ?3,
                                server_list_enabled = 1,
                                server_list_channel_id = ?4,
                                player_list_enabled = 1,
                                player_list_channel_id = ?5,
                                notifications_channel_id = ?6,
                                enabled = 1,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE cluster_id = ?7",
                            rusqlite::params![
                                guild_id_str,
                                cross_chat_ch.to_string(),
                                admin_ch.to_string(),
                                status_ch.to_string(),
                                roster_ch.to_string(),
                                alerts_ch.to_string(),
                                cluster_id
                            ],
                        );
                    }
                }
            }
        }

        // 4. Emit event
        let payload = serde_json::json!({
            "cluster_id": cluster_id,
            "guild_id": guild_id_str,
            "category_id": cat_id.to_string(),
            "status_channel_id": status_ch.to_string(),
            "player_channel_id": roster_ch.to_string(),
            "cross_chat_channel_id": cross_chat_ch.to_string(),
            "alerts_channel_id": alerts_ch.to_string(),
            "admin_channel_id": admin_ch.to_string(),
        });
        let _ = app_handle.emit("discord-setup-completed", payload.clone());

        // 5. Log audit
        super::audit::AuditLogger::log(
            app_handle,
            guild_id_str,
            "Desktop-UI",
            None,
            "/setup",
            Some("ARK SERVER MANAGER Category & Channels (Desktop Triggered)"),
            "SUCCESS",
            None,
            Some(&payload),
        );

        Ok(payload)
    }
}

pub type SetupOrchestrator = SetupWizard;

