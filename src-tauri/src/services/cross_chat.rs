// Cross-Server Chat Service for ARK Server Clusters
// Enables cluster-wide chat relay via RCON polling
// EXPERIMENTAL FEATURE

#![allow(dead_code)]

use crate::services::rcon::RconService;
use crate::utils::log_watcher::LogWatcher;
use regex::Regex;
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
    rcon_service: RconService,
    active_clusters: Arc<Mutex<HashMap<i64, CrossChatConfig>>>,
    watchers: Arc<tokio::sync::Mutex<HashMap<i64, Vec<Arc<LogWatcher>>>>>,
    running: Arc<AtomicBool>,
}

impl CrossChatService {
    pub fn new(rcon_service: RconService) -> Self {
        Self {
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
        message: &str,
    ) -> Result<(), String> {
        let formatted_message = format!("[{}] {}", source_server_name, message);

        for server in cluster_servers {
            if server.server_id != source_server_id {
                // Broadcast to this server
                match self
                    .rcon_service
                    .broadcast(server.server_id, &formatted_message)
                    .await
                {
                    Ok(_) => {
                        println!(
                            "  📤 Relayed message to {} from {}",
                            server.server_name, source_server_name
                        );
                    }
                    Err(e) => {
                        println!("  ⚠️ Failed to relay to {}: {}", server.server_name, e);
                    }
                }
            }
        }

        Ok(())
    }

    /// Start the polling loop for chat relay
    /// This should be spawned as a background task
    /// Start the log watchers for chat relay
    pub async fn start_chat_relay(self: Arc<Self>, cluster_id: i64, servers: Vec<CrossChatServer>) {
        self.running.store(true, Ordering::Relaxed);
        println!("🔄 Starting cross-chat relay for cluster {}", cluster_id);

        let chat_regex = Regex::new(
            r"(\d{4}\.\d{2}\.\d{2}_\d{2}\.\d{2}\.\d{2}): (?:[A-Za-z0-9_]+): ([^:]+): (.*)",
        )
        .unwrap();
        // Example: 2024.02.05_12.00.00: LogServer: PlayerName: Hello World
        // Adjusted regex to match typical ARK logs. Needs verification of ASA format.

        let mut cluster_watchers = Vec::new();

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

            let service_clone = self.clone();
            let servers_clone = servers.clone();
            let server_clone = server.clone();
            let regex_clone = chat_regex.clone();

            tokio::spawn(async move {
                while let Some(line) = rx.recv().await {
                    if !service_clone.running.load(Ordering::Relaxed) {
                        break;
                    }

                    if let Some(captures) = regex_clone.captures(&line) {
                        // captures[0] is full match
                        // captures[1] is timestamp
                        // captures[2] is player name
                        // captures[3] is message

                        let player_name = captures.get(2).map_or("", |m| m.as_str());
                        let message = captures.get(3).map_or("", |m| m.as_str());

                        // Ignore system messages or empty
                        if player_name.is_empty() || message.is_empty() || player_name == "Server" {
                            continue;
                        }

                        // Broadcast
                        let _ = service_clone
                            .relay_message(
                                &servers_clone,
                                server_clone.server_id,
                                &server_clone.server_name,
                                message,
                            )
                            .await; // relay_message will format it as [Server] Message
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

impl Default for CrossChatService {
    fn default() -> Self {
        Self {
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
