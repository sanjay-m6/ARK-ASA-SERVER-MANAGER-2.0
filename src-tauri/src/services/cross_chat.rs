// Cross-Server Chat Service for ARK Server Clusters
// Enables cluster-wide chat relay via RCON polling
// EXPERIMENTAL FEATURE

#![allow(dead_code)]

use crate::services::rcon::RconService;
use crate::utils::log_watcher::LogWatcher;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;
// use tokio::time::{sleep, Duration}; // Unused

/// Cross-chat configuration for a cluster
#[derive(Clone, Debug)]
pub struct CrossChatConfig {
    pub cluster_id: i64,
    pub enabled: bool,
    pub poll_interval_ms: u64,
    pub message_prefix: String, // e.g., "[Server1]"
}

/// Represents a chat message to relay
#[derive(Clone, Debug)]
pub struct ChatMessage {
    pub source_server_id: i64,
    pub source_server_name: String,
    pub content: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

/// Server info for cross-chat relay
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CrossChatServer {
    pub server_id: i64,
    pub server_name: String,
    pub display_name: Option<String>,
    pub install_path: String,
    pub rcon_address: String,
    pub rcon_port: u16,
    pub rcon_password: String,
}

/// Cross-Server Chat Service
///
/// This service polls chat from each server in a cluster and relays
/// messages to all other servers with a server name prefix.
pub struct CrossChatService {
    app_handle: Option<tauri::AppHandle>,
    rcon_service: RconService,
    active_clusters: Arc<Mutex<HashMap<i64, CrossChatConfig>>>,
    watchers: Arc<tokio::sync::Mutex<HashMap<i64, Vec<Arc<LogWatcher>>>>>,
    running: Arc<AtomicBool>,
}

impl CrossChatService {
    pub fn new(rcon_service: RconService) -> Self {
        Self {
            app_handle: None,
            rcon_service,
            active_clusters: Arc::new(Mutex::new(HashMap::new())),
            watchers: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn with_app_handle(app_handle: tauri::AppHandle, rcon_service: RconService) -> Self {
        Self {
            app_handle: Some(app_handle),
            rcon_service,
            active_clusters: Arc::new(Mutex::new(HashMap::new())),
            watchers: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            running: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Enable cross-chat for a cluster
    pub async fn enable_for_cluster(
        &self,
        cluster_id: i64,
        servers: Vec<CrossChatServer>,
    ) -> Result<(), String> {
        println!("🔗 Enabling cross-chat for cluster {}", cluster_id);

        // Connect to all servers via RCON
        for server in &servers {
            self.rcon_service
                .connect(
                    server.server_id,
                    &server.rcon_address,
                    server.rcon_port,
                    &server.rcon_password,
                )
                .await?;
            println!("  ✅ Connected to {} RCON", server.server_name);
        }

        // Store config
        let config = CrossChatConfig {
            cluster_id,
            enabled: true,
            poll_interval_ms: 2000,        // Poll every 2 seconds
            message_prefix: String::new(), // Prefix will be server name
        };

        let mut clusters = self.active_clusters.lock().await;
        clusters.insert(cluster_id, config);

        println!("  📡 Cross-chat enabled for {} servers", servers.len());
        Ok(())
    }

    /// Disable cross-chat for a cluster
    pub async fn disable_for_cluster(&self, cluster_id: i64) -> Result<(), String> {
        println!("🔇 Disabling cross-chat for cluster {}", cluster_id);

        let mut clusters = self.active_clusters.lock().await;
        clusters.remove(&cluster_id);

        Ok(())
    }

    /// Check if cross-chat is enabled for a cluster
    pub async fn is_enabled(&self, cluster_id: i64) -> bool {
        let clusters = self.active_clusters.lock().await;
        clusters.contains_key(&cluster_id)
    }

    /// Broadcast a message to all servers in a cluster (except source)
    pub async fn relay_message(
        &self,
        cluster_servers: &[CrossChatServer],
        source_server_id: i64,
        source_server_name: &str,
        player_name: &str,
        message: &str,
    ) -> Result<(), String> {
        // Resolve custom display name/alias for the source server if configured
        let name_to_show = cluster_servers
            .iter()
            .find(|s| s.server_id == source_server_id)
            .and_then(|s| s.display_name.as_deref().filter(|n| !n.trim().is_empty()))
            .unwrap_or(source_server_name);

        let formatted_message = if player_name.is_empty() {
            format!("[{}] {}", name_to_show, message)
        } else {
            format!("[{}] {}: {}", name_to_show, player_name, message)
        };

        for server in cluster_servers {
            if server.server_id != source_server_id {
                // Relay chat via ServerChat (avoiding [ANNOUNCEMENT] broadcast banner)
                match self
                    .rcon_service
                    .server_chat(server.server_id, &formatted_message)
                    .await
                {
                    Ok(_) => {
                        println!(
                            "  📤 Relayed message to {} from {}",
                            server.server_name, name_to_show
                        );
                    }
                    Err(e) => {
                        println!("  ⚠️ Failed to relay to {}: {}", server.server_name, e);
                    }
                }
            }
        }

        // Forward to Discord bridge if configured
        if let Some(app) = &self.app_handle {
            use tauri::Manager;
            if let Some(state) = app.try_state::<crate::AppState>() {
                let discord = state.discord_bridge.clone();
                let src_name = name_to_show.to_string();
                let plr_name = player_name.to_string();
                let msg_text = message.to_string();
                tokio::spawn(async move {
                    let _ = discord.send_to_discord(&src_name, &plr_name, &msg_text).await;
                });
            }
        }

        Ok(())
    }

    /// Start the chat relay for a cluster (dual engine: RCON GetChat polling + ShooterGame.log watcher)
    pub async fn start_chat_relay(self: Arc<Self>, cluster_id: i64, servers: Vec<CrossChatServer>) {
        self.running.store(true, Ordering::Relaxed);
        println!("🔄 Starting cross-chat relay for cluster {} with {} servers", cluster_id, servers.len());

        let recent_cache = Arc::new(Mutex::new(HashMap::<String, std::time::Instant>::new()));
        let mut cluster_watchers = Vec::new();

        // 1. Spawn RCON GetChat polling loop for instant memory chat reading
        let service_rcon = self.clone();
        let servers_rcon = servers.clone();
        let cache_rcon = recent_cache.clone();

        tokio::spawn(async move {
            println!("📡 RCON GetChat polling loop active for cluster {}", cluster_id);
            while service_rcon.running.load(Ordering::Relaxed) {
                tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;

                for server in &servers_rcon {
                    if let Ok(chat_resp) = service_rcon.rcon_service.send_command(server.server_id, "GetChat").await {
                        if !chat_resp.message.trim().is_empty() && !chat_resp.message.contains("No chat messages") {
                            for line in chat_resp.message.lines() {
                                if let Some((player_name, message)) = parse_ark_chat_line(line) {
                                    let cache_key = format!("{}:{}:{}", server.server_id, player_name, message);
                                    let mut cache = cache_rcon.lock().await;

                                    // Clean old cache entries (older than 10s)
                                    cache.retain(|_, time| time.elapsed().as_secs() < 10);

                                    if !cache.contains_key(&cache_key) {
                                        cache.insert(cache_key, std::time::Instant::now());
                                        drop(cache);

                                        let _ = service_rcon
                                            .relay_message(
                                                &servers_rcon,
                                                server.server_id,
                                                &server.server_name,
                                                &player_name,
                                                &message,
                                            )
                                            .await;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        // 2. Spawn log watchers as secondary file-based relay engine
        for server in servers.clone() {
            let log_path =
                PathBuf::from(&server.install_path).join("ShooterGame/Saved/Logs/ShooterGame.log");

            if !log_path.exists() {
                println!(
                    "⚠️ Log file not found for {}: {:?}",
                    server.server_name, log_path
                );
                continue;
            }

            let watcher = Arc::new(LogWatcher::new(log_path, None));
            let mut rx = watcher.start();
            cluster_watchers.push(watcher);

            let service_log = self.clone();
            let servers_log = servers.clone();
            let server_log = server.clone();
            let cache_log = recent_cache.clone();

            tokio::spawn(async move {
                while let Some(line) = rx.recv().await {
                    if !service_log.running.load(Ordering::Relaxed) {
                        break;
                    }

                    if let Some((player_name, message)) = parse_ark_chat_line(&line) {
                        let cache_key = format!("{}:{}:{}", server_log.server_id, player_name, message);
                        let mut cache = cache_log.lock().await;

                        cache.retain(|_, time| time.elapsed().as_secs() < 10);

                        if !cache.contains_key(&cache_key) {
                            cache.insert(cache_key, std::time::Instant::now());
                            drop(cache);

                            let _ = service_log
                                .relay_message(
                                    &servers_log,
                                    server_log.server_id,
                                    &server_log.server_name,
                                    &player_name,
                                    &message,
                                )
                                .await;
                        }
                    }
                }
            });
        }

        // Store watchers to keep them alive
        let mut watchers_lock = self.watchers.lock().await;
        watchers_lock.insert(cluster_id, cluster_watchers);
    }

    /// Stop the polling loop
    pub fn stop_polling(&self) {
        self.running.store(false, Ordering::Relaxed);
    }
}

/// Helper to parse any format of ARK: Survival Ascended or Evolved chat line into (player_name, message)
pub fn parse_ark_chat_line(raw_line: &str) -> Option<(String, String)> {
    let line = raw_line.trim();
    if line.is_empty() {
        return None;
    }

    // 1. If line starts with relayed tag [ServerName], ignore to prevent echo loops
    if line.starts_with('[') && line.contains("] ") && !line.starts_with("[202") {
        return None;
    }

    // 2. Strip standard ARK log timestamp headers:
    // e.g., "[2024.02.05-12.00.00:123][  0]" or "[2024.02.05_12.00.00]" or "2024.02.05_12.00.00:"
    let mut cleaned = line;
    if let Some(pos) = cleaned.find("][") {
        if let Some(end_bracket) = cleaned[pos + 2..].find(']') {
            cleaned = cleaned[pos + 3 + end_bracket..].trim();
        }
    }
    if cleaned.starts_with('[') {
        if let Some(closing) = cleaned.find(']') {
            let inner = &cleaned[1..closing];
            if inner.contains('-') || inner.contains('.') || inner.contains(':') || inner.contains('_') {
                cleaned = cleaned[closing + 1..].trim();
            }
        }
    }
    if let Some(colon_pos) = cleaned.find(": ") {
        let prefix = &cleaned[..colon_pos];
        if prefix.contains('_') || prefix.contains('.') {
            cleaned = cleaned[colon_pos + 2..].trim();
        }
    }

    // 3. Strip Log category prefixes
    if cleaned.starts_with("LogServer:") {
        cleaned = cleaned[10..].trim();
    }
    if cleaned.starts_with("LogShooterGame:") {
        cleaned = cleaned[15..].trim();
    }
    if cleaned.starts_with("Server:") || cleaned.starts_with("SERVER:") {
        cleaned = cleaned[7..].trim();
    }
    if cleaned.starts_with("Chat:") || cleaned.starts_with("CHAT:") {
        cleaned = cleaned[5..].trim();
    }
    if cleaned.starts_with("Global:") || cleaned.starts_with("GLOBAL:") {
        cleaned = cleaned[7..].trim();
    }

    // 4. Filter out system messages, commands, noise, and world save notifications
    let lower = cleaned.to_lowercase();
    if lower.starts_with("command:")
        || lower.starts_with("rcon:")
        || lower.starts_with("executing")
        || lower.starts_with("server received")
        || lower.starts_with("admincmd")
        || lower.starts_with("logserver:")
        || lower.starts_with("shootergame:")
        || lower.starts_with("server :")
        || lower.starts_with("setmessage")
        || lower.contains("world save complete")
        || lower.contains("server save loaded")
        || lower.contains("world save took")
        || lower.contains("save complete")
        || lower.contains("world save")
    {
        return None;
    }

    // 5. Parse "PlayerName: Message" or "PlayerName (TribeName): Message"
    let parts: Vec<&str> = cleaned.splitn(2, ':').collect();
    if parts.len() == 2 {
        let player = parts[0].trim();
        let msg = parts[1].trim();

        if player.is_empty() || msg.is_empty() {
            return None;
        }

        // Filter out system speaker names
        if player.eq_ignore_ascii_case("server")
            || player.eq_ignore_ascii_case("admin")
            || player.eq_ignore_ascii_case("logserver")
            || player.starts_with('[')
        {
            return None;
        }

        return Some((player.to_string(), msg.to_string()));
    }

    None
}

impl Default for CrossChatService {
    fn default() -> Self {
        Self {
            app_handle: None,
            rcon_service: RconService::new(),
            active_clusters: Arc::new(Mutex::new(HashMap::new())),
            watchers: Arc::new(Mutex::new(HashMap::new())),
            running: Arc::new(AtomicBool::new(false)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_cross_chat_config() {
        let config = CrossChatConfig {
            cluster_id: 1,
            enabled: true,
            poll_interval_ms: 2000,
            message_prefix: "[Test]".to_string(),
        };

        assert!(config.enabled);
        assert_eq!(config.poll_interval_ms, 2000);
    }
}
