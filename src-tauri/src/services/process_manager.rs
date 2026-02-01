use anyhow::{Context, Result};
use serde::Serialize;
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

use crate::services::network;
use crate::AppState;
use tauri::Manager;

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
        use windows_sys::Win32::UI::WindowsAndMessaging::{SetForegroundWindow, SW_SHOW};

        unsafe extern "system" fn show_window_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let pid_ptr = lparam as *const u32;
            let target_pid = *pid_ptr;
            let mut window_pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, &mut window_pid);

            if window_pid == target_pid {
                ShowWindow(hwnd, SW_SHOW);
                SetForegroundWindow(hwnd);
                return 0; // Stop enumerating
            }
            1
        }

        unsafe {
            EnumWindows(Some(show_window_callback), &pid as *const _ as LPARAM);
        }
    }
}

#[derive(Clone, Serialize)]
pub struct ServerLogEvent {
    pub server_id: i64,
    pub line: String,
    pub is_stderr: bool,
}

struct ServerProcess {
    child: Child,
    stop_flag: Arc<AtomicBool>,
}

pub struct ProcessManager {
    processes: Arc<Mutex<HashMap<i64, ServerProcess>>>,
    app_handle: AppHandle,
}

#[derive(Clone, Serialize)]
pub struct ServerStatusEvent {
    pub server_id: i64,
    pub status: String,
}

impl ProcessManager {
    pub fn new(app_handle: AppHandle) -> Self {
        let processes = Arc::new(Mutex::new(HashMap::new()));
        let pm = ProcessManager {
            processes: processes.clone(),
            app_handle: app_handle.clone(),
        };

        // Start background monitoring thread
        let monitor_processes = processes.clone();
        let monitor_handle = app_handle.clone();

        std::thread::spawn(move || {
            loop {
                std::thread::sleep(std::time::Duration::from_secs(2));

                // Collect crashed servers while holding the lock
                let crashed_servers: Vec<(i64, i32)>;
                {
                    let mut p_lock = monitor_processes.lock().unwrap();
                    let mut to_remove: Vec<(i64, i32)> = Vec::new();

                    for (id, proc) in p_lock.iter_mut() {
                        match proc.child.try_wait() {
                            Ok(Some(status)) => {
                                // Process has exited
                                let exit_code = status.code().unwrap_or(-1);
                                println!(
                                    "  ⚠️ Monitor detected server {} exit with status: {:?} (code: {})",
                                    id, status, exit_code
                                );
                                to_remove.push((*id, exit_code));

                                // Signal log watcher to stop
                                proc.stop_flag.store(true, Ordering::SeqCst);
                            }
                            Ok(None) => {
                                // Still running
                            }
                            Err(e) => {
                                println!("  ❌ Monitor failed to check server {}: {}", id, e);
                            }
                        }
                    }

                    // Remove crashed servers from the process list
                    for (id, _) in &to_remove {
                        p_lock.remove(id);
                    }

                    crashed_servers = to_remove;
                } // Lock is released here

                // Now process crashed servers without holding the lock
                for (id, exit_code) in crashed_servers {
                    // Determine status based on exit code
                    // Exit code 0 = normal stop, anything else = crash/error
                    let status = if exit_code == 0 { "stopped" } else { "crashed" };

                    println!(
                        "  📢 Server {} status changed to '{}' (exit code: {})",
                        id, status, exit_code
                    );

                    // Check if intelligent_mode is enabled for auto-repair
                    let mut should_auto_repair = false;
                    let mut server_install_path: Option<String> = None;
                    
                    if exit_code != 0 {
                        if let Some(state) = monitor_handle.try_state::<AppState>() {
                            if let Ok(db) = state.db.lock() {
                                if let Ok(conn) = db.get_connection() {
                                    // Check if intelligent_mode is enabled
                                    let result: Result<(i32, String), _> = conn.query_row(
                                        "SELECT intelligent_mode, install_path FROM servers WHERE id = ?1",
                                        [id],
                                        |row| Ok((row.get::<usize, i32>(0)?, row.get::<usize, String>(1)?)),
                                    );
                                    if let Ok((intelligent_mode, install_path)) = result {
                                        if intelligent_mode != 0 {
                                            should_auto_repair = true;
                                            server_install_path = Some(install_path);
                                            println!(
                                                "  🔧 Intelligent Mode enabled for server {} - will attempt auto-repair",
                                                id
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Emit status change event
                    let _ = monitor_handle.emit(
                        "server-status-change",
                        ServerStatusEvent {
                            server_id: id,
                            status: if should_auto_repair { "repairing".to_string() } else { status.to_string() },
                        },
                    );

                    // Update database status
                    if let Some(state) = monitor_handle.try_state::<AppState>() {
                        if let Ok(db) = state.db.lock() {
                            if let Ok(conn) = db.get_connection() {
                                let db_status = if should_auto_repair { "repairing" } else { "stopped" };
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
                                "[Manager] Server process exited with code {}. Status: {}{}",
                                exit_code, 
                                status,
                                if should_auto_repair { " - Auto-repair initiating..." } else { "" }
                            ),
                            is_stderr: exit_code != 0,
                        },
                    );

                    // Auto-repair: Clear mod cache and restart without mods
                    if should_auto_repair {
                        if let Some(install_path) = server_install_path {
                            let repair_handle = monitor_handle.clone();
                            let repair_id = id;
                            
                            // Spawn repair thread after releasing all locks
                            std::thread::spawn(move || {
                                println!("  🔧 Auto-repair: Starting repair process for server {}", repair_id);
                                
                                // Emit starting message
                                let _ = repair_handle.emit(
                                    "server_log",
                                    ServerLogEvent {
                                        server_id: repair_id,
                                        line: "[Manager] Auto-repair: Waiting 3 seconds before repair...".to_string(),
                                        is_stderr: false,
                                    },
                                );
                                
                                // Wait a moment before attempting repair
                                std::thread::sleep(std::time::Duration::from_secs(3));
                                
                                // Clear mod cache (.temp folder)
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
                                            let _ = repair_handle.emit(
                                                "server_log",
                                                ServerLogEvent {
                                                    server_id: repair_id,
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
                                
                                // Emit repair status
                                let _ = repair_handle.emit(
                                    "server_log",
                                    ServerLogEvent {
                                        server_id: repair_id,
                                        line: "[Manager] Auto-repair: Starting server without mods...".to_string(),
                                        is_stderr: false,
                                    },
                                );
                                
                                // Trigger restart without mods via Tauri command
                                // Use runtime to call the async command
                                match tokio::runtime::Runtime::new() {
                                    Ok(rt) => {
                                        rt.block_on(async {
                                            // Get the state from the app handle
                                            let state: tauri::State<'_, AppState> = repair_handle.state();
                                            
                                            // Import and call the start_server_no_mods command
                                            if let Err(e) = crate::commands::server::start_server_no_mods(
                                                repair_handle.clone(),
                                                state,
                                                repair_id,
                                            ).await {
                                                println!("  ❌ Auto-repair failed for server {}: {}", repair_id, e);
                                                let _ = repair_handle.emit(
                                                    "server_log",
                                                    ServerLogEvent {
                                                        server_id: repair_id,
                                                        line: format!("[Manager] Auto-repair failed: {}. Please restart manually.", e),
                                                        is_stderr: true,
                                                    },
                                                );
                                                
                                                // Update status back to stopped
                                                if let Some(state) = repair_handle.try_state::<AppState>() {
                                                    if let Ok(db) = state.db.lock() {
                                                        if let Ok(conn) = db.get_connection() {
                                                            let _ = conn.execute(
                                                                "UPDATE servers SET status = 'stopped' WHERE id = ?1",
                                                                [repair_id],
                                                            );
                                                        }
                                                    }
                                                }
                                            } else {
                                                println!("  ✅ Auto-repair: Server {} restarted without mods", repair_id);
                                                let _ = repair_handle.emit(
                                                    "server_log",
                                                    ServerLogEvent {
                                                        server_id: repair_id,
                                                        line: "[Manager] Auto-repair successful! Server restarted without mods.".to_string(),
                                                        is_stderr: false,
                                                    },
                                                );
                                            }
                                        });
                                    }
                                    Err(e) => {
                                        println!("  ❌ Failed to create tokio runtime for auto-repair: {}", e);
                                    }
                                }
                            });
                        }
                    }
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
        _server_type: &str,
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
    ) -> Result<()> {
        let executable = install_path
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64")
            .join("ArkAscendedServer.exe");

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
        let mut connection_url = format!("{}?listen", map_name);
        connection_url.push_str(&format!("?SessionName={}", session_name));
        connection_url.push_str(&format!("?Port={}", game_port));
        connection_url.push_str(&format!("?QueryPort={}", query_port));
        connection_url.push_str(&format!("?RCONPort={}", rcon_port));
        connection_url.push_str(&format!("?MaxPlayers={}", max_players));
        connection_url.push_str(&format!("?ServerAdminPassword={}", admin_password));

        if let Some(password) = server_password {
            connection_url.push_str(&format!("?ServerPassword={}", password));
        }

        let mut args = vec![connection_url];

        args.push("-log".to_string());
        args.push("-NoBattlEye".to_string());

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
                args.push(format!("-ClusterDirOverride=\"{}\"", cdir));
                println!(
                    "  🔗 Server {} joining cluster: {} at {}",
                    server_id, cid, cdir
                );
            }
        }

        // Add mods if any are enabled
        if let Some(mod_list) = mods {
            if !mod_list.is_empty() {
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

        // Add custom launch arguments
        if let Some(custom) = custom_args {
            if !custom.is_empty() {
                // Split by whitespace but respect basic quoting if possible,
                // for now simple split is safer than nothing.
                let custom_parts: Vec<String> =
                    custom.split_whitespace().map(|s| s.to_string()).collect();
                args.extend(custom_parts);
            }
        }

        println!("  🚀 Executing Command: {:?} {:?}", executable, args);

        let win64_dir = install_path
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64");

        println!("  📂 Setting Working Directory: {:?}", win64_dir);

        let mut command = Command::new(&executable);
        command
            .current_dir(&win64_dir)
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = command.spawn().context("Failed to start server process")?;
        let child_pid = child.id();

        // Capture Output Streams
        let stdout = child.stdout.take().expect("Failed to capture stdout");
        let stderr = child.stderr.take().expect("Failed to capture stderr");

        let app_handle_out = self.app_handle.clone();
        let app_handle_err = self.app_handle.clone();

        // Stdout Reader
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(l) = line {
                    // Filter out noisy CFCore messages (mod system warnings that aren't actual errors)
                    if l.contains("LogCFCore:") && (
                        l.contains("Couldn't load mods library") ||
                        l.contains("No machine id was found") ||
                        l.contains("UserContextInfo not loaded") ||
                        l.contains("Error querying server mods") ||
                        l.contains("Error: 404")
                    ) {
                        continue; // Skip these noisy CFCore warnings
                    }
                    
                    let _ = app_handle_out.emit(
                        "server_log",
                        ServerLogEvent {
                            server_id,
                            line: l,
                            is_stderr: false,
                        },
                    );
                }
            }
        });

        // Stderr Reader
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(l) = line {
                    // Filter out noisy CFCore messages (mod system warnings that aren't actual errors)
                    if l.contains("LogCFCore:") && (
                        l.contains("Couldn't load mods library") ||
                        l.contains("No machine id was found") ||
                        l.contains("UserContextInfo not loaded") ||
                        l.contains("Error querying server mods") ||
                        l.contains("Error: 404")
                    ) {
                        continue; // Skip these noisy CFCore warnings
                    }
                    
                    let _ = app_handle_err.emit(
                        "server_log",
                        ServerLogEvent {
                            server_id,
                            line: l,
                            is_stderr: true, // Mark as stderr
                        },
                    );
                }
            }
        });

        // Wait a moment to check for immediate startup failures (e.g. missing DLLs, bad path)
        // Only check for very quick failures - ARK servers can take several minutes to fully start
        std::thread::sleep(std::time::Duration::from_secs(3));

        match child.try_wait() {
            Ok(Some(status)) => {
                let exit_code = status.code().unwrap_or(-1);
                let error_msg = match exit_code {
                    3 => "Exit code 3: This usually indicates invalid map name, corrupted installation, or missing game files. Try verifying/updating the server installation.",
                    1 => "Exit code 1: General error. Check for missing dependencies or configuration issues.",
                    -1 => "Process terminated abnormally. Check for anti-virus interference or missing permissions.",
                    _ => "Unknown error. Check the server console logs for details.",
                };
                return Err(anyhow::anyhow!(
                    "Server process exited immediately with status: {:?} (code: {}). {}",
                    status,
                    exit_code,
                    error_msg
                ));
            }
            Ok(None) => {
                // Still running after 5 seconds - let the background monitor handle any later crashes
            }
            Err(e) => {
                return Err(anyhow::anyhow!("Failed to check process status: {}", e));
            }
        }

        println!("  ✅ Server {} started with PID: {} ", server_id, child_pid);

        // Emit 'running' event (This now means process started, but not yet ready)
        self.emit_status_change(server_id, "running");

        // Create stop flag for log watcher
        let stop_flag = Arc::new(AtomicBool::new(false));
        let stop_flag_clone = stop_flag.clone();

        // 3. Create Online Flag (New)
        let online_flag = Arc::new(AtomicBool::new(false));
        let online_flag_clone = online_flag.clone();

        // Store process
        {
            let mut processes = self.processes.lock().unwrap();
            processes.insert(server_id, ServerProcess { child, stop_flag });
        }

        // Start log file watcher (Unchanged block omitted for brevity, keeping existing logic)
        let app_handle = self.app_handle.clone();
        let app_handle_status = self.app_handle.clone(); // Clone for status updates inside thread

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

            // Seek to end to only read new lines
            let _ = reader.seek(SeekFrom::End(0));

            // Read new lines as they appear
            while !stop_flag_clone.load(Ordering::SeqCst) {
                let mut line = String::new();
                match reader.read_line(&mut line) {
                    Ok(0) => {
                        // No new data, wait a bit
                        std::thread::sleep(std::time::Duration::from_millis(100));
                    }
                    Ok(_) => {
                        let line = line.trim_end().to_string();
                        if !line.is_empty() {
                            let _ = app_handle.emit(
                                "server_log",
                                ServerLogEvent {
                                    server_id,
                                    line: line.clone(),
                                    is_stderr: false,
                                },
                            );

                            // CHECK FOR SERVER READY STATE
                            if !online_flag_clone.load(Ordering::SeqCst) {
                                if line.contains("server has successfully started")
                                    || line.contains("Full Startup: ")
                                    || line.contains("Number of cores")
                                // Sometimes appears late
                                {
                                    println!("  🎉 Server {} is ONLINE!", server_id);
                                    online_flag_clone.store(true, Ordering::SeqCst);
                                    // Update database status (Do this FIRST to avoid race conditions with frontend polling)
                                    if let Some(state) = app_handle_status.try_state::<AppState>() {
                                        match state.db.lock() {
                                            Ok(db) => {
                                                match db.get_connection() {
                                                    Ok(conn) => {
                                                        if let Err(e) = conn.execute(
                                                            "UPDATE servers SET status = 'online' WHERE id = ?1",
                                                            [server_id],
                                                        ) {
                                                            eprintln!("  ❌ Failed to update server status in DB: {}", e);
                                                        }
                                                    }
                                                    Err(e) => eprintln!("  ❌ Failed to get DB connection: {}", e),
                                                }
                                            }
                                            Err(e) => eprintln!("  ❌ Failed to lock DB: {}", e),
                                        }
                                    }

                                    // Then emit status change event
                                    let _ = app_handle_status.emit(
                                        "server-status-change",
                                        ServerStatusEvent {
                                            server_id,
                                            status: "online".to_string(),
                                        },
                                    );
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

        Ok(())
    }

    /// Stop ARK server (Force)
    pub fn stop_server(&self, server_id: i64) -> Result<()> {
        let mut processes = self.processes.lock().unwrap();

        if let Some(mut server_proc) = processes.remove(&server_id) {
            // Signal log watcher to stop
            server_proc.stop_flag.store(true, Ordering::SeqCst);

            // Force kill the process tree on Windows
            #[cfg(target_os = "windows")]
            {
                let pid = server_proc.child.id();
                let _ = Command::new("taskkill")
                    .args(["/F", "/T", "/PID", &pid.to_string()])
                    .creation_flags(CREATE_NO_WINDOW)
                    .output();
            }

            // Fallback
            let _ = server_proc.child.kill();
            let _ = server_proc.child.wait();

            // Emit stopped status
            self.emit_status_change(server_id, "stopped");
        }
        Ok(())
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
            self.stop_server(server_id)?;
        }

        Ok(())
    }

    /// Check if server is running
    pub fn is_running(&self, server_id: i64) -> bool {
        let mut processes = self.processes.lock().unwrap();

        if let Some(server_proc) = processes.get_mut(&server_id) {
            match server_proc.child.try_wait() {
                Ok(Some(status)) => {
                    let exit_code = status.code().unwrap_or(-1);
                    let status_str = if exit_code == 0 { "stopped" } else { "crashed" };

                    println!(
                        "  ⚠️ Server {} exited with status: {:?} (code: {}, status: {})",
                        server_id, status, exit_code, status_str
                    );
                    server_proc.stop_flag.store(true, Ordering::SeqCst);
                    processes.remove(&server_id);

                    // Emit crash/stop event
                    self.emit_status_change(server_id, status_str);

                    // Update database status
                    if let Some(state) = self.app_handle.try_state::<AppState>() {
                        if let Ok(db) = state.db.lock() {
                            if let Ok(conn) = db.get_connection() {
                                let _ = conn.execute(
                                    "UPDATE servers SET status = 'stopped' WHERE id = ?1",
                                    [server_id],
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
    ) -> Result<()> {
        if self.is_running(server_id) {
            self.stop_server(server_id)?;
        }

        std::thread::sleep(std::time::Duration::from_secs(2));

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
        )
    }

    /// Show the hidden server window
    pub fn show_server_window(&self, server_id: i64) -> Result<()> {
        let processes = self.processes.lock().unwrap();
        if let Some(server_proc) = processes.get(&server_id) {
            let pid = server_proc.child.id();
            #[cfg(target_os = "windows")]
            {
                window_hider::show_process_window(pid);
            }
            Ok(())
        } else {
            Err(anyhow::anyhow!("Server is not running"))
        }
    }
}
