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

/// Helper to find and cleanly terminate any orphaned server or SteamCMD processes under the server install directory
fn kill_orphaned_processes(install_path: &str) {
    let mut sys = sysinfo::System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let normalized_install_path = install_path.replace("\\", "/").to_lowercase();
    println!("[ASE Process Watchdog] Checking for orphaned processes in install path: {}", normalized_install_path);

    for (pid, process) in sys.processes() {
        let name = process.name().to_string_lossy().to_lowercase();
        if name == "shootergameserver.exe" || name == "steamcmd.exe" {
            if let Some(exe_path) = process.exe() {
                let exe_path_str = exe_path.to_string_lossy().replace("\\", "/").to_lowercase();
                if exe_path_str.contains(&normalized_install_path) {
                    println!("[ASE Process Watchdog] Found orphaned process '{}' (PID {}) in our path. Terminating...", name, pid);
                    
                    #[cfg(target_os = "windows")]
                    {
                        let _ = std::process::Command::new("taskkill")
                            .args(["/F", "/T", "/PID", &pid.to_string()])
                            .creation_flags(CREATE_NO_WINDOW)
                            .output();
                    }
                    #[cfg(not(target_os = "windows"))]
                    {
                        let _ = std::process::Command::new("kill")
                            .args(["-9", &pid.to_string()])
                            .output();
                    }
                }
            }
        }
    }
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
        branch: row.get(25)?,
    })
}

const SELECT_COLS: &str = "id, name, install_path, map_name, port, query_port, rcon_port, \
    rcon_password, max_players, server_password, admin_password, session_name, active_mods, \
    cluster_id, battleye, extra_args, status, process_id, created_at, updated_at, \
    auto_start, auto_stop, intelligent_mode, startup_delay, startup_priority, branch";

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
    branch: String,
    state: State<'_, AppState>,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO ase_servers (name, install_path, map_name, port, query_port, rcon_port, \
         rcon_password, max_players, server_password, admin_password, session_name, active_mods, \
         cluster_id, battleye, extra_args, status, created_at, updated_at, branch) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, '', 70, '', ?7, ?8, '', '', 1, '', 'stopped', ?9, ?9, ?10)",
        rusqlite::params![name, install_path, map_name, game_port, query_port, rcon_port, admin_password, session_name, now, branch],
    ).map_err(|e| e.to_string())?;
    let server_id = conn.last_insert_rowid();
    let _ = conn.execute(
        "INSERT OR IGNORE INTO ase_scheduler_settings (server_id) VALUES (?1)",
        [server_id],
    );
    Ok(server_id)
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
        "auto_start","auto_stop","intelligent_mode","startup_delay","startup_priority","branch"];

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
    branch: Option<String>,
    state: State<'_, AppState>,
) -> Result<i64, String> {
    // Create server record first
    let server_id = create_ase_server(
        name, install_path.clone(), map_name, game_port, query_port,
        rcon_port, admin_password, session_name, branch.clone().unwrap_or_else(|| "default".to_string()), state,
    ).await?;

    let install_dir = PathBuf::from(&install_path);
    if !install_dir.exists() {
        std::fs::create_dir_all(&install_dir)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    // Run ServerInstaller for ASE (streams "install-progress" and "install-console" events)
    let installer = crate::services::server_installer::ServerInstaller::new(app_handle.clone(), install_dir.to_string_lossy().to_string());
    installer.install_server(&install_dir, "ASE", branch).await?;

    Ok(server_id)
}

#[tauri::command]
pub async fn update_ase_server_install(
    app_handle: AppHandle,
    server_id: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // 1. Get the server details from the DB
    let srv = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.query_row(
            &format!("SELECT {} FROM ase_servers WHERE id = ?1", SELECT_COLS),
            [server_id], |row| read_server_row(row),
        ).map_err(|e| e.to_string())?
    };

    // 2. Set status to 'updating' in the DB
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE ase_servers SET status = 'updating' WHERE id = ?1",
            [server_id],
        ).map_err(|e| e.to_string())?;
    }

    // Emit event to update UI status
    let _ = app_handle.emit("server-status-change", serde_json::json!({ "server_id": server_id, "status": "updating" }));

    // 3. Run installation via SteamCMD
    let install_dir = PathBuf::from(&srv.install_path);
    let installer = crate::services::server_installer::ServerInstaller::new(app_handle.clone(), srv.install_path.clone());
    
    // Pass the branch saved in the DB
    let branch_opt = if srv.branch.is_empty() || srv.branch == "default" {
        None
    } else {
        Some(srv.branch.clone())
    };

    match installer.install_server(&install_dir, "ASE", branch_opt).await {
        Ok(_) => {
            // Set status to 'stopped' when done
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            conn.execute(
                "UPDATE ase_servers SET status = 'stopped' WHERE id = ?1",
                [server_id],
            ).map_err(|e| e.to_string())?;
            let _ = app_handle.emit("server-status-change", serde_json::json!({ "server_id": server_id, "status": "stopped" }));
            
            // Send completed event to frontend
            let _ = app_handle.emit("install-progress", crate::services::server_installer::InstallProgress {
                install_path: srv.install_path.clone(),
                stage: "complete".to_string(),
                progress: 100.0,
                message: "Server files updated successfully!".to_string(),
                is_complete: true,
                is_error: false,
            });
            Ok(())
        }
        Err(e) => {
            // Restore status to stopped
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            conn.execute(
                "UPDATE ase_servers SET status = 'stopped' WHERE id = ?1",
                [server_id],
            ).map_err(|e| e.to_string())?;
            let _ = app_handle.emit("server-status-change", serde_json::json!({ "server_id": server_id, "status": "stopped" }));
            
            // Send error event
            let _ = app_handle.emit("install-progress", crate::services::server_installer::InstallProgress {
                install_path: srv.install_path.clone(),
                stage: "error".to_string(),
                progress: 0.0,
                message: e.clone(),
                is_complete: false,
                is_error: true,
            });
            Err(e)
        }
    }
}

async fn resolve_public_ip() -> Option<String> {
    if let Ok(resp) = reqwest::get("https://api.ipify.org").await {
        if let Ok(ip) = resp.text().await {
            let trimmed = ip.trim().to_string();
            if !trimmed.is_empty() {
                return Some(trimmed);
            }
        }
    }
    None
}

fn fetch_active_mod_ids(
    conn: &rusqlite::Connection,
    server_id: i64,
    server_active_mods: &str,
) -> Result<Vec<String>, String> {
    let mut stmt = conn.prepare(
        "SELECT workshop_id FROM ase_mods WHERE server_id = ?1 AND enabled = 1 ORDER BY load_order ASC"
    ).map_err(|e| e.to_string())?;
    let mut rows = stmt.query([server_id]).map_err(|e| e.to_string())?;
    let mut ids = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        ids.push(row.get::<_, String>(0).map_err(|e| e.to_string())?);
    }
    
    if ids.is_empty() && !server_active_mods.is_empty() {
        let fallback_ids: Vec<String> = server_active_mods.split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        let now = chrono::Utc::now().to_rfc3339();
        
        for (idx, id) in fallback_ids.iter().enumerate() {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO ase_mods (server_id, workshop_id, name, version, installed_at, enabled, load_order) \
                 VALUES (?1, ?2, ?3, '1.0', ?4, 1, ?5)",
                rusqlite::params![server_id, id, format!("Workshop Mod {}", id), now, idx as i32],
            );
        }
        Ok(fallback_ids)
    } else {
        Ok(ids)
    }
}

fn build_ase_launch_arguments(
    server: &AseServer,
    config: &crate::ase::models::AseGameConfig,
    public_ip: Option<String>,
    active_mod_ids: &[String],
) -> Vec<String> {
    let mut travel = format!(
        "{}?listen?SessionName={}?Port={}?QueryPort={}?MaxPlayers={}?ServerAdminPassword={}?RCONEnabled={}?RCONPort={}",
        server.map_name, server.session_name, server.port, server.query_port,
        server.max_players, server.admin_password, server.rcon_port != 0, server.rcon_port,
    );

    if !server.server_password.is_empty() {
        travel.push_str(&format!("?ServerPassword={}", server.server_password));
    }

    if !config.alternate_save_directory_name.is_empty() {
        travel.push_str(&format!("?AltSaveDirectoryName={}", config.alternate_save_directory_name));
    }

    if !active_mod_ids.is_empty() {
        travel.push_str(&format!("?ActiveMods={}", active_mod_ids.join(",")));
    }

    if config.enable_extinction_event {
        travel.push_str("?EnableExtinctionEvent=true");
        if config.extinction_event_time_interval > 0 {
            let seconds = config.extinction_event_time_interval * 86400;
            travel.push_str(&format!("?ExtinctionEventTimeInterval={}", seconds));
        }
    }

    let mut args: Vec<String> = vec![travel];

    if !server.battleye || config.no_battle_eye {
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

    if !config.active_event.is_empty() {
        args.push(format!("-ActiveEvent={}", config.active_event));
    }

    if config.use_all_available_cores {
        args.push("-USEALLAVAILABLECORES".into());
    }
    
    if config.use_low_memory || config.force_low_memory {
        args.push("-lowmemory".into());
    }
    
    if config.force_no_man_sky {
        args.push("-nomansky".into());
    }

    if config.no_playervac {
        args.push("-insecure".into());
    }

    if config.no_anti_speed_hack {
        args.push("-NoAntiSpeedHack".into());
    } else {
        args.push(format!("-speedhackbias={}", config.speed_hack_cpu_bias));
    }

    if config.disable_movement_validation {
        args.push("-DisableMovementValidation".into());
    }

    if config.output_server_log_to_console {
        args.push("-log".into());
    }

    if config.no_hang_det {
        args.push("-NoHangDet".into());
    }

    if config.no_dinos {
        args.push("-NoDinos".into());
    }

    if config.no_under_mesh_checking {
        args.push("-NoUnderMeshChecking".into());
    }

    if config.no_under_mesh_killing {
        args.push("-NoUnderMeshKilling".into());
    }

    if config.enable_vivox {
        args.push("-UseVivox".into());
    }

    if config.secure_item_dino_spawning_rules {
        args.push("-UseSecureSpawnRules".into());
    }

    if config.additional_dupe_protection {
        args.push("-UseItemDupeCheck".into());
    }

    if config.force_respawn_dinos_on_startup {
        args.push("-ForceRespawnDinos".into());
    }

    if config.force_direct_x10 {
        args.push("-d3d10".into());
    }

    if config.force_shader_model4 {
        args.push("-sm4".into());
    }

    if config.use_no_memory_bias {
        args.push("-nomemorybias".into());
    }

    if config.stasis_keep_controllers {
        args.push("-StasisKeepControllers".into());
    }

    if config.server_allow_ansel {
        args.push("-ServerAllowAnsel".into());
    }

    if config.structure_memory_optimizations {
        args.push("-structurememopts".into());
    }

    if config.structure_stasis_grid {
        args.push("-structurestasisgrid".into());
    }

    if config.enable_crossplay {
        args.push("-crossplay".into());
    }

    if config.enable_public_ip_for_epic {
        if let Some(ip) = public_ip {
            args.push(format!("-PublicIPForEpic={}", ip));
        } else {
            args.push("-PublicIPForEpic=DETECTING_IP".into());
        }
    }

    if config.epic_store_players_only {
        args.push("-epiconly".into());
    }

    if config.use_cluster_directory_override && !config.cluster_directory_override.is_empty() {
        args.push(format!("-ClusterDirOverride=\"{}\"", config.cluster_directory_override));
    }

    if !config.launcher_args.is_empty() {
        for arg in config.launcher_args.split_whitespace() {
            args.push(arg.to_string());
        }
    }

    if config.new_save_game_format {
        args.push("-newsaveformat".into());
    }
    if config.use_store {
        args.push("-usestore".into());
    }
    if config.backup_transfer_player_datas {
        args.push("-BackupTransferPlayerDatas".into());
    }

    args
}

#[tauri::command]
pub async fn get_ase_launch_arguments(server_id: i64, state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let server: AseServer = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.query_row(
            &format!("SELECT {} FROM ase_servers WHERE id = ?1", SELECT_COLS),
            [server_id], |row| read_server_row(row),
        ).map_err(|e| e.to_string())?
    };

    let config = match crate::ase::commands::config::read_ase_config(server_id, state.clone()).await {
        Ok(c) => c,
        Err(_) => crate::ase::models::AseGameConfig::default(),
    };

    let public_ip = if config.enable_public_ip_for_epic {
        resolve_public_ip().await
    } else {
        None
    };

    let active_mod_ids = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        fetch_active_mod_ids(&conn, server_id, &server.active_mods)?
    };

    Ok(build_ase_launch_arguments(&server, &config, public_ip, &active_mod_ids))
}

#[tauri::command]
pub async fn start_ase_server(app: tauri::AppHandle, server_id: i64, state: State<'_, AppState>) -> Result<(), String> {
    let server: AseServer = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.query_row(
            &format!("SELECT {} FROM ase_servers WHERE id = ?1", SELECT_COLS),
            [server_id], |row| read_server_row(row),
        ).map_err(|e| e.to_string())?
    };

    // 1. Terminate orphaned processes in our install directory to release port/file locks
    kill_orphaned_processes(&server.install_path);

    // 2. Cleanly terminate previous process ID if it was left running
    if let Some(pid) = server.process_id {
        if is_pid_running(pid) {
            println!("[ASE Startup] Previous server process PID {} is still active. Terminating to prevent port conflicts...", pid);
            #[cfg(target_os = "windows")]
            {
                let _ = std::process::Command::new("taskkill")
                    .args(["/F", "/PID", &pid.to_string()])
                    .creation_flags(CREATE_NO_WINDOW)
                    .output();
            }
            #[cfg(not(target_os = "windows"))]
            {
                let _ = std::process::Command::new("kill")
                    .args(["-9", &pid.to_string()])
                    .output();
            }
        }
    }

    // 3. Resolve active mod list from DB
    let active_mod_ids: Vec<String> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        fetch_active_mod_ids(&conn, server_id, &server.active_mods)?
    };

    // 4. Mod Pre-launch Validation and Download Loop
    if !active_mod_ids.is_empty() {
        println!("[ASE Mod Loader] Validating {} active mods before launch...", active_mod_ids.len());
        
        for id in &active_mod_ids {
            let report = crate::ase::commands::mods::validate_ase_mod(server_id, id.clone(), state.clone()).await
                .map_err(|e| format!("Mod validation failed for {}: {}", id, e))?;
            
            if !report.is_valid {
                println!("[ASE Mod Loader] Mod {} is invalid/missing (Issues: {:?}). Triggering auto-repair...", id, report.issues);
                
                // Set server status to 'updating' while downloads are active so frontend reflects the process
                {
                    let db = state.db.lock().map_err(|e| e.to_string())?;
                    let conn = db.get_connection().map_err(|e| e.to_string())?;
                    let _ = conn.execute(
                        "UPDATE ase_servers SET status = 'updating' WHERE id = ?1",
                        rusqlite::params![server_id],
                    );
                    let _ = app.emit("server-status-change", serde_json::json!({
                        "server_id": server_id,
                        "status": "updating"
                    }));
                }

                match crate::ase::commands::mods::repair_ase_mod(app.clone(), server_id, id.clone(), state.clone()).await {
                    Ok(repair_report) => {
                        if !repair_report.is_valid {
                            // Reset status to stopped in DB on failure
                            let db = state.db.lock().map_err(|e| e.to_string())?;
                            let conn = db.get_connection().map_err(|e| e.to_string())?;
                            let _ = conn.execute(
                                "UPDATE ase_servers SET status = 'stopped' WHERE id = ?1",
                                rusqlite::params![server_id],
                            );
                            let _ = app.emit("server-status-change", serde_json::json!({
                                "server_id": server_id,
                                "status": "stopped"
                            }));
                            return Err(format!("Critical Mod Failure: Mod {} auto-repair succeeded but validation still failed. Issues: {:?}", id, repair_report.issues));
                        }
                        println!("[ASE Mod Loader] Mod {} successfully repaired and verified.", id);
                    }
                    Err(err) => {
                        // Reset status to stopped in DB on failure
                        let db = state.db.lock().map_err(|e| e.to_string())?;
                        let conn = db.get_connection().map_err(|e| e.to_string())?;
                        let _ = conn.execute(
                            "UPDATE ase_servers SET status = 'stopped' WHERE id = ?1",
                            rusqlite::params![server_id],
                        );
                        let _ = app.emit("server-status-change", serde_json::json!({
                            "server_id": server_id,
                            "status": "stopped"
                        }));
                        return Err(format!("Critical Mod Failure: Mod {} download or extraction failed: {}", id, err));
                    }
                }
            }
        }

        // Sync mod order to GameUserSettings.ini before launch
        crate::ase::commands::mods::sync_ase_mods_to_ini(&server.install_path, &active_mod_ids)
            .map_err(|e| format!("Failed to synchronize mods to GameUserSettings.ini: {}", e))?;
    }

    let exe_path = PathBuf::from(&server.install_path)
        .join("ShooterGame").join("Binaries").join("Win64").join("ShooterGameServer.exe");

    if !exe_path.exists() {
        return Err(format!("ShooterGameServer.exe not found at {}", exe_path.display()));
    }

    let config = match crate::ase::commands::config::read_ase_config(server_id, state.clone()).await {
        Ok(c) => c,
        Err(_) => crate::ase::models::AseGameConfig::default(),
    };

    let public_ip = if config.enable_public_ip_for_epic {
        resolve_public_ip().await
    } else {
        None
    };

    let args = build_ase_launch_arguments(&server, &config, public_ip, &active_mod_ids);

    // Spawn process windowless
    #[cfg(target_os = "windows")]
    let child = std::process::Command::new(&exe_path)
        .args(&args)
        .current_dir(exe_path.parent().unwrap())
        .creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP)
        .spawn()
        .map_err(|e| format!("Failed to start server: {}", e))?;

    #[cfg(not(target_os = "windows"))]
    let child = std::process::Command::new(&exe_path)
        .args(&args)
        .current_dir(exe_path.parent().unwrap())
        .spawn()
        .map_err(|e| format!("Failed to start server: {}", e))?;

    let pid = child.id();
    let now = chrono::Utc::now().to_rfc3339();

    // Re-acquire db connection to update status
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.execute(
            "UPDATE ase_servers SET status = 'starting', process_id = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![pid, now, server_id],
        ).map_err(|e| e.to_string())?;
    }

    // Register with Guardian Watchdog Service
    if let Some(guardian) = app.try_state::<crate::services::guardian::GuardianState>() {
        let service = guardian.0.lock().await;
        service.register_ase_server(app.clone(), server_id, pid).await;
    }



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

/// Import an existing ASE server installation.
/// Reads GameUserSettings.ini and Game.ini to extract all settings,
/// then creates a fully populated ase_servers database row.
#[tauri::command]
pub async fn import_ase_server(
    install_path: String,
    name: String,
    overrides: Option<crate::commands::server::ImportPreview>,
    state: State<'_, AppState>,
) -> Result<AseServer, String> {
    use std::path::PathBuf;

    println!("📥 [ASE] Importing server from: {}", install_path);

    let path = PathBuf::from(&install_path);

    // Validate: check for ShooterGameServer.exe (ASE executable)
    let exe_path = path
        .join("ShooterGame")
        .join("Binaries")
        .join("Win64")
        .join("ShooterGameServer.exe");

    let shooter_game_path = path.join("ShooterGame");

    if exe_path.exists() {
        println!("   ✅ Found ASE server executable");
    } else if shooter_game_path.exists() {
        println!("   ⚠️  ShooterGame folder found but no executable — will need SteamCMD install");
    } else {
        println!("   ⚠️  Empty folder — server will be downloaded on first start");
    }

    // Use the unified parse_import_settings helper or overrides
    let preview = if let Some(ov) = overrides {
        ov
    } else {
        crate::commands::server::parse_import_settings(&path, "ASE")
    };

    let map_name = if preview.map_name.is_empty() { "TheIsland".to_string() } else { preview.map_name };
    let session_name = if preview.session_name.is_empty() { name.clone() } else { preview.session_name };
    let server_password = preview.server_password;
    let admin_password = preview.admin_password;
    let port = preview.game_port;
    let query_port = preview.query_port;
    let rcon_port = preview.rcon_port;
    let max_players = preview.max_players;
    let active_mods = preview.active_mods;
    let cluster_id = preview.cluster_id;
    let extra_args = preview.custom_args;

    // Detect BattlEye configuration using case-insensitive INI parser helpers
    let mut battleye = true;
    let gus_path = path
        .join("ShooterGame")
        .join("Saved")
        .join("Config")
        .join("WindowsServer")
        .join("GameUserSettings.ini");

    if gus_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&gus_path) {
            let sections = crate::commands::server::parse_ini(&content);
            let mut no_be = false;
            let mut be_enforcer = true;
            if let Some(v) = crate::commands::server::ini_get(&sections, &["ASM2"], "NoBattlEye") {
                no_be = v.to_lowercase() == "true" || v == "1";
            }
            if let Some(v) = crate::commands::server::ini_get(&sections, &["ServerSettings"], "BattlEyeEnforcer") {
                be_enforcer = v.to_lowercase() == "true" || v == "1";
            }
            battleye = !no_be && be_enforcer;
        }
    }

    println!(
        "   [ASE] Detected: Session={}, Map={}, MaxPlayers={}, Ports={}/{}/{}, Mods={}",
        session_name, map_name, max_players, port, query_port, rcon_port,
        if active_mods.is_empty() { "none".to_string() } else { active_mods.clone() }
    );

    // Database insert
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    // Check path uniqueness
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM ase_servers WHERE install_path = ?1)",
            [&install_path],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if exists {
        return Err("An ASE server with this installation path already exists.".to_string());
    }

    // Ensure unique name
    let mut unique_name = name.clone();
    let mut counter = 1;
    loop {
        let name_exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM ase_servers WHERE name = ?1)",
                [&unique_name],
                |row| row.get(0),
            )
            .unwrap_or(false);
        if !name_exists { break; }
        counter += 1;
        unique_name = format!("{} ({})", name, counter);
    }

    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO ase_servers (name, install_path, map_name, port, query_port, rcon_port, \
         rcon_password, max_players, server_password, admin_password, session_name, active_mods, \
         cluster_id, battleye, extra_args, status, created_at, updated_at, branch) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?9, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 'stopped', ?15, ?15, 'default')",
        rusqlite::params![
            unique_name, install_path, map_name, port, query_port, rcon_port,
            max_players, server_password, admin_password, session_name,
            active_mods.clone(), cluster_id, battleye as i32, extra_args, now
        ],
    ).map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    println!("✅ [ASE] Server imported with ID: {} (map: {})", id, map_name);

    // Populate ase_mods table from imported active_mods list
    if !active_mods.is_empty() {
        let mod_ids: Vec<&str> = active_mods.split(',')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();
        for (index, mod_id) in mod_ids.iter().enumerate() {
            println!("   📥 [ASE Import] Pre-populating mod {} with load order {}", mod_id, index);
            let _ = conn.execute(
                "INSERT OR IGNORE INTO ase_mods (server_id, workshop_id, name, version, installed_at, enabled, load_order) \
                 VALUES (?1, ?2, ?3, '1.0', ?4, 1, ?5)",
                rusqlite::params![id, mod_id, format!("Workshop Mod {}", mod_id), now, index as i32],
            );
        }
    }

    // Create pre-import backup for safety (only if Saved/SavedArks folder exists)
    let saved_dir = path.join("ShooterGame").join("Saved");
    let saved_arks = saved_dir.join("SavedArks");
    let config_dir = saved_dir.join("Config").join("WindowsServer");
    if saved_arks.exists() {
        let backup_base = path.join("Backups");
        if !backup_base.exists() {
            let _ = std::fs::create_dir_all(&backup_base);
        }
        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
        let backup_name = format!("ase_backup_pre_import_{}", timestamp);
        let backup_path = backup_base.join(&backup_name);
        if std::fs::create_dir_all(&backup_path).is_ok() {
            // Helper recursive copy
            fn copy_dir_all(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
                std::fs::create_dir_all(dst)?;
                for entry in std::fs::read_dir(src)? {
                    let entry = entry?;
                    let ty = entry.file_type()?;
                    if ty.is_dir() {
                        copy_dir_all(&entry.path(), &dst.join(entry.file_name()))?;
                    } else {
                        std::fs::copy(entry.path(), &dst.join(entry.file_name()))?;
                    }
                }
                Ok(())
            }

            fn get_dir_size(src: &std::path::Path) -> u64 {
                let mut size = 0;
                if let Ok(entries) = std::fs::read_dir(src) {
                    for entry in entries.flatten() {
                        if let Ok(ty) = entry.file_type() {
                            if ty.is_dir() {
                                size += get_dir_size(&entry.path());
                            } else if let Ok(meta) = entry.metadata() {
                                size += meta.len();
                            }
                        }
                    }
                }
                size
            }

            if copy_dir_all(&saved_arks, &backup_path.join("SavedArks")).is_ok() {
                if config_dir.exists() {
                    let dest_config = backup_path.join("Config");
                    if std::fs::create_dir_all(&dest_config).is_ok() {
                        if let Ok(entries) = std::fs::read_dir(&config_dir) {
                            for entry in entries.flatten() {
                                if entry.path().extension().map_or(false, |e| e == "ini") {
                                    let _ = std::fs::copy(entry.path(), dest_config.join(entry.file_name()));
                                }
                            }
                        }
                    }
                }
                // Save database record for this backup
                let size_bytes = get_dir_size(&backup_path);
                let backup_path_str = backup_path.to_string_lossy().to_string();
                let backup_time = chrono::Utc::now().to_rfc3339();
                let _ = conn.execute(
                    "INSERT INTO ase_backups (server_id, path, size_bytes, created_at) VALUES (?1, ?2, ?3, ?4)",
                    rusqlite::params![id, backup_path_str, size_bytes as i64, backup_time],
                );
            }
        }
    }

    // Return the full server struct
    conn.query_row(
        &format!("SELECT {} FROM ase_servers WHERE id = ?1", SELECT_COLS),
        [id],
        |row| read_server_row(row),
    ).map_err(|e| e.to_string())
}

