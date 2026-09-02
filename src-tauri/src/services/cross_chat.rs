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
    cluster_cancels: Arc<Mutex<HashMap<i64, Arc<AtomicBool>>>>,
    watchers: Arc<tokio::sync::Mutex<HashMap<i64, Vec<Arc<LogWatcher>>>>>,
    running: Arc<AtomicBool>,
}

impl CrossChatService {
    pub fn new(rcon_service: RconService) -> Self {
        Self {
            app_handle: None,
            rcon_service,
            active_clusters: Arc::new(Mutex::new(HashMap::new())),
            cluster_cancels: Arc::new(Mutex::new(HashMap::new())),
            watchers: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn with_app_handle(app_handle: tauri::AppHandle, rcon_service: RconService) -> Self {
        Self {
            app_handle: Some(app_handle),
            rcon_service,
            active_clusters: Arc::new(Mutex::new(HashMap::new())),
            cluster_cancels: Arc::new(Mutex::new(HashMap::new())),
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

    /// Disable cross-chat for a cluster immediately (stops RCON polling & log watchers)
    pub async fn disable_for_cluster(&self, cluster_id: i64) -> Result<(), String> {
        println!("🔇 Disabling cross-chat for cluster {}", cluster_id);

        // Signal cancellation flag for this specific cluster runner
        {
            let mut cancels = self.cluster_cancels.lock().await;
            if let Some(flag) = cancels.remove(&cluster_id) {
                flag.store(false, Ordering::Relaxed);
            }
        }

        // Stop and drain all log watchers for this cluster
        {
            let mut watchers = self.watchers.lock().await;
            if let Some(watcher_list) = watchers.remove(&cluster_id) {
                for w in watcher_list {
                    w.stop();
                }
            }
        }

        let mut clusters = self.active_clusters.lock().await;
        clusters.remove(&cluster_id);

        if clusters.is_empty() {
            self.running.store(false, Ordering::Relaxed);
        }

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
        
        let cluster_flag = Arc::new(AtomicBool::new(true));
        {
            let mut cancels = self.cluster_cancels.lock().await;
            if let Some(old_flag) = cancels.insert(cluster_id, cluster_flag.clone()) {
                old_flag.store(false, Ordering::Relaxed);
            }
        }

        println!("🔄 Starting cross-chat relay for cluster {} with {} servers", cluster_id, servers.len());

        let recent_cache = Arc::new(Mutex::new(HashMap::<String, std::time::Instant>::new()));
        let mut cluster_watchers = Vec::new();

        // 1. Spawn RCON GetChat polling loop for instant memory chat reading
        let service_rcon = self.clone();
        let servers_rcon = servers.clone();
        let cache_rcon = recent_cache.clone();
        let cluster_flag_rcon = cluster_flag.clone();

        tokio::spawn(async move {
            println!("📡 RCON GetChat polling loop active for cluster {}", cluster_id);
            while cluster_flag_rcon.load(Ordering::Relaxed) && service_rcon.running.load(Ordering::Relaxed) {
                tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;

                if !cluster_flag_rcon.load(Ordering::Relaxed) || !service_rcon.running.load(Ordering::Relaxed) {
                    break;
                }

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
            println!("🛑 RCON GetChat polling loop stopped for cluster {}", cluster_id);
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
            let cluster_flag_log = cluster_flag.clone();

            tokio::spawn(async move {
                while let Some(line) = rx.recv().await {
                    if !cluster_flag_log.load(Ordering::Relaxed) || !service_log.running.load(Ordering::Relaxed) {
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

    /// Stop all polling loops and log watchers across all clusters
    pub async fn stop_all(&self) {
        self.running.store(false, Ordering::Relaxed);

        let mut cancels = self.cluster_cancels.lock().await;
        for (_, flag) in cancels.drain() {
            flag.store(false, Ordering::Relaxed);
        }

        let mut watchers = self.watchers.lock().await;
        for (_, watcher_list) in watchers.drain() {
            for w in watcher_list {
                w.stop();
            }
        }

        let mut clusters = self.active_clusters.lock().await;
        clusters.clear();
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

    let lower_raw = raw_line.to_lowercase();

    // 1. Immediately reject non-chat engine logs, HTTP headers, API configs, mod loading, and telemetry
    if lower_raw.contains("ushooterengine")
        || lower_raw.contains("loadgamemods")
        || lower_raw.contains("merging mod asset")
        || lower_raw.contains("primalgamedata")
        || lower_raw.contains("isserverpconly")
        || lower_raw.contains("logsentrysdk")
        || lower_raw.contains("sentry.io")
        || lower_raw.contains("sentry-native")
        || lower_raw.contains("crashpad")
        || lower_raw.contains("winhttp")
        || lower_raw.contains("package /")
        || lower_raw.contains("primalgamedataoverride")
        || lower_raw.contains("lognet")
        || lower_raw.contains("loghttp")
        || lower_raw.contains("access-control")
        || lower_raw.contains("cross-origin")
        || lower_raw.contains("1.1 google")
        || lower_raw.contains("cloudflare")
        || lower_raw.contains("defaultlanguage")
        || lower_raw.contains("maxconcurrentinstallations")
        || lower_raw.contains("modsdirectory")
        || lower_raw.contains("apikey")
        || lower_raw.contains("gameid")
        || lower_raw.contains("world save complete")
        || lower_raw.contains("world save took")
        || lower_raw.contains("server save loaded")
        || lower_raw.contains("sending envelope")
        || lower_raw.contains("using database path")
        || lower_raw.contains("http/1.")
        || lower_raw.contains("http/2")
    {
        return None;
    }

    // 2. Strip leading noise chars such as colons, quotes, spaces
    let mut check_str = line.trim_start_matches(|c: char| c == ':' || c == '"' || c == '\'' || c.is_whitespace());
    if check_str.is_empty() {
        return None;
    }

    // 3. Echo Prevention & Timestamp / Server Tag stripping:
    let is_log_format = check_str.starts_with('[');
    while check_str.starts_with('[') {
        if let Some(end_bracket) = check_str.find(']') {
            let inner = check_str[1..end_bracket].trim();
            // Is it a timestamp, frame count, or log index?
            if inner.starts_with("202")
                || inner.contains('-')
                || inner.contains('.')
                || inner.chars().all(|c| c.is_ascii_digit() || c.is_whitespace())
            {
                check_str = check_str[end_bracket + 1..].trim();
            } else {
                // It's a server tag like [Ragnarok], [Valguero], [Island], etc. -> ECHO! Ignore.
                return None;
            }
        } else {
            break;
        }
    }

    // Check if line contains an echoed server tag pattern like "[Island] Bob: ..."
    if line.contains("] ") || line.contains("] \"") || line.contains("]: ") {
        if let Some(close_pos) = line.find("] ") {
            if let Some(open_pos) = line[..close_pos].rfind('[') {
                let tag = &line[open_pos + 1..close_pos];
                if !tag.starts_with("202")
                    && !tag.chars().all(|c| c.is_ascii_digit() || c.is_whitespace())
                {
                    return None; // Echo detected!
                }
            }
        }
    }

    let mut cleaned = check_str;

    // 4. Strip secondary timestamp header e.g. "[  0]"
    if cleaned.starts_with('[') {
        if let Some(closing) = cleaned.find(']') {
            let inner = &cleaned[1..closing];
            if inner.starts_with("202")
                || inner.contains('-')
                || inner.contains('.')
                || inner.contains(':')
                || inner.contains('_')
                || inner.chars().all(|c| c.is_ascii_digit() || c.is_whitespace())
            {
                cleaned = cleaned[closing + 1..].trim();
            }
        }
    }

    // 5. Match and strip Log Category Prefixes:
    let mut has_chat_category = false;
    if cleaned.starts_with("LogServer:") {
        cleaned = cleaned[10..].trim();
        has_chat_category = true;
    } else if cleaned.starts_with("LogShooterGame: Display:") {
        cleaned = cleaned[24..].trim();
        has_chat_category = true;
    } else if cleaned.starts_with("LogShooterGame:") {
        cleaned = cleaned[15..].trim();
    } else if cleaned.starts_with("Server:") || cleaned.starts_with("SERVER:") {
        cleaned = cleaned[7..].trim();
        has_chat_category = true;
    } else if cleaned.starts_with("Chat:") || cleaned.starts_with("CHAT:") {
        cleaned = cleaned[5..].trim();
        has_chat_category = true;
    } else if cleaned.starts_with("GLOBAL:") || cleaned.starts_with("Global:") {
        cleaned = cleaned[7..].trim();
        has_chat_category = true;
    } else if cleaned.starts_with("LogChat:") {
        cleaned = cleaned[8..].trim();
        has_chat_category = true;
    }

    // If this line came from a log file (has timestamps), it MUST have a recognized chat category prefix!
    if is_log_format && !has_chat_category {
        return None;
    }

    // Trim again leading colons/quotes/spaces
    cleaned = cleaned.trim_start_matches(|c: char| c == ':' || c == '"' || c == '\'' || c.is_whitespace());

    // 6. Filter out commands, HTTP headers, and system noise
    let lower = cleaned.to_lowercase();
    if lower.starts_with("command:")
        || lower.starts_with("rcon:")
        || lower.starts_with("executing")
        || lower.starts_with("server received")
        || lower.starts_with("admincmd")
        || lower.starts_with("setmessage")
        || lower.starts_with("date:")
        || lower.starts_with("via:")
        || lower.starts_with("vary:")
        || lower.starts_with("content-")
        || lower.starts_with("user-agent:")
        || lower.starts_with("host:")
        || lower.starts_with("connection:")
        || lower.starts_with("accept:")
        || lower.starts_with("authorization:")
        || lower.starts_with("get ")
        || lower.starts_with("post ")
    {
        return None;
    }

    // 7. Parse "PlayerName: Message" or "PlayerName (TribeName): Message"
    let parts: Vec<&str> = cleaned.splitn(2, ':').collect();
    if parts.len() == 2 {
        let player = parts[0].trim().trim_matches('"').trim_matches('\'').trim_matches('[').trim_matches(']');
        let msg = parts[1].trim().trim_matches('"').trim_matches('\'');

        if player.is_empty() || msg.is_empty() {
            return None;
        }

        // Validate player name length and characters
        if player.len() > 32 || player.contains('{') || player.contains('}') || player.contains('"') || player.contains('\\') || player.contains('/') {
            return None;
        }

        let player_lower = player.to_lowercase();

        // Reject HTTP headers and config property names
        if player_lower == "date"
            || player_lower == "via"
            || player_lower == "vary"
            || player_lower == "host"
            || player_lower == "server"
            || player_lower == "admin"
            || player_lower == "system"
            || player_lower == "defaultlanguage"
            || player_lower == "gameid"
            || player_lower == "apikey"
            || player_lower == "provider"
            || player_lower == "maxconcurrentinstallations"
            || player_lower == "modsdirectory"
            || player_lower == "installedmods"
            || player_lower == "pendinginstalls"
            || player_lower.starts_with("log")
            || player_lower.contains("engine")
            || player_lower.contains("shooter")
            || player_lower.contains("sentry")
            || player_lower.contains("crashpad")
            || player_lower.contains("winhttp")
            || player_lower.contains("http")
            || player_lower.contains("origin")
            || player_lower.contains('-')
            || player_lower.contains('_') && player.chars().next().map_or(false, |c| c.is_lowercase())
        {
            return None;
        }

        // Reject Unreal Engine class names (e.g. UShooterEngine, UPrimalGameData, etc.)
        if player.starts_with('U') && player.chars().nth(1).map_or(false, |c| c.is_uppercase()) {
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
            cluster_cancels: Arc::new(Mutex::new(HashMap::new())),
            watchers: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
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

    #[test]
    fn test_parse_ark_chat_line_valid_player_chat() {
        let line = "[2026.08.04-10.00.00:123][  0]LogServer: Survivor1 (Tribe Alpha): Hello everyone!";
        let parsed = parse_ark_chat_line(line);
        assert_eq!(parsed, Some(("Survivor1 (Tribe Alpha)".to_string(), "Hello everyone!".to_string())));

        let rcon_line = "Bob: Looking for a giga mutation";
        let parsed_rcon = parse_ark_chat_line(rcon_line);
        assert_eq!(parsed_rcon, Some(("Bob".to_string(), "Looking for a giga mutation".to_string())));
    }

    #[test]
    fn test_parse_ark_chat_line_filters_sentry_and_engine_logs() {
        let sentry1 = ": [Ragnarok] LogSentrySdk: Verbose: sending envelope";
        assert_eq!(parse_ark_chat_line(sentry1), None);

        let sentry2 = ": \"[Valguero] \"[Extinction] \"[Astraeos] LogSentrySdk: using database path \"F:\\Astraeos\\ShooterGame\\.sentry-native\"\"\"\"\"";
        assert_eq!(parse_ark_chat_line(sentry2), None);

        let sentry3 = "LogSentrySdk: Verbose: sending envelope";
        assert_eq!(parse_ark_chat_line(sentry3), None);

        let http = ": [Genesis] cross-origin-resource-policy: cross-origin";
        assert_eq!(parse_ark_chat_line(http), None);

        let engine = "LogNet: NetConnection::Close()";
        assert_eq!(parse_ark_chat_line(engine), None);

        let mod_merge = ": 2026.08.05_10.02.39: SERVER: \"[Island] UShooterEngine: :LoadGameMods Merging mod asset Package /DinoDepot/PrimalGameData_BP_DinoDepot with PrimalGameDataOverride.";
        assert_eq!(parse_ark_chat_line(mod_merge), None);

        let pc_only = ": 2026.08.05_10.02.42: SERVER: \"[TheCenter] \"[Genesis] \"isServerPcOnly\": false,\"";
        assert_eq!(parse_ark_chat_line(pc_only), None);
    }

    #[test]
    fn test_parse_ark_chat_line_filters_echoed_server_tags() {
        let echo = "[Ragnarok] Bob: Hello from Ragnarok";
        assert_eq!(parse_ark_chat_line(echo), None);

        let echo2 = ": [Valguero] Alice: Hello from Valguero";
        assert_eq!(parse_ark_chat_line(echo2), None);
    }

    #[test]
    fn test_parse_ark_chat_line_filters_http_and_curseforge_spam() {
        assert_eq!(parse_ark_chat_line("Date: Tue, 01 Sep 2026 21:25:37 GMT"), None);
        assert_eq!(parse_ark_chat_line("Via: 1.1 google"), None);
        assert_eq!(parse_ark_chat_line("Vary: origin, access-control-request-method, access-control-request-headers"), None);
        assert_eq!(parse_ark_chat_line("defaultLanguage: en"), None);
        assert_eq!(parse_ark_chat_line("gameId: 83374"), None);
        assert_eq!(parse_ark_chat_line("apiKey: *****1aZe"), None);
        assert_eq!(parse_ark_chat_line("provider: None"), None);
        assert_eq!(parse_ark_chat_line("maxConcurrentInstallations: 3"), None);
        assert_eq!(parse_ark_chat_line("modsDirectory: ShooterGame/Mods"), None);
        assert_eq!(parse_ark_chat_line("\"defaultLanguage\": \"en\""), None);
        assert_eq!(parse_ark_chat_line("[Island] Date: Tue, 01 Sep 2026 21:25:37 GMT"), None);
    }
}

