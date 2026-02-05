// Cross-Server Chat Service for ARK Server Clusters
// Enables cluster-wide chat relay via RCON polling
// EXPERIMENTAL FEATURE

#![allow(dead_code)]

use crate::services::rcon::RconService;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};

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
#[derive(Clone, Debug)]
pub struct CrossChatServer {
    pub server_id: i64,
    pub server_name: String,
    pub rcon_address: String,
    pub rcon_port: u16,
    pub rcon_password: String,
}

/// Cross-Server Chat Service
///
/// This service polls chat from each server in a cluster and relays
/// messages to all other servers with a server name prefix.
pub struct CrossChatService {
    rcon_service: Arc<Mutex<RconService>>,
    active_clusters: Arc<Mutex<HashMap<i64, CrossChatConfig>>>,
    running: Arc<AtomicBool>,
}

impl CrossChatService {
    pub fn new(rcon_service: Arc<Mutex<RconService>>) -> Self {
        Self {
            rcon_service,
            active_clusters: Arc::new(Mutex::new(HashMap::new())),
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
        let rcon = self.rcon_service.lock().await;
        for server in &servers {
            rcon.connect(
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
        let rcon = self.rcon_service.lock().await;

        for server in cluster_servers {
            if server.server_id != source_server_id {
                // Broadcast to this server
                match rcon.broadcast(server.server_id, &formatted_message).await {
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
    pub async fn start_polling_loop(
        self: Arc<Self>,
        cluster_id: i64,
        _servers: Vec<CrossChatServer>,
    ) {
        self.running.store(true, Ordering::Relaxed);
        println!("🔄 Starting cross-chat polling for cluster {}", cluster_id);

        // Track last known chat state per server to detect new messages
        let mut _last_chat_state: HashMap<i64, String> = HashMap::new();

        while self.running.load(Ordering::Relaxed) {
            // Check if still enabled
            if !self.is_enabled(cluster_id).await {
                println!("🛑 Cross-chat disabled, stopping poll loop");
                break;
            }

            // Poll each server for new chat messages
            // Note: ARK doesn't have a direct "get chat" RCON command
            // This is a placeholder for future implementation
            // Options:
            // 1. Parse server logs for chat
            // 2. Use webhook integration
            // 3. Custom plugin

            // For now, just keep the connection alive
            sleep(Duration::from_millis(2000)).await;
        }
    }

    /// Stop the polling loop
    pub fn stop_polling(&self) {
        self.running.store(false, Ordering::Relaxed);
    }
}

impl Default for CrossChatService {
    fn default() -> Self {
        Self {
            rcon_service: Arc::new(Mutex::new(RconService::new())),
            active_clusters: Arc::new(Mutex::new(HashMap::new())),
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
