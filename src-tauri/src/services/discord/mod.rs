// Discord Webhook Service & Remote Management Subsystem for ASA Server Manager
// Sends notifications for server events to Discord channels and coordinates remote commands

pub mod types;
pub mod auth;
pub mod rate_limit;
pub mod setup;
pub mod dashboard;
pub mod commands;
pub mod components;
pub mod player;
pub mod whitelist;
pub mod audit;

use crate::AppState;
use reqwest::Client;
use serde_json::json;
use tauri::Manager;

/// Standalone function to send a Discord webhook notification.
/// Reads `discord_webhook_url` and `discord_alerts_config` from the settings DB table.
/// `event_key` should match a key in the alerts JSON (e.g. "serverStart", "serverStop", "serverCrash", "scheduledTask").
pub async fn send_discord_webhook(
    app_handle: &tauri::AppHandle,
    event_key: &str,
    embed: DiscordEmbed,
) {
    println!(
        "  🔔 [DISCORD] send_discord_webhook called for event: '{}'",
        event_key
    );

    // 1. Read webhook URL from settings
    let webhook_url = match read_setting(app_handle, "discord_webhook_url") {
        Some(url) if !url.is_empty() => {
            println!(
                "  🔔 [DISCORD] Webhook URL found: {}...{}",
                &url[..url.len().min(40)],
                if url.len() > 40 { "..." } else { "" }
            );
            url
        }
        Some(_) => {
            println!("  ⚠️ [DISCORD] Webhook URL is EMPTY. Skipping.");
            return;
        }
        None => {
            println!("  ⚠️ [DISCORD] No webhook URL configured in settings. Skipping.");
            return;
        }
    };

    // 2. Read alerts config and check if this event type is enabled
    let alerts_config = read_setting(app_handle, "discord_alerts_config");
    if let Some(config_json) = &alerts_config {
        println!("  🔔 [DISCORD] Alerts config found: {}", config_json);
        if let Ok(config) = serde_json::from_str::<serde_json::Value>(config_json) {
            // Check if this specific alert is enabled
            if let Some(enabled) = config.get(event_key).and_then(|v| v.as_bool()) {
                if !enabled {
                    println!(
                        "  📭 [DISCORD] Event '{}' is DISABLED in alerts config. Skipping.",
                        event_key
                    );
                    return;
                }
                println!("  🔔 [DISCORD] Event '{}' is enabled.", event_key);
            } else {
                println!(
                    "  🔔 [DISCORD] Event '{}' not found in config, defaulting to enabled.",
                    event_key
                );
            }
        }
    } else {
        println!("  🔔 [DISCORD] No alerts config found, defaulting to all enabled.");
    }

    // 3. Build payload and send
    let payload = json!({
        "embeds": [embed.to_json()]
    });

    println!(
        "  📤 [DISCORD] Sending '{}' webhook to Discord...",
        event_key
    );

    let client = Client::new();
    match client.post(&webhook_url).json(&payload).send().await {
        Ok(resp) => {
            if resp.status().is_success() {
                println!("  ✅ [DISCORD] Webhook SENT successfully: '{}'", event_key);
            } else {
                let status = resp.status();
                println!(
                    "  ⚠️ [DISCORD] Webhook returned HTTP {}: '{}'",
                    status, event_key
                );
                if let Ok(body) = resp.text().await {
                    println!("  ⚠️ [DISCORD] Error body: {}", body);
                }
            }
        }
        Err(e) => {
            println!("  ❌ [DISCORD] Webhook FAILED for '{}': {}", event_key, e);
        }
    }
}

/// Read a setting from the DB via AppState.
fn read_setting(app_handle: &tauri::AppHandle, key: &str) -> Option<String> {
    let state = app_handle.try_state::<AppState>()?;
    let db = state.db.lock().ok()?;
    db.get_setting(key).ok().flatten()
}

/// Get the server name from the DB for use in webhook embeds.
pub fn get_server_name(app_handle: &tauri::AppHandle, server_id: i64) -> String {
    if let Some(state) = app_handle.try_state::<AppState>() {
        if let Ok(db) = state.db.lock() {
            if let Ok(conn) = db.get_connection() {
                if let Ok(name) = conn.query_row(
                    "SELECT name FROM servers WHERE id = ?1",
                    [server_id],
                    |row| row.get::<_, String>(0),
                ) {
                    return name;
                }
            }
        }
    }
    format!("Server #{}", server_id)
}

// ── Embed Structs ──────────────────────────────────────────────────────

/// Discord embed structure
#[derive(Clone, Debug)]
pub struct DiscordEmbed {
    pub title: String,
    pub description: String,
    pub color: u32,
    pub fields: Vec<EmbedField>,
    pub footer: Option<String>,
    pub timestamp: Option<String>,
}

impl DiscordEmbed {
    pub fn to_json(&self) -> serde_json::Value {
        let mut embed = json!({
            "title": self.title,
            "description": self.description,
            "color": self.color,
        });

        if !self.fields.is_empty() {
            embed["fields"] = json!(self
                .fields
                .iter()
                .map(|f| {
                    json!({
                        "name": f.name,
                        "value": f.value,
                        "inline": f.inline,
                    })
                })
                .collect::<Vec<_>>());
        }

        if let Some(ref footer) = self.footer {
            embed["footer"] = json!({ "text": footer });
        }

        if let Some(ref timestamp) = self.timestamp {
            embed["timestamp"] = json!(timestamp);
        }

        embed
    }
}

#[derive(Clone, Debug)]
pub struct EmbedField {
    pub name: String,
    pub value: String,
    pub inline: bool,
}

// ── Convenience constructors for common events ─────────────────────────

impl DiscordEmbed {
    pub fn custom(title: &str, description: &str, color: u32) -> Self {
        Self {
            title: title.to_string(),
            description: description.to_string(),
            color,
            fields: vec![],
            footer: Some("ASA Server Manager 2.0".to_string()),
            timestamp: Some(chrono::Utc::now().to_rfc3339()),
        }
    }

    pub fn server_online(server_name: &str) -> Self {
        Self {
            title: "🟢 Server Online".to_string(),
            description: format!("**{}** is now online and accepting players!", server_name),
            color: 0x22C55E, // Green
            fields: vec![],
            footer: Some("ASA Server Manager 2.0".to_string()),
            timestamp: Some(chrono::Utc::now().to_rfc3339()),
        }
    }

    pub fn server_stopped(server_name: &str) -> Self {
        Self {
            title: "🔴 Server Stopped".to_string(),
            description: format!("**{}** has been shut down.", server_name),
            color: 0xEF4444, // Red
            fields: vec![],
            footer: Some("ASA Server Manager 2.0".to_string()),
            timestamp: Some(chrono::Utc::now().to_rfc3339()),
        }
    }

    pub fn server_crashed(server_name: &str, exit_code: i32) -> Self {
        Self {
            title: "💥 Server Crashed".to_string(),
            description: format!("**{}** has crashed unexpectedly!", server_name),
            color: 0xDC2626, // Dark Red
            fields: vec![EmbedField {
                name: "Exit Code".to_string(),
                value: format!("`{}`", exit_code),
                inline: true,
            }],
            footer: Some("ASA Server Manager 2.0".to_string()),
            timestamp: Some(chrono::Utc::now().to_rfc3339()),
        }
    }

    #[allow(dead_code)]
    pub fn scheduled_task(server_name: &str, task_type: &str, status: &str) -> Self {
        Self {
            title: "⏰ Scheduled Task".to_string(),
            description: format!("**{}** on **{}**", task_type, server_name),
            color: 0x8B5CF6, // Purple
            fields: vec![EmbedField {
                name: "Status".to_string(),
                value: status.to_string(),
                inline: true,
            }],
            footer: Some("ASA Server Manager 2.0".to_string()),
            timestamp: Some(chrono::Utc::now().to_rfc3339()),
        }
    }

    pub fn server_recovery(server_name: &str, is_success: bool, details: &str) -> Self {
        let (title, color, description) = if is_success {
            (
                "🟢 Auto-Recovery Success",
                0x22C55E, // Green
                format!("Intelligent auto-recovery successfully restarted server **{}**!", server_name),
            )
        } else {
            (
                "⚠️ Auto-Recovery Failed",
                0xF59E0B, // Amber/Orange
                format!("Intelligent auto-recovery failed to restore server **{}**.", server_name),
            )
        };

        Self {
            title: title.to_string(),
            description,
            color,
            fields: vec![EmbedField {
                name: "Details".to_string(),
                value: details.to_string(),
                inline: false,
            }],
            footer: Some("ASA Server Manager 2.0".to_string()),
            timestamp: Some(chrono::Utc::now().to_rfc3339()),
        }
    }

    pub fn backup_completed(server_name: &str, backup_type: &str, size: &str, is_success: bool) -> Self {
        let (title, color, description) = if is_success {
            (
                "💾 Backup Completed",
                0x10B981, // Emerald Green
                format!("Backup completed successfully for server **{}**.", server_name),
            )
        } else {
            (
                "❌ Backup Failed",
                0xEF4444, // Red
                format!("Backup failed for server **{}**.", server_name),
            )
        };

        Self {
            title: title.to_string(),
            description,
            color,
            fields: vec![
                EmbedField {
                    name: "Type".to_string(),
                    value: backup_type.to_string(),
                    inline: true,
                },
                EmbedField {
                    name: "Size / Error Details".to_string(),
                    value: size.to_string(),
                    inline: true,
                },
            ],
            footer: Some("ASA Server Manager 2.0".to_string()),
            timestamp: Some(chrono::Utc::now().to_rfc3339()),
        }
    }

    pub fn player_join(server_name: &str, player_name: &str) -> Self {
        Self {
            title: "👤 Player Joined".to_string(),
            description: format!("**{}** has joined **{}**", player_name, server_name),
            color: 0x3B82F6, // Blue
            fields: vec![],
            footer: Some("ASA Server Manager 2.0".to_string()),
            timestamp: Some(chrono::Utc::now().to_rfc3339()),
        }
    }

    pub fn player_leave(server_name: &str, player_name: &str) -> Self {
        Self {
            title: "🚪 Player Left".to_string(),
            description: format!("**{}** has left **{}**", player_name, server_name),
            color: 0x6B7280, // Gray
            fields: vec![],
            footer: Some("ASA Server Manager 2.0".to_string()),
            timestamp: Some(chrono::Utc::now().to_rfc3339()),
        }
    }

    /// Build a rich status update embed with per-server details
    /// Each entry: (name, map_name, current_players, max_players)
    pub fn status_update(
        online_count: usize,
        total_count: usize,
        server_details: Vec<(String, String, i32, i32)>,
    ) -> Self {
        let color = if online_count > 0 { 0x22C55E } else { 0xEF4444 };

        let total_players: i32 = server_details.iter().map(|(_, _, p, _)| p).sum();
        let total_max: i32 = server_details.iter().map(|(_, _, _, m)| m).sum();

        let mut fields: Vec<EmbedField> = if server_details.is_empty() {
            vec![EmbedField {
                name: "No Servers Online".to_string(),
                value: "All servers are currently offline.".to_string(),
                inline: false,
            }]
        } else {
            server_details
                .into_iter()
                .map(|(name, map, players, max)| EmbedField {
                    name: format!("🖥️ {}", name),
                    value: format!(
                        "Players: **{}/{}**\nMap: **{}**\nStatus: 🟢 Online",
                        players, max, map
                    ),
                    inline: true,
                })
                .collect()
        };

        // Add summary field
        fields.push(EmbedField {
            name: "📈 Total".to_string(),
            value: format!(
                "{} / {} servers online — **{}** player(s) active",
                online_count, total_count, total_players
            ),
            inline: false,
        });

        Self {
            title: "📊 Server Status Update".to_string(),
            description: format!(
                "**{}** of **{}** server(s) online — **{}/{}** player slots in use",
                online_count, total_count, total_players, total_max
            ),
            color,
            fields,
            footer: Some("ASA Server Manager 2.0".to_string()),
            timestamp: Some(chrono::Utc::now().to_rfc3339()),
        }
    }
}
