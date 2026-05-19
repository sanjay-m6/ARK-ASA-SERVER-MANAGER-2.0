use crate::ase::models::AseServer;
use crate::AppState;
use tauri::{AppHandle, State, Emitter, Manager};
use std::path::PathBuf;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;
const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;

// Helper to get local IP address (best guess)
fn get_local_ip() -> std::net::Ipv4Addr {
    use std::net::UdpSocket;
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|socket| {
            socket.connect("8.8.8.8:80")?;
            socket.local_addr()
        })
        .ok()
        .and_then(|addr| match addr {
            std::net::SocketAddr::V4(v4) => Some(*v4.ip()),
            _ => None,
        })
        .unwrap_or(std::net::Ipv4Addr::new(192, 168, 1, 100))
}

// Helper to check if a process ID is still active
#[cfg(target_os = "windows")]
fn is_pid_running(pid: u32) -> bool {
    unsafe {
        let handle = windows_sys::Win32::System::Threading::OpenProcess(
            windows_sys::Win32::System::Threading::PROCESS_QUERY_INFORMATION,
            0,
            pid,
        );
        if handle.is_null() {
            return false;
        }
        let mut exit_code: u32 = 0;
        let success = windows_sys::Win32::System::Threading::GetExitCodeProcess(handle, &mut exit_code);
        windows_sys::Win32::Foundation::CloseHandle(handle);
        success != 0 && exit_code == 259 // 259 is STILL_ACTIVE
    }
}

#[cfg(not(target_os = "windows"))]
fn is_pid_running(pid: u32) -> bool {
    std::process::Command::new("kill")
        .args(["-0", &pid.to_string()])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}


/// Helper: read all ASE servers from DB
fn read_server_row(row: &rusqlite::Row) -> Result<AseServer, rusqlite::Error> {
    Ok(AseServer {
        id: row.get(0)?, name: row.get(1)?, install_path: row.get(2)?,
        map_name: row.get(3)?, port: row.get(4)?, query_port: row.get(5)?,
        rcon_port: row.get(6)?, rcon_password: row.get(7)?,
        max_players: row.get(8)?, server_password: row.get(9)?,
        admin_password: row.get(10)?, session_name: row.get(11)?,
        active_mods: row.get(12)?, cluster_id: row.get(13)?,
        battleye: row.get(14)?, extra_args: row.get(15)?,
        status: row.get(16)?, process_id: row.get(17)?,
        created_at: row.get(18)?, updated_at: row.get(19)?,
        auto_start: row.get::<_, i32>(20)? != 0,
        auto_stop: row.get::<_, i32>(21)? != 0,
        intelligent_mode: row.get::<_, i32>(22)? != 0,
        startup_delay: row.get(23)?,
        startup_priority: row.get(24)?,
    })
}

const SELECT_COLS: &str = "id, name, install_path, map_name, port, query_port, rcon_port, \
    rcon_password, max_players, server_password, admin_password, session_name, active_mods, \
    cluster_id, battleye, extra_args, status, process_id, created_at, updated_at, \
    auto_start, auto_stop, intelligent_mode, startup_delay, startup_priority";

#[tauri::command]
pub async fn get_ase_servers(state: State<'_, AppState>) -> Result<Vec<AseServer>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(&format!("SELECT {} FROM ase_servers", SELECT_COLS))
        .map_err(|e| e.to_string())?;
    let mut servers = Vec::new();
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        servers.push(read_server_row(row).map_err(|e| e.to_string())?);
    }
    Ok(servers)
}

#[tauri::command]
pub async fn get_ase_server_by_id(server_id: i64, state: State<'_, AppState>) -> Result<AseServer, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    conn.query_row(
        &format!("SELECT {} FROM ase_servers WHERE id = ?1", SELECT_COLS),
        [server_id], |row| read_server_row(row),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_ase_server(
    name: String, install_path: String, map_name: String,
    game_port: u16, query_port: u16, rcon_port: u16,
    admin_password: String, session_name: String,
    state: State<'_, AppState>,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO ase_servers (name, install_path, map_name, port, query_port, rcon_port, \
         rcon_password, max_players, server_password, admin_password, session_name, active_mods, \
         cluster_id, battleye, extra_args, status, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, '', 70, '', ?7, ?8, '', '', 1, '', 'stopped', ?9, ?9)",
        rusqlite::params![name, install_path, map_name, game_port, query_port, rcon_port, admin_password, session_name, now],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub async fn delete_ase_server(server_id: i64, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM ase_servers WHERE id = ?1", [server_id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_ase_server(server_id: i64, updates: serde_json::Value, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let obj = updates.as_object().ok_or("Updates must be a JSON object")?;

    let allowed = ["name","install_path","map_name","port","query_port","rcon_port",
        "rcon_password","max_players","server_password","admin_password","session_name",
        "active_mods","cluster_id","battleye","extra_args",
        "auto_start","auto_stop","intelligent_mode","startup_delay","startup_priority"];

    for (key, val) in obj {
        let key_snake = match key.as_str() {
            "autoStart" => "auto_start",
            "autoStop" => "auto_stop",
            "intelligentMode" => "intelligent_mode",
            "startupDelay" => "startup_delay",
            "startupPriority" => "startup_priority",
            k => k,
        };
        if !allowed.contains(&key_snake) { continue; }
        let sql = format!("UPDATE ase_servers SET {} = ?1, updated_at = ?2 WHERE id = ?3", key_snake);
        match val {
            serde_json::Value::String(s) => {
                conn.execute(&sql, rusqlite::params![s, now, server_id]).map_err(|e| e.to_string())?;
            }
            serde_json::Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    conn.execute(&sql, rusqlite::params![i, now, server_id]).map_err(|e| e.to_string())?;
                }
            }
            serde_json::Value::Bool(b) => {
                let int_val = if *b { 1 } else { 0 };
                conn.execute(&sql, rusqlite::params![int_val, now, server_id]).map_err(|e| e.to_string())?;
            }
            _ => {}
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn install_ase_server(
    app_handle: AppHandle,
    name: String, install_path: String, map_name: String,
    game_port: u16, query_port: u16, rcon_port: u16,
    admin_password: String, session_name: String,
    state: State<'_, AppState>,
) -> Result<i64, String> {
    // Create server record first
    let server_id = create_ase_server(
        name, install_path.clone(), map_name, game_port, query_port,
        rcon_port, admin_password, session_name, state,
    ).await?;

    let install_dir = PathBuf::from(&install_path);
    if !install_dir.exists() {
        std::fs::create_dir_all(&install_dir)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    // Run ServerInstaller for ASE (streams "install-progress" and "install-console" events)
    let installer = crate::services::server_installer::ServerInstaller::new(app_handle.clone(), install_dir.to_string_lossy().to_string());
    installer.install_server(&install_dir, "ASE").await?;

    Ok(server_id)
}

#[tauri::command]
pub async fn start_ase_server(app: tauri::AppHandle, server_id: i64, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let server: AseServer = conn.query_row(
        &format!("SELECT {} FROM ase_servers WHERE id = ?1", SELECT_COLS),
        [server_id], |row| read_server_row(row),
    ).map_err(|e| e.to_string())?;

    let exe_path = PathBuf::from(&server.install_path)
        .join("ShooterGame").join("Binaries").join("Win64").join("ShooterGameServer.exe");

    if !exe_path.exists() {
        return Err(format!("ShooterGameServer.exe not found at {}", exe_path.display()));
    }

    // Build ASE travel URL: MapName?listen?Option=Value?...
    let mut travel = format!(
        "{}?listen?SessionName={}?Port={}?QueryPort={}?MaxPlayers={}?ServerAdminPassword={}?RCONEnabled={}?RCONPort={}",
        server.map_name, server.session_name, server.port, server.query_port,
        server.max_players, server.admin_password, server.rcon_port != 0, server.rcon_port,
    );

    if !server.server_password.is_empty() {
        travel.push_str(&format!("?ServerPassword={}", server.server_password));
    }

    // Build CLI args
    let mut args: Vec<String> = vec![travel];

    if !server.battleye {
        args.push("-NoBattlEye".into());
    }

    if !server.cluster_id.is_empty() {
        args.push(format!("-clusterid={}", server.cluster_id));
    }

    if !server.extra_args.is_empty() {
        for arg in server.extra_args.split_whitespace() {
            args.push(arg.to_string());
        }
    }

    // Parse GameUserSettings.ini directly for custom ASM2 args and ActiveEvent
    let gus_path = PathBuf::from(&server.install_path)
        .join("ShooterGame").join("Saved").join("Config").join("WindowsServer").join("GameUserSettings.ini");
    
    if let Ok(content) = std::fs::read_to_string(&gus_path) {
        for line in content.lines() {
            let line = line.trim();
            if line.starts_with("ActiveEvent=") {
                let event = line.trim_start_matches("ActiveEvent=");
                if !event.is_empty() {
                    args.push(format!("-ActiveEvent={}", event));
                }
            } else if line.starts_with("NoBattlEye=") {
                if line.to_lowercase().ends_with("true") || line.ends_with("1") {
                    if server.battleye {
                        args.push("-NoBattlEye".into());
                    }
                }
            } else if line.starts_with("UseAllAvailableCores=") {
                if line.to_lowercase().ends_with("true") || line.ends_with("1") {
                    args.push("-USEALLAVAILABLECORES".into());
                }
            } else if line.starts_with("UseLowMemory=") {
                if line.to_lowercase().ends_with("true") || line.ends_with("1") {
                    args.push("-nomansky".into());
                    args.push("-lowmemory".into());
                }
            } else if line.starts_with("LauncherArgs=") {
                let launcher_args = line.trim_start_matches("LauncherArgs=");
                if !launcher_args.is_empty() {
                    for arg in launcher_args.split_whitespace() {
                        args.push(arg.to_string());
                    }
                }
            }
        }
    }

    // Spawn process
    let child = std::process::Command::new(&exe_path)
        .args(&args)
        .current_dir(exe_path.parent().unwrap())
        .creation_flags(CREATE_NEW_PROCESS_GROUP)
        .spawn()
        .map_err(|e| format!("Failed to start server: {}", e))?;

    let pid = child.id();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE ase_servers SET status = 'starting', process_id = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![pid, now, server_id],
    ).map_err(|e| e.to_string())?;

    // Drop DB lock before awaiting or sleeping
    drop(conn);
    drop(db);

    let query_port = server.query_port;
    let rcon_port = server.rcon_port;
    
    // Spawn background task to check if server comes online
    tauri::async_runtime::spawn(async move {
        let local_ip = get_local_ip().to_string();
        
        for _ in 0..120 { // Check for up to 10 minutes (120 * 5s)
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            
            // Check process status (if crashed or stopped by user)
            let mut is_running = true;
            
            if let Some(state) = tauri::Manager::try_state::<AppState>(&app) {
                if let Ok(db) = state.db.lock() {
                    if let Ok(conn) = db.get_connection() {
                        let row: Result<(String, Option<u32>), _> = conn.query_row(
                            "SELECT status, process_id FROM ase_servers WHERE id = ?1",
                            [server_id],
                            |r| Ok((r.get(0)?, r.get(1)?)),
                        );
                        if let Ok((status, pid_opt)) = row {
                            if status != "starting" && status != "online" {
                                // Changed by user (stopped, restoring, etc.), exit check
                                break;
                            }
                            if let Some(pid) = pid_opt {
                                if !is_pid_running(pid) {
                                    is_running = false;
                                }
                            }
                        }
                    }
                }
            }

            if !is_running {
                println!("❌ [ASE] Server {} process (PID) is no longer running. Setting status to crashed.", server_id);
                if let Some(state) = app.try_state::<AppState>() {
                    if let Ok(db) = state.db.lock() {
                        if let Ok(conn) = db.get_connection() {
                            let _ = conn.execute(
                                "UPDATE ase_servers SET status = 'crashed', process_id = NULL WHERE id = ?1 AND status = 'starting'",
                                rusqlite::params![server_id],
                            );
                            let _ = app.emit("server-status-change", serde_json::json!({
                                "server_id": server_id,
                                "status": "crashed"
                            }));
                        }
                    }
                }
                break;
            }

            // Check if server is queryable (UDP query port or RCON TCP port)
            let is_online = crate::services::network::query_server("127.0.0.1", query_port)
                || crate::services::network::query_server(&local_ip, query_port)
                || (rcon_port != 0 && crate::services::network::check_port_open("127.0.0.1", rcon_port))
                || (rcon_port != 0 && crate::services::network::check_port_open(&local_ip, rcon_port));

            if is_online {
                println!("✅ [ASE] Server {} came online!", server_id);
                if let Some(state) = app.try_state::<AppState>() {
                    if let Ok(db) = state.db.lock() {
                        if let Ok(conn) = db.get_connection() {
                            let _ = conn.execute(
                                "UPDATE ase_servers SET status = 'online' WHERE id = ?1 AND status = 'starting'",
                                rusqlite::params![server_id],
                            );
                            let _ = app.emit("server-status-change", serde_json::json!({
                                "server_id": server_id,
                                "status": "online"
                            }));
                        }
                    }
                }
                break;
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_ase_server(server_id: i64, state: State<'_, AppState>) -> Result<(), String> {
    // Extract what we need from DB, then drop the lock before any .await
    let process_id: Option<u32> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT process_id FROM ase_servers WHERE id = ?1",
            [server_id], |row| row.get(0),
        ).map_err(|e| format!("Server not found: {}", e))?
    }; // db + conn dropped here

    // Try graceful RCON shutdown first (these acquire their own DB locks internally)
    let rcon_result = super::rcon::send_ase_rcon(
        server_id, "SaveWorld".into(), state.clone(),
    ).await;

    if rcon_result.is_ok() {
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        let _ = super::rcon::send_ase_rcon(server_id, "DoExit".into(), state.clone()).await;
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    }

    // Fallback: kill process
    if let Some(pid) = process_id {
        #[cfg(target_os = "windows")]
        {
            let _ = std::process::Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string()])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
        }
    }

    // Re-acquire lock for final status update
    let now = chrono::Utc::now().to_rfc3339();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE ase_servers SET status = 'stopped', process_id = NULL, updated_at = ?1 WHERE id = ?2",
        rusqlite::params![now, server_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_ase_server_status(server_id: i64, state: State<'_, AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT status FROM ase_servers WHERE id = ?1",
        [server_id], |row| row.get::<_, String>(0),
    ).map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
pub struct ResetOptions {
    wipe_save: bool,
    wipe_config: bool,
    wipe_logs: bool,
}

#[tauri::command]
pub async fn reset_ase_server(
    server_id: i64,
    options: ResetOptions,
    state: State<'_, AppState>
) -> Result<(), String> {
    let server = get_ase_server_by_id(server_id, state).await?;
    let base_path = PathBuf::from(&server.install_path).join("ShooterGame").join("Saved");

    if options.wipe_save {
        let saved_arks = base_path.join("SavedArks");
        if saved_arks.exists() {
            let _ = std::fs::remove_dir_all(&saved_arks);
        }
        let local_profiles = base_path.join("LocalProfiles");
        if local_profiles.exists() {
            let _ = std::fs::remove_dir_all(&local_profiles);
        }
    }

    if options.wipe_config {
        let config_dir = base_path.join("Config").join("WindowsServer");
        if config_dir.exists() {
            // Delete Game.ini and GameUserSettings.ini
            let _ = std::fs::remove_file(config_dir.join("Game.ini"));
            let _ = std::fs::remove_file(config_dir.join("GameUserSettings.ini"));
        }
    }

    if options.wipe_logs {
        let logs_dir = base_path.join("Logs");
        if logs_dir.exists() {
            let _ = std::fs::remove_dir_all(&logs_dir);
        }
    }

    Ok(())
}

