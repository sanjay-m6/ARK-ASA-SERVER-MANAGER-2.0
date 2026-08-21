// Player Linking, Dossier Inspection, and Moderation Actions
#![allow(dead_code)]
use super::types::DiscordPlayerLinkRecord;
use super::audit::AuditLogger;
use crate::AppState;
use serenity::all::{CreateEmbed, CreateEmbedFooter};
use tauri::{AppHandle, Manager};

pub struct PlayerManager;

impl PlayerManager {
    /// Link a Discord user to a Steam/EOS ID
    pub fn link_player(
        app_handle: &AppHandle,
        guild_id: &str,
        discord_user_id: &str,
        discord_username: &str,
        steam_or_eos_id: &str,
        cluster_id: i64,
    ) -> Result<String, String> {
        let clean_id = steam_or_eos_id.trim();
        if clean_id.is_empty() {
            return Err("Identifier cannot be empty.".to_string());
        }

        let state = app_handle.try_state::<AppState>().ok_or("AppState not found")?;
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        // Check if this Steam/EOS ID is already claimed by ANOTHER Discord user
        let existing_claim: Option<String> = conn.query_row(
            "SELECT discord_user_id FROM discord_player_links WHERE (steam_id = ?1 OR eos_id = ?1) AND discord_user_id != ?2",
            [clean_id, discord_user_id],
            |row| row.get(0)
        ).ok();

        if let Some(other_discord_id) = existing_claim {
            return Err(format!(
                "This in-game ID is already linked to another Discord user (<@{}>). Please contact a server admin if this is an error.",
                other_discord_id
            ));
        }

        let is_steam = clean_id.chars().all(|c| c.is_ascii_digit()) && clean_id.len() >= 17;
        let steam_id = if is_steam { clean_id } else { "" };
        let eos_id = if !is_steam { clean_id } else { "" };

        conn.execute(
            "INSERT INTO discord_player_links (
                discord_user_id, guild_id, steam_id, eos_id, player_name, cluster_id, verified, last_verified_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, CURRENT_TIMESTAMP)
            ON CONFLICT(discord_user_id) DO UPDATE SET
                guild_id = excluded.guild_id,
                steam_id = excluded.steam_id,
                eos_id = excluded.eos_id,
                player_name = excluded.player_name,
                cluster_id = excluded.cluster_id,
                verified = 1,
                last_verified_at = CURRENT_TIMESTAMP",
            rusqlite::params![
                discord_user_id,
                guild_id,
                steam_id,
                eos_id,
                discord_username,
                cluster_id
            ],
        ).map_err(|e| format!("Database error: {}", e))?;

        // Also update discord_users table for backwards compatibility
        let _ = conn.execute(
            "INSERT OR REPLACE INTO discord_users (discord_id, steam_id, discord_username) VALUES (?1, ?2, ?3)",
            rusqlite::params![discord_user_id, clean_id, discord_username],
        );

        AuditLogger::log(
            app_handle,
            guild_id,
            discord_user_id,
            None,
            "/link",
            Some(clean_id),
            "SUCCESS",
            None,
            Some(&serde_json::json!({ "platform_id": clean_id })),
        );

        Ok(format!("Successfully linked Discord account <@{}> to `{}`.", discord_user_id, clean_id))
    }

    /// Retrieve linked players list
    pub fn get_linked_players(
        app_handle: &AppHandle,
        cluster_id: Option<i64>,
    ) -> Result<Vec<DiscordPlayerLinkRecord>, String> {
        let state = app_handle.try_state::<AppState>().ok_or("AppState not found")?;
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let sql = if let Some(cid) = cluster_id {
            format!("SELECT discord_user_id, guild_id, steam_id, eos_id, player_name, cluster_id, linked_at, verified, last_verified_at FROM discord_player_links WHERE cluster_id = {} ORDER BY linked_at DESC", cid)
        } else {
            "SELECT discord_user_id, guild_id, steam_id, eos_id, player_name, cluster_id, linked_at, verified, last_verified_at FROM discord_player_links ORDER BY linked_at DESC".to_string()
        };

        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            Ok(DiscordPlayerLinkRecord {
                discord_user_id: row.get(0)?,
                guild_id: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                steam_id: row.get(2)?,
                eos_id: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                player_name: row.get(4)?,
                cluster_id: row.get(5)?,
                linked_at: row.get(6)?,
                verified: row.get::<_, i32>(7)? != 0,
                last_verified_at: row.get::<_, Option<String>>(8)?.unwrap_or_default(),
            })
        }).map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows.flatten() {
            list.push(r);
        }

        Ok(list)
    }

    /// Unlink a player
    pub fn unlink_player(
        app_handle: &AppHandle,
        guild_id: &str,
        admin_discord_id: &str,
        target_discord_id: &str,
    ) -> Result<(), String> {
        let state = app_handle.try_state::<AppState>().ok_or("AppState not found")?;
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.execute("DELETE FROM discord_player_links WHERE discord_user_id = ?1", [target_discord_id])
            .map_err(|e| e.to_string())?;
        let _ = conn.execute("DELETE FROM discord_users WHERE discord_id = ?1", [target_discord_id]);

        AuditLogger::log(
            app_handle,
            guild_id,
            admin_discord_id,
            None,
            "/unlink",
            Some(target_discord_id),
            "SUCCESS",
            None,
            None,
        );

        Ok(())
    }

    /// Build a Player Dossier embed for `/player <query>`
    pub async fn build_player_dossier(
        app_handle: &AppHandle,
        query: &str,
    ) -> Result<CreateEmbed, String> {
        let q = query.trim();
        let state = app_handle.try_state::<AppState>().ok_or("AppState not found")?;
        let (db_record, active_session) = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;

            let search_like = format!("%{}%", q);
            let mut stmt = conn.prepare(
                "SELECT steam_id, display_name, first_seen, last_seen, total_playtime_minutes, total_sessions, is_whitelisted, is_banned, notes 
                 FROM player_stats 
                 WHERE steam_id = ?1 OR display_name LIKE ?2 LIMIT 1"
            ).map_err(|e| e.to_string())?;

            let record = stmt.query_row(rusqlite::params![q, search_like], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, i32>(4)?,
                    row.get::<_, i32>(5)?,
                    row.get::<_, i32>(6)?,
                    row.get::<_, i32>(7)?,
                    row.get::<_, Option<String>>(8)?,
                ))
            }).ok();

            // Look up active session
            let active = if let Some((ref sid, _, _, _, _, _, _, _, _)) = record {
                conn.query_row(
                    "SELECT server_id, joined_at FROM player_sessions WHERE steam_id = ?1 AND left_at IS NULL ORDER BY joined_at DESC LIMIT 1",
                    [sid],
                    |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                ).ok()
            } else {
                None
            };

            (record, active)
        };

        let (sid, name, first_seen, last_seen, playtime, sessions, wl, banned, notes) =
            db_record.ok_or_else(|| format!("No survivor found matching `{}` in database archives.", q))?;

        let hours = playtime / 60;
        let mins = playtime % 60;

        let status_badges = format!(
            "{}{}{}",
            if banned == 1 { "🚫 **BANNED** " } else { "🟢 **Active** " },
            if wl == 1 { "🛡️ **Whitelisted** " } else { "" },
            if active_session.is_some() { "⚡ **Online In-Game**" } else { "💤 **Offline**" }
        );

        let active_server_info = if let Some((srv_id, ref joined_at)) = active_session {
            format!("🟢 Server #{} (since `{}`)", srv_id, joined_at)
        } else {
            "None (Offline)".to_string()
        };

        let tribe_info = notes.as_deref().and_then(|n| {
            serde_json::from_str::<serde_json::Value>(n).ok()
        }).and_then(|v| v.get("tribe").and_then(|t| t.as_str()).map(|s| s.to_string()))
        .unwrap_or_else(|| "Unknown / Solo".to_string());

        let desc = format!(
            "**Survivor Name:** `{}`\n\
            **Platform ID:** `{}`\n\
            **Status:** {}\n\
            **Current Server:** {}\n\
            **Tribe:** `{}`\n\n\
            📊 **Activity Statistics:**\n\
            • **Total Playtime:** `{}h {}m`\n\
            • **Total Sessions:** `{}`\n\
            • **First Seen:** `{}`\n\
            • **Last Seen:** `{}`",
            name, sid, status_badges, active_server_info, tribe_info, hours, mins, sessions, first_seen, last_seen
        );

        let color = if banned == 1 { 0xEF4444 } else if active_session.is_some() { 0x22C55E } else { 0x3B82F6 };

        let embed = CreateEmbed::new()
            .title(format!("👤 Survivor Dossier — {}", name))
            .description(desc)
            .color(color)
            .footer(CreateEmbedFooter::new("ARK Server Manager • Player Intelligence"))
            .timestamp(serenity::model::Timestamp::now());

        Ok(embed)
    }

    /// Moderation: Kick a player
    pub async fn kick_player(
        app_handle: &AppHandle,
        guild_id: &str,
        admin_discord_id: &str,
        server_id: i64,
        steam_id: &str,
        reason: Option<&str>,
    ) -> Result<String, String> {
        let rcon_state = app_handle.try_state::<crate::commands::rcon::RconState>().ok_or("RCON state not found")?;
        let rcon_service = &rcon_state.inner().0;

        let kick_reason = reason.unwrap_or("Kicked by Administrator via Discord");
        rcon_service.kick_player(server_id, steam_id, Some(kick_reason)).await?;

        AuditLogger::log(
            app_handle,
            guild_id,
            admin_discord_id,
            Some(server_id),
            "KICK",
            Some(steam_id),
            "SUCCESS",
            Some(kick_reason),
            None,
        );

        Ok(format!("👢 Successfully kicked survivor `{}` from Server #{}.", steam_id, server_id))
    }

    /// Moderation: Ban a player
    pub async fn ban_player(
        app_handle: &AppHandle,
        guild_id: &str,
        admin_discord_id: &str,
        server_id: i64,
        steam_id: &str,
        reason: Option<&str>,
    ) -> Result<String, String> {
        let rcon_state = app_handle.try_state::<crate::commands::rcon::RconState>().ok_or("RCON state not found")?;
        let rcon_service = &rcon_state.inner().0;

        rcon_service.ban_player(server_id, steam_id).await?;

        // Update database ban record
        if let Some(state) = app_handle.try_state::<AppState>() {
            if let Ok(db) = state.db.lock() {
                if let Ok(conn) = db.get_connection() {
                    let _ = conn.execute(
                        "INSERT INTO player_stats (steam_id, display_name, is_banned) VALUES (?1, 'Banned Player', 1)
                         ON CONFLICT(steam_id) DO UPDATE SET is_banned = 1",
                        [steam_id],
                    );
                }
            }
        }

        let ban_reason = reason.unwrap_or("Banned by Administrator via Discord");
        AuditLogger::log(
            app_handle,
            guild_id,
            admin_discord_id,
            Some(server_id),
            "BAN",
            Some(steam_id),
            "SUCCESS",
            Some(ban_reason),
            None,
        );

        Ok(format!("🚫 Successfully banned survivor `{}` on Server #{}.", steam_id, server_id))
    }
}
