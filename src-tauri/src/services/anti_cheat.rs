use crate::AppState;
use crate::commands::rcon::RconState; // Import RconState
use crate::utils::log_watcher::{LogWatcher, LogWatcherConfig};
use regex::Regex;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, Emitter}; // Import Emitter trait for emit
use tokio::sync::mpsc;
// use tokio::task::JoinHandle; // Unused

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AntiCheatConfig {
    pub enabled: bool,
    pub sensitivity: f32, // 1.0 = Normal, 0.5 = High Sensitivity (Strict), 2.0 = Low
    pub actions: ActionConfig,
    pub mesh_protection: MeshConfig,
    pub command_protection: CommandProtectionConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionConfig {
    pub log_only: bool,
    pub kick_enabled: bool,
    pub ban_enabled: bool,
    pub discord_alert: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeshConfig {
    pub enabled: bool,
    pub threshold: f32, // 0.6 default
    pub notify_player: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandProtectionConfig {
    pub enabled: bool,
    pub blacklisted_commands: Vec<String>,
    pub whitelist_admin_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViolationEvent {
    pub server_id: i64,
    pub player_name: String,
    pub steam_id: String,
    pub violation_type: String, // "Speed", "Fly", "Inventory"
    pub severity: f32,          // 0.0 - 1.0+
    pub details: String,
    pub timestamp: u64,
}

pub struct AntiCheatService {
    app_handle: AppHandle,
    config_cache: Arc<Mutex<HashMap<i64, AntiCheatConfig>>>, // Cache configs
    event_tx: mpsc::Sender<ViolationEvent>,
    event_rx: Arc<tokio::sync::Mutex<mpsc::Receiver<ViolationEvent>>>,
    watchers: Arc<Mutex<HashMap<i64, Arc<LogWatcher>>>>,
}

impl AntiCheatService {
    pub fn new(app_handle: AppHandle) -> Self {
        let (tx, rx) = mpsc::channel(100);

        Self {
            app_handle,
            config_cache: Arc::new(Mutex::new(HashMap::new())),
            event_tx: tx,
            event_rx: Arc::new(tokio::sync::Mutex::new(rx)),
            watchers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Start the processing loop
    pub fn start(&self) {
        let rx_mutex = self.event_rx.clone();
        let app_handle = self.app_handle.clone();
        let config_cache = self.config_cache.clone();

        tauri::async_runtime::spawn(async move {
            let mut rx = rx_mutex.lock().await;

            // println!("🛡️ Anti-Cheat Engine Started");

            while let Some(event) = rx.recv().await {
                Self::process_violation(&app_handle, &config_cache, event).await;
            }
        });
    }

    async fn process_violation(
        app_handle: &AppHandle,
        config_cache: &Arc<Mutex<HashMap<i64, AntiCheatConfig>>>,
        event: ViolationEvent,
    ) {
        // 1. Check Config
        let config = {
            let cache = config_cache.lock().unwrap();
            cache.get(&event.server_id).cloned()
        };

        // If no config found, or disabled, ignore
        let config = match config {
            Some(c) if c.enabled => c,
            _ => return, 
        };

        // 2. Evaluate Rule
        // Sensitivity acts as a THRESHOLD.
        // 0.5 = Strict (Low Threshold). 2.0 = Relaxed (High Threshold).
        // Violation if severity >= sensitivity.
        
        if event.severity < config.sensitivity {
            return; // Below threshold
        }
        
        let score = event.severity; // Score is just the severity for logging

        println!(
            "⚠️ Anti-Cheat Violation: {} ({}) - Score: {:.2}",
            event.player_name, event.violation_type, score
        );

        // 3. Take Actions

        // A. Log to DB
        {
            let state = app_handle.state::<AppState>();
            let db_guard = state.db.lock();
            if let Ok(db) = db_guard {
                if let Ok(conn) = db.get_connection() {
                     let _ = conn.execute(
                        "INSERT INTO anti_cheat_logs (server_id, player_name, steam_id, violation_type, severity, details, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                        params![
                            event.server_id,
                            event.player_name,
                            event.steam_id,
                            event.violation_type,
                            event.severity,
                            event.details,
                            event.timestamp as i64 
                        ],
                    );
                }
            }
        };

        // B. Discord Alert
        if config.actions.discord_alert {
            // Clone Arc inside block to drop State borrow immediately
            let discord_service = {
                let state = app_handle.state::<AppState>();
                state.discord_bridge.clone()
            };
            
            let alert_msg = format!("**ANTI-CHEAT ALERT**\n**Player:** {}\n**Violation:** {}\n**Details:** {}", event.player_name, event.violation_type, event.details);
            let _ = discord_service.send_to_discord("System", "Anti-Cheat", &alert_msg).await;
        }

        // C. RCON Action (Kick/Ban)
        if !config.actions.log_only {
            // Clone Arc inside block to drop State borrow immediately
            let rcon_state = app_handle.state::<RconState>();
            let rcon_service = &rcon_state.0;

            if config.actions.ban_enabled {
                println!("🔨 Banning player {}", event.player_name);
                let cmd = format!("BanPlayer {} \"Anti-Cheat Violation: {}\"", event.steam_id, event.violation_type);
                let _ = rcon_service.send_command(event.server_id, &cmd).await;
                
                let cmd_kick = format!("KickPlayer {} \"Banned for Anti-Cheat Violation\"", event.steam_id);
                let _ = rcon_service.send_command(event.server_id, &cmd_kick).await;

            } else if config.actions.kick_enabled {
                println!("🥾 Kicking player {}", event.player_name);
                let cmd = format!("KickPlayer {} \"Anti-Cheat Violation: {}\"", event.steam_id, event.violation_type);
                let _ = rcon_service.send_command(event.server_id, &cmd).await;
            }
        }

        // D. Notify Frontend
        let _ = app_handle.emit("anti-cheat://new-violation", event.clone());
    }

    /// Public API to report violations (from NgcCore or Mock)
    pub async fn report_violation(&self, event: ViolationEvent) {
        let _ = self.event_tx.send(event).await;
    }

    /// Update the config cache (called when config is saved via command)
    pub async fn update_cache(&self, server_id: i64, config: AntiCheatConfig) {
        {
            let mut cache = self.config_cache.lock().unwrap();
            cache.insert(server_id, config.clone());
        }
        println!("🛡️ Anti-Cheat config cache updated for server {}", server_id);

        // Update watcher if needed (start/stop)
        if config.enabled {
            self.ensure_watcher(server_id).await;
        } else {
            self.stop_watcher(server_id).await;
        }
    }

    /// Ensure a log watcher is running for the server
    pub async fn ensure_watcher(&self, server_id: i64) {
        let mut watchers = self.watchers.lock().unwrap();
        if watchers.contains_key(&server_id) {
            return;
        }

        // Get install path
        // Get install path
        let install_path = {
            let state = self.app_handle.state::<AppState>();
            let db = state.db.lock();
            if let Ok(db_guard) = db {
                if let Ok(conn) = db_guard.get_connection() {
                    let res: Result<String, _> = conn.query_row(
                        "SELECT install_path FROM servers WHERE id = ?1",
                        [server_id],
                        |row| row.get(0),
                    );
                    res.ok().map(PathBuf::from)
                } else {
                    None
                }
            } else {
                None
            }
        };

        if let Some(path) = install_path {
            let log_path = path.join("ShooterGame/Saved/Logs/ShooterGame.log");
            println!("🛡️ Anti-Cheat: Starting log watcher for server {} at {:?}", server_id, log_path);
            
            let watcher_config = LogWatcherConfig {
                poll_interval_ms: 1000,
            };
            
            let watcher = Arc::new(LogWatcher::new(log_path, Some(watcher_config)));
            let rx = watcher.start();
            
            watchers.insert(server_id, watcher.clone());
            
            // Spawn parser task
            let app_handle = self.app_handle.clone();
            let config_cache = self.config_cache.clone();
            let event_tx = self.event_tx.clone();
            
            tokio::spawn(async move {
                Self::process_log_stream(server_id, rx, app_handle, config_cache, event_tx).await;
            });
        }
    }

    /// Stop looking at logs for a server
    pub async fn stop_watcher(&self, server_id: i64) {
        let mut watchers = self.watchers.lock().unwrap();
        if let Some(watcher) = watchers.remove(&server_id) {
            watcher.stop();
            println!("🛡️ Anti-Cheat: Stopped log watcher for server {}", server_id);
        }
    }

    async fn process_log_stream(
        server_id: i64,
        mut rx: mpsc::Receiver<String>,
        _app_handle: AppHandle,
        config_cache: Arc<Mutex<HashMap<i64, AntiCheatConfig>>>,
        event_tx: mpsc::Sender<ViolationEvent>,
    ) {
        // Regex patterns
        // Example AdminCmd: [2024.02.05-12.00.00] AdminCmd: PlayerName (SteamID) executed command: Fly
        let cmd_regex = Regex::new(r"AdminCmd: (.*) \((\d+)\) executed command: (.*)").unwrap();
        
        // Example Mesh: [NgcCore] Player PlayerName (SteamID) tried to place structure inside mesh.
        // Note: Use a generic pattern that might match NgcCore logs
        let mesh_regex = Regex::new(r"\[NgcCore\] Player (.*) \((\d+)\) tried to place structure inside mesh").unwrap();

        while let Some(line) = rx.recv().await {
            // Check Config First
            let config = {
                let cache = config_cache.lock().unwrap();
                match cache.get(&server_id) {
                    Some(c) if c.enabled => c.clone(),
                    _ => continue,
                }
            };

            // 1. Check Command Protection
            if config.command_protection.enabled {
                if let Some(caps) = cmd_regex.captures(&line) {
                    let player_name = caps.get(1).map_or("", |m| m.as_str()).to_string();
                    let steam_id = caps.get(2).map_or("", |m| m.as_str()).to_string();
                    let command = caps.get(3).map_or("", |m| m.as_str()).trim().to_string();
                    
                    // Check if command is blacklisted
                    // Check if player is NOT whitelisted
                    let is_whitlisted = config.command_protection.whitelist_admin_ids.contains(&steam_id);
                    
                    // Case insensitive check for command
                    let is_blacklisted = config.command_protection.blacklisted_commands.iter().any(|c| c.eq_ignore_ascii_case(&command));

                    if !is_whitlisted && is_blacklisted {
                         let event = ViolationEvent {
                            server_id,
                            player_name,
                            steam_id,
                            violation_type: "Video/Command Abuse".to_string(), // Matches existing types or new
                            severity: 1.0, // High severity
                            details: format!("Used prohibited command: {}", command),
                            timestamp: chrono::Utc::now().timestamp() as u64,
                        };
                         let _ = event_tx.send(event).await;
                    }
                }
            }

            // 2. Check Mesh Protection
            if config.mesh_protection.enabled {
                 if let Some(caps) = mesh_regex.captures(&line) {
                    let player_name = caps.get(1).map_or("", |m| m.as_str()).to_string();
                    let steam_id = caps.get(2).map_or("", |m| m.as_str()).to_string();
                    
                    // Determine violation based on log
                    // NGC might drop it, but we want to log/ban if configured
                    let event = ViolationEvent {
                        server_id,
                        player_name,
                        steam_id,
                        violation_type: "UnderMesh/Structure".to_string(),
                        severity: 1.0, // Strict
                            details: "Attempted to place structure inside mesh".to_string(),
                        timestamp: chrono::Utc::now().timestamp() as u64,
                    };
                    let _ = event_tx.send(event).await;
                 }
            }
        }
    }

    /// Load all configs from database into cache on startup
    pub fn load_configs_from_db(&self) {
        // Fetch configs from DB first
        let loaded_configs = {
            let state = self.app_handle.state::<AppState>();
            let db = match state.db.lock() {
                Ok(guard) => guard,
                Err(_) => return,
            };
            let conn = match db.get_connection() {
                Ok(guard) => guard,
                Err(_) => return,
            };

            let mut stmt = match conn.prepare(
                "SELECT server_id, enabled, sensitivity, log_only, kick_enabled, ban_enabled, discord_alert, 
                        mesh_enabled, mesh_threshold, mesh_notify,
                        command_enabled, command_blacklisted, command_whitelist 
                 FROM anti_cheat_config"
            ) {
                Ok(s) => s,
                Err(_) => return,
            };

            let config_iter = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    AntiCheatConfig {
                        enabled: row.get::<_, i32>(1)? == 1,
                        sensitivity: row.get(2)?,
                        actions: ActionConfig {
                            log_only: row.get::<_, i32>(3)? == 1,
                            kick_enabled: row.get::<_, i32>(4)? == 1,
                            ban_enabled: row.get::<_, i32>(5)? == 1,
                            discord_alert: row.get::<_, i32>(6)? == 1,
                        },
                        mesh_protection: MeshConfig {
                            enabled: row.get::<_, i32>(7).unwrap_or(0) == 1,
                            threshold: row.get::<_, f32>(8).unwrap_or(0.6),
                            notify_player: row.get::<_, i32>(9).unwrap_or(1) == 1,
                        },
                        command_protection: CommandProtectionConfig {
                            enabled: row.get::<_, i32>(10).unwrap_or(0) == 1,
                            blacklisted_commands: row.get::<_, String>(11).unwrap_or_default().split(',').filter(|s| !s.is_empty()).map(|s| s.to_string()).collect(),
                            whitelist_admin_ids: row.get::<_, String>(12).unwrap_or_default().split(',').filter(|s| !s.is_empty()).map(|s| s.to_string()).collect(),
                        },
                    },
                ))
            });

            match config_iter {
                Ok(rows) => rows.filter_map(|r| r.ok()).collect::<Vec<_>>(),
                Err(_) => Vec::new(),
            }
        };

        // Update cache
        if !loaded_configs.is_empty() {
            let mut cache = self.config_cache.lock().unwrap();
            for (server_id, config) in loaded_configs {
                cache.insert(server_id, config);
            }
            println!("🛡️ Loaded {} anti-cheat configs from database", cache.len());
        }
    }
}
