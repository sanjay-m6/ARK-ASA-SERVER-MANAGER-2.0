//! Guardian Self-Healing System
//! Monitors server health, detects crashes, and auto-restarts failed servers

use std::collections::HashMap;
use std::sync::Arc;
use sysinfo::{Pid, System};
use tokio::sync::Mutex;

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
    /// Is the guardian running (currently unused)
    #[allow(dead_code)]
    is_running: Arc<Mutex<bool>>,
}

impl GuardianService {
    pub fn new() -> Self {
        Self {
            server_pids: Arc::new(Mutex::new(HashMap::new())),
            auto_restart_enabled: Arc::new(Mutex::new(HashMap::new())),
            crash_counts: Arc::new(Mutex::new(HashMap::new())),
            crash_log: Arc::new(Mutex::new(Vec::new())),
            is_running: Arc::new(Mutex::new(false)),
        }
    }

    /// Register a server PID for monitoring
    pub async fn register_server(&self, server_id: i64, pid: u32) {
        let mut pids = self.server_pids.lock().await;
        pids.insert(server_id, pid);
        println!(
            "🛡️ Guardian: Registered server {} with PID {}",
            server_id, pid
        );
    }

    /// Unregister a server from monitoring
    #[allow(dead_code)]
    pub async fn unregister_server(&self, server_id: i64) {
        let mut pids = self.server_pids.lock().await;
        pids.remove(&server_id);
        println!("🛡️ Guardian: Unregistered server {}", server_id);
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
    #[allow(dead_code)]
    pub async fn is_auto_restart_enabled(&self, server_id: i64) -> bool {
        let settings = self.auto_restart_enabled.lock().await;
        *settings.get(&server_id).unwrap_or(&false)
    }

    /// Get health status for a server
    pub async fn get_server_health(&self, server_id: i64) -> Option<ServerHealth> {
        let pids = self.server_pids.lock().await;
        let pid = pids.get(&server_id)?;

        let mut sys = System::new_all();
        sys.refresh_all();

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
    #[allow(dead_code)]
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
            "⚠️ Guardian: Crash detected for server {} - {}",
            server_id, reason
        );
    }

    /// Check if a process is running
    #[allow(dead_code)]
    pub fn is_process_alive(pid: u32) -> bool {
        let mut sys = System::new_all();
        sys.refresh_all();
        sys.process(Pid::from_u32(pid)).is_some()
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
}

impl Default for GuardianService {
    fn default() -> Self {
        Self::new()
    }
}

// Tauri Commands

use tauri::State;

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
    guardian: State<'_, GuardianState>,
    server_id: i64,
    pid: u32,
) -> Result<(), String> {
    let service = guardian.0.lock().await;
    service.register_server(server_id, pid).await;
    Ok(())
}
