// Whitelist submission, staff review, and RCON/File synchronization
#![allow(dead_code)]
use super::audit::AuditLogger;
use crate::AppState;
use serenity::all::{CreateEmbed, CreateEmbedFooter};
use tauri::{AppHandle, Manager};

pub struct WhitelistService;

impl WhitelistService {
    /// Add a survivor to the whitelist
    pub async fn add_to_whitelist(
        app_handle: &AppHandle,
        guild_id: &str,
        admin_discord_id: &str,
        steam_or_eos_id: &str,
        player_name: Option<&str>,
        target_server_id: Option<i64>,
    ) -> Result<CreateEmbed, String> {
        let clean_id = steam_or_eos_id.trim();
        let display_name = player_name.unwrap_or("Survivor");

        let state = app_handle.try_state::<AppState>().ok_or("AppState not found")?;
        
        // 1. Update Database
        {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT INTO player_stats (steam_id, display_name, is_whitelisted) 
                 VALUES (?1, ?2, 1) 
                 ON CONFLICT(steam_id) DO UPDATE SET is_whitelisted = 1, display_name = excluded.display_name",
                rusqlite::params![clean_id, display_name],
            ).map_err(|e| format!("DB Error: {}", e))?;
        }

        // 2. If servers are running, attempt live RCON AllowPlayerToJoinNoCheck
        let rcon_state = app_handle.try_state::<crate::commands::rcon::RconState>();
        if let Some(rcon) = rcon_state {
            let rcon_service = &rcon.inner().0;
            if let Some(srv_id) = target_server_id {
                let _ = rcon_service.send_command(srv_id, &format!("AllowPlayerToJoinNoCheck {}", clean_id)).await;
            }
        }

        AuditLogger::log(
            app_handle,
            guild_id,
            admin_discord_id,
            target_server_id,
            "WHITELIST_ADD",
            Some(clean_id),
            "SUCCESS",
            None,
            Some(&serde_json::json!({ "player_name": display_name })),
        );

        let embed = CreateEmbed::new()
            .title("🛡️ Survivor Whitelisted")
            .description(format!(
                "**Survivor:** `{}`\n\
                **Platform ID:** `{}`\n\
                **Status:** ✅ Added to Server Whitelist\n\n\
                *The survivor has been granted whitelist access to join the cluster.*",
                display_name, clean_id
            ))
            .color(0x10B981)
            .footer(CreateEmbedFooter::new("ARK Server Manager • Security & Access Control"))
            .timestamp(serenity::model::Timestamp::now());

        Ok(embed)
    }

    /// Remove a survivor from whitelist
    pub async fn remove_from_whitelist(
        app_handle: &AppHandle,
        guild_id: &str,
        admin_discord_id: &str,
        steam_or_eos_id: &str,
    ) -> Result<String, String> {
        let clean_id = steam_or_eos_id.trim();

        let state = app_handle.try_state::<AppState>().ok_or("AppState not found")?;
        {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            conn.execute(
                "UPDATE player_stats SET is_whitelisted = 0 WHERE steam_id = ?1",
                [clean_id],
            ).map_err(|e| format!("DB Error: {}", e))?;
        }

        AuditLogger::log(
            app_handle,
            guild_id,
            admin_discord_id,
            None,
            "WHITELIST_REMOVE",
            Some(clean_id),
            "SUCCESS",
            None,
            None,
        );

        Ok(format!("Survivor `{}` has been removed from the whitelist.", clean_id))
    }
}
