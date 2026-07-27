use crate::ase::models::AseServer;
use crate::AppState;
use tauri::{AppHandle, State, Emitter};
use std::path::PathBuf;
use crate::ase::services::launcher::AseLauncher;

use crate::platform::CommandNoWindowExt;

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
        servers.push(AseLauncher::read_server_row(row).map_err(|e| e.to_string())?);
    }
    Ok(servers)
}

#[tauri::command]
pub async fn get_ase_server_by_id(server_id: i64, state: State<'_, AppState>) -> Result<AseServer, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    conn.query_row(
        &format!("SELECT {} FROM ase_servers WHERE id = ?1", SELECT_COLS),
        [server_id], |row| AseLauncher::read_server_row(row),
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
pub async fn delete_ase_server(
    server_id: i64,
    state: State<'_, AppState>,
    delete_files: Option<bool>,
) -> Result<(), String> {
    let install_path: Option<String> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT install_path FROM ase_servers WHERE id = ?1",
            [server_id],
            |row| row.get(0),
        )
        .ok()
    };

    // Stop server process if running to release file locks
    if state.process_manager.is_running(server_id) {
        println!("  🛑 Stopping running process for ASE server {} prior to deletion...", server_id);
        let _ = state.process_manager.stop_server_with_reason(
            server_id,
            crate::services::process_manager::StopReason::UserAction,
        );
    }

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        let _ = conn.execute("DELETE FROM ase_backups WHERE server_id = ?1", [server_id]);
        conn.execute("DELETE FROM ase_servers WHERE id = ?1", [server_id]).map_err(|e| e.to_string())?;
    }

    let should_delete_files = delete_files.unwrap_or(true);
    if should_delete_files {
        if let Some(ref path_str) = install_path {
            let path = std::path::Path::new(path_str);
            if path.exists() {
                let saved_arks = path.join("ShooterGame").join("Saved").join("SavedArks");
                if saved_arks.exists() {
                    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
                    let safety_dir = std::path::PathBuf::from("C:/ASA_Backups")
                        .join("safety_net")
                        .join(format!("ase_server_{}_{}", server_id, timestamp));
                    println!("  🛡️ Safety Net (ASE): Preserving save game files to {:?}", safety_dir);
                    let _ = std::fs::create_dir_all(&safety_dir);
                    if let Ok(entries) = std::fs::read_dir(&saved_arks) {
                        let target_saved_arks = safety_dir.join("SavedArks");
                        let _ = std::fs::create_dir_all(&target_saved_arks);
                        for entry in entries.flatten() {
                            let p = entry.path();
                            if p.is_file() {
                                if let Some(name) = p.file_name() {
                                    let _ = std::fs::copy(&p, target_saved_arks.join(name));
                                }
                            }
                        }
                    }
                }

                if let Err(e) = std::fs::remove_dir_all(path) {
                    eprintln!("  ⚠️ Warning: Could not remove ASE server directory {:?}: {}", path, e);
                }
            }
        }
    }

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
            "mapName" => "map_name",
            "sessionName" => "session_name",
            "installPath" => "install_path",
            "queryPort" => "query_port",
            "rconPort" => "rcon_port",
            "rconPassword" => "rcon_password",
            "maxPlayers" => "max_players",
            "serverPassword" => "server_password",
            "adminPassword" => "admin_password",
            "activeMods" => "active_mods",
            "clusterId" => "cluster_id",
            "extraArgs" => "extra_args",
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

    // Sync updated settings to INI files on disk immediately
    if let Err(e) = crate::services::config_generator::ConfigGenerator::generate_config(
        &state.app_handle,
        &conn,
        server_id,
    ) {
        println!("⚠️ Failed to write synced ASE database settings to INI: {}", e);
    } else {
        println!("  ✅ Synced ASE server {} database settings to INI files", server_id);
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
    let server_id = create_ase_server(
        name, install_path.clone(), map_name, game_port, query_port,
        rcon_port, admin_password, session_name, branch.clone().unwrap_or_else(|| "default".to_string()), state,
    ).await?;

    let install_dir = PathBuf::from(&install_path);
    if !install_dir.exists() {
        std::fs::create_dir_all(&install_dir)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

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
    let srv = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.query_row(
            &format!("SELECT {} FROM ase_servers WHERE id = ?1", SELECT_COLS),
            [server_id], |row| AseLauncher::read_server_row(row),
        ).map_err(|e| e.to_string())?
    };

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE ase_servers SET status = 'updating' WHERE id = ?1",
            [server_id],
        ).map_err(|e| e.to_string())?;
    }

    let _ = app_handle.emit("server-status-change", serde_json::json!({ "server_id": server_id, "status": "updating" }));

    let install_dir = PathBuf::from(&srv.install_path);
    let installer = crate::services::server_installer::ServerInstaller::new(app_handle.clone(), srv.install_path.clone());
    
    let branch_opt = if srv.branch.is_empty() || srv.branch == "default" {
        None
    } else {
        Some(srv.branch.clone())
    };

    match installer.install_server_ext(&install_dir, "ASE", branch_opt, true).await {
        Ok(_) => {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            conn.execute(
                "UPDATE ase_servers SET status = 'stopped' WHERE id = ?1",
                [server_id],
            ).map_err(|e| e.to_string())?;
            let _ = app_handle.emit("server-status-change", serde_json::json!({ "server_id": server_id, "status": "stopped" }));
            
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
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            conn.execute(
                "UPDATE ase_servers SET status = 'stopped' WHERE id = ?1",
                [server_id],
            ).map_err(|e| e.to_string())?;
            let _ = app_handle.emit("server-status-change", serde_json::json!({ "server_id": server_id, "status": "stopped" }));
            
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

#[tauri::command]
pub async fn get_ase_launch_arguments(server_id: i64, state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let server: AseServer = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.query_row(
            &format!("SELECT {} FROM ase_servers WHERE id = ?1", SELECT_COLS),
            [server_id], |row| AseLauncher::read_server_row(row),
        ).map_err(|e| e.to_string())?
    };

    let config = match crate::ase::commands::config::read_ase_config(server_id, state.clone()).await {
        Ok(c) => c,
        Err(_) => crate::ase::models::AseGameConfig::default(),
    };

    let public_ip = if config.enable_public_ip_for_epic {
        AseLauncher::resolve_public_ip().await
    } else {
        None
    };

    let (active_mod_ids, cluster_dir) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        let active_mods = AseLauncher::fetch_active_mod_ids(&conn, server_id, &server.active_mods)?;
        let cluster_dir: Option<String> = if !server.cluster_id.is_empty() {
            conn.query_row(
                "SELECT cluster_dir FROM ase_clusters WHERE id = ?1",
                [&server.cluster_id],
                |row| row.get(0)
            ).ok()
        } else {
            None
        };
        (active_mods, cluster_dir)
    };

    Ok(AseLauncher::build_arguments(&server, &config, public_ip, &active_mod_ids, cluster_dir))
}

#[tauri::command]
pub async fn start_ase_server(app: AppHandle, server_id: i64, state: State<'_, AppState>) -> Result<(), String> {
    AseLauncher::spawn_server(app, server_id, &state, None).await
}

#[tauri::command]
pub async fn stop_ase_server(server_id: i64, state: State<'_, AppState>) -> Result<(), String> {
    AseLauncher::stop_server(server_id, &state).await
}

#[tauri::command]
pub async fn restart_ase_server(app: AppHandle, server_id: i64, wipe_dinos: Option<bool>, state: State<'_, AppState>) -> Result<(), String> {
    println!("🔄 Restarting ASE server {} (graceful stop first, wipe_dinos: {:?})", server_id, wipe_dinos);
    let _ = AseLauncher::stop_server(server_id, &state).await;
    AseLauncher::spawn_server(app, server_id, &state, wipe_dinos).await
}

#[tauri::command]
pub async fn get_ase_server_status(server_id: i64, state: State<'_, AppState>) -> Result<String, String> {
    AseLauncher::determine_server_state(server_id, &state)
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

#[tauri::command]
pub async fn import_ase_server(
    install_path: String,
    name: String,
    overrides: Option<crate::commands::server::ImportPreview>,
    state: State<'_, AppState>,
) -> Result<AseServer, String> {
    println!("📥 [ASE] Importing server from: {}", install_path);

    let path = PathBuf::from(&install_path);

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

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

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

    conn.query_row(
        &format!("SELECT {} FROM ase_servers WHERE id = ?1", SELECT_COLS),
        [id],
        |row| AseLauncher::read_server_row(row),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clone_ase_server(
    state: State<'_, AppState>,
    source_server_id: i64,
) -> Result<AseServer, String> {
    println!("📋 Cloning ASE server {}", source_server_id);

    let (
        name,
        install_path,
        map_name,
        _session_name,
        port,
        query_port,
        rcon_port,
        rcon_password,
        max_players,
        server_password,
        admin_password,
        active_mods,
        cluster_id,
        battleye,
        extra_args,
        auto_start,
        auto_stop,
        intelligent_mode,
        startup_delay,
        startup_priority,
        branch,
    ) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.query_row(
            "SELECT name, install_path, map_name, session_name, port, query_port, rcon_port, \
             rcon_password, max_players, server_password, admin_password, active_mods, cluster_id, \
             battleye, extra_args, auto_start, auto_stop, intelligent_mode, startup_delay, startup_priority, branch \
             FROM ase_servers WHERE id = ?1",
            [source_server_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, u16>(4)?,
                    row.get::<_, u16>(5)?,
                    row.get::<_, u16>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, u32>(8)?,
                    row.get::<_, String>(9)?,
                    row.get::<_, String>(10)?,
                    row.get::<_, String>(11)?,
                    row.get::<_, String>(12)?,
                    row.get::<_, i32>(13)? != 0,
                    row.get::<_, String>(14)?,
                    row.get::<_, i32>(15)? != 0,
                    row.get::<_, i32>(16)? != 0,
                    row.get::<_, i32>(17)? != 0,
                    row.get::<_, i32>(18)?,
                    row.get::<_, i32>(19)?,
                    row.get::<_, String>(20)?,
                ))
            },
        )
        .map_err(|e| format!("Source ASE server not found: {}", e))?
    };

    let new_name = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let base_name = name.clone();
        let mut candidate = format!("{} (Clone)", base_name);
        let mut counter = 2u32;
        loop {
            let exists: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM ase_servers WHERE name = ?1)",
                    [&candidate],
                    |row| row.get(0),
                )
                .unwrap_or(false);
            if !exists {
                break;
            }
            candidate = format!("{} (Clone {})", base_name, counter);
            counter += 1;
        }
        candidate
    };

    let source_path = PathBuf::from(&install_path);
    let new_install_path = source_path.parent().unwrap_or(&source_path).join(format!(
        "{}_copy",
        source_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
    ));

    let new_port = port + 10;
    let new_query_port = query_port + 10;
    let new_rcon_port = rcon_port + 10;

    std::fs::create_dir_all(&new_install_path)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    let source_config_dir = source_path.join("ShooterGame/Saved/Config/WindowsServer");
    let dest_config_dir = new_install_path.join("ShooterGame/Saved/Config/WindowsServer");
    if source_config_dir.exists() {
        std::fs::create_dir_all(&dest_config_dir)
            .map_err(|e| format!("Failed to create config dir: {}", e))?;

        for file in ["GameUserSettings.ini", "Game.ini"] {
            let src = source_config_dir.join(file);
            let dst = dest_config_dir.join(file);
            if src.exists() {
                std::fs::copy(&src, &dst).map_err(|e| format!("Failed to copy {}: {}", file, e))?;
            }
        }

        let gus_path = dest_config_dir.join("GameUserSettings.ini");
        if gus_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&gus_path) {
                let mut gus_data = crate::ase::ini_parser::IniData::parse(&content);
                let ss = gus_data.ensure_section("ServerSettings");
                
                if let Some(entry) = ss.entries.iter_mut().find(|e| e.key.to_lowercase() == "sessionname") {
                    entry.value = new_name.clone();
                } else {
                    ss.entries.push(crate::ase::ini_parser::IniEntry {
                        key: "SessionName".to_string(),
                        value: new_name.clone(),
                        comment: None,
                    });
                }
                
                let sss = gus_data.ensure_section("SessionSettings");
                if let Some(entry) = sss.entries.iter_mut().find(|e| e.key.to_lowercase() == "sessionname") {
                    entry.value = new_name.clone();
                } else {
                    sss.entries.push(crate::ase::ini_parser::IniEntry {
                        key: "SessionName".to_string(),
                        value: new_name.clone(),
                        comment: None,
                    });
                }
                
                let _ = std::fs::write(&gus_path, gus_data.serialize());
            }
        }
    }

    let now = chrono::Utc::now().to_rfc3339();

    let new_id = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO ase_servers (name, install_path, map_name, port, query_port, rcon_port, \
             rcon_password, max_players, server_password, admin_password, session_name, active_mods, \
             cluster_id, battleye, extra_args, status, created_at, updated_at, auto_start, auto_stop, \
             intelligent_mode, startup_delay, startup_priority, branch) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, 'stopped', ?16, ?16, ?17, ?18, ?19, ?20, ?21, ?22)",
            rusqlite::params![
                new_name,
                new_install_path.to_string_lossy(),
                map_name,
                new_port,
                new_query_port,
                new_rcon_port,
                rcon_password,
                max_players,
                server_password,
                admin_password,
                new_name.clone(),
                active_mods,
                cluster_id,
                if battleye { 1 } else { 0 },
                extra_args,
                now,
                if auto_start { 1 } else { 0 },
                if auto_stop { 1 } else { 0 },
                if intelligent_mode { 1 } else { 0 },
                startup_delay,
                startup_priority,
                branch
            ],
        )
        .map_err(|e: rusqlite::Error| e.to_string())?;

        let server_id = conn.last_insert_rowid();
        let _ = conn.execute(
            "INSERT OR IGNORE INTO ase_scheduler_settings (server_id) VALUES (?1)",
            [server_id],
        );
        server_id
    };

    println!(
        "  ✅ Cloned ASE server {} -> {} (ID: {})",
        source_server_id, new_name, new_id
    );

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    conn.query_row(
        &format!("SELECT {} FROM ase_servers WHERE id = ?1", SELECT_COLS),
        [new_id],
        |row| AseLauncher::read_server_row(row),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn transfer_ase_settings(
    state: State<'_, AppState>,
    source_server_id: i64,
    target_server_id: i64,
) -> Result<(), String> {
    println!(
        "📋 Transferring ASE settings from server {} to {}",
        source_server_id, target_server_id
    );

    let (source_path, target_path) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let source: String = conn
            .query_row(
                "SELECT install_path FROM ase_servers WHERE id = ?1",
                [source_server_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Source ASE server not found: {}", e))?;

        let target: String = conn
            .query_row(
                "SELECT install_path FROM ase_servers WHERE id = ?1",
                [target_server_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Target ASE server not found: {}", e))?;

        (PathBuf::from(source), PathBuf::from(target))
    };

    let source_config = source_path.join("ShooterGame/Saved/Config/WindowsServer");
    let target_config = target_path.join("ShooterGame/Saved/Config/WindowsServer");

    if !source_config.exists() {
        return Err("Source ASE server has no config files".to_string());
    }

    std::fs::create_dir_all(&target_config)
        .map_err(|e| format!("Failed to create target config dir: {}", e))?;

    for file in ["GameUserSettings.ini", "Game.ini"] {
        let src = source_config.join(file);
        let dst = target_config.join(file);
        if src.exists() {
            std::fs::copy(&src, &dst).map_err(|e| format!("Failed to copy {}: {}", file, e))?;
            println!("  ✅ Copied {}", file);
        }
    }

    println!("  ✅ ASE Settings transferred successfully");
    Ok(())
}

#[tauri::command]
pub async fn extract_ase_save_data(
    state: State<'_, AppState>,
    source_server_id: i64,
    target_server_id: i64,
) -> Result<(), String> {
    println!(
        "📦 Extracting ASE save data from server {} to {}",
        source_server_id, target_server_id
    );

    let (source_path, target_path) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let source: String = conn
            .query_row(
                "SELECT install_path FROM ase_servers WHERE id = ?1",
                [source_server_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Source ASE server not found: {}", e))?;

        let target: String = conn
            .query_row(
                "SELECT install_path FROM ase_servers WHERE id = ?1",
                [target_server_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Target ASE server not found: {}", e))?;

        (PathBuf::from(source), PathBuf::from(target))
    };

    let source_saves = source_path.join("ShooterGame/Saved/SavedArks");
    let target_saves = target_path.join("ShooterGame/Saved/SavedArks");

    if !source_saves.exists() {
        return Err("Source ASE server has no save data".to_string());
    }

    std::fs::create_dir_all(&target_saves)
        .map_err(|e| format!("Failed to create target saves dir: {}", e))?;

    fn copy_dir_recursive_safe(
        src: &std::path::Path,
        dst: &std::path::Path,
        canonical_dst_root: &std::path::Path,
        depth: u32,
    ) -> std::io::Result<()> {
        const MAX_DEPTH: u32 = 20;
        if depth > MAX_DEPTH {
            return Err(std::io::Error::other(
                format!("Directory copy exceeded max depth of {}", MAX_DEPTH),
            ));
        }

        if src.is_dir() {
            std::fs::create_dir_all(dst)?;
            for entry in std::fs::read_dir(src)? {
                let entry = entry?;
                let src_path = entry.path();

                if let Ok(canon_entry) = std::fs::canonicalize(&src_path) {
                    if canon_entry.starts_with(canonical_dst_root) {
                        println!(
                            "  ⚠️ Skipping overlapping entry: {}",
                            canon_entry.display()
                        );
                        continue;
                    }
                }

                let dst_path = dst.join(entry.file_name());
                if src_path.is_dir() {
                    copy_dir_recursive_safe(&src_path, &dst_path, canonical_dst_root, depth + 1)?;
                } else {
                    std::fs::copy(&src_path, &dst_path)?;
                }
            }
        }
        Ok(())
    }

    let canonical_dst_root = std::fs::canonicalize(&target_saves)
        .map_err(|e| format!("Failed to canonicalize target path: {}", e))?;

    copy_dir_recursive_safe(&source_saves, &target_saves, &canonical_dst_root, 0)
        .map_err(|e| format!("Failed to copy saves: {}", e))?;

    println!("  ✅ ASE Save data extracted successfully");
    Ok(())
}

#[tauri::command]
pub async fn validate_ase_install_path(install_path: String) -> Result<bool, String> {
    let path = PathBuf::from(&install_path);
    let exe_path = path
        .join("ShooterGame")
        .join("Binaries")
        .join("Win64")
        .join("ShooterGameServer.exe");
    if exe_path.exists() {
        Ok(true)
    } else {
        Err("ShooterGameServer.exe not found under the specified installation directory. Ensure it is a valid ARK: Survival Evolved server directory.".to_string())
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightPortCheck {
    pub label: String,
    pub port: u16,
    pub available: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightModCheck {
    pub workshop_id: String,
    pub is_valid: bool,
    pub issues: Vec<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AsePreflightReport {
    pub exe_exists: bool,
    pub config_valid: bool,
    pub ports: Vec<PreflightPortCheck>,
    pub mods: Vec<PreflightModCheck>,
    pub active_mods_synced: bool,
}

#[tauri::command]
pub async fn run_ase_preflight_check(
    server_id: i64,
    state: State<'_, AppState>,
) -> Result<AsePreflightReport, String> {
    let server: AseServer = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.query_row(
            &format!("SELECT {} FROM ase_servers WHERE id = ?1", SELECT_COLS),
            [server_id], |row| AseLauncher::read_server_row(row),
        ).map_err(|e| e.to_string())?
    };

    let exe_path = PathBuf::from(&server.install_path)
        .join("ShooterGame").join("Binaries").join("Win64").join("ShooterGameServer.exe");
    let exe_exists = exe_path.exists();

    let gus_path = PathBuf::from(&server.install_path)
        .join("ShooterGame").join("Saved").join("Config").join("WindowsServer").join("GameUserSettings.ini");

    let config_valid = gus_path.exists();

    let mut ports = Vec::new();
    for (label, p) in [("Game", server.port), ("Query", server.query_port), ("RCON", server.rcon_port)] {
        if p > 0 {
            let available = !crate::services::network::is_port_in_use(p);
            ports.push(PreflightPortCheck {
                label: label.to_string(),
                port: p,
                available,
            });
        }
    }

    let active_mod_ids: Vec<String> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        AseLauncher::fetch_active_mod_ids(&conn, server_id, &server.active_mods)?
    };

    let mut mods = Vec::new();
    for id in &active_mod_ids {
        let validation = crate::ase::commands::mods::validate_ase_mod(server_id, id.clone(), state.clone()).await;
        match validation {
            Ok(report) => {
                mods.push(PreflightModCheck {
                    workshop_id: id.clone(),
                    is_valid: report.is_valid,
                    issues: report.issues,
                });
            }
            Err(e) => {
                mods.push(PreflightModCheck {
                    workshop_id: id.clone(),
                    is_valid: false,
                    issues: vec![e],
                });
            }
        }
    }

    let mut active_mods_synced = false;
    if gus_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&gus_path) {
            let mut in_server_settings = false;
            let mut ini_active_mods = String::new();
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with('[') && trimmed.ends_with(']') {
                    in_server_settings = trimmed == "[ServerSettings]";
                }
                if in_server_settings && line.starts_with("ActiveMods=") {
                    ini_active_mods = line.trim_start_matches("ActiveMods=").to_string();
                    break;
                }
            }
            let ini_mod_ids: Vec<String> = ini_active_mods.split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            let mut db_unique_ids = Vec::new();
            for id in &active_mod_ids {
                if !db_unique_ids.contains(id) {
                    db_unique_ids.push(id.clone());
                }
            }
            active_mods_synced = ini_mod_ids == db_unique_ids;
        }
    }

    Ok(AsePreflightReport {
        exe_exists,
        config_valid,
        ports,
        mods,
        active_mods_synced,
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisibilityPortCheck {
    pub label: String,
    pub port: u16,
    pub in_use: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AseVisibilityReport {
    pub local_ip: String,
    pub public_ip: Option<String>,
    pub port_bindings: Vec<VisibilityPortCheck>,
    pub query_reachable_local: bool,
    pub query_reachable_public: bool,
    pub firewall_rules_exist: bool,
}

#[tauri::command]
pub async fn diagnose_ase_server_visibility(
    server_id: i64,
    state: State<'_, AppState>,
) -> Result<AseVisibilityReport, String> {
    let server: AseServer = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.query_row(
            &format!("SELECT {} FROM ase_servers WHERE id = ?1", SELECT_COLS),
            [server_id], |row| AseLauncher::read_server_row(row),
        ).map_err(|e| e.to_string())?
    };

    let local_ip = AseLauncher::get_local_ip().to_string();
    let public_ip = AseLauncher::resolve_public_ip().await;

    let mut port_bindings = Vec::new();
    for (label, p) in [("Game", server.port), ("Query", server.query_port), ("RCON", server.rcon_port)] {
        if p > 0 {
            let in_use = crate::services::network::is_port_in_use(p);
            port_bindings.push(VisibilityPortCheck {
                label: label.to_string(),
                port: p,
                in_use,
            });
        }
    }

    let query_reachable_local = crate::services::network::query_server("127.0.0.1", server.query_port)
        || crate::services::network::query_server(&local_ip, server.query_port);

    let query_reachable_public = if let Some(ref pub_ip) = public_ip {
        crate::services::network::query_server(pub_ip, server.query_port)
    } else {
        false
    };

    #[allow(unused_mut)]
    let mut firewall_rules_exist = false;
    #[cfg(target_os = "windows")]
    {
        let check_script = format!(
            "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; \
             Get-NetFirewallRule -Enabled True -Direction Inbound -Action Allow -ErrorAction SilentlyContinue \
             | Get-NetFirewallPortFilter \
             | Where-Object {{ $_.LocalPort -eq '{}' -or $_.LocalPort -eq '{}' }} \
             | Select-Object LocalPort, Protocol",
            server.port, server.query_port
        );
        if let Ok(output) = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &check_script])
            .no_window()
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if !stdout.trim().is_empty() {
                firewall_rules_exist = true;
            }
        }
    }

    Ok(AseVisibilityReport {
        local_ip,
        public_ip,
        port_bindings,
        query_reachable_local,
        query_reachable_public,
        firewall_rules_exist,
    })
}

/// FIX 5: Launch ARK client and connect directly to this server by IP.
/// Uses steam://run/346110 with +connect to bypass the broken in-game LAN browser.
#[tauri::command]
pub async fn join_ase_server(server_id: i64, state: State<'_, AppState>) -> Result<(), String> {
    let server = get_ase_server_by_id(server_id, state).await?;

    if server.status != "online" && server.status != "running" {
        return Err("Server is not running. Start the server first.".to_string());
    }

    // Use 127.0.0.1 for local connections (same machine)
    let connect_ip = "127.0.0.1";
    let connect_port = server.port;

    // steam://run/346110//+connect <IP>:<Port>
    // AppID 346110 = ARK: Survival Evolved
    let steam_url = format!(
        "steam://run/346110//+connect {}:{}",
        connect_ip, connect_port
    );

    println!("🎮 [ASE] Joining server via: {}", steam_url);

    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd")
            .args(["/C", "start", "", &steam_url])
            .no_window()
            .spawn()
            .map_err(|e| format!("Failed to open Steam URL: {}", e))?;
    }

    Ok(())
}

/// FIX 4: Read the server executable version for mismatch detection.
/// Returns the file version string of ShooterGameServer.exe.
#[tauri::command]
pub async fn get_ase_server_version(server_id: i64, state: State<'_, AppState>) -> Result<String, String> {
    let server = get_ase_server_by_id(server_id, state).await?;

    let exe_path = PathBuf::from(&server.install_path)
        .join("ShooterGame")
        .join("Binaries")
        .join("Win64")
        .join("ShooterGameServer.exe");

    if !exe_path.exists() {
        return Err("Server executable not found.".to_string());
    }

    // Read the file's last-modified timestamp as a proxy for version
    // (full Win32 version info requires the winver crate, so we use file metadata)
    let metadata = std::fs::metadata(&exe_path)
        .map_err(|e| format!("Failed to read exe metadata: {}", e))?;

    let modified = metadata.modified()
        .map_err(|e| format!("Failed to read modified time: {}", e))?;

    let datetime: chrono::DateTime<chrono::Utc> = modified.into();
    let version_string = datetime.format("%Y.%m.%d-%H%M").to_string();

    // Also get file size as a secondary identifier
    let size_mb = metadata.len() as f64 / (1024.0 * 1024.0);

    Ok(format!("{} ({:.1} MB)", version_string, size_mb))
}
