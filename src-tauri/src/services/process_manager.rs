use anyhow::{Context, Result};
use serde::Serialize;
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;
#[cfg(target_os = "windows")]
const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;

/// Reason why a server stop was initiated. Every stop must provide a reason.
#[derive(Debug, Clone, Serialize)]
pub enum StopReason {
    UserAction,
    ScheduledRestart,
    UpdateRequired,
    CrashDetected,
    StartupTimeout,
    SystemShutdown,
    AutoStop,
}

impl std::fmt::Display for StopReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StopReason::UserAction => write!(f, "USER_ACTION"),
            StopReason::ScheduledRestart => write!(f, "SCHEDULED_RESTART"),
            StopReason::UpdateRequired => write!(f, "UPDATE_REQUIRED"),
            StopReason::CrashDetected => write!(f, "CRASH_DETECTED"),
            StopReason::StartupTimeout => write!(f, "STARTUP_TIMEOUT"),
            StopReason::SystemShutdown => write!(f, "SYSTEM_SHUTDOWN"),
            StopReason::AutoStop => write!(f, "AUTO_STOP"),
        }
    }
}

/// Structured lifecycle event for audit trail
#[derive(Clone, Serialize)]
pub struct ServerLifecycleEvent {
    pub server_id: i64,
    pub event: String,
    pub reason: Option<String>,
    pub exit_code: Option<i32>,
    pub uptime_seconds: Option<u64>,
    pub timestamp: String,
}

use crate::services::discord::{send_discord_webhook, get_server_name, DiscordEmbed};
use crate::services::network;
use crate::AppState;
use tauri::Manager;

#[cfg(target_os = "windows")]
use std::os::windows::io::AsRawHandle;
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::Threading::{SetProcessAffinityMask, SetPriorityClass, HIGH_PRIORITY_CLASS, ABOVE_NORMAL_PRIORITY_CLASS, NORMAL_PRIORITY_CLASS, IDLE_PRIORITY_CLASS, BELOW_NORMAL_PRIORITY_CLASS};

#[cfg(target_os = "windows")]
mod window_hider {
    use std::sync::atomic::{AtomicU32, Ordering};
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowThreadProcessId, ShowWindow, SW_HIDE,
    };

    static TARGET_PID: AtomicU32 = AtomicU32::new(0);

    unsafe extern "system" fn enum_windows_callback(hwnd: HWND, _lparam: LPARAM) -> BOOL {
        let mut window_pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut window_pid);

        if window_pid == TARGET_PID.load(Ordering::SeqCst) {
            ShowWindow(hwnd, SW_HIDE);
        }
        1
    }

    pub fn hide_process_windows(pid: u32) {
        TARGET_PID.store(pid, Ordering::SeqCst);
        unsafe {
            EnumWindows(Some(enum_windows_callback), 0);
        }
    }

    pub fn show_process_window(pid: u32) {
        use windows_sys::Win32::UI::WindowsAndMessaging::{SetForegroundWindow, SW_SHOW, SW_RESTORE};

        unsafe extern "system" fn show_window_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let pid_ptr = lparam as *const u32;
            let target_pid = *pid_ptr;
            let mut window_pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, &mut window_pid);

            if window_pid == target_pid {
                // Show and restore the window (SW_RESTORE handles minimized windows too)
                ShowWindow(hwnd, SW_RESTORE);
                ShowWindow(hwnd, SW_SHOW);
                SetForegroundWindow(hwnd);
                // Don't stop — show ALL windows for this PID
            }
            1
        }

        unsafe {
            EnumWindows(Some(show_window_callback), &pid as *const _ as LPARAM);
        }
    }

    /// Show all windows belonging to any process with the given executable name
    pub fn show_windows_by_exe_name(exe_name: &str) {

        // Use WMIC/tasklist to find all PIDs matching the exe name
        let mut cmd = std::process::Command::new("tasklist");
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }

        let output = cmd
            .args(["/FI", &format!("IMAGENAME eq {}", exe_name), "/FO", "CSV", "/NH"])
            .output();

        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                // CSV format: "exe_name","PID","Session Name","Session#","Mem Usage"
                let parts: Vec<&str> = line.split(',').collect();
                if parts.len() >= 2 {
                    let pid_str = parts[1].trim().trim_matches('"');
                    if let Ok(pid) = pid_str.parse::<u32>() {
                        println!("  🖥️ Found {} with PID {}, showing its windows", exe_name, pid);
                        show_process_window(pid);
                    }
                }
            }
        }
    }
}

#[derive(Clone, Serialize)]
pub struct ServerLogEvent {
    pub server_id: i64,
    pub line: String,
    pub is_stderr: bool,
}

#[derive(Clone, Serialize)]
pub struct ModLoadFailureEvent {
    pub server_id: i64,
    pub error_type: String,
    pub details: String,
    pub suggestions: Vec<String>,
}

pub fn find_game_server_pid_by_install_path(install_path: &str, server_type: &str) -> Option<u32> {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let target_name = if server_type == "ASE" {
        "ShooterGameServer.exe"
    } else {
        "ArkAscendedServer.exe"
    };

    let norm_install = install_path.replace('\\', "/").to_lowercase();
    let install_parts: Vec<&str> = norm_install.split('/').filter(|s| !s.is_empty()).collect();
    if install_parts.is_empty() {
        return None;
    }

    for (pid, process) in sys.processes() {
        let name = process.name().to_string_lossy();
        if name.eq_ignore_ascii_case(target_name) {
            if let Some(exe_path) = process.exe() {
                let exe_str = exe_path.to_string_lossy().replace('\\', "/").to_lowercase();
                let exe_parts: Vec<&str> = exe_str.split('/').filter(|s| !s.is_empty()).collect();

                if exe_parts.len() >= install_parts.len() && exe_parts[..install_parts.len()] == install_parts[..] {
                    return Some(pid.as_u32());
                }
            }
        }
    }
    None
}

struct ServerProcess {
    child: Option<Child>,
    pid: u32,
    install_path: PathBuf,
    server_type: String,
    stop_flag: Arc<AtomicBool>,
    query_port: u16,
    started_at: std::time::Instant,
    is_online: bool,
    ip_address: Option<String>,
    startup_confirmed: Arc<AtomicBool>,
    has_been_online: bool,
}

pub struct ProcessManager {
    processes: Arc<Mutex<HashMap<i64, ServerProcess>>>,
    app_handle: AppHandle,
    /// Tracks the pending stop reason for each server (set before kill, cleared after)
    pending_stop_reasons: Arc<Mutex<HashMap<i64, StopReason>>>,
}

#[derive(Clone, Serialize)]
pub struct ServerStatusEvent {
    pub server_id: i64,
    pub status: String,
}

#[derive(Clone, Serialize)]
pub struct ServerStartupProgressEvent {
    pub server_id: i64,
    pub elapsed_seconds: u64,
    pub startup_confirmed: bool,
}

impl ProcessManager {
    pub fn new(app_handle: AppHandle) -> Self {
        let processes = Arc::new(Mutex::new(HashMap::new()));
        let pending_stop_reasons = Arc::new(Mutex::new(HashMap::new()));
        let pm = ProcessManager {
            processes: processes.clone(),
            app_handle: app_handle.clone(),
            pending_stop_reasons: pending_stop_reasons.clone(),
        };

        // Start background monitoring thread
        let monitor_processes = processes.clone();
        let monitor_handle = app_handle.clone();

        let monitor_stop_reasons = pending_stop_reasons.clone();
        std::thread::spawn(move || {
            loop {
                std::thread::sleep(std::time::Duration::from_secs(3)); // Check every 3s

                // Collect servers that need querying (running processes)
                let mut servers_to_query: Vec<(i64, String, u16)> = Vec::new();
                // 1. Check process status (Fast, holds lock)
                let crashed_servers = {
                    let mut p_lock = monitor_processes.lock().unwrap_or_else(|e| e.into_inner());
                    let mut to_remove: Vec<(i64, i32, u16, Option<String>, bool, bool)> = Vec::new();

                    for (id, proc) in p_lock.iter_mut() {
                        let mut has_exited = false;
                        let mut status_code = -1;

                        if let Some(ref mut child) = proc.child {
                            match child.try_wait() {
                                Ok(Some(status)) => {
                                    // Parent exited. Check if handoff exists first.
                                    if let Some(new_pid) = find_game_server_pid_by_install_path(&proc.install_path.to_string_lossy(), &proc.server_type) {
                                        println!("  🔄 [Handoff] Monitor: Handoff detected for server {}! Swapping tracking to PID {}.", id, new_pid);
                                        proc.pid = new_pid;
                                        proc.child = None;

                                        // Update process_id in DB
                                        if let Some(state) = monitor_handle.try_state::<AppState>() {
                                            if let Ok(db) = state.db.lock() {
                                                if let Ok(conn) = db.get_connection() {
                                                    let table = if proc.server_type == "ASE" { "ase_servers" } else { "servers" };
                                                    let _ = conn.execute(
                                                        &format!("UPDATE {} SET process_id = ?1 WHERE id = ?2", table),
                                                        rusqlite::params![new_pid, *id],
                                                    );
                                                }
                                            }
                                            // Update Guardian Watchdog
                                            if let Some(guardian) = monitor_handle.try_state::<crate::services::guardian::GuardianState>() {
                                                let guard = tauri::async_runtime::block_on(async { guardian.0.lock().await });
                                                if proc.server_type == "ASE" {
                                                    tauri::async_runtime::block_on(async {
                                                        guard.register_ase_server(monitor_handle.clone(), *id, new_pid).await;
                                                    });
                                                } else {
                                                    tauri::async_runtime::block_on(async {
                                                        guard.register_server(monitor_handle.clone(), *id, new_pid).await;
                                                    });
                                                }
                                            }
                                        }
                                    } else {
                                        has_exited = true;
                                        status_code = status.code().unwrap_or(-1);
                                    }
                                }
                                Ok(None) => {}
                                Err(e) => {
                                    println!("  ❌ Monitor failed to check server {}: {}", id, e);
                                }
                            }
                        } else {
                            // Tracking by system PID (child is None)
                            let is_alive = {
                                let mut sys = sysinfo::System::new();
                                sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
                                sys.process(sysinfo::Pid::from_u32(proc.pid)).is_some()
                            };
                            if !is_alive {
                                has_exited = true;
                                status_code = -1;
                            }
                        }

                        if has_exited {
                            let uptime = proc.started_at.elapsed().as_secs();

                            // Check if this was an authorized stop
                            let stop_reason = {
                                let mut reasons = monitor_stop_reasons.lock().unwrap_or_else(|e| e.into_inner());
                                reasons.remove(id)
                            };
                            let is_authorized = stop_reason.is_some();
                            let reason_str = stop_reason
                                .as_ref()
                                .map(|r| format!("{}", r))
                                .unwrap_or_else(|| "UNAUTHORIZED_TERMINATION".to_string());

                            println!(
                                "  [LIFECYCLE] Server {} exited | code: {} | uptime: {}s | reason: {}",
                                id, status_code, uptime, reason_str
                            );

                            // Emit lifecycle event for frontend audit trail
                            let _ = monitor_handle.emit(
                                "server-lifecycle-event",
                                ServerLifecycleEvent {
                                    server_id: *id,
                                    event: if status_code == 0 || is_authorized { "STOP".to_string() } else { "CRASH".to_string() },
                                    reason: Some(reason_str),
                                    exit_code: Some(status_code),
                                    uptime_seconds: Some(uptime),
                                    timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                                },
                            );

                            to_remove.push((*id, status_code, proc.query_port, proc.ip_address.clone(), proc.has_been_online, is_authorized));

                            // Signal log watcher to stop
                            proc.stop_flag.store(true, Ordering::SeqCst);
                        } else {
                            // Process is running. Add to query list.
                            let query_ip = proc.ip_address.clone().unwrap_or_else(|| "127.0.0.1".to_string());
                            servers_to_query.push((*id, query_ip, proc.query_port));
                        }
                    }

                    // Remove exited servers from the process list
                    for (id, _, _, _, _, _) in &to_remove {
                        p_lock.remove(id);
                    }
                    to_remove
                }; // Lock released

                // 2. Query Servers (Slow, NO lock)
                let mut status_updates: Vec<(i64, String)> = Vec::new();
                
                for (id, ip, port) in servers_to_query {
                    let mut is_reachable_query = network::query_server(&ip, port);
                    
                    // Fallback: If query failed and IP is not localhost, try localhost
                    if !is_reachable_query && ip != "127.0.0.1" && ip != "0.0.0.0" {
                         is_reachable_query = network::query_server("127.0.0.1", port);
                         if is_reachable_query {
                             println!("  ⚠️ Server {} reachable on localhost (fallback) but not on configured IP {}", id, ip);
                         }
                    }
                    
                    // Re-acquire lock to update state
                    // We must check if the process still exists (it might have been stopped/crashed in the meantime)
                    let mut p_lock = monitor_processes.lock().unwrap_or_else(|e| e.into_inner());
                    
                    if let Some(proc) = p_lock.get_mut(&id) {
                        let _message_startup_confirmed = proc.startup_confirmed.load(Ordering::Relaxed);
                        
                            // DETERMINE DESIRED STATUS
                            // If reachable via network OR logs confirm startup -> online
                            let startup_confirmed = proc.startup_confirmed.load(Ordering::Relaxed);
                            let is_reachable = is_reachable_query || startup_confirmed;
                        
                            // STATE TRANSITION LOGIC
                            if is_reachable && !proc.is_online {
                                 // Transition: Starting -> Online
                                 // Update DB first
                                 if let Some(state) = monitor_handle.try_state::<AppState>() {
                                    if let Ok(db) = state.db.lock() {
                                        if let Ok(conn) = db.get_connection() {
                                            match conn.execute(
                                                "UPDATE servers SET status = 'online' WHERE id = ?1",
                                                rusqlite::params![id],
                                            ) {
                                                Ok(_) => {
                                                    println!("  🟢 Server {} state persisted: ONLINE (Reachable: {}, Startup Logs: {})", id, is_reachable_query, startup_confirmed);
                                                    proc.is_online = true;
                                                    proc.has_been_online = true;
                                                    status_updates.push((id, "online".to_string()));
                                                    
                                                    // CRITICAL: Tell the dedicated webhook thread that we are online!
                                                    // If we reached here via network query before the log printed, we still want the webhook to fire.
                                                    if !startup_confirmed {
                                                        proc.startup_confirmed.store(true, Ordering::SeqCst);
                                                    }
                                                    // Monitor loop only handles state transition.
                                                },
                                                Err(e) => println!("  ❌ DB Update Failed for Server {}: {}", id, e),
                                            }
                                        } else {
                                            println!("  ❌ get_connection Failed for Server {}", id);
                                        }
                                    } else {
                                        println!("  ❌ db.lock Failed for Server {}", id);
                                    }
                                 } else {
                                     println!("  ❌ try_state Failed for Server {}", id);
                                 }
                            } else if !is_reachable && proc.is_online {
                                // Transition: Online -> Connection Lost
                                // CRITICAL: Only revert if startup was NOT confirmed (or if we want strict network checks).
                                // For now, if logs said "I'm ready", we trust it for a while even if UDP fails.
                                // BUT if the process is dead, it's handled by the crashed_servers block above.
                                // If process is alive but query fails + logs confirmed startup -> Keep Online.
                                if startup_confirmed {
                                     // Do nothing, trust the logs.
                                     // Maybe log a warning?
                                     // println!("  ⚠️ Server {} query failed but startup confirmed. Keeping ONLINE.", id);
                                } else if let Some(state) = monitor_handle.try_state::<AppState>() {
                                   if let Ok(db) = state.db.lock() {
                                       if let Ok(conn) = db.get_connection() {
                                           match conn.execute(
                                               "UPDATE servers SET status = 'running' WHERE id = ?1",
                                               rusqlite::params![id],
                                           ) {
                                               Ok(_) => {
                                                   println!("  ⚠️ Server {} lost connection and startup not confirmed", id);
                                                   proc.is_online = false;
                                                   status_updates.push((id, "running".to_string()));
                                               },
                                               Err(e) => println!("  ❌ DB Update Failed for Server {}: {}", id, e),
                                           }
                                       }
                                   }
                                }
                            }
                        
                        // Stuck in "Starting" check with TIMEOUT
                        // We only enforce timeout if the sever has NEVER been online. 
                        // If it came online and then dropped, it's just "running"/disconnected, not stuck starting.
                        if !proc.has_been_online {
                            let uptime = proc.started_at.elapsed();
                            let uptime_secs = uptime.as_secs();
                            
                            // Emit startup progress every 30 seconds
                            if uptime_secs % 30 == 0 {
                                let startup_confirmed = proc.startup_confirmed.load(Ordering::Relaxed);
                                let _ = monitor_handle.emit(
                                    "server-startup-progress",
                                    ServerStartupProgressEvent {
                                        server_id: id,
                                        elapsed_seconds: uptime_secs,
                                        startup_confirmed,
                                    },
                                );
                            }

                            // Timeout Logic
                            let startup_confirmed = proc.startup_confirmed.load(Ordering::Relaxed);
                            
                            // Fetch timeout from DB (cached/fetched per loop for simplicity)
                            let mut startup_timeout_limit = 1200; // Default 20m (ARK + mods can take very long)
                            if let Some(state) = monitor_handle.try_state::<AppState>() {
                                if let Ok(db) = state.db.lock() {
                                    if let Ok(Some(val)) = db.get_setting("startup_timeout") {
                                        if let Ok(v) = val.parse::<u64>() {
                                            startup_timeout_limit = v;
                                        }
                                    }
                                }
                            }

                            // If startup confirmed, we allow much longer (1 hour) before considering it "stuck"
                            // If not confirmed, we use the user-defined startup timeout
                            let timeout_limit = if startup_confirmed { 3600 } else { startup_timeout_limit };

                            if uptime_secs > timeout_limit {
                                // SAFETY: Before killing, do a final network check.
                                // If the server is actually responding, mark it online instead of killing.
                                let query_port = proc.query_port;
                                let final_check_reachable = crate::services::network::query_server("127.0.0.1", query_port);

                                if final_check_reachable {
                                    println!("  ✅ [LIFECYCLE] Server {} passed FINAL reachability check at {}s — marking online instead of killing.", id, uptime_secs);
                                    proc.startup_confirmed.store(true, Ordering::SeqCst);
                                    proc.is_online = true;
                                    proc.has_been_online = true;
                                    status_updates.push((id, "online".to_string()));
                                } else {
                                    println!("  [LIFECYCLE] Server {} STARTUP_TIMEOUT after {}s (final check also failed). Killing process.", id, uptime_secs);
                                    // Register the stop reason before killing
                                    {
                                        let mut reasons = monitor_stop_reasons.lock().unwrap_or_else(|e| e.into_inner());
                                        reasons.insert(id, StopReason::StartupTimeout);
                                    }
                                    // Kill Process
                                    let pid = proc.pid;
                                    #[cfg(target_os = "windows")]
                                    {
                                        let _ = Command::new("taskkill")
                                            .args(["/F", "/T", "/PID", &pid.to_string()])
                                            .creation_flags(CREATE_NO_WINDOW)
                                            .output();
                                    }
                                    if let Some(ref mut child) = proc.child {
                                        let _ = child.kill();
                                    }
                                    
                                    // FORCE status update to 'startup_timeout' immediately so UI knows WHY it died
                                    if let Some(state) = monitor_handle.try_state::<AppState>() {
                                        if let Ok(db) = state.db.lock() {
                                            if let Ok(conn) = db.get_connection() {
                                                let _ = conn.execute(
                                                    "UPDATE servers SET status = 'startup_timeout' WHERE id = ?1",
                                                    rusqlite::params![id],
                                                );
                                            } else {
                                                println!("  ❌ get_connection Failed format for timeout Server {}", id);
                                            }
                                        } else {
                                            println!("  ❌ db.lock Failed for timeout Server {}", id);
                                        }
                                    } else {
                                        println!("  ❌ try_state Failed for timeout Server {}", id);
                                    }

                                    // Emit specific timeout event
                                    let _ = monitor_handle.emit(
                                        "server-status-change",
                                        ServerStatusEvent {
                                            server_id: id,
                                            status: "startup_timeout".to_string(),
                                        },
                                    );
                                }
                            } else if uptime_secs > 300 && uptime_secs % 60 == 0 {
                                 println!("  ⏳ Server {} still starting... ({}s)", id, uptime_secs);
                            }
                        }
                    }
                } // Lock released after updating this server

                // Emit status updates for Online/Running toggles
                for (id, status) in status_updates {
                    let _ = monitor_handle.emit(
                        "server-status-change",
                        ServerStatusEvent {
                            server_id: id,
                            status: status.clone(),
                        },
                    );
                     // Update DB status to persist "online" vs "starting"
                    if let Some(state) = monitor_handle.try_state::<AppState>() {
                        if let Ok(db) = state.db.lock() {
                            if let Ok(conn) = db.get_connection() {
                                match conn.execute(
                                    "UPDATE servers SET status = ?1 WHERE id = ?2",
                                    rusqlite::params![status, id],
                                ) {
                                    Ok(_) => {
                                        println!("  ✅ DB Updated: Server {} -> {}", id, status);
                                        if status == "online" {
                                            let app_handle_clone = monitor_handle.clone();
                                            tauri::async_runtime::spawn(async move {
                                                crate::services::scheduler::SchedulerService::run_online_tasks(&app_handle_clone, id).await;
                                            });
                                        }
                                    }
                                    Err(e) => println!("  ❌ DB Update Failed for Server {}: {}", id, e),
                                }
                            } else {
                                println!("  ❌ Failed to get DB connection for status update");
                            }
                        } else {
                            println!("  ❌ Failed to lock DB for status update");
                        }
                    } else {
                         println!("  ❌ Failed to get AppState for status update");
                    }
                }

                // Now process crashed servers without holding the lock
                for (id, exit_code, query_port, ip_address, _has_been_online, is_authorized) in crashed_servers {
                    // Determine status based on exit code and authorization
                    // Exit code 0 = normal stop, anything else = crash/error
                    // CRITICAL UE5 (ARK ASA) process handoff check:
                    // If the parent/launcher process exited (even with code 0 or 1), but the actual
                    // game server is still active (reachable on query port or port is still bound),
                    // this is an authorized process handoff, NOT a crash/stop.
                    let status = if is_authorized {
                        "stopped"
                    } else {
                        // Check if the server is still reachable (child process took over)
                        let query_ip = ip_address.as_deref().unwrap_or("127.0.0.1");
                        let still_reachable = network::query_server(query_ip, query_port)
                            || network::query_server("127.0.0.1", query_port);

                        // Also check if ArkAscendedServer.exe is still using our ports
                        let port_still_bound = network::is_port_in_use(query_port);

                        if still_reachable {
                            println!(
                                "  ✅ [UE5-FIX] Server {} exited (code {}) but server is STILL REACHABLE on port {}. Not a crash/stop — UE5 process handoff. Keeping ONLINE.",
                                id, exit_code, query_port
                            );
                            "online" // Server is alive and responding, keep it online
                        } else if port_still_bound {
                            println!(
                                "  ⚠️ [UE5-FIX] Server {} exited (code {}) but port {} is still bound. Server still running — keeping ONLINE.",
                                id, exit_code, query_port
                            );
                            "online" // Port is in use, server process still alive
                        } else if exit_code == 0 {
                            "stopped" // Clean exit without being authorized and not running
                        } else {
                            println!(
                                "  💥 Server {} genuinely crashed (code {}, port {} free, not reachable).",
                                id, exit_code, query_port
                            );
                            "crashed"
                        }
                    };

                    println!(
                        "  📢 Server {} status changed to '{}' (exit code: {})",
                        id, status, exit_code
                    );

                    // Send Discord webhook for crash
                    if exit_code != 0 {
                        let wh_handle = monitor_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            let name = get_server_name(&wh_handle, id);
                            send_discord_webhook(
                                &wh_handle,
                                "serverCrash",
                                DiscordEmbed::server_crashed(&name, exit_code),
                            ).await;
                        });
                    }

                    // Emit status change event
                    let _ = monitor_handle.emit(
                        "server-status-change",
                        ServerStatusEvent {
                            server_id: id,
                            status: status.to_string(),
                        },
                    );

                    // Update database status
                    if let Some(state) = monitor_handle.try_state::<AppState>() {
                        if let Ok(db) = state.db.lock() {
                            if let Ok(conn) = db.get_connection() {
                                let mut db_status = status.to_string();
                                
                                // CRITICAL FIX: If the server was killed due to startup timeout, do NOT overwrite the status with "stopped" or "crashed".
                                // We check the current status in DB first.
                                let current_db_status: Result<String, _> = conn.query_row(
                                    "SELECT status FROM servers WHERE id = ?1",
                                    [id],
                                    |row| row.get(0),
                                );

                                if let Ok(current) = current_db_status {
                                    if current == "startup_timeout" {
                                        println!("  ⚠️ Server {} was marked as startup_timeout, preserving that status instead of {}", id, db_status);
                                        db_status = "startup_timeout".to_string();
                                    }
                                }

                                match conn.execute(
                                    "UPDATE servers SET status = ?1 WHERE id = ?2",
                                    rusqlite::params![db_status, id],
                                ) {
                                    Ok(_) => {
                                        println!(
                                            "  ✅ Database status updated for server {} to '{}'",
                                            id, db_status
                                        );
                                    }
                                    Err(e) => {
                                        println!("  ❌ Failed to update database status for server {}: {}", id, e);
                                    }
                                }
                            }
                        }
                    }

                    // Emit a server crash/stop notification event for the UI
                    let _ = monitor_handle.emit(
                        "server_log",
                        ServerLogEvent {
                            server_id: id,
                            line: format!(
                                "[Manager] Server process exited with code {}. Status: {}",
                                exit_code, 
                                status
                            ),
                            is_stderr: exit_code != 0,
                        },
                    );

                }

                // Check for stuck servers (Running but not online for > 15 mins)
                // TODO: Implement this using a timestamp check if needed
            }
        });

        pm
    }

    fn emit_status_change(&self, server_id: i64, status: &str) {
        let _ = self.app_handle.emit(
            "server-status-change",
            ServerStatusEvent {
                server_id,
                status: status.to_string(),
            },
        );
    }

    /// Start ARK server
    pub fn start_server(
        &self,
        server_id: i64,
        server_type: &str,
        install_path: &PathBuf,
        map_name: &str,
        session_name: &str,
        game_port: u16,
        query_port: u16,
        rcon_port: u16,
        max_players: i32,
        _server_password: Option<&str>,
        _admin_password: &str,
        ip_address: Option<&str>,
        cluster_id: Option<&str>,
        cluster_dir: Option<&str>,
        mods: Option<&[String]>,
        custom_args: Option<&str>,
        battleye_enabled: bool,
    ) -> Result<()> {
        let win64_dir = install_path
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64");

        let executable = if server_type == "ASE" {
            win64_dir.join("ShooterGameServer.exe")
        } else {
            // First check for ASA API Loader
            let api_loader = win64_dir.join("AsaApiLoader.exe");
            let api_dir = win64_dir.join("ArkApi");

            // ASA Server API requires AsaApiLoader.exe and the ArkApi folder to be present
            if api_loader.exists() && api_dir.exists() {
                api_loader
            } else {
                win64_dir.join("ArkAscendedServer.exe")
            }
        };

        // Guard: reject duplicate starts — if the process is already tracked, bail immediately.
        {
            let procs = self.processes.lock().unwrap_or_else(|e| e.into_inner());
            if procs.contains_key(&server_id) {
                return Err(anyhow::anyhow!(
                    "Server {} is already running. Ignoring duplicate start request.",
                    server_id
                ));
            }
        }

        if !executable.exists() {
            return Err(anyhow::anyhow!(
                "Server executable not found at {:?}",
                executable
            ));
        }

        // Check ports before starting
        if network::is_port_in_use(game_port) {
            return Err(anyhow::anyhow!(
                "Game Port {} is already in use by another application.",
                game_port
            ));
        }
        if network::is_port_in_use(query_port) {
            return Err(anyhow::anyhow!(
                "Query Port {} is already in use by another application.",
                query_port
            ));
        }
        if network::is_port_in_use(rcon_port) {
            return Err(anyhow::anyhow!(
                "RCON Port {} is already in use by another application.",
                rcon_port
            ));
        }

        // Log file path
        let log_file_path = install_path
            .join("ShooterGame")
            .join("Saved")
            .join("Logs")
            .join("ShooterGame.log");

        // Build launch arguments
        // Wrap session name in quotes so spaces are preserved and parsed correctly by the engine
        let mut connection_url = format!("{}?listen", map_name);
        connection_url.push_str(&format!("?SessionName=\"{}\"", session_name));
        connection_url.push_str(&format!("?Port={}", game_port));
        connection_url.push_str(&format!("?QueryPort={}", query_port));
        connection_url.push_str(&format!("?RCONPort={}", rcon_port));
        if rcon_port > 0 {
            connection_url.push_str("?RCONEnabled=True");
        }
        connection_url.push_str(&format!("?MaxPlayers={}", max_players));
        
        // Note: ServerAdminPassword and ServerPassword are intentionally NOT passed
        // on the command line. They are already written to GameUserSettings.ini.
        // Passing them here causes a known ARK engine bug where the URL parser
        // merges them into a corrupted string and saves it back to the INI file.

        let mut args = vec![connection_url];

        args.push("-log".to_string());
        args.push("-servergamelog".to_string());
        if !battleye_enabled {
            args.push("-NoBattlEye".to_string());
        }

        // Add MaxPlayers as a launch argument (Required for ASA)
        args.push(format!("-WinLiveMaxPlayers={}", max_players));

        // Add MultiHome for IP binding
        if let Some(ip) = ip_address {
            if !ip.is_empty() {
                args.push(format!("-MultiHome={}", ip));
            }
        }

        // Add cluster configuration for cross-ARK travel
        if let (Some(cid), Some(cdir)) = (cluster_id, cluster_dir) {
            if !cid.is_empty() && !cdir.is_empty() {
                args.push(format!("-clusterid={}", cid));
                args.push(format!("-ClusterDirOverride={}", cdir));
                println!(
                    "  🔗 Server {} joining cluster: {} at {}",
                    server_id, cid, cdir
                );
            }
        }

        // Pre-flight: Clean corrupt mod cache directories before launch
        if let Some(mod_list) = mods {
            if !mod_list.is_empty() {
                let mods_dir = install_path
                    .join("ShooterGame")
                    .join("Binaries")
                    .join("Win64")
                    .join("ShooterGame")
                    .join("Content")
                    .join("Mods");
                for mod_id in mod_list {
                    let mod_path = mods_dir.join(mod_id);
                    if mod_path.exists() && mod_path.is_dir() {
                        // Check if the mod directory has any .pak files and is not suspiciously tiny
                        let has_pak = std::fs::read_dir(&mod_path)
                            .map(|entries| {
                                entries.filter_map(|e| e.ok()).any(|e| {
                                    e.path().extension().map_or(false, |ext| ext == "pak")
                                })
                            })
                            .unwrap_or(false);
                        let total_size: u64 = std::fs::read_dir(&mod_path)
                            .map(|entries| {
                                entries
                                    .filter_map(|e| e.ok())
                                    .filter_map(|e| e.metadata().ok())
                                    .map(|m| m.len())
                                    .sum()
                            })
                            .unwrap_or(0);

                        if !has_pak || total_size < 1024 {
                            println!(
                                "  🧹 Cleaning corrupt mod cache for {} (has_pak={}, size={}B) — CFCore will re-download",
                                mod_id, has_pak, total_size
                            );
                            let _ = std::fs::remove_dir_all(&mod_path);
                        }
                    }
                }

                let mods_string = mod_list.join(",");
                args.push(format!("-mods={}", mods_string));
                println!(
                    "  🧩 Server {} loading {} mods: {}",
                    server_id,
                    mod_list.len(),
                    mods_string
                );
            }
        }

        // Automatically check GameUserSettings.ini for Culture setting and append -culture arg
        let sub_dir = if server_type == "ASE" { "WindowsServer" } else { "WindowsServer" };
        let gus_path = install_path
            .join("ShooterGame")
            .join("Saved")
            .join("Config")
            .join(sub_dir)
            .join("GameUserSettings.ini");

        if gus_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&gus_path) {
                let mut in_server_settings = false;
                for line in content.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with('[') && trimmed.ends_with(']') {
                        in_server_settings = &trimmed[1..trimmed.len() - 1] == "ServerSettings";
                        continue;
                    }
                    if in_server_settings {
                        if let Some((key, value)) = trimmed.split_once('=') {
                            let key = key.trim();
                            let value = value.trim();
                            if key == "Culture" && !value.is_empty() {
                                println!("  🌐 Auto-detected Culture from GameUserSettings.ini: {}", value);
                                args.push(format!("-culture={}", value));
                                break;
                            }
                        }
                    }
                }
            }
        }

        // Add custom launch arguments — strip -mods= to prevent conflicts with manager-generated list,
        // parse quotes correctly, and append URL parameters (?) to the map connection string.
        if let Some(custom) = custom_args {
            if !custom.is_empty() {
                let mut custom_parts = Vec::new();
                let mut current_arg = String::new();
                let mut in_quotes = false;
                
                for c in custom.chars() {
                    match c {
                        '"' | '\'' => in_quotes = !in_quotes,
                        ' ' | '\t' if !in_quotes => {
                            if !current_arg.is_empty() {
                                custom_parts.push(current_arg.clone());
                                current_arg.clear();
                            }
                        }
                        _ => current_arg.push(c),
                    }
                }
                if !current_arg.is_empty() {
                    custom_parts.push(current_arg);
                }

                for s in custom_parts {
                    let lower = s.to_lowercase();
                    if lower.starts_with("-mods=") {
                        let has_managed_mods = match mods {
                            Some(m) => !m.is_empty(),
                            None => false,
                        };
                        if has_managed_mods {
                            println!(
                                "  ⚠️ Stripped conflicting -mods= from custom_args for server {} (mods are managed automatically)",
                                server_id
                            );
                        } else {
                            println!(
                                "  🧩 Preserved custom -mods= from custom_args for server {} (no active mods in manager)",
                                server_id
                            );
                            args.push(s);
                        }
                    } else if s.starts_with('?') {
                        // Append URL parameters to the connection URL (args[0])
                        args[0].push_str(&s);
                        println!("  🔗 Appended URL parameter to connection string: {}", s);
                    } else {
                        args.push(s);
                    }
                }
            }
        }

        println!("  🚀 Executing Command: {:?} {:?}", executable, args);

        println!("  📂 Setting Working Directory: {:?}", win64_dir);

        let mut command = Command::new(&executable);
        command
            .current_dir(&win64_dir)
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Spawn in a new process group so the server survives if the manager exits without showing a console window
        #[cfg(target_os = "windows")]
        command.creation_flags(CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);

        let mut child = command.spawn().context("Failed to start server process")?;
                let child_pid = child.id();

        // [NEW] Apply Hardware Allocation (CPU Affinity & Priority)
        #[cfg(target_os = "windows")]
        {
            if let Some(state) = self.app_handle.try_state::<AppState>() {
                if let Ok(db) = state.db.lock() {
                    if let Ok(conn) = db.get_connection() {
                        let stmt = conn.prepare("SELECT use_all_cores, cpu_affinity, process_priority FROM hardware_allocation WHERE server_id = ?1");
                        if let Ok(mut stmt) = stmt {
                            let result = stmt.query_row([server_id], |row| {
                                Ok((
                                    row.get::<_, i32>(0)? != 0,
                                    row.get::<_, String>(1).unwrap_or_else(|_| "[]".to_string()),
                                    row.get::<_, String>(2).unwrap_or_else(|_| "Normal".to_string()),
                                ))
                            });
                            
                            if let Ok((use_all_cores, cpu_affinity_json, process_priority)) = result {
                                let handle = child.as_raw_handle() as *mut std::ffi::c_void;
                                
                                // Apply Priority
                                let priority_flag = match process_priority.as_str() {
                                    "RealTime" => {
                                        // REALTIME_PRIORITY_CLASS is extremely dangerous in Windows.
                                        // It preempts operating system threads, input drivers, disk cache flushes, and thermal control threads.
                                        // This can lead to system freezes, watchdog timeouts, or complete thermal shutdowns.
                                        // For safety and system stability, we downgrade RealTime to High priority.
                                        println!("  ⚠️ [SAFETY-FIX] Downgrading RealTime process priority to High to prevent Windows freezing/shutdown.");
                                        HIGH_PRIORITY_CLASS
                                    }
                                    "High" => HIGH_PRIORITY_CLASS,
                                    "AboveNormal" => ABOVE_NORMAL_PRIORITY_CLASS,
                                    "BelowNormal" => BELOW_NORMAL_PRIORITY_CLASS,
                                    "Idle" => IDLE_PRIORITY_CLASS,
                                    _ => NORMAL_PRIORITY_CLASS,
                                };
                                unsafe { SetPriorityClass(handle, priority_flag) };
                                
                                // Apply Affinity
                                if !use_all_cores {
                                    if let Ok(cores) = serde_json::from_str::<Vec<usize>>(&cpu_affinity_json) {
                                        if !cores.is_empty() {
                                            let mut mask: usize = 0;
                                            for core in cores {
                                                if core < 64 {
                                                    mask |= 1usize << core;
                                                }
                                            }
                                            if mask > 0 {
                                                unsafe { SetProcessAffinityMask(handle, mask) };
                                                println!("  ✅ Applied CPU Affinity Mask: {} for Server {}", mask, server_id);
                                            }
                                        }
                                    }
                                }
                                println!("  ✅ Applied Process Priority: {} for Server {}", process_priority, server_id);
                            }
                        }
                    }
                }
            }
        }

        // Create startup confirmed flag (Moved up to share with stdout thread)
        let startup_confirmed = Arc::new(AtomicBool::new(false));
        let startup_confirmed_stdout = startup_confirmed.clone(); // Clone for stdout thread

        // Capture Output Streams
        let stdout = child.stdout.take().ok_or_else(|| anyhow::anyhow!("Failed to capture stdout"))?;
        let stderr = child.stderr.take().ok_or_else(|| anyhow::anyhow!("Failed to capture stderr"))?;

        let app_handle_stdout = self.app_handle.clone();
        let server_id_stdout = server_id;
        let has_mods = match mods {
            Some(m) => !m.is_empty(),
            None => false,
        };
        let has_mods_stdout = has_mods;

        // Stdout Reader
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                // We strictly consume stdout to prevent buffer deadlock, but we DO NOT emit events
                // because the Log File Watcher (below) is the primary source of logs.
                // HOWEVER, we DO listen for startup confirmation here because stdout is real-time, unlike the file.
                if let Ok(l) = line {
                    println!("[Server STDOUT] {}", l);
                    
                    // EMIT LOG EVENT FROM STDOUT (Real-time)
                    let _ = app_handle_stdout.emit(
                        "server_log",
                        ServerLogEvent {
                            server_id: server_id_stdout,
                            line: l.clone(),
                            is_stderr: false,
                        },
                    );

                    // REAL-TIME STARTUP DETECTION
                    let lower_line = l.to_lowercase();
                    
                    // DEBUG: Print line if it looks relevant
                    if lower_line.contains("advertising") || lower_line.contains("startup") {
                        println!("  🔍 [DEBUG] STDOUT Line Candidate: '{}'", l);
                        println!("  🔍 [DEBUG] Lowercase: '{}'", lower_line);
                    }

                    // STRICTER CHECK per user request: "Server has completed startup and is now advertising for join."
                    // We check for "advertising for join" as the critical component.
                    if lower_line.contains("advertising for join") 
                    {
                        println!("  ✅ [DEBUG] MATCH FOUND! Triggering Online Status...");
                        if !startup_confirmed_stdout.load(Ordering::Relaxed) {
                            println!("  🚀 Detected startup in STDOUT (Real-time)! Forcing Online status...");
                            startup_confirmed_stdout.store(true, Ordering::Relaxed);
                            
                            // Force immediate UI update
                            let _ = app_handle_stdout.emit("server-status-change", serde_json::json!({
                                "server_id": server_id_stdout,
                                "status": "online"
                            }));
                            
                            // Update DB immediately
                            if let Some(state) = app_handle_stdout.try_state::<AppState>() {
                                if let Ok(db) = state.db.lock() {
                                    if let Ok(conn) = db.get_connection() {
                                        let _ = conn.execute(
                                            "UPDATE servers SET status = 'online' WHERE id = ?1",
                                            rusqlite::params![server_id_stdout],
                                        );
                                    }
                                }
                            }
                        }
                    }

                    // CFCore mod loading failure detection (real-time)
                    if has_mods_stdout {
                        if lower_line.contains("not all mods were installed") {
                            println!("  ❌ [CFCore] Mod loading failure detected for server {}", server_id_stdout);
                            let _ = app_handle_stdout.emit("mod_load_failure", ModLoadFailureEvent {
                                server_id: server_id_stdout,
                                error_type: "CFCore_ModLoadFailed".to_string(),
                                details: l.clone(),
                                suggestions: vec![
                                    "Accept CurseForge Terms & Conditions in the ARK game client (Main Menu → Mod List)".to_string(),
                                    "Clear the mod cache using Server Actions → Clear Mod Cache, then restart".to_string(),
                                    "If using crossplay, check that no PC-only mods are in the mod list".to_string(),
                                    "Try running the Server Manager as Administrator for the first launch".to_string(),
                                ],
                            });
                        } else if lower_line.contains("no machine id was found") {
                            let _ = app_handle_stdout.emit("mod_load_failure", ModLoadFailureEvent {
                                server_id: server_id_stdout,
                                error_type: "CFCore_NoMachineId".to_string(),
                                details: l.clone(),
                                suggestions: vec![
                                    "Run the Server Manager as Administrator once to register CFCore's machine ID".to_string(),
                                ],
                            });
                        } else if lower_line.contains("couldn't load mods library from disk") {
                            let _ = app_handle_stdout.emit("mod_load_failure", ModLoadFailureEvent {
                                server_id: server_id_stdout,
                                error_type: "CFCore_LibraryLoadFailed".to_string(),
                                details: l.clone(),
                                suggestions: vec![
                                    "Accept CurseForge Terms & Conditions in the ARK game client".to_string(),
                                    "Clear the mod cache and let CFCore re-download all mods".to_string(),
                                ],
                            });
                        }
                    }
                }
            }
        });

        // Stderr Reader - also checks for startup completion
        let app_handle_stderr = self.app_handle.clone();
        let server_id_stderr = server_id;
        let startup_confirmed_stderr = startup_confirmed.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(l) = line {
                    // Filter out GameAnalytics noise
                    if !l.contains("GameAnalytics") {
                        println!("[Server STDERR] {}", l);
                    }

                    // Also check STDERR for startup completion (ARK may output it here)
                    let lower_line = l.to_lowercase();
                    if lower_line.contains("advertising for join") {
                        println!("  ✅ [DEBUG] STDERR MATCH FOUND! Triggering Online Status...");
                        if !startup_confirmed_stderr.load(Ordering::Relaxed) {
                            println!("  🚀 Detected startup in STDERR! Forcing Online status...");
                            startup_confirmed_stderr.store(true, Ordering::Relaxed);

                            // Force immediate UI update
                            let _ = app_handle_stderr.emit("server-status-change", serde_json::json!({
                                "server_id": server_id_stderr,
                                "status": "online"
                            }));

                            // Update DB immediately
                            if let Some(state) = app_handle_stderr.try_state::<AppState>() {
                                if let Ok(db) = state.db.lock() {
                                    if let Ok(conn) = db.get_connection() {
                                        let _ = conn.execute(
                                            "UPDATE servers SET status = 'online' WHERE id = ?1",
                                            rusqlite::params![server_id_stderr],
                                        );
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        // REMOVED: Immediate check for startup failures (blocking sleep)
        // User requested instant startup feedback.
        // Background monitor will catch if it crashes shortly after.
        // std::thread::sleep(std::time::Duration::from_secs(3));
        
        // match child.try_wait() { ... } 


        println!("  ✅ Server {} started with PID: {} ", server_id, child_pid);

        // Emit 'running' event (This now means process started, but not yet ready)
        self.emit_status_change(server_id, "running");

        // Create stop flag for log watcher
        let stop_flag = Arc::new(AtomicBool::new(false));
        let stop_flag_clone = stop_flag.clone();

        // startup_confirmed is already created above

        // Clone for the log file watcher and webhook thread BEFORE moving values into the struct
        let startup_confirmed_clone = startup_confirmed.clone();
        let wh_startup_confirmed = startup_confirmed.clone(); // Clone for the dedicated webhook thread
        let wh_stop_flag = stop_flag_clone.clone(); // Clone for the dedicated webhook thread

        // Store process
        {
            let mut processes = self.processes.lock().unwrap_or_else(|e| e.into_inner());
            processes.insert(server_id, ServerProcess { 
                child: Some(child), 
                pid: child_pid,
                install_path: install_path.clone(),
                server_type: server_type.to_string(),
                stop_flag,
                query_port,
                started_at: std::time::Instant::now(),
                is_online: false,
                ip_address: ip_address.map(|s| s.to_string()),
                startup_confirmed,
                has_been_online: false,
            });
        }

        // Start log file watcher
        let app_handle = self.app_handle.clone();
        let _app_handle_status = self.app_handle.clone();

        std::thread::spawn(move || {
            // Wait for log file to be created
            let mut attempts = 0;
            while !log_file_path.exists() && attempts < 30 {
                std::thread::sleep(std::time::Duration::from_secs(1));
                attempts += 1;
            }

            if !log_file_path.exists() {
                let _ = app_handle.emit(
                    "server_log",
                    ServerLogEvent {
                        server_id,
                        line: "[Manager] Log file not found".to_string(),
                        is_stderr: true,
                    },
                );
                return;
            }

            // Record initial file size so we can skip old content for startup detection
            let mut initial_file_size = std::fs::metadata(&log_file_path)
                .map(|m| m.len())
                .unwrap_or(0);

            // Open log file
            let file = match File::open(&log_file_path) {
                Ok(f) => f,
                Err(e) => {
                    let _ = app_handle.emit(
                        "server_log",
                        ServerLogEvent {
                            server_id,
                            line: format!("[Manager] Failed to open log file: {}", e),
                            is_stderr: true,
                        },
                    );
                    return;
                }
            };

            let mut reader = BufReader::new(file);
            let mut bytes_read: u64 = 0;

            // Do NOT seek to end. Server might have already written startup logs.
            // let _ = reader.seek(SeekFrom::End(0));

            // Read new lines as they appear
            while !stop_flag_clone.load(Ordering::SeqCst) {
                let mut line = String::new();
                match reader.read_line(&mut line) {
                    Ok(0) => {
                        // EOF reached. Check if the file grew or shrunk (truncated).
                        if let Ok(meta) = std::fs::metadata(&log_file_path) {
                            if meta.len() < bytes_read {
                                // Truncated! (e.g., server restarted and cleared log)
                                println!("  🔄 Server {} LOG FILE truncated! Resetting reader.", server_id);
                                if let Ok(new_file) = File::open(&log_file_path) {
                                    reader = BufReader::new(new_file);
                                    bytes_read = 0;
                                    initial_file_size = 0; // Process all lines from the new file
                                    continue;
                                }
                            } else if bytes_read == 0 && meta.len() == 0 && initial_file_size > 0 {
                                // Edge case where file is truncated to 0 right at startup, and we haven't read anything.
                                println!("  🔄 Server {} LOG FILE truncated to 0! Resetting target size.", server_id);
                                initial_file_size = 0;
                            }
                        }
                        // No new data, wait a bit
                        std::thread::sleep(std::time::Duration::from_millis(100));
                    }
                    Ok(n) => {
                        bytes_read += n as u64;
                        let line = line.trim_end().to_string();
                        if !line.is_empty() {
                            // MOVED TO STDOUT thread for real-time updates
                            /*
                            let _ = app_handle.emit(
                                "server_log",
                                ServerLogEvent {
                                    server_id,
                                    line: line.clone(),
                                    is_stderr: false,
                                },
                            );
                            */

                            // CHECK FOR SERVER READY STATE (LOG FILE)
                            // Only check lines that are NEW (written after we started watching)
                            // to avoid false positives from a previous run's log content.
                            if bytes_read > initial_file_size {
                                let lower_line = line.to_lowercase();
                                if (lower_line.contains("server has completed startup")
                                    || lower_line.contains("advertising for join"))
                                    && !startup_confirmed_clone.load(Ordering::Relaxed) {
                                        println!("  🎉 Server {} LOG FILE detected startup complete!", server_id);
                                        startup_confirmed_clone.store(true, Ordering::Relaxed);
                                        
                                        // Force immediate UI update
                                        let _ = app_handle.emit("server-status-change", serde_json::json!({
                                            "server_id": server_id,
                                            "status": "online"
                                        }));
                                        
                                        // Update DB immediately
                                        if let Some(state) = app_handle.try_state::<AppState>() {
                                            if let Ok(db) = state.db.lock() {
                                                if let Ok(conn) = db.get_connection() {
                                                    let _ = conn.execute(
                                                        "UPDATE servers SET status = 'online' WHERE id = ?1",
                                                        rusqlite::params![server_id],
                                                    );
                                                }
                                            }
                                        }
                                        // NOTE: Discord webhook is handled by the dedicated sender thread.
                                    }
                            }

                            // DISCORD WEBHOOKS: Player Join/Leave
                            if line.contains("joined this ARK!") {
                                // Format: "User <Name> joined this ARK!"
                                if let Some(idx) = line.find("User ") {
                                    let rest = &line[idx + 5..];
                                    if let Some(end_idx) = rest.find(" joined this ARK!") {
                                        let player_name = &rest[..end_idx];
                                        let wh_handle = app_handle.clone();
                                        let wh_id = server_id;
                                        let p_name = player_name.to_string();
                                        tauri::async_runtime::spawn(async move {
                                            let s_name = get_server_name(&wh_handle, wh_id);
                                            send_discord_webhook(
                                                &wh_handle,
                                                "playerJoin",
                                                DiscordEmbed::player_join(&s_name, &p_name),
                                            ).await;
                                        });
                                    }
                                }
                            } else if line.contains("left this ARK!") {
                                // Format: "User <Name> left this ARK!"
                                if let Some(idx) = line.find("User ") {
                                    let rest = &line[idx + 5..];
                                    if let Some(end_idx) = rest.find(" left this ARK!") {
                                        let player_name = &rest[..end_idx];
                                        let wh_handle = app_handle.clone();
                                        let wh_id = server_id;
                                        let p_name = player_name.to_string();
                                        tauri::async_runtime::spawn(async move {
                                            let s_name = get_server_name(&wh_handle, wh_id);
                                            send_discord_webhook(
                                                &wh_handle,
                                                "playerLeave",
                                                DiscordEmbed::player_leave(&s_name, &p_name),
                                            ).await;
                                        });
                                    }
                                }
                            }
                        }
                    }
                    Err(_) => {
                        std::thread::sleep(std::time::Duration::from_millis(100));
                    }
                }
            }
        });

        // Hide the ASA console windows after a delay
        #[cfg(target_os = "windows")]
        {
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(3));
                window_hider::hide_process_windows(child_pid);
                std::thread::sleep(std::time::Duration::from_secs(5));
                window_hider::hide_process_windows(child_pid);
            });
        }

        // ── DEDICATED DISCORD WEBHOOK SENDER ──
        // Completely independent thread that watches for startup_confirmed
        // and sends the "Server Online" Discord webhook. No shared flags.
        {
            let wh_app_handle = self.app_handle.clone();
            // wh_startup_confirmed is already cloned above
            // wh_stop_flag is already cloned above
            let wh_server_id = server_id;
            let wh_stop_flag_thread = wh_stop_flag.clone();

            tauri::async_runtime::spawn(async move {
                println!("  🔔 [WEBHOOK-THREAD] Started for server {}", wh_server_id);

                // Poll every 2 seconds until startup is confirmed or server stops
                loop {
                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

                    // If server was stopped, exit
                    if wh_stop_flag_thread.load(Ordering::SeqCst) {
                        println!("  🔔 [WEBHOOK-THREAD] Server {} stopped before going online. Exiting.", wh_server_id);
                        return;
                    }

                    // Check if startup has been confirmed (by log watcher, stdout, or stderr)
                    if wh_startup_confirmed.load(Ordering::Relaxed) {
                        println!("  🔔 [WEBHOOK-THREAD] Server {} is ONLINE! Sending Discord webhook...", wh_server_id);

                        let name = get_server_name(&wh_app_handle, wh_server_id);
                        send_discord_webhook(
                            &wh_app_handle,
                            "serverStart",
                            DiscordEmbed::server_online(&name),
                        ).await;

                        println!("  🔔 [WEBHOOK-THREAD] Done for server {}. Exiting.", wh_server_id);
                        return;
                    }
                }
            });
        }

        Ok(())
    }
    /// Check if a server process is tracked and alive (public helper)
    pub fn is_server_running(&self, server_id: i64) -> bool {
        let processes = self.processes.lock().unwrap_or_else(|e| e.into_inner());
        processes.contains_key(&server_id)
    }

    /// Explicitly record a stop reason (useful for RCON DoExit)
    pub fn set_pending_stop_reason(&self, server_id: i64, reason: StopReason) {
        let mut reasons = self.pending_stop_reasons.lock().unwrap_or_else(|e| e.into_inner());
        reasons.insert(server_id, reason);
    }

    /// Stop ARK server with a reason (authorized stop)
    pub fn stop_server_with_reason(&self, server_id: i64, reason: StopReason) -> Result<()> {
        println!("  [LIFECYCLE] Server {} stop requested | reason: {}", server_id, reason);

        // Register the stop reason BEFORE killing so the monitor thread sees it
        {
            let mut reasons = self.pending_stop_reasons.lock().unwrap_or_else(|e| e.into_inner());
            reasons.insert(server_id, reason.clone());
        }

        let mut processes = self.processes.lock().unwrap_or_else(|e| e.into_inner());

        if let Some(server_proc) = processes.remove(&server_id) {
            let uptime = server_proc.started_at.elapsed().as_secs();

            // Signal log watcher to stop
            server_proc.stop_flag.store(true, Ordering::SeqCst);

            // Force kill the process tree on Windows
            let pid = server_proc.pid;
            #[cfg(target_os = "windows")]
            {
                let _ = Command::new("taskkill")
                    .args(["/F", "/T", "/PID", &pid.to_string()])
                    .creation_flags(CREATE_NO_WINDOW)
                    .output();
            }

            // Fallback
            if let Some(mut child) = server_proc.child {
                let _ = child.kill();
                let _ = child.wait();
            }

            // Emit lifecycle event
            let _ = self.app_handle.emit(
                "server-lifecycle-event",
                ServerLifecycleEvent {
                    server_id,
                    event: "STOP".to_string(),
                    reason: Some(format!("{}", reason)),
                    exit_code: None,
                    uptime_seconds: Some(uptime),
                    timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                },
            );

            // Emit stopped status
            self.emit_status_change(server_id, "stopped");

            // Send Discord webhook for server stop
            let wh_handle = self.app_handle.clone();
            tauri::async_runtime::spawn(async move {
                let name = get_server_name(&wh_handle, server_id);
                send_discord_webhook(
                    &wh_handle,
                    "serverStop",
                    DiscordEmbed::server_stopped(&name),
                ).await;
            });
        }

        // Clean up the reason after stop completes
        {
            let mut reasons = self.pending_stop_reasons.lock().unwrap_or_else(|e| e.into_inner());
            reasons.remove(&server_id);
        }

        Ok(())
    }

    /// Stop ARK server (Force) — backward-compatible wrapper, defaults to UserAction
    pub fn stop_server(&self, server_id: i64) -> Result<()> {
        self.stop_server_with_reason(server_id, StopReason::UserAction)
    }

    /// Graceful shutdown via RCON
    pub async fn shutdown_server(
        &self,
        server_id: i64,
        rcon: &crate::services::rcon::RconService,
        address: &str,
        port: u16,
        password: &str,
    ) -> Result<()> {
        println!(
            "🛡️ Intelligent Mode: Attempting graceful shutdown for server {}...",
            server_id
        );

        // 1. Connect and send RCON commands
        if let Ok(resp) = rcon.connect(server_id, address, port, password).await {
            if resp.success {
                println!("  📡 RCON connected, sending SaveWorld...");
                let _ = rcon.save_world(server_id).await;

                std::thread::sleep(std::time::Duration::from_secs(2));

                println!("  📡 Sending DoExit/Quit...");
                use tauri::Manager;
                if let Some(guardian) = self.app_handle.try_state::<crate::services::guardian::GuardianState>() {
                    let guard = guardian.0.lock().await;
                    guard.mark_as_stopping(server_id).await;
                }
                let _ = rcon.send_command(server_id, "DoExit").await;

                // Wait for process to exit naturally
                let mut attempts = 0;
                while self.is_running(server_id) && attempts < 15 {
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                    attempts += 1;
                }
            }
        }

        // 2. If still running, force stop
        if self.is_running(server_id) {
            println!("  ⚠️ Graceful shutdown timed out or failed, force stopping...");
            self.stop_server_with_reason(server_id, StopReason::UserAction)?;
        }

        Ok(())
    }

    /// Check if server is running
    pub fn is_running(&self, server_id: i64) -> bool {
        let mut processes = self.processes.lock().unwrap_or_else(|e| e.into_inner());

        if let Some(server_proc) = processes.get_mut(&server_id) {
            if let Some(ref mut child) = server_proc.child {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        // Parent exited. Check if handoff exists first.
                        if let Some(new_pid) = find_game_server_pid_by_install_path(&server_proc.install_path.to_string_lossy(), &server_proc.server_type) {
                            println!("  🔄 [Handoff] is_running: Handoff detected for server {}! Swapping tracking to PID {}.", server_id, new_pid);
                            server_proc.pid = new_pid;
                            server_proc.child = None;

                            // Update process_id in DB
                            if let Some(state) = self.app_handle.try_state::<AppState>() {
                                if let Ok(db) = state.db.lock() {
                                    if let Ok(conn) = db.get_connection() {
                                        let table = if server_proc.server_type == "ASE" { "ase_servers" } else { "servers" };
                                        let _ = conn.execute(
                                            &format!("UPDATE {} SET process_id = ?1 WHERE id = ?2", table),
                                            rusqlite::params![new_pid, server_id],
                                        );
                                    }
                                }
                                // Update Guardian
                                if let Some(guardian) = self.app_handle.try_state::<crate::services::guardian::GuardianState>() {
                                    let guard = tauri::async_runtime::block_on(async { guardian.0.lock().await });
                                    if server_proc.server_type == "ASE" {
                                        tauri::async_runtime::block_on(async {
                                            guard.register_ase_server(self.app_handle.clone(), server_id, new_pid).await;
                                        });
                                    } else {
                                        tauri::async_runtime::block_on(async {
                                            guard.register_server(self.app_handle.clone(), server_id, new_pid).await;
                                        });
                                    }
                                }
                            }
                            return true;
                        }

                        let exit_code = status.code().unwrap_or(-1);
                        let status_str = if exit_code == 0 { "stopped" } else { "crashed" };

                        println!(
                            "  ⚠️ Server {} exited with status: {:?} (code: {}, status: {})",
                            server_id, status, exit_code, status_str
                        );
                        server_proc.stop_flag.store(true, Ordering::SeqCst);
                        let server_type = server_proc.server_type.clone();
                        processes.remove(&server_id);

                        // Emit crash/stop event
                        self.emit_status_change(server_id, status_str);

                        // Update database status
                        if let Some(state) = self.app_handle.try_state::<AppState>() {
                            if let Ok(db) = state.db.lock() {
                                if let Ok(conn) = db.get_connection() {
                                    let table = if server_type == "ASE" { "ase_servers" } else { "servers" };
                                    let _ = conn.execute(
                                        &format!("UPDATE {} SET status = ?1 WHERE id = ?2", table),
                                        rusqlite::params![status_str, server_id],
                                    );
                                }
                            }
                        }

                        false
                    }
                    Ok(None) => true,
                    Err(e) => {
                        println!("  ❌ Server {} error checking status: {:?}", server_id, e);
                        false
                    }
                }
            } else {
                // Tracking by system PID
                let is_alive = {
                    let mut sys = sysinfo::System::new();
                    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
                    sys.process(sysinfo::Pid::from_u32(server_proc.pid)).is_some()
                };

                if !is_alive {
                    println!(
                        "  ⚠️ Server {} (PID {}) is no longer running",
                        server_id, server_proc.pid
                    );
                    server_proc.stop_flag.store(true, Ordering::SeqCst);
                    let server_type = server_proc.server_type.clone();
                    processes.remove(&server_id);

                    self.emit_status_change(server_id, "stopped");

                    if let Some(state) = self.app_handle.try_state::<AppState>() {
                        if let Ok(db) = state.db.lock() {
                            if let Ok(conn) = db.get_connection() {
                                let table = if server_type == "ASE" { "ase_servers" } else { "servers" };
                                let _ = conn.execute(
                                    &format!("UPDATE {} SET status = 'stopped' WHERE id = ?1", table),
                                    [server_id],
                                );
                            }
                        }
                    }
                    false
                } else {
                    true
                }
            }
        } else {
            false
        }
    }

    /// Restart server
    pub fn restart_server(
        &self,
        server_id: i64,
        server_type: &str,
        install_path: &PathBuf,
        map_name: &str,
        session_name: &str,
        game_port: u16,
        query_port: u16,
        rcon_port: u16,
        max_players: i32,
        server_password: Option<&str>,
        admin_password: &str,
        ip_address: Option<&str>,
        cluster_id: Option<&str>,
        cluster_dir: Option<&str>,
        mods: Option<&[String]>,
        custom_args: Option<&str>,
        battleye_enabled: bool,
    ) -> Result<()> {
        if self.is_running(server_id) {
            self.stop_server(server_id)?;
        }

        // Reduced wait time for shorter restart delay
        std::thread::sleep(std::time::Duration::from_secs(1));

        self.start_server(
            server_id,
            server_type,
            install_path,
            map_name,
            session_name,
            game_port,
            query_port,
            rcon_port,
            max_players,
            server_password,
            admin_password,
            ip_address,
            cluster_id,
            cluster_dir,
            mods,
            custom_args,
            battleye_enabled,
        )
    }

    /// Show the hidden server window
    pub fn show_server_window(&self, server_id: i64) -> Result<()> {
        let processes = self.processes.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(server_proc) = processes.get(&server_id) {
            let pid = server_proc.pid;
            println!("  🖥️ Attempting to show console window for server {} (PID: {})", server_id, pid);
            #[cfg(target_os = "windows")]
            {
                // First try: show by exact PID
                window_hider::show_process_window(pid);
                // Second try: find all ArkAscendedServer.exe / ShooterGameServer.exe processes and show their windows
                // This handles UE5 spawning child processes with different PIDs
                if server_proc.server_type == "ASE" {
                    window_hider::show_windows_by_exe_name("ShooterGameServer.exe");
                } else {
                    window_hider::show_windows_by_exe_name("ArkAscendedServer.exe");
                }
            }
            Ok(())
        } else {
            Err(anyhow::anyhow!("Server is not running"))
        }
    }

    /// Check if a server process has completed its startup logs/ticking
    pub fn is_startup_confirmed(&self, server_id: i64) -> bool {
        let processes = self.processes.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(proc) = processes.get(&server_id) {
            proc.startup_confirmed.load(std::sync::atomic::Ordering::Relaxed)
        } else {
            false
        }
    }
}

/// Triggers intelligent repair for a server (clears mod caches and restarts without mods)
pub async fn trigger_intelligent_repair(app_handle: tauri::AppHandle, server_id: i64) -> anyhow::Result<()> {
    let state = app_handle.try_state::<crate::AppState>()
        .ok_or_else(|| anyhow::anyhow!("Failed to get AppState"))?;
        
    let install_path = {
        let db = state.db.lock().map_err(|e| anyhow::anyhow!(e.to_string()))?;
        let conn = db.get_connection().map_err(|_| anyhow::anyhow!("Failed to get DB connection"))?;
        let path: String = conn.query_row(
            "SELECT install_path FROM servers WHERE id = ?1",
            [server_id],
            |row| row.get(0),
        ).unwrap_or_default();
        path
    };

    let name = crate::services::process_manager::get_server_name(&app_handle, server_id);
    
    // Notify Discord
    crate::services::discord::send_discord_webhook(
        &app_handle,
        "serverRecovery",
        crate::services::discord::DiscordEmbed::server_recovery(
            &name,
            true,
            "Intelligent Mode auto-repair triggered. Clearing mod caches and restarting the server without mods...",
        ),
    ).await;

    println!("  🔧 Auto-repair: Starting repair process for server {}", server_id);
    
    // Emit starting message
    let _ = app_handle.emit(
        "server_log",
        ServerLogEvent {
            server_id,
            line: "[Manager] Auto-repair: Waiting 3 seconds before repair...".to_string(),
            is_stderr: false,
        },
    );
    
    tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
    
    let temp_folder = std::path::PathBuf::from(&install_path)
        .join("ShooterGame")
        .join("Binaries")
        .join("Win64")
        .join("ShooterGame")
        .join(".temp");
    
    if temp_folder.exists() {
        println!("  🗑️ Auto-repair: Clearing mod cache at {:?}", temp_folder);
        match std::fs::remove_dir_all(&temp_folder) {
            Ok(_) => {
                let _ = app_handle.emit(
                    "server_log",
                    ServerLogEvent {
                        server_id,
                        line: format!("[Manager] Cleared mod cache: {:?}", temp_folder),
                        is_stderr: false,
                    },
                );
            }
            Err(e) => {
                println!("  ⚠️ Failed to clear mod cache: {}", e);
            }
        }
    }
    
    // Also try alternate temp location
    let alt_temp = std::path::PathBuf::from(&install_path)
        .join("ShooterGame")
        .join("Mods")
        .join(".temp");
    if alt_temp.exists() {
        println!("  🗑️ Auto-repair: Clearing alternate mod cache at {:?}", alt_temp);
        let _ = std::fs::remove_dir_all(&alt_temp);
    }
    
    let _ = app_handle.emit(
        "server_log",
        ServerLogEvent {
            server_id,
            line: "[Manager] Auto-repair: Starting server without mods...".to_string(),
            is_stderr: false,
        },
    );
    
    if let Err(e) = crate::commands::server::start_server_no_mods(
        app_handle.clone(),
        state.clone(),
        server_id,
    ).await {
        println!("  ❌ Auto-repair failed for server {}: {}", server_id, e);
        let _ = app_handle.emit(
            "server_log",
            ServerLogEvent {
                server_id,
                line: format!("[Manager] Auto-repair failed: {}. Please restart manually.", e),
                is_stderr: true,
            },
        );

        crate::services::discord::send_discord_webhook(
            &app_handle,
            "serverRecovery",
            crate::services::discord::DiscordEmbed::server_recovery(
                &name,
                false,
                &format!("Auto-repair failed: {}. Manual intervention is required.", e),
            ),
        ).await;
        if let Ok(db) = state.db.lock() {
            if let Ok(conn) = db.get_connection() {
                let _ = conn.execute(
                    "UPDATE servers SET status = ?1 WHERE id = ?2",
                    rusqlite::params!["stopped", server_id],
                );
            }
        }
        return Err(anyhow::anyhow!("Auto-repair failed: {}", e));
    }

    println!("  ✅ Auto-repair: Server {} restarted without mods", server_id);
    let _ = app_handle.emit(
        "server_log",
        ServerLogEvent {
            server_id,
            line: "[Manager] Auto-repair successful! Server restarted without mods.".to_string(),
            is_stderr: false,
        },
    );

    crate::services::discord::send_discord_webhook(
        &app_handle,
        "serverRecovery",
        crate::services::discord::DiscordEmbed::server_recovery(
            &name,
            true,
            "Auto-repair successful! Mod caches cleared and server process restarted successfully.",
        ),
    ).await;
    
    Ok(())
}


