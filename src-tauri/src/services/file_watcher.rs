use crate::AppState;
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use rusqlite::Row;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::mpsc::RecvTimeoutError;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::Manager;

pub struct FileWatcherService {
    app_handle: tauri::AppHandle,
    watchers: Arc<Mutex<HashMap<i64, RecommendedWatcher>>>,
}

impl FileWatcherService {
    pub fn new(app_handle: tauri::AppHandle) -> Self {
        Self {
            app_handle,
            watchers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn start_watching(&self, server_id: i64, path: PathBuf) -> Result<(), String> {
        let app_handle = self.app_handle.clone();

        // Channel for watcher events
        let (tx, rx) = std::sync::mpsc::channel();

        let mut watcher = RecommendedWatcher::new(tx, Config::default())
            .map_err(|e| format!("Failed to create watcher: {}", e))?;

        // ONLY watch the config directory for admin-initiated changes.
        // DO NOT watch SavedArks/ — ARK auto-saves every 15-30 minutes
        // which would trigger auto-stop and kill the running server.
        let mut config_path = path.join("ShooterGame/Saved/Config/WindowsServer");
        if !config_path.exists() {
            let asa_config = path.join("ShooterGame/Saved/Config/Windows");
            if asa_config.exists() {
                config_path = asa_config;
            }
        }

        if config_path.exists() {
            let _ = watcher.watch(&config_path, RecursiveMode::NonRecursive);
            println!("🛡️ Automation: Watching config dir: {:?}", config_path);
        } else {
            println!("🛡️ Automation: Config dir not found for server {}, auto-stop will not function until server is installed.", server_id);
        }

        // NOTE: SavedArks/ and root path are intentionally NOT watched.
        // SavedArks/ changes are routine game saves that must NOT trigger auto-stop.
        // Root path watching was too broad and could trigger on any file change.

        // Record when the watcher started — ignore changes in the first 120 seconds
        // to avoid false triggers during server startup.
        let watcher_start_time = Instant::now();

        // Start a thread to handle events
        let server_id_clone = server_id;
        let app_handle_clone = app_handle.clone();

        thread::spawn(move || {
            loop {
                match rx.recv() {
                    Ok(event) => {
                        if let Ok(e) = event {
                            // Ignore Access events (too noisy), focus on Modify/Create/Remove
                            if matches!(e.kind, notify::EventKind::Access(_)) {
                                continue;
                            }

                            // STARTUP GRACE PERIOD: ignore changes in the first 120 seconds
                            // Server startup often modifies config files as part of initialization.
                            if watcher_start_time.elapsed() < Duration::from_secs(120) {
                                println!(
                                    "🛡️ Automation: Ignoring file change for server {} (startup grace period, {}s elapsed)",
                                    server_id_clone,
                                    watcher_start_time.elapsed().as_secs()
                                );
                                continue;
                            }

                            // FILTER: Only trigger on config file changes (.ini files)
                            // Ignore non-config files like logs, temp files, etc.
                            let is_config_change = e.paths.iter().any(|p| {
                                if let Some(ext) = p.extension() {
                                    let ext_lower = ext.to_string_lossy().to_lowercase();
                                    ext_lower == "ini"
                                } else {
                                    false
                                }
                            });

                            if !is_config_change {
                                println!(
                                    "🛡️ Automation: Ignoring non-config file change for server {} ({:?})",
                                    server_id_clone, e.paths
                                );
                                continue;
                            }

                            println!(
                                "🛡️ Automation: Detected CONFIG file change for server {} ({:?}): {:?}",
                                server_id_clone, e.kind, e.paths
                            );

                            // Debounce: Wait for 5 seconds of silence (increased from 2s)
                            let mut quiet = false;
                            while !quiet {
                                match rx.recv_timeout(Duration::from_secs(5)) {
                                    Ok(next_event) => {
                                        if let Ok(next_e) = next_event {
                                            if matches!(next_e.kind, notify::EventKind::Access(_)) {
                                                continue;
                                            }
                                            println!("   ... Debouncing (more changes detected)");
                                        }
                                    }
                                    Err(RecvTimeoutError::Timeout) => {
                                        quiet = true;
                                    }
                                    Err(_) => return, // Channel closed
                                }
                            }

                            println!(
                                "🛡️ Automation: Triggering Auto-Stop for server {} (config change detected)...",
                                server_id_clone
                            );

                            // Trigger Stop Command
                            let app_handle_bg = app_handle_clone.clone();

                            tauri::async_runtime::spawn(async move {
                                let state = app_handle_bg.state::<AppState>();

                                // Fetch server details for Intelligent Mode check
                                let server_details = {
                                    if let Ok(db) = state.db.lock() {
                                        if let Ok(conn) = db.get_connection() {
                                            conn.query_row(
                                                "SELECT intelligent_mode, rcon_enabled, admin_password, query_port, ip_address FROM servers WHERE id = ?1",
                                                [server_id_clone],
                                                |row: &Row| {
                                                    Ok((
                                                        row.get::<usize, i32>(0)? != 0, // intelligent_mode
                                                        row.get::<usize, i32>(1)? != 0, // rcon_enabled
                                                        row.get::<usize, String>(2)?,   // admin_password
                                                        row.get::<usize, u16>(3)?,      // query_port
                                                        row.get::<usize, Option<String>>(4)?, // ip_address
                                                    ))
                                                }
                                            ).ok()
                                        } else {
                                            None
                                        }
                                    } else {
                                        None
                                    }
                                };

                                if let Some((intel_mode, rcon_on, pass, port, ip)) = server_details
                                {
                                    // Check if the server process is actually running before attempting to stop
                                    if !state.process_manager.is_server_running(server_id_clone) {
                                        println!("🛡️ Automation: Server {} is not running, skipping auto-stop.", server_id_clone);
                                        return;
                                    }

                                    println!("🛡️ Automation: Stopping server {} (Intelligent Mode: {})...", server_id_clone, intel_mode);

                                    if intel_mode && rcon_on {
                                        // 1. Graceful shutdown
                                        let addr = ip.unwrap_or_else(|| "127.0.0.1".to_string());
                                        let rcon_state = state
                                            .app_handle
                                            .state::<crate::commands::rcon::RconState>(
                                        );
                                        let rcon = &rcon_state.0;

                                        if let Err(e) = state
                                            .process_manager
                                            .shutdown_server(
                                                server_id_clone,
                                                rcon,
                                                &addr,
                                                port,
                                                &pass,
                                            )
                                            .await
                                        {
                                            println!(
                                                "[LIFECYCLE] Auto-stop graceful shutdown failed: {}",
                                                e
                                            );
                                        }
                                    } else {
                                        // 1. Force stop with AutoStop reason
                                        if let Err(e) = state
                                            .process_manager
                                            .stop_server_with_reason(
                                            server_id_clone,
                                            crate::services::process_manager::StopReason::AutoStop,
                                        ) {
                                            println!("[LIFECYCLE] Auto-stop failed: {}", e);
                                        }
                                    }

                                    // 2. Update DB status
                                    if let Ok(db) = state.db.lock() {
                                        if let Ok(conn) = db.get_connection() {
                                            let _ = conn.execute(
                                                "UPDATE servers SET status = 'stopped' WHERE id = ?1",
                                                [server_id_clone],
                                            );
                                        }
                                    };
                                }
                            });
                        }
                    }
                    Err(_) => {
                        break;
                    }
                }
            }
        });

        let mut watchers = self.watchers.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        watchers.insert(server_id, watcher);

        println!(
            "🛡️ Automation: Started watching server {} (config-only mode)",
            server_id
        );
        Ok(())
    }

    pub fn stop_watching(&self, server_id: i64) {
        let mut watchers = self.watchers.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if watchers.remove(&server_id).is_some() {
            println!("🛡️ Automation: Stopped watching server {}", server_id);
        }
    }
}
