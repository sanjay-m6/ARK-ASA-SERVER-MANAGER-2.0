// Discord Webhook Service for ASA Server Manager
// Sends notifications for server events to Discord channels

use crate::models::DiscordConfig;
use reqwest::Client;
use serde_json::json;

pub struct DiscordService {
    client: Client,
}

impl DiscordService {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    /// Send a Discord webhook message
    pub async fn send_webhook(&self, webhook_url: &str, embed: DiscordEmbed) -> Result<(), String> {
        let payload = json!({
            "embeds": [embed.to_json()]
        });

        self.client
            .post(webhook_url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Failed to send webhook: {}", e))?;

        Ok(())
    }

    /// Notify server start
    pub async fn notify_server_start(
        &self,
        config: &DiscordConfig,
        server_name: &str,
        map_name: &str,
    ) -> Result<(), String> {
        if !config.notify_server_start {
            return Ok(());
        }

        let webhook_url = config
            .webhook_url
            .as_ref()
            .ok_or("No webhook URL configured")?;

        let embed = DiscordEmbed {
            title: "🟢 Server Started".to_string(),
            description: format!("**{}** is now online!", server_name),
            color: 0x22C55E, // Green
            fields: vec![EmbedField {
                name: "Map".to_string(),
                value: map_name.to_string(),
                inline: true,
            }],
            footer: Some("ASA Server Manager 2.0".to_string()),
            timestamp: Some(chrono::Utc::now().to_rfc3339()),
        };

        self.send_webhook(webhook_url, embed).await
    }

    /// Notify server stop
    pub async fn notify_server_stop(
        &self,
        config: &DiscordConfig,
        server_name: &str,
    ) -> Result<(), String> {
        if !config.notify_server_stop {
            return Ok(());
        }

        let webhook_url = config
            .webhook_url
            .as_ref()
            .ok_or("No webhook URL configured")?;

        let embed = DiscordEmbed {
            title: "🔴 Server Stopped".to_string(),
            description: format!("**{}** has been shut down.", server_name),
            color: 0xEF4444, // Red
            fields: vec![],
            footer: Some("ASA Server Manager 2.0".to_string()),
            timestamp: Some(chrono::Utc::now().to_rfc3339()),
        };

        self.send_webhook(webhook_url, embed).await
    }

    /// Notify server crash
    pub async fn notify_server_crash(
        &self,
        config: &DiscordConfig,
        server_name: &str,
        error: Option<&str>,
    ) -> Result<(), String> {
        if !config.notify_server_crash {
            return Ok(());
        }

        let webhook_url = config
            .webhook_url
            .as_ref()
            .ok_or("No webhook URL configured")?;

        let mut fields = vec![];
        if let Some(err) = error {
            fields.push(EmbedField {
                name: "Error".to_string(),
                value: format!("```{}```", err),
                inline: false,
            });
        }

        let embed = DiscordEmbed {
            title: "💥 Server Crashed".to_string(),
            description: format!("**{}** has crashed unexpectedly!", server_name),
            color: 0xDC2626, // Dark Red
            fields,
            footer: Some("ASA Server Manager 2.0".to_string()),
            timestamp: Some(chrono::Utc::now().to_rfc3339()),
        };

        self.send_webhook(webhook_url, embed).await
    }

    /// Notify player join
    pub async fn notify_player_join(
        &self,
        config: &DiscordConfig,
        server_name: &str,
        player_name: &str,
        player_count: i32,
        max_players: i32,
    ) -> Result<(), String> {
        if !config.notify_player_join {
            return Ok(());
        }

        let webhook_url = config
            .webhook_url
            .as_ref()
            .ok_or("No webhook URL configured")?;

        let embed = DiscordEmbed {
            title: "👋 Player Joined".to_string(),
            description: format!(
                "**{}** joined **{}**\nPlayers: {}/{}",
                player_name, server_name, player_count, max_players
            ),
            color: 0x06B6D4, // Cyan
            fields: vec![],
            footer: Some("ASA Server Manager 2.0".to_string()),
            timestamp: Some(chrono::Utc::now().to_rfc3339()),
        };

        self.send_webhook(webhook_url, embed).await
    }

    /// Notify player leave
    pub async fn notify_player_leave(
        &self,
        config: &DiscordConfig,
        server_name: &str,
        player_name: &str,
        player_count: i32,
        max_players: i32,
    ) -> Result<(), String> {
        if !config.notify_player_leave {
            return Ok(());
        }

        let webhook_url = config
            .webhook_url
            .as_ref()
            .ok_or("No webhook URL configured")?;

        let embed = DiscordEmbed {
            title: "👋 Player Left".to_string(),
            description: format!(
                "**{}** left **{}**\nPlayers: {}/{}",
                player_name, server_name, player_count, max_players
            ),
            color: 0x64748B, // Slate
            fields: vec![],
            footer: Some("ASA Server Manager 2.0".to_string()),
            timestamp: Some(chrono::Utc::now().to_rfc3339()),
        };

        self.send_webhook(webhook_url, embed).await
    }

    /// Notify scheduled task execution
    pub async fn notify_scheduled_task(
        &self,
        config: &DiscordConfig,
        server_name: &str,
        task_type: &str,
        status: &str,
    ) -> Result<(), String> {
        if !config.notify_scheduled_task {
            return Ok(());
        }

        let webhook_url = config
            .webhook_url
            .as_ref()
            .ok_or("No webhook URL configured")?;

        let embed = DiscordEmbed {
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
        };

        self.send_webhook(webhook_url, embed).await
    }
}

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

impl Default for DiscordService {
    fn default() -> Self {
        Self::new()
    }
}
