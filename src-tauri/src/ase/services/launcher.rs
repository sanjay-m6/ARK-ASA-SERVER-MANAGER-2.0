use crate::ase::models::{AseServer, AseGameConfig};
use crate::AppState;
use tauri::{AppHandle, State, Emitter};
use std::path::PathBuf;

pub struct AseLauncher;

impl AseLauncher {
    pub fn read_server_row(row: &rusqlite::Row) -> Result<AseServer, rusqlite::Error> {
        let active_mods: String = row.get(12)?;
        Ok(AseServer {
            id: row.get(0)?,
            name: row.get(1)?,
            install_path: row.get(2)?,
            map_name: row.get(3)?,
            port: row.get(4)?,
            query_port: row.get(5)?,
            rcon_port: row.get(6)?,
            rcon_password: row.get(7)?,
            max_players: row.get(8)?,
            server_password: row.get(9)?,
            admin_password: row.get(10)?,
            session_name: row.get(11)?,
            active_mods,
            cluster_id: row.get(13).unwrap_or_default(),
            battleye: row.get(14).unwrap_or(true),
            extra_args: row.get(15).unwrap_or_default(),
            status: row.get(16)?,
            process_id: row.get(17).unwrap_or(None),
            created_at: row.get(18).unwrap_or_default(),
            updated_at: row.get(19).unwrap_or_default(),
            auto_start: row.get(20).unwrap_or(false),
            auto_stop: row.get(21).unwrap_or(false),
            intelligent_mode: row.get(22).unwrap_or(false),
            startup_delay: row.get(23).unwrap_or(0),
            startup_priority: row.get(24).unwrap_or(0),
            branch: row.get(25).unwrap_or_else(|_| "live".to_string()),
        })
    }

    pub fn get_local_ip() -> std::net::Ipv4Addr {
        use std::net::UdpSocket;
        
        // 1. Try UDP connection to a public DNS (most reliable for active gateway interface)
        if let Some(ip) = UdpSocket::bind("0.0.0.0:0")
            .and_then(|socket| {
                socket.connect("8.8.8.8:80")?;
                socket.local_addr()
            })
            .ok()
            .and_then(|addr| match addr {
                std::net::SocketAddr::V4(v4) => Some(*v4.ip()),
                _ => None,
            })
        {
            return ip;
        }

        // 2. Fallback: Use local_ip_address crate to scan active local network adapters
        if let Ok(std::net::IpAddr::V4(v4)) = local_ip_address::local_ip() {
            return v4;
        }

        // 3. Fallback: Default to loopback
        std::net::Ipv4Addr::new(127, 0, 0, 1)
    }

    pub async fn resolve_public_ip() -> Option<String> {
        reqwest::get("https://api.ipify.org")
            .await
            .ok()?
            .text()
            .await
            .ok()
    }

    pub fn fetch_active_mod_ids(
        conn: &rusqlite::Connection,
        server_id: i64,
        fallback: &str,
    ) -> Result<Vec<String>, String> {
        let mut stmt = conn.prepare("SELECT workshop_id FROM ase_mods WHERE server_id = ?1 AND enabled = 1 ORDER BY load_order ASC")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query([server_id]).map_err(|e| e.to_string())?;
        let mut ids = Vec::new();
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let id: String = row.get(0).map_err(|e| e.to_string())?;
            ids.push(id);
        }
        if ids.is_empty() && !fallback.is_empty() {
            return Ok(fallback.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect());
        }
        Ok(ids)
    }

    pub fn split_arguments(s: &str) -> Vec<String> {
        let mut args = Vec::new();
        let mut current = String::new();
        let mut in_quotes = false;
        let mut chars = s.chars().peekable();
        
        while let Some(c) = chars.next() {
            match c {
                '"' => {
                    in_quotes = !in_quotes;
                }
                ' ' | '\t' if !in_quotes => {
                    if !current.is_empty() {
                        args.push(current.clone());
                        current.clear();
                    }
                }
                _ => {
                    current.push(c);
                }
            }
        }
        if !current.is_empty() {
            args.push(current);
        }
        args
    }

    pub fn determine_server_state(server_id: i64, state: &AppState) -> Result<String, String> {
        let (_install_path, _port, query_port, current_status, process_id) = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            conn.query_row(
                "SELECT install_path, port, query_port, status, process_id FROM ase_servers WHERE id = ?1",
                [server_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, u16>(1)?,
                        row.get::<_, u16>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, Option<u32>>(4)?,
                    ))
                },
            )
            .map_err(|e| e.to_string())?
        };

        let mut is_process_alive = false;
        if let Some(pid) = process_id {
            use sysinfo::System;
            let mut sys = System::new();
            sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
            is_process_alive = sys.process(sysinfo::Pid::from_u32(pid)).is_some();
        }

        let local_ip = Self::get_local_ip().to_string();
        let is_query_reachable = crate::services::network::query_server("127.0.0.1", query_port)
            || crate::services::network::query_server(&local_ip, query_port);

        let determined_state = match current_status.as_str() {
            "stopped" | "offline" => {
                if is_process_alive {
                    if is_query_reachable {
                        "online".to_string()
                    } else {
                        "starting".to_string()
                    }
                } else {
                    "stopped".to_string()
                }
            }
            "starting" => {
                if is_process_alive {
                    if is_query_reachable {
                        "online".to_string()
                    } else {
                        "starting".to_string()
                    }
                } else {
                    "crashed".to_string()
                }
            }
            "online" | "running" => {
                if is_process_alive {
                    "online".to_string()
                } else {
                    "crashed".to_string()
                }
            }
            "stopping" => {
                if is_process_alive {
                    "stopping".to_string()
                } else {
                    "stopped".to_string()
                }
            }
            other => other.to_string(),
        };

        if determined_state != current_status {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            let mut sql = "UPDATE ase_servers SET status = ?1".to_string();
            if determined_state == "stopped" || determined_state == "crashed" {
                sql.push_str(", process_id = NULL");
            }
            sql.push_str(" WHERE id = ?2");
            let _ = conn.execute(&sql, rusqlite::params![determined_state, server_id]);
            println!("[INFO] [ASE] Server {} state auto-corrected from '{}' to '{}'", server_id, current_status, determined_state);
        }

        Ok(determined_state)
    }

    pub fn build_arguments(
        server: &AseServer,
        _config: &AseGameConfig,
        _public_ip: Option<String>,
        active_mod_ids: &[String],
        cluster_dir: Option<String>,
    ) -> Vec<String> {
        let mut args = Vec::new();
        // ASE uses "TheIsland", NOT "TheIsland_WP" (that's ASA)
        let map = if server.map_name.is_empty() { "TheIsland" } else { &server.map_name };
        
        let mut launch_string = format!("{}?listen", map);
        
        if !server.session_name.is_empty() {
            let safe_name = server.session_name.replace("\"", "");
            launch_string.push_str(&format!("?SessionName={}", safe_name));
        }
        if server.port > 0 {
            launch_string.push_str(&format!("?Port={}", server.port));
            launch_string.push_str(&format!("?RawPort={}", server.port + 1));
        }
        if server.query_port > 0 {
            launch_string.push_str(&format!("?QueryPort={}", server.query_port));
        }
        if server.max_players > 0 {
            launch_string.push_str(&format!("?MaxPlayers={}", server.max_players));
        }
        if !server.server_password.is_empty() {
            launch_string.push_str(&format!("?ServerPassword={}", server.server_password));
        }
        if !server.admin_password.is_empty() {
            launch_string.push_str(&format!("?ServerAdminPassword={}", server.admin_password));
        }
        // RCON settings belong in the launch string as query parameters
        if server.rcon_port > 0 {
            launch_string.push_str("?RCONEnabled=True");
            launch_string.push_str(&format!("?RCONPort={}", server.rcon_port));
        }
        
        if !active_mod_ids.is_empty() {
            launch_string.push_str(&format!("?GameModIds={}", active_mod_ids.join(",")));
        }
        
        args.push(launch_string);
        
        // Note: Dedicated servers for ASE do not support the -mods= command line parameter.
        // Instead, the active mods list must be written to GameUserSettings.ini under [ServerSettings] -> ActiveMods,
        // which is managed automatically on launch in config_generator.rs.

        if !server.battleye {
            args.push("-NoBattlEye".to_string());
        }

        if !server.extra_args.is_empty() {
            for arg in Self::split_arguments(&server.extra_args) {
                let lower = arg.to_lowercase();
                if lower.starts_with("-mods=") {
                    println!(
                        "  ⚠️ Stripped conflicting -mods= from extra_args for ASE server {} (mods are managed automatically)",
                        server.id
                    );
                } else {
                    args.push(arg);
                }
            }
        }
        
        // Essential flags
        args.push("-server".to_string());       // CRITICAL: required for Steam master server registration
        
        // We always pass -log and -servergamelog so that ShooterGame.log is created,
        // which is required for the status watcher thread to detect when the server goes online.
        args.push("-log".to_string());
        args.push("-servergamelog".to_string());

        // Apply advanced launch parameters from config
        if _config.no_playervac { args.push("-insecure".to_string()); }
        if _config.disable_movement_validation { args.push("-DisablePhysX".to_string()); }
        if _config.no_hang_det { args.push("-NoHangDetection".to_string()); }
        if _config.no_dinos { args.push("-NoDinos".to_string()); }
        if _config.no_under_mesh_checking { args.push("-NoUnderMeshChecking".to_string()); }
        if _config.no_under_mesh_killing { args.push("-NoUnderMeshKilling".to_string()); }
        if _config.enable_vivox { args.push("-EnableVivox".to_string()); }
        if _config.allow_shared_connections { args.push("-AllowSharedConnections".to_string()); }
        if _config.creature_upload_issue_protection { args.push("-PreventUploadDinos".to_string()); } // Usually PreventUploadDinos
        if _config.additional_dupe_protection { args.push("-AdditionalDupeProtection".to_string()); }
        if _config.secure_item_dino_spawning_rules { args.push("-ValidateItemDinoSpawns".to_string()); }
        if _config.force_respawn_dinos_on_startup { args.push("-ForceRespawnDinos".to_string()); }
        if _config.force_direct_x10 { args.push("-d3d10".to_string()); }
        if _config.force_shader_model4 { args.push("-sm4".to_string()); }
        if _config.force_low_memory { args.push("-lowmemory".to_string()); }
        if _config.force_no_man_sky { args.push("-nomansky".to_string()); }
        if _config.use_no_memory_bias { args.push("-NoMemoryBias".to_string()); }
        if _config.stasis_keep_controllers { args.push("-StasisKeepControllers".to_string()); }
        if _config.server_allow_ansel { args.push("-ServerAllowAnsel".to_string()); }
        if _config.structure_memory_optimizations { args.push("-StructureMemoryOptimizations".to_string()); }
        if _config.structure_stasis_grid { args.push("-StructureStasisGrid".to_string()); }
        if _config.enable_crossplay { args.push("-crossplay".to_string()); }
        if _config.enable_public_ip_for_epic { args.push("-PublicIPForEpic".to_string()); }
        if _config.epic_store_players_only { args.push("-epiconly".to_string()); }
        
        if _config.no_anti_speed_hack { args.push("?bDisableAntiSpeedHack=true".to_string()); }
        if _config.speed_hack_cpu_bias != 1.0 { args.push(format!("?SpeedHackBias={}", _config.speed_hack_cpu_bias)); }
        
        if _config.enable_auto_force_respawn_dinos && _config.auto_force_respawn_dinos_interval > 0.0 {
            args.push(format!("?AutoDestroyDecayedDinos={}", _config.auto_force_respawn_dinos_interval));
        }

        if !_config.alternate_save_directory_name.is_empty() {
            args.push(format!("?AltSaveDirectoryName={}", _config.alternate_save_directory_name));
        }

        if !server.cluster_id.is_empty() {
            args.push(format!("-clusterid={}", server.cluster_id));
            if _config.use_cluster_directory_override && !_config.cluster_directory_override.is_empty() {
                args.push(format!("-ClusterDirOverride={}", _config.cluster_directory_override));
            } else if let Some(ref path) = cluster_dir {
                if !path.is_empty() {
                    args.push(format!("-ClusterDirOverride={}", path));
                }
            }
        }
        
        if !_config.server_language.is_empty() {
            args.push(format!("-culture={}", _config.server_language));
        }
        
        // Ensure MultiHome is set for LAN discovery if missing.
        // [FIX] Removed automatic -MultiHome injection. Force-binding to a local IP
        // prevents the server from properly registering with the public Steam Master server.
        // Users who need specific network interfaces should manually add -MultiHome in Extra Arguments.

        // Deduplicate index 1 onwards
        let mut final_args = Vec::new();
        if !args.is_empty() {
            final_args.push(args[0].clone()); // Map/URL parameter stays first
            
            let mut seen_keys = std::collections::HashSet::new();
            let mut deduped_rest = Vec::new();
            for arg in args[1..].iter().rev() {
                let key = if let Some(eq_pos) = arg.find('=') {
                    arg[..eq_pos].to_lowercase()
                } else {
                    arg.to_lowercase()
                };
                
                if seen_keys.insert(key) {
                    deduped_rest.push(arg.clone());
                }
            }
            deduped_rest.reverse();
            final_args.extend(deduped_rest);
        }
        
        println!("[INFO] Generated startup arguments for server {}: {:?}", server.name, final_args);
        final_args
    }

    pub async fn spawn_server(_app: AppHandle, server_id: i64, state: &State<'_, AppState>, wipe_dinos: Option<bool>) -> Result<(), String> {
        // Sync database configurations to disk before starting the server
        {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            if let Err(e) = crate::services::config_generator::ConfigGenerator::generate_config(
                &_app,
                &conn,
                server_id,
            ) {
                println!(
                    "⚠️ Failed to sync config files for ASE server {} on startup: {}",
                    server_id, e
                );
            } else {
                println!("✅ Configuration synced successfully for ASE server {}.", server_id);
            }
        }

        let (server, config, active_mods, cluster_dir) = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            let mut stmt = conn.prepare("SELECT id, name, install_path, map_name, port, query_port, rcon_port, rcon_password, max_players, server_password, admin_password, session_name, active_mods, cluster_id, battleye, extra_args, status, process_id, created_at, updated_at, auto_start, auto_stop, intelligent_mode, startup_delay, startup_priority, branch FROM ase_servers WHERE id = ?1").map_err(|e| e.to_string())?;
            let server = stmt.query_row([server_id], |row| Self::read_server_row(row)).map_err(|e| e.to_string())?;
            
            let config_json: String = conn.query_row(
                "SELECT settings_json FROM ase_game_settings WHERE server_id = ?1",
                [server_id], |row| row.get(0)
            ).unwrap_or_else(|_| "{}".to_string());
            
            let config: AseGameConfig = serde_json::from_str(&config_json).unwrap_or_default();
            
            let active_mods = Self::fetch_active_mod_ids(&conn, server_id, &server.active_mods)?;
            
            let cluster_dir: Option<String> = if !server.cluster_id.is_empty() {
                conn.query_row(
                    "SELECT cluster_dir FROM ase_clusters WHERE id = ?1",
                    [&server.cluster_id],
                    |row| row.get(0)
                ).ok()
            } else {
                None
            };
            
            (server, config, active_mods, cluster_dir)
        };

        // If user config folder is active, copy the INI files from the custom folder to the default directory before starting the server
        let user_folder_raw: String = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            db.get_setting("ase_user_config_folder").ok().flatten().unwrap_or_default()
        };
        if !user_folder_raw.is_empty() {
            let user_dir = PathBuf::from(&user_folder_raw);
            if user_dir.exists() && user_dir.is_dir() {
                let default_config_dir = PathBuf::from(&server.install_path)
                    .join("ShooterGame")
                    .join("Saved")
                    .join("Config")
                    .join("WindowsServer");
                
                let _ = std::fs::create_dir_all(&default_config_dir);
                
                // Copy GameUserSettings.ini
                let user_gus = user_dir.join("GameUserSettings.ini");
                if user_gus.exists() {
                    let _ = std::fs::copy(&user_gus, default_config_dir.join("GameUserSettings.ini"));
                    println!("  🔄 [ASE Startup Sync] Copied GameUserSettings.ini from custom folder to default config dir");
                } else {
                    let user_sub_gus = user_dir.join("ShooterGame/Saved/Config/WindowsServer/GameUserSettings.ini");
                    if user_sub_gus.exists() {
                        let _ = std::fs::copy(&user_sub_gus, default_config_dir.join("GameUserSettings.ini"));
                        println!("  🔄 [ASE Startup Sync] Copied GameUserSettings.ini (sub-path) from custom folder to default config dir");
                    }
                }

                // Copy Game.ini
                let user_game = user_dir.join("Game.ini");
                if user_game.exists() {
                    let _ = std::fs::copy(&user_game, default_config_dir.join("Game.ini"));
                    println!("  🔄 [ASE Startup Sync] Copied Game.ini from custom folder to default config dir");
                } else {
                    let user_sub_game = user_dir.join("ShooterGame/Saved/Config/WindowsServer/Game.ini");
                    if user_sub_game.exists() {
                        let _ = std::fs::copy(&user_sub_game, default_config_dir.join("Game.ini"));
                        println!("  🔄 [ASE Startup Sync] Copied Game.ini (sub-path) from custom folder to default config dir");
                    }
                }
            }
        }

        let public_ip = if config.enable_public_ip_for_epic { Self::resolve_public_ip().await } else { None };
        let mut args = Self::build_arguments(&server, &config, public_ip, &active_mods, cluster_dir);
        if wipe_dinos.unwrap_or(false) {
            args.push("-ForceRespawnDinos".to_string());
        }

        // Auto-configure firewall rules in a background thread silently.
        let app_clone = _app.clone();
        std::thread::spawn(move || {
            use tauri::Manager;
            let state = app_clone.state::<AppState>();
            match crate::commands::firewall::configure_ase_firewall_raw(&state, server_id) {
                Ok(res) => {
                    let msg = if res.already_configured {
                        format!("[INFO] [FIREWALL] Firewall rules already correctly configured.")
                    } else {
                        format!("[INFO] [FIREWALL] Firewall rules successfully configured.")
                    };
                    println!("  🔥 {}", msg);
                    let _ = app_clone.emit("ase-log-line", serde_json::json!({
                        "server_id": server_id,
                        "line": msg
                    }));
                }
                Err(e) => {
                    let msg = format!("[ERROR] [FIREWALL] Firewall configuration failed: {}", e);
                    println!("  ⚠️ {}", msg);
                    let _ = app_clone.emit("ase-log-line", serde_json::json!({
                        "server_id": server_id,
                        "line": msg
                    }));
                }
            }
        });

        let exe_path = PathBuf::from(&server.install_path)
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64")
            .join("ShooterGameServer.exe");

        if !exe_path.exists() {
            return Err(format!("Server executable not found at {:?}", exe_path));
        }

        // Delete old log file before spawning process to avoid file locking on Windows UAC / IO
        let log_file_path_init = PathBuf::from(&server.install_path)
            .join("ShooterGame")
            .join("Saved")
            .join("Logs")
            .join("ShooterGame.log");
        let _ = std::fs::remove_file(&log_file_path_init);

        let mut cmd = std::process::Command::new(&exe_path);
        cmd.args(&args);

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            let mut flags = 0x00000200; // CREATE_NEW_PROCESS_GROUP
            flags |= 0x08000000; // CREATE_NO_WINDOW
            cmd.creation_flags(flags);
        }

        let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn server: {}", e))?;
        let pid = child.id();

        // Set process priority to HIGH for faster loading
        #[cfg(target_os = "windows")]
        unsafe {
            let handle = windows_sys::Win32::System::Threading::OpenProcess(
                windows_sys::Win32::System::Threading::PROCESS_SET_INFORMATION,
                0,
                pid,
            );
            if !handle.is_null() {
                // HIGH_PRIORITY_CLASS = 0x00000080
                windows_sys::Win32::System::Threading::SetPriorityClass(handle, 0x00000080);
                windows_sys::Win32::Foundation::CloseHandle(handle);
            }
        }

        {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            conn.execute(
                "UPDATE ase_servers SET status = 'starting', process_id = ?1 WHERE id = ?2",
                rusqlite::params![pid, server_id],
            ).map_err(|e| e.to_string())?;
        }
        
        use tauri::Manager;
        let _ = _app.emit("server-status-change", serde_json::json!({
            "server_id": server_id,
            "status": "starting"
        }));

        use std::sync::atomic::{AtomicBool, Ordering};
        use std::sync::Arc;

        let stop_flag = Arc::new(AtomicBool::new(false));
        let stop_flag_waiter = stop_flag.clone();
        let stop_flag_watcher = stop_flag.clone();

        // Spawns a thread to wait for the child process to exit
        let app_clone_wait = _app.clone();
        let start_time = std::time::Instant::now();
        std::thread::spawn(move || {
            let status = child.wait();
            stop_flag_waiter.store(true, Ordering::SeqCst);
            
            if start_time.elapsed().as_secs() < 3 {
                // Process exited almost immediately. Likely missing files or crash.
                let msg = match status {
                    Ok(exit_status) => format!("[ERROR] Server process exited immediately with status: {}", exit_status),
                    Err(e) => format!("[ERROR] Server process failed while running: {}", e),
                };
                let _ = app_clone_wait.emit("ase-log-line", serde_json::json!({
                    "server_id": server_id,
                    "line": msg
                }));
            }

            if let Some(state) = app_clone_wait.try_state::<crate::AppState>() {
                if let Ok(db) = state.db.lock() {
                    if let Ok(conn) = db.get_connection() {
                        let _ = conn.execute("UPDATE ase_servers SET status = 'stopped', process_id = NULL WHERE id = ?1", [server_id]);
                    }
                }
            }
            let _ = app_clone_wait.emit("server-status-change", serde_json::json!({
                "server_id": server_id,
                "status": "stopped"
            }));
        });

        // Spawns a thread to watch the log file
        let app_clone_watch = _app.clone();
        
        let _ = app_clone_watch.emit("ase-log-line", serde_json::json!({
            "server_id": server_id,
            "line": "__CLEAR_LOGS_SIGNAL__"
        }));

        let log_file_path = PathBuf::from(&server.install_path)
            .join("ShooterGame")
            .join("Saved")
            .join("Logs")
            .join("ShooterGame.log");

        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            use std::fs::File;

            println!("🔍 [ASE] Log watcher thread started for server {}", server_id);

            // Wait for log file to be created
            let mut attempts = 0;
            while !log_file_path.exists() && attempts < 30 && !stop_flag_watcher.load(Ordering::SeqCst) {
                std::thread::sleep(std::time::Duration::from_secs(1));
                attempts += 1;
            }

            if !log_file_path.exists() {
                eprintln!("❌ [ASE] Log file was not created within 30 seconds at {:?}", log_file_path);
                return;
            }

            // Open log file
            let file = match File::open(&log_file_path) {
                Ok(f) => f,
                Err(e) => {
                    eprintln!("❌ [ASE] Failed to open log file at {:?}: {}", log_file_path, e);
                    return;
                }
            };

            let mut reader = BufReader::new(file);
            let mut bytes_read: u64 = 0;
            let mut online = false;

            while !stop_flag_watcher.load(Ordering::SeqCst) {
                let mut line = String::new();
                match reader.read_line(&mut line) {
                    Ok(0) => {
                        // Check for truncation
                        if let Ok(meta) = std::fs::metadata(&log_file_path) {
                            if meta.len() < bytes_read {
                                // File truncated while we were reading it
                                if let Ok(new_file) = File::open(&log_file_path) {
                                    reader = BufReader::new(new_file);
                                    bytes_read = 0;
                                    continue;
                                }
                            }
                        }
                        std::thread::sleep(std::time::Duration::from_millis(100));
                    }
                    Ok(n) => {
                        bytes_read += n as u64;
                        let trimmed = line.trim_end().to_string();
                        if trimmed.is_empty() {
                            continue;
                        }

                        let _ = app_clone_watch.emit("ase-log-line", serde_json::json!({
                            "server_id": server_id,
                            "line": trimmed
                        }));

                        // Check for ready states (we parse from byte 0 since ShooterGame.log is fresh for this launch)
                        if !online && (
                            trimmed.contains("Sever Is not set to official") || 
                            trimmed.contains("Set New Years event location") || 
                            trimmed.contains("Full Startup:") ||
                            trimmed.contains("has successfully started!")
                        ) {
                            online = true;
                            println!("🟢 [ASE] Log watcher detected online signature: {}", trimmed);
                            if let Some(state) = app_clone_watch.try_state::<crate::AppState>() {
                                match state.db.lock() {
                                    Ok(db) => match db.get_connection() {
                                        Ok(conn) => {
                                            match conn.execute("UPDATE ase_servers SET status = 'online' WHERE id = ?1", [server_id]) {
                                                Ok(_) => println!("🟢 [ASE] Database status updated to ONLINE for server {}", server_id),
                                                Err(e) => eprintln!("❌ [ASE] Failed to update status in DB: {}", e),
                                            }
                                        }
                                        Err(e) => eprintln!("❌ [ASE] Failed to get DB connection: {}", e),
                                    }
                                    Err(e) => eprintln!("❌ [ASE] Failed to lock database state: {}", e),
                                }
                            } else {
                                eprintln!("❌ [ASE] Failed to retrieve AppState from Tauri app handle");
                            }
                            let _ = app_clone_watch.emit("server-status-change", serde_json::json!({
                                "server_id": server_id,
                                "status": "online"
                            }));
                        }
                    }
                    Err(e) => {
                        eprintln!("⚠️ [ASE] Error reading log line: {}", e);
                        std::thread::sleep(std::time::Duration::from_millis(100));
                    }
                }
            }
        });

        // Spawn a thread to actively poll query port via A2S UDP query
        let app_clone_query = _app.clone();
        let query_port = server.query_port;
        let local_ip = Self::get_local_ip().to_string();
        let stop_flag_query = stop_flag.clone();

        std::thread::spawn(move || {
            println!("[INFO] [ASE] Active UDP query thread started for server {} on port {}", server_id, query_port);
            let mut attempts = 0;
            // Poll for 10 minutes (120 attempts * 5 seconds)
            while !stop_flag_query.load(Ordering::SeqCst) && attempts < 120 {
                std::thread::sleep(std::time::Duration::from_secs(5));
                attempts += 1;

                if crate::services::network::query_server("127.0.0.1", query_port)
                    || crate::services::network::query_server(&local_ip, query_port)
                {
                    println!("🟢 [INFO] [ASE] Active UDP query succeeded for server {} on port {}", server_id, query_port);
                    
                    if let Some(state) = app_clone_query.try_state::<crate::AppState>() {
                        if let Ok(db) = state.db.lock() {
                            if let Ok(conn) = db.get_connection() {
                                let current_status: String = conn.query_row(
                                    "SELECT status FROM ase_servers WHERE id = ?1",
                                    [server_id],
                                    |row| row.get(0)
                                ).unwrap_or_else(|_| "".to_string());

                                if current_status == "starting" {
                                    let _ = conn.execute("UPDATE ase_servers SET status = 'online' WHERE id = ?1", [server_id]);
                                    let _ = app_clone_query.emit("server-status-change", serde_json::json!({
                                        "server_id": server_id,
                                        "status": "online"
                                    }));
                                    println!("🟢 [INFO] [ASE] Updated database status to online via active UDP query for server {}", server_id);
                                }
                            }
                        }
                    }
                    break; // Port is responding, exit thread
                }
            }
        });

        Ok(())
    }

    pub async fn stop_server(server_id: i64, state: &State<'_, AppState>) -> Result<(), String> {
        let pid: Option<u32> = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            conn.query_row("SELECT process_id FROM ase_servers WHERE id = ?1", [server_id], |row| row.get(0)).unwrap_or(None)
        };

        if let Some(pid) = pid {
            #[cfg(target_os = "windows")]
            unsafe {
                let handle = windows_sys::Win32::System::Threading::OpenProcess(
                    windows_sys::Win32::System::Threading::PROCESS_TERMINATE,
                    0,
                    pid,
                );
                if !handle.is_null() {
                    windows_sys::Win32::System::Threading::TerminateProcess(handle, 1);
                    windows_sys::Win32::Foundation::CloseHandle(handle);
                }
            }
        }

        {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            conn.execute(
                "UPDATE ase_servers SET status = 'stopped', process_id = NULL WHERE id = ?1",
                [server_id],
            ).map_err(|e| e.to_string())?;
        }

        Ok(())
    }
}