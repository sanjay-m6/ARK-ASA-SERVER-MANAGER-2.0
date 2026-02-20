// Discord Webhook Service for ASA Server Manager
// Sends notifications for server events to Discord channels

use crate::AppState;
use reqwest::blocking::Client as BlockingClient;
use serde_json::json;
use tauri::Manager;

/// Standalone function to send a Discord webhook notification.
/// Reads `discord_webhook_url` and `discord_alerts_config` from the settings DB table.
/// `event_key` should match a key in the alerts JSON (e.g. "serverStart", "serverStop", "serverCrash", "scheduledTask").
/// This function is safe to call from any synchronous thread (e.g. process manager monitor).
pub fn send_discord_webhook(app_handle: &tauri::AppHandle, event_key: &str, embed: DiscordEmbed) {
    // 1. Read webhook URL from settings
    let webhook_url = match read_setting(app_handle, "discord_webhook_url") {
        Some(url) if !url.is_empty() => url,
        _ => return, // No webhook configured, silently skip
    };

    // 2. Read alerts config and check if this event type is enabled
    let alerts_config = read_setting(app_handle, "discord_alerts_config");
    if let Some(config_json) = alerts_config {
        if let Ok(config) = serde_json::from_str::<serde_json::Value>(&config_json) {
            // Check if this specific alert is enabled
            if let Some(enabled) = config.get(event_key).and_then(|v| v.as_bool()) {
                if !enabled {
                    log::info!("📭 Discord webhook skipped: '{}' is disabled", event_key);
                    return;
                }
            }
            // If key not found in config, default to sending (enabled by default)
        }
        // If JSON parse fails, default to sending
    }
    // If no alerts config at all, default to sending

    // 3. Build payload and send
    let payload = json!({
        "embeds": [embed.to_json()]
    });

    log::info!(
        "📤 Discord webhook: sending '{}' notification...",
        event_key
    );

    let client = BlockingClient::new();
    match client.post(&webhook_url).json(&payload).send() {
        Ok(resp) => {
            if resp.status().is_success() {
                log::info!("✅ Discord webhook sent: '{}'", event_key);
            } else {
                log::error!(
                    "⚠️ Discord webhook returned status {}: '{}'",
                    resp.status(),
                    event_key
                );
            }
        }
        Err(e) => {
            log::error!("❌ Discord webhook failed for '{}': {}", event_key, e);
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

pub struct EmbedField {
    pub name: String,
    pub value: String,
    pub inline: bool,
}

// ── Convenience constructors for common events ─────────────────────────

impl DiscordEmbed {
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
}
