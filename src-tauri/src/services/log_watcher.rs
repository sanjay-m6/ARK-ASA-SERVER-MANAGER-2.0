use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::Emitter;

#[derive(Clone, serde::Serialize)]
pub struct LogAnomalyEvent {
    pub server_id: i64,
    pub anomaly_type: String,
    pub details: String,
}

pub struct LogWatcherService {
    app_handle: tauri::AppHandle,
    watchers: Arc<Mutex<HashMap<i64, RecommendedWatcher>>>,
    streaming_servers: Arc<Mutex<std::collections::HashSet<i64>>>,
}

#[derive(Clone, serde::Serialize)]
pub struct LogLineEvent {
    pub server_id: i64,
    pub line: String,
}

impl LogWatcherService {
    pub fn new(app_handle: tauri::AppHandle) -> Self {
        Self {
            app_handle,
            watchers: Arc::new(Mutex::new(HashMap::new())),
            streaming_servers: Arc::new(Mutex::new(std::collections::HashSet::new())),
        }
    }

    pub fn enable_streaming(&self, server_id: i64) {
        let mut streaming = self.streaming_servers.lock().unwrap_or_else(|p| p.into_inner());
        streaming.insert(server_id);
        println!("🤖 AI Automation: Enabled log streaming for server {}", server_id);
    }

    pub fn disable_streaming(&self, server_id: i64) {
        let mut streaming = self.streaming_servers.lock().unwrap_or_else(|p| p.into_inner());
        streaming.remove(&server_id);
        println!("🤖 AI Automation: Disabled log streaming for server {}", server_id);
    }

    pub fn is_streaming(&self, server_id: i64) -> bool {
        let streaming = self.streaming_servers.lock().unwrap_or_else(|p| p.into_inner());
        streaming.contains(&server_id)
    }

    pub fn start_watching(&self, server_id: i64, path: PathBuf) -> Result<(), String> {
        let app_handle = self.app_handle.clone();
        let (tx, rx) = std::sync::mpsc::channel();

        let mut watcher = RecommendedWatcher::new(tx, Config::default())
            .map_err(|e| format!("Failed to create log watcher: {}", e))?;

        let log_path = path.join("ShooterGame/Saved/Logs/ShooterGame.log");
        
        // Ensure log directory and file exist so we can watch them
        if !log_path.exists() {
            if let Some(parent) = log_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = File::create(&log_path);
        }

        let _ = watcher.watch(&log_path, RecursiveMode::NonRecursive);
        println!("🤖 AI Automation: Watching log file: {:?}", log_path);

        let server_id_clone = server_id;
        let mut last_pos = 0;

        // Try to get initial file size
        if let Ok(metadata) = std::fs::metadata(&log_path) {
            last_pos = metadata.len();
        }

        let streaming_servers_clone = self.streaming_servers.clone();

        thread::spawn(move || {
            loop {
                match rx.recv() {
                    Ok(event) => {
                        if let Ok(e) = event {
                            // Only care about file modification
                            if !matches!(e.kind, notify::EventKind::Modify(_)) {
                                continue;
                            }

                            if let Ok(mut file) = File::open(&log_path) {
                                if let Ok(metadata) = file.metadata() {
                                    let current_len = metadata.len();
                                    
                                    // Handle file truncation (e.g., server restarted and log cleared)
                                    if current_len < last_pos {
                                        last_pos = 0;
                                    }
                                    
                                    if current_len > last_pos {
                                        let _ = file.seek(SeekFrom::Start(last_pos));
                                        let reader = BufReader::new(file);
                                        
                                        for line in reader.lines() {
                                            if let Ok(line_content) = line {
                                                let lower_line = line_content.to_lowercase();
                                                
                                                // 1. Emit live log line to console subscriber if active
                                                let is_streaming = {
                                                    let guard = streaming_servers_clone.lock().unwrap_or_else(|p| p.into_inner());
                                                    guard.contains(&server_id_clone)
                                                };
                                                if is_streaming {
                                                    let _ = app_handle.emit("server_log_line", LogLineEvent {
                                                        server_id: server_id_clone,
                                                        line: line_content.clone(),
                                                    });
                                                }

                                                // 2. Check for specific crash or error keywords
                                                if lower_line.contains("fatal error") || lower_line.contains("crash") || lower_line.contains("exception") {
                                                    println!("🤖 AI Automation: Anomaly detected for server {}: {}", server_id_clone, line_content);
                                                    
                                                    let keyword = if lower_line.contains("fatal error") { 
                                                        "Fatal Error".to_string() 
                                                    } else if lower_line.contains("crash") { 
                                                        "Crash".to_string() 
                                                    } else { 
                                                        "Exception".to_string() 
                                                    };

                                                    // Emit event to frontend AI Agent listener
                                                    let _ = app_handle.emit("log_anomaly", LogAnomalyEvent {
                                                        server_id: server_id_clone,
                                                        anomaly_type: keyword,
                                                        details: line_content.clone(),
                                                    });
                                                }

                                                // 3. Check for CFCore mod loading failures
                                                if lower_line.contains("not all mods were installed") {
                                                    let _ = app_handle.emit("mod_load_failure", crate::services::process_manager::ModLoadFailureEvent {
                                                        server_id: server_id_clone,
                                                        error_type: "CFCore_ModLoadFailed".to_string(),
                                                        details: line_content.clone(),
                                                        suggestions: vec![
                                                            "Accept CurseForge Terms & Conditions in the ARK game client (Main Menu → Mod List)".to_string(),
                                                            "Clear the mod cache using Server Actions → Clear Mod Cache, then restart".to_string(),
                                                            "If using crossplay, check that no PC-only mods are in the mod list".to_string(),
                                                            "Try running the Server Manager as Administrator for the first launch".to_string(),
                                                        ],
                                                    });
                                                } else if lower_line.contains("no machine id was found") {
                                                    let _ = app_handle.emit("mod_load_failure", crate::services::process_manager::ModLoadFailureEvent {
                                                        server_id: server_id_clone,
                                                        error_type: "CFCore_NoMachineId".to_string(),
                                                        details: line_content.clone(),
                                                        suggestions: vec![
                                                            "Run the Server Manager as Administrator once to register CFCore's machine ID".to_string(),
                                                        ],
                                                    });
                                                } else if lower_line.contains("couldn't load mods library from disk") {
                                                    let _ = app_handle.emit("mod_load_failure", crate::services::process_manager::ModLoadFailureEvent {
                                                        server_id: server_id_clone,
                                                        error_type: "CFCore_LibraryLoadFailed".to_string(),
                                                        details: line_content.clone(),
                                                        suggestions: vec![
                                                            "Accept CurseForge Terms & Conditions in the ARK game client".to_string(),
                                                            "Clear the mod cache and let CFCore re-download all mods".to_string(),
                                                        ],
                                                    });
                                                }
                                            }
                                        }
                                        last_pos = current_len;
                                    }
                                }
                            }
                        }
                    }
                    Err(_) => break, // Channel closed
                }
            }
        });

        let mut watchers = self.watchers.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        watchers.insert(server_id, watcher);

        Ok(())
    }

    pub fn stop_watching(&self, server_id: i64) {
        let mut watchers = self.watchers.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if watchers.remove(&server_id).is_some() {
            println!("🤖 AI Automation: Stopped log watching server {}", server_id);
        }
    }
}
