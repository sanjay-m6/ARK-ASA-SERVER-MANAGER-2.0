use crate::AppState;
use tauri::{AppHandle, Manager};
use std::sync::Arc;
use tokio::sync::Mutex;
use std::collections::HashMap;
use std::time::Duration;
use serde::{Deserialize, Serialize};
use crate::services::mod_scraper;
use crate::services::process_manager::StopReason;
// chrono can be added back when maintenance window parsing is implemented
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchdogConfig {
    pub server_id: i64,
    pub enabled: bool,
    pub polling_interval_minutes: u64,
    pub safe_restart_mode: bool,
    pub maintenance_windows: Vec<String>, // e.g. "02:00-05:00"
}

impl Default for WatchdogConfig {
    fn default() -> Self {
        Self {
            server_id: 0,
            enabled: false,
            polling_interval_minutes: 60,
            safe_restart_mode: true,
            maintenance_windows: vec![],
        }
    }
}

pub struct ModWatchdogService {
    app_handle: AppHandle,
    configs: Arc<Mutex<HashMap<i64, WatchdogConfig>>>,
    // Tracks the last seen update date for a mod: server_id -> mod_id -> date_modified
    mod_state: Arc<Mutex<HashMap<i64, HashMap<i32, String>>>>,
    active_updates: Arc<Mutex<HashMap<i64, bool>>>,
}

impl ModWatchdogService {
    pub fn new(app_handle: AppHandle) -> Self {
        let service = Self {
            app_handle,
            configs: Arc::new(Mutex::new(HashMap::new())),
            mod_state: Arc::new(Mutex::new(HashMap::new())),
            active_updates: Arc::new(Mutex::new(HashMap::new())),
        };
        service
    }

    pub fn start_worker(&self) {
        let app_handle = self.app_handle.clone();
        let configs = self.configs.clone();
        let mod_state = self.mod_state.clone();
        let active_updates = self.active_updates.clone();

        tauri::async_runtime::spawn(async move {
            println!("🐕 [Watchdog] Background worker started.");
            let mut interval = tokio::time::interval(Duration::from_secs(60));

            loop {
                interval.tick().await;

                // Create a block to scope the AppState usage
                let servers_to_check: Vec<(i64, Vec<i32>)> = {
                    let mut results = Vec::new();
                    if let Some(state) = app_handle.try_state::<AppState>() {
                        if let Ok(db) = state.db.lock() {
                            if let Ok(conn) = db.get_connection() {
                                // Get all online or running servers
                                if let Ok(mut stmt) = conn.prepare("SELECT id, status FROM servers") {
                                    if let Ok(mut rows) = stmt.query([]) {
                                        while let Ok(Some(row)) = rows.next() {
                                            let id: i64 = row.get(0).unwrap();
                                            let status: String = row.get(1).unwrap();
                                            
                                            // Only check mods for running servers
                                            if status == "online" || status == "running" {
                                                // Get active mods from config DB or Game.ini.
                                                // We'll read from our server configs DB via standard approach.
                                                if let Ok(mods_str) = conn.query_row(
                                                    "SELECT active_mods FROM server_configs WHERE server_id = ?1",
                                                    [id],
                                                    |r| r.get::<_, String>(0)
                                                ) {
                                                    let mod_ids: Vec<i32> = mods_str
                                                        .split(',')
                                                        .filter_map(|s| s.trim().parse::<i32>().ok())
                                                        .collect();
                                                    
                                                    if !mod_ids.is_empty() {
                                                        results.push((id, mod_ids));
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    results
                };

                for (server_id, mod_ids) in servers_to_check {
                    // Check if watchdog is enabled for this server
                    let config = {
                        let cfgs = configs.lock().await;
                        cfgs.get(&server_id).cloned().unwrap_or_default()
                    };

                    if !config.enabled {
                        continue;
                    }

                    // Check if an update sequence is already active
                    {
                        let active = active_updates.lock().await;
                        if active.get(&server_id).cloned().unwrap_or(false) {
                            continue; // Skip, already updating
                        }
                    }

                    println!("🐕 [Watchdog] Checking {} mods for server {}...", mod_ids.len(), server_id);

                    // Fetch updates from CurseForge
                    match mod_scraper::check_mod_updates(mod_ids.clone(), None).await {
                        Ok(mod_infos) => {
                            let mut needs_update = false;
                            let mut updated_mods = Vec::new();

                            {
                                let mut state_lock = mod_state.lock().await;
                                let server_state = state_lock.entry(server_id).or_insert_with(HashMap::new);

                                for m in mod_infos {
                                    if let Some(date_str) = m.last_updated {
                                        let mod_id: i32 = m.id.parse().unwrap_or(0);
                                        if mod_id == 0 { continue; }

                                        if let Some(local_date) = server_state.get(&mod_id) {
                                            if &date_str != local_date {
                                                println!("🐕 [Watchdog] Mod {} update detected! ({} -> {})", m.name, local_date, date_str);
                                                needs_update = true;
                                                updated_mods.push(m.name.clone());
                                                server_state.insert(mod_id, date_str);
                                            }
                                        } else {
                                            // First time seeing this mod, record it
                                            server_state.insert(mod_id, date_str);
                                        }
                                    }
                                }
                            }

                            if needs_update {
                                println!("🐕 [Watchdog] Server {} requires an update for {} mods.", server_id, updated_mods.len());
                                
                                // Launch update orchestration in background
                                {
                                    let mut active = active_updates.lock().await;
                                    active.insert(server_id, true);
                                }
                                
                                let ah_clone = app_handle.clone();
                                let au_clone = active_updates.clone();
                                tokio::spawn(async move {
                                    Self::orchestrate_update(ah_clone, server_id, updated_mods).await;
                                    let mut active = au_clone.lock().await;
                                    active.insert(server_id, false);
                                });
                            }
                        }
                        Err(e) => {
                            println!("🐕 [Watchdog] Error checking mod updates for server {}: {}", server_id, e);
                        }
                    }
                }
            }
        });
    }

    pub async fn get_config(&self, server_id: i64) -> WatchdogConfig {
        let configs = self.configs.lock().await;
        configs.get(&server_id).cloned().unwrap_or(WatchdogConfig {
            server_id,
            enabled: false,
            polling_interval_minutes: 60,
            safe_restart_mode: true,
            maintenance_windows: vec![],
        })
    }

    pub async fn set_config(&self, server_id: i64, config: WatchdogConfig) {
        let mut configs = self.configs.lock().await;
        configs.insert(server_id, config);
    }

    async fn orchestrate_update(app_handle: AppHandle, server_id: i64, mods: Vec<String>) {
        println!("🔧 [Watchdog Orchestrator] Starting sequence for server {}", server_id);
        
        let rcon_state = app_handle.state::<crate::commands::rcon::RconState>();
        let rcon = &rcon_state.0;

        let (rcon_port, admin_password, ip_address, install_path) = {
            let state = app_handle.state::<AppState>();
            let db_lock = state.db.lock().unwrap();
            let conn = db_lock.get_connection().unwrap();
            conn.query_row(
                "SELECT rcon_port, admin_password, ip_address, install_path FROM servers WHERE id = ?1",
                [server_id],
                |row| Ok((
                    row.get::<_, u16>(0)?, 
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?.unwrap_or_else(|| "127.0.0.1".to_string()),
                    row.get::<_, String>(3)?
                ))
            ).unwrap_or((0, "".to_string(), "127.0.0.1".to_string(), "".to_string()))
        };

        if rcon_port > 0 {
            // Step 1: Warning Broadcasts
            if let Ok(_) = rcon.connect(server_id, &ip_address, rcon_port, &admin_password).await {
                let mod_names = mods.join(", ");
                let _ = rcon.broadcast(server_id, &format!("Mod update detected for: {}. Server will restart in 15 minutes.", mod_names)).await;
                tokio::time::sleep(Duration::from_secs(5 * 60)).await;

                let _ = rcon.broadcast(server_id, "Server will restart in 10 minutes for mod updates. Please wrap up your activities.").await;
                tokio::time::sleep(Duration::from_secs(5 * 60)).await;

                let _ = rcon.broadcast(server_id, "Server will restart in 5 minutes! Get to safety!").await;
                tokio::time::sleep(Duration::from_secs(4 * 60)).await;

                let _ = rcon.broadcast(server_id, "Server restarting in 1 minute for updates!").await;
                tokio::time::sleep(Duration::from_secs(60)).await;

                // Step 2: Graceful Save
                let _ = rcon.broadcast(server_id, "Saving world and shutting down...").await;
                let _ = rcon.save_world(server_id).await;
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        }

        // Step 3: Cache current mods for rollback
        let mods_dir = PathBuf::from(&install_path)
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64")
            .join("ShooterGame")
            .join("Saved")
            .join("Mods"); // Verify ASA path or use root ShooterGame/Mods
            
        let backup_dir = PathBuf::from(&install_path).join("ModBackups");
        if mods_dir.exists() {
            println!("📦 [Watchdog] Backing up mods folder for rollback protection...");
            let _ = std::fs::create_dir_all(&backup_dir);
            // Quick copy of directory
            if let Ok(entries) = std::fs::read_dir(&mods_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() && path.extension().unwrap_or_default() == "pak" {
                        if let Some(file_name) = path.file_name() {
                            let _ = std::fs::copy(&path, backup_dir.join(file_name));
                        }
                    }
                }
            }
        }

        // Step 4: Stop Server
        println!("🛑 [Watchdog] Stopping server {}...", server_id);
        let state = app_handle.state::<AppState>();
        let _ = state.process_manager.stop_server_with_reason(server_id, StopReason::UpdateRequired);

        // Wait for process to fully die
        tokio::time::sleep(Duration::from_secs(10)).await;

        // Step 5: Start Server
        println!("▶️ [Watchdog] Restarting server {} to apply mod updates...", server_id);
        // We use the start command to ensure it reads the latest config
        match crate::commands::server::start_server(app_handle.clone(), server_id, false).await {
            Ok(_) => println!("✅ [Watchdog] Server restart command issued successfully."),
            Err(e) => println!("❌ [Watchdog] Failed to restart server: {}", e)
        }

        // Discord Webhook
        let wh_handle = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            let name = crate::services::discord::get_server_name(&wh_handle, server_id);
            crate::services::discord::send_discord_webhook(
                &wh_handle,
                "serverStart",
                crate::services::discord::DiscordEmbed::custom(
                    "Mod Update Complete",
                    &format!("Server **{}** has been restarted to apply mod updates.", name),
                    3066993 // Green
                ),
            ).await;
        });
    }
}
