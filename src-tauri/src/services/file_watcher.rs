use crate::AppState;
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use rusqlite::Row;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::mpsc::RecvTimeoutError;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
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

        // Watch the specific directories
        let config_path = path.join("ShooterGame/Saved/Config/WindowsServer");
        let saves_path = path.join("ShooterGame/Saved/SavedArks");

        if config_path.exists() {
            let _ = watcher.watch(&config_path, RecursiveMode::NonRecursive);
            println!("🛡️ Automation: Watching config dir: {:?}", config_path);
        }

        if saves_path.exists() {
            let _ = watcher.watch(&saves_path, RecursiveMode::NonRecursive);
            println!("🛡️ Automation: Watching saves dir: {:?}", saves_path);
        }

        // Always watch the root path as well (for general updates)
        watcher
            .watch(&path, RecursiveMode::NonRecursive)
            .map_err(|e| format!("Failed to watch root path: {}", e))?;

        // Start a thread to handle events
        let server_id_clone = server_id;
        let app_handle_clone = app_handle.clone();

        thread::spawn(move || {
            loop {
                match rx.recv() {
                    Ok(event) => {
                        if let Ok(e) = event {
                            // Ignore Access events (too noisy), focus on Modify/Create/Remove
                            // notify 6.x: Access, Create, Modify, Remove, Rename, Other.
                            if matches!(e.kind, notify::EventKind::Access(_)) {
                                continue;
                            }

                            println!(
                                "🛡️ Automation: Detected file change for server {} ({:?})",
                                server_id_clone, e.kind
                            );

                            // Debounce: Wait for 2 seconds of silence
                            let mut quiet = false;
                            while !quiet {
                                match rx.recv_timeout(Duration::from_secs(2)) {
                                    Ok(next_event) => {
                                        if let Ok(next_e) = next_event {
                                            if matches!(next_e.kind, notify::EventKind::Access(_)) {
                                                // Ignore access events even during debounce
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
                                "🛡️ Automation: Triggering Auto-Stop for server {}...",
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
                                    println!("🛡️ Automation: Stopping server {} (Intelligent Mode: {})...", server_id_clone, intel_mode);

                                    if intel_mode && rcon_on {
                                        // 1. Graceful shutdown
                                        let addr = ip.unwrap_or_else(|| "127.0.0.1".to_string());
                                        let rcon_state = state
                                            .app_handle
                                            .state::<crate::commands::rcon::RconState>(
                                        );
                                        let rcon = rcon_state.0.lock().await;

                                        if let Err(e) = state
                                            .process_manager
                                            .shutdown_server(
                                                server_id_clone,
                                                &*rcon,
                                                &addr,
                                                port,
                                                &pass,
                                            )
                                            .await
                                        {
                                            println!(
                                                "❌ Automation Error: Graceful shutdown failed: {}",
                                                e
                                            );
                                        }
                                    } else {
                                        // 1. Force stop (fallback or if intel mode off)
                                        if let Err(e) =
                                            state.process_manager.stop_server(server_id_clone)
                                        {
                                            println!(
                                                "❌ Automation Error: Failed to stop server: {}",
                                                e
                                            );
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

                                    // 3. Optional: Restart if Auto-Start is on?
                                    // Maybe wait a bit more for the file operation to fully complete.
                                }
                            });

                            // Prevent rapid re-triggering? The stop_server takes time.
                            // We loop back to recv(), but likely files will change during stop?
                            // If server stops, we might want to keep watching or not?
                            // Logic: stop_server updates status.
                            // If we detect changes WHILE stopping, we might re-trigger stop?
                            // Ideally, stop_server is idempotent.
                        }
                    }
                    Err(_) => {
                        break;
                    }
                }
            }
        });

        let mut watchers = self.watchers.lock().unwrap();
        watchers.insert(server_id, watcher);

        println!("🛡️ Automation: Started watching server {}", server_id);
        Ok(())
    }

    pub fn stop_watching(&self, server_id: i64) {
        let mut watchers = self.watchers.lock().unwrap();
        if watchers.remove(&server_id).is_some() {
            println!("🛡️ Automation: Stopped watching server {}", server_id);
        }
    }
}
