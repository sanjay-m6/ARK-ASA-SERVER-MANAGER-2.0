//! Guardian Self-Healing System
//! Monitors server health, detects crashes, and auto-restarts failed servers with loop prevention

#![allow(dead_code)]
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use sysinfo::{Pid, System};
use tokio::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

/// Server health status
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerHealth {
    pub server_id: i64,
    pub is_alive: bool,
    pub last_seen: String,
    pub crash_count: u32,
    pub memory_mb: f64,
    pub cpu_percent: f32,
    pub auto_restart_enabled: bool,
    pub last_restart: Option<String>,
}

/// Crash event log
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashEvent {
    pub server_id: i64,
    pub server_name: String,
    pub timestamp: String,
    pub was_auto_restarted: bool,
    pub crash_reason: String,
}

/// Guardian service for monitoring and healing servers
pub struct GuardianService {
    /// Track server process IDs
    server_pids: Arc<Mutex<HashMap<i64, u32>>>,
    /// Track auto-restart settings per server
    auto_restart_enabled: Arc<Mutex<HashMap<i64, bool>>>,
    /// Track crash counts per server
    crash_counts: Arc<Mutex<HashMap<i64, u32>>>,
    /// Crash event log
    crash_log: Arc<Mutex<Vec<CrashEvent>>>,
    /// Crash timestamps history for loop prevention
    crash_history: Arc<Mutex<HashMap<i64, Vec<chrono::DateTime<chrono::Utc>>>>>,
    /// Track servers that are intentionally stopping (e.g. DoExit)
    pub stopping_servers: Arc<Mutex<HashSet<i64>>>,
    /// Is the watchdog actively running
    is_running: Arc<Mutex<bool>>,
}

impl GuardianService {
    pub fn new() -> Self {
        Self {
            server_pids: Arc::new(Mutex::new(HashMap::new())),
            auto_restart_enabled: Arc::new(Mutex::new(HashMap::new())),
            crash_counts: Arc::new(Mutex::new(HashMap::new())),
            crash_log: Arc::new(Mutex::new(Vec::new())),
            crash_history: Arc::new(Mutex::new(HashMap::new())),
            stopping_servers: Arc::new(Mutex::new(HashSet::new())),
            is_running: Arc::new(Mutex::new(false)),
        }
    }

    /// Register a server PID for monitoring and sync auto-restart from database
    pub async fn register_server(&self, app_handle: AppHandle, server_id: i64, pid: u32) {
        let mut pids = self.server_pids.lock().await;
        pids.insert(server_id, pid);
        println!(
            "🛡️ Guardian: Registered server {} with PID {}",
            server_id, pid
        );

        // Populate in-memory auto-restart settings cache from SQLite
        let mut auto_restart = false;
        if let Some(state) = app_handle.try_state::<crate::AppState>() {
            if let Ok(db_guard) = state.db.lock() {
                if let Ok(conn) = db_guard.get_connection() {
                    auto_restart = conn.query_row(
                        "SELECT auto_restart FROM servers WHERE id = ?",
                        [server_id],
                        |row| row.get::<_, i32>(0)
                    ).map(|v| v == 1).unwrap_or(false);
                }
            }
        }

        let mut settings = self.auto_restart_enabled.lock().await;
        settings.insert(server_id, auto_restart);
        println!(
            "🛡️ Guardian: Synced auto-restart setting for server {} as {}",
            server_id, auto_restart
        );
    }

    /// Unregister a server from monitoring
    pub async fn unregister_server(&self, server_id: i64) {
        let mut pids = self.server_pids.lock().await;
        pids.remove(&server_id);
        println!("🛡️ Guardian: Unregistered server {}", server_id);
    }

    /// Mark a server as intentionally stopping
    pub async fn mark_as_stopping(&self, server_id: i64) {
        let mut stopping = self.stopping_servers.lock().await;
        stopping.insert(server_id);
        println!("🛡️ Guardian: Marked server {} as intentionally stopping", server_id);
    }

    /// Enable/disable auto-restart for a server
    pub async fn set_auto_restart(&self, server_id: i64, enabled: bool) {
        let mut settings = self.auto_restart_enabled.lock().await;
        settings.insert(server_id, enabled);
        println!(
            "🛡️ Guardian: Auto-restart for server {} set to {}",
            server_id, enabled
        );
    }

    /// Check if auto-restart is enabled for a server
    pub async fn is_auto_restart_enabled(&self, server_id: i64) -> bool {
        let settings = self.auto_restart_enabled.lock().await;
        *settings.get(&server_id).unwrap_or(&false)
    }

    /// Get health status for a server
    pub async fn get_server_health(&self, server_id: i64) -> Option<ServerHealth> {
        let pids = self.server_pids.lock().await;
        let pid = pids.get(&server_id)?;

        let mut sys = System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

        let process = sys.process(Pid::from_u32(*pid));
        let is_alive = process.is_some();

        let (memory_mb, cpu_percent) = if let Some(p) = process {
            (p.memory() as f64 / 1_048_576.0, p.cpu_usage())
        } else {
            (0.0, 0.0)
        };

        let crash_counts = self.crash_counts.lock().await;
        let crash_count = *crash_counts.get(&server_id).unwrap_or(&0);

        let auto_restart = self.auto_restart_enabled.lock().await;
        let auto_restart_enabled = *auto_restart.get(&server_id).unwrap_or(&false);

        Some(ServerHealth {
            server_id,
            is_alive,
            last_seen: chrono::Utc::now().to_rfc3339(),
            crash_count,
            memory_mb,
            cpu_percent,
            auto_restart_enabled,
            last_restart: None,
        })
    }

    /// Get crash log
    pub async fn get_crash_log(&self) -> Vec<CrashEvent> {
        let log = self.crash_log.lock().await;
        log.clone()
    }

    /// Log a crash event
    pub async fn log_crash(
        &self,
        server_id: i64,
        server_name: &str,
        reason: &str,
        was_restarted: bool,
    ) {
        let mut log = self.crash_log.lock().await;
        log.push(CrashEvent {
            server_id,
            server_name: server_name.to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            was_auto_restarted: was_restarted,
            crash_reason: reason.to_string(),
        });

        // Keep only last 100 events
        if log.len() > 100 {
            log.remove(0);
        }

        let mut counts = self.crash_counts.lock().await;
        *counts.entry(server_id).or_insert(0) += 1;

        println!(
            "⚠️ Guardian: Crash logged for server {} ('{}') - {}",
            server_id, server_name, reason
        );
    }

    /// Get all monitored server health statuses
    pub async fn get_all_health(&self) -> Vec<ServerHealth> {
        let pids = self.server_pids.lock().await;
        let mut health = Vec::new();

        for server_id in pids.keys() {
            if let Some(h) = self.get_server_health(*server_id).await {
                health.push(h);
            }
        }

        health
    }

    /// Start the active watchdog background thread
    pub fn start_watchdog(&self, app_handle: AppHandle) {
        let mut running = match self.is_running.try_lock() {
            Ok(lock) => lock,
            Err(_) => return,
        };
        if *running {
            return;
        }
        *running = true;

        let server_pids = self.server_pids.clone();
        let auto_restart_enabled = self.auto_restart_enabled.clone();
        let crash_history = self.crash_history.clone();
        let stopping_servers = self.stopping_servers.clone();
        let self_service = Arc::new(Mutex::new(self.clone_ref()));

        tauri::async_runtime::spawn(async move {
            println!("🛡️ Guardian Watchdog: Self-healing and active process monitoring thread started.");
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(10)).await;

                let state = match app_handle.try_state::<crate::AppState>() {
                    Some(s) => s,
                    None => continue,
                };

                let mut pids_to_check = Vec::new();
                {
                    let pids = server_pids.lock().await;
                    for (&id, &pid) in pids.iter() {
                        pids_to_check.push((id, pid));
                    }
                }

                if pids_to_check.is_empty() {
                    continue;
                }

                // Query process statuses using lightweight sysinfo
                let mut sys = System::new();
                sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

                for (server_id, pid) in pids_to_check {
                    let process = sys.process(Pid::from_u32(pid));
                    let is_alive = process.is_some();

                    if !is_alive {
                        println!("🛡️ Guardian Watchdog: Server {} (PID {}) crashed or terminated!", server_id, pid);

                        // Stop tracking crashed PID to prevent duplicate restarts
                        {
                            let mut pids = server_pids.lock().await;
                            pids.remove(&server_id);
                        }

                        let is_intentionally_stopping = {
                            let mut stopping = stopping_servers.lock().await;
                            stopping.remove(&server_id)
                        };

                        let server_name = {
                            if let Ok(db_guard) = state.db.lock() {
                                if let Ok(conn) = db_guard.get_connection() {
                                    conn.query_row(
                                        "SELECT name FROM servers WHERE id = ?",
                                        [server_id],
                                        |row| row.get::<_, String>(0)
                                    ).unwrap_or_else(|_| format!("Server {}", server_id))
                                } else { format!("Server {}", server_id) }
                            } else { format!("Server {}", server_id) }
                        };

                        if is_intentionally_stopping {
                            println!("🛡️ Guardian Watchdog: Server '{}' ({}) shut down gracefully.", server_name, server_id);
                            
                            // Update status to stopped
                            if let Ok(db_guard) = state.db.lock() {
                                if let Ok(conn) = db_guard.get_connection() {
                                    let _ = conn.execute(
                                        "UPDATE servers SET status = 'stopped' WHERE id = ?",
                                        [server_id]
                                    );
                                    let _ = conn.execute(
                                        "UPDATE ase_servers SET status = 'stopped' WHERE id = ?",
                                        [server_id]
                                    );
                                }
                            }
                            
                            let _ = app_handle.emit("server-status-change", serde_json::json!({
                                "serverId": server_id,
                                "status": "stopped"
                            }));
                            
                            continue; // Skip crash logic
                        }

                        let auto_restart = {
                            let enabled = auto_restart_enabled.lock().await;
                            *enabled.get(&server_id).unwrap_or(&false)
                        };

                        if auto_restart {
                            // Check sliding-window crash limits (Loop Prevention)
                            let (max_crashes, window_mins) = {
                                if let Ok(db_guard) = state.db.lock() {
                                    if let Ok(conn) = db_guard.get_connection() {
                                        let max_c = conn.query_row(
                                            "SELECT value FROM settings WHERE key = 'loop_prevention_max_crashes'",
                                            [],
                                            |row| row.get::<_, String>(0)
                                        ).ok().and_then(|v| v.parse::<usize>().ok()).unwrap_or(3);

                                        let win_m = conn.query_row(
                                            "SELECT value FROM settings WHERE key = 'loop_prevention_time_window_mins'",
                                            [],
                                            |row| row.get::<_, String>(0)
                                        ).ok().and_then(|v| v.parse::<i64>().ok()).unwrap_or(15);

                                        (max_c, win_m)
                                    } else { (3, 15) }
                                } else { (3, 15) }
                            };

                            let mut history = crash_history.lock().await;
                            let timestamps = history.entry(server_id).or_insert_with(Vec::new);
                            let now = chrono::Utc::now();
                            timestamps.push(now);

                            // Keep only entries in the window
                            let cutoff = now - chrono::Duration::minutes(window_mins);
                            timestamps.retain(|&t| t > cutoff);

                            if timestamps.len() > max_crashes {
                                println!("🛡️ Guardian Watchdog: Loop Prevention triggered for server {}! {} crashes in {} mins. Auto-restart disabled.", server_id, timestamps.len(), window_mins);

                                // Disable in-memory state
                                {
                                    let mut enabled = auto_restart_enabled.lock().await;
                                    enabled.insert(server_id, false);
                                }

                                // Disable in DB & update status
                                if let Ok(db_guard) = state.db.lock() {
                                    if let Ok(conn) = db_guard.get_connection() {
                                        let _ = conn.execute(
                                            "UPDATE servers SET auto_restart = 0, status = 'crashed' WHERE id = ?",
                                            [server_id]
                                        );
                                    }
                                }

                                // Log crash event (not restarted due to loop prevention)
                                {
                                    let service = self_service.lock().await;
                                    service.log_crash(server_id, &server_name, "crashed (auto-restart aborted: crash loop prevention)", false).await;
                                }

                                // Emit alert event to frontend
                                let _ = app_handle.emit("server-health-alert", serde_json::json!({
                                    "serverId": server_id,
                                    "serverName": server_name,
                                    "type": "crash_loop_prevented",
                                    "message": format!("Crash loop detected! Auto-restart disabled for '{}' to prevent system degradation.", server_name)
                                }));
                            } else {
                                // Safe to restart!
                                println!("🛡️ Guardian Watchdog: Server '{}' restarting automatically.", server_name);

                                // Log crash event
                                {
                                    let service = self_service.lock().await;
                                    service.log_crash(server_id, &server_name, "unexpected shutdown (auto-restart triggered)", true).await;
                                }

                                // Update status to restarting in DB
                                if let Ok(db_guard) = state.db.lock() {
                                    if let Ok(conn) = db_guard.get_connection() {
                                        let _ = conn.execute(
                                            "UPDATE servers SET status = 'restarting' WHERE id = ?",
                                            [server_id]
                                        );
                                    }
                                }

                                // Trigger start_server asynchronously
                                let h = app_handle.clone();
                                tauri::async_runtime::spawn(async move {
                                    let _ = crate::commands::server::start_server(h, server_id, false).await;
                                });
                            }
                        } else {
                            // Auto restart is off, transition to crashed
                            println!("🛡️ Guardian Watchdog: Server '{}' is down, auto-restart is disabled.", server_name);
                            
                            if let Ok(db_guard) = state.db.lock() {
                                if let Ok(conn) = db_guard.get_connection() {
                                    let _ = conn.execute(
                                        "UPDATE servers SET status = 'crashed' WHERE id = ?",
                                        [server_id]
                                    );
                                }
                            }

                            // Log crash event
                            {
                                let service = self_service.lock().await;
                                service.log_crash(server_id, &server_name, "unexpected shutdown", false).await;
                            }
                        }
                    }
                }
            }
        });
    }

    /// Clone reference to fields (for async moving)
    fn clone_ref(&self) -> Self {
        Self {
            server_pids: self.server_pids.clone(),
            auto_restart_enabled: self.auto_restart_enabled.clone(),
            crash_counts: self.crash_counts.clone(),
            crash_log: self.crash_log.clone(),
            crash_history: self.crash_history.clone(),
            stopping_servers: self.stopping_servers.clone(),
            is_running: self.is_running.clone(),
        }
    }
}

impl Default for GuardianService {
    fn default() -> Self {
        Self::new()
    }
}

pub struct GuardianState(pub Arc<Mutex<GuardianService>>);

#[tauri::command]
pub async fn get_server_health(
    guardian: State<'_, GuardianState>,
    server_id: i64,
) -> Result<Option<ServerHealth>, String> {
    let service = guardian.0.lock().await;
    Ok(service.get_server_health(server_id).await)
}

#[tauri::command]
pub async fn get_all_server_health(
    guardian: State<'_, GuardianState>,
) -> Result<Vec<ServerHealth>, String> {
    let service = guardian.0.lock().await;
    Ok(service.get_all_health().await)
}

#[tauri::command]
pub async fn set_auto_restart(
    guardian: State<'_, GuardianState>,
    server_id: i64,
    enabled: bool,
) -> Result<(), String> {
    let service = guardian.0.lock().await;
    service.set_auto_restart(server_id, enabled).await;
    Ok(())
}

#[tauri::command]
pub async fn get_crash_log(guardian: State<'_, GuardianState>) -> Result<Vec<CrashEvent>, String> {
    let service = guardian.0.lock().await;
    Ok(service.get_crash_log().await)
}

#[tauri::command]
pub async fn register_server_pid(
    app_handle: AppHandle,
    guardian: State<'_, GuardianState>,
    server_id: i64,
    pid: u32,
) -> Result<(), String> {
    let service = guardian.0.lock().await;
    service.register_server(app_handle, server_id, pid).await;
    Ok(())
}
