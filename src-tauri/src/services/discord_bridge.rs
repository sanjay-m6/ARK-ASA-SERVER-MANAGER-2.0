// Discord Bridge Service for Cross-Server Chat
// Enables two-way chat sync between ARK servers and Discord
// EXPERIMENTAL FEATURE

#![allow(dead_code)]

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;

/// Discord bridge configuration
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DiscordBridgeConfig {
    pub cluster_id: i64,
    pub enabled: bool,
    pub bot_token: String,
    pub guild_id: String,
    pub channel_id: String,
    pub game_to_discord: bool,
    pub discord_to_game: bool,
}

impl Default for DiscordBridgeConfig {
    fn default() -> Self {
        Self {
            cluster_id: 0,
            enabled: false,
            bot_token: String::new(),
            guild_id: String::new(),
            channel_id: String::new(),
            game_to_discord: true,
            discord_to_game: true,
        }
    }
}

/// Rate limiter for messages
struct RateLimiter {
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

/// Discord Bridge Service
pub struct DiscordBridgeService {
    http_client: Client,
    config: Arc<Mutex<Option<DiscordBridgeConfig>>>,
    running: Arc<AtomicBool>,
    rate_limiter: Arc<Mutex<RateLimiter>>,
    /// Messages sent by us to prevent echo loops
    sent_messages: Arc<Mutex<Vec<String>>>,
}

impl DiscordBridgeService {
    pub fn new() -> Self {
        Self {
            http_client: Client::new(),
            config: Arc::new(Mutex::new(None)),
            running: Arc::new(AtomicBool::new(false)),
            rate_limiter: Arc::new(Mutex::new(RateLimiter::new(5, 10))), // 5 msgs per 10 seconds
            sent_messages: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Configure the bridge
    pub async fn configure(&self, config: DiscordBridgeConfig) {
        let mut cfg = self.config.lock().await;
        *cfg = Some(config);
    }

    /// Get current configuration
    pub async fn get_config(&self) -> Option<DiscordBridgeConfig> {
        let cfg = self.config.lock().await;
        cfg.clone()
    }

    /// Test Discord connection by fetching channel info
    pub async fn test_connection(&self) -> Result<String, String> {
        let config = self.config.lock().await;
        let config = config.as_ref().ok_or("No configuration set")?;

        if config.bot_token.is_empty() {
            return Err("Bot token is required".to_string());
        }

        if config.channel_id.is_empty() {
            return Err("Channel ID is required".to_string());
        }

        // Test by fetching channel info
        let url = format!("https://discord.com/api/v10/channels/{}", config.channel_id);

        let response = self
            .http_client
            .get(&url)
            .header("Authorization", format!("Bot {}", config.bot_token))
            .send()
            .await
            .map_err(|e| format!("Connection failed: {}", e))?;

        if response.status().is_success() {
            let channel: serde_json::Value = response
                .json()
                .await
                .map_err(|e| format!("Failed to parse response: {}", e))?;

            let channel_name = channel["name"].as_str().unwrap_or("Unknown");
            Ok(format!("Connected to #{}", channel_name))
        } else {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
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
        {
            let sent = self.sent_messages.lock().await;
            if sent.iter().any(|m| m.contains(content)) {
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

    /// Start the bridge
    pub fn start(&self) {
        self.running.store(true, Ordering::Relaxed);
        println!("🌉 Discord bridge started");
    }

    /// Stop the bridge
    pub fn stop(&self) {
        self.running.store(false, Ordering::Relaxed);
        println!("🌉 Discord bridge stopped");
    }

    /// Check if running
    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::Relaxed)
    }
}

impl Default for DiscordBridgeService {
    fn default() -> Self {
        Self::new()
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
