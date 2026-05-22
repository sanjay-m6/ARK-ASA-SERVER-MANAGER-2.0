use crate::models::{RconConfig, Server, ServerConfig, ServerPorts, ServerStatus};
use crate::services::network;
use crate::services::server_installer::ServerInstaller;
use crate::AppState;
use anyhow::Error as AnyhowError;
use rusqlite::Row;
use std::path::PathBuf;
use tauri::{Emitter, Manager, State};

#[tauri::command]
pub async fn get_all_servers(state: State<'_, AppState>) -> Result<Vec<Server>, String> {
    let db = state
        .db
        .lock()
        .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
    let conn = db
        .get_connection()
        .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, install_path, status, game_port, query_port, rcon_port, max_players, 
          server_password, admin_password, ip_address, created_at, last_started, 
          auto_start, auto_stop, intelligent_mode, map_name, session_name, custom_args, server_type FROM servers",
        )
        .map_err(|e: rusqlite::Error| e.to_string())?;

    let mut servers = Vec::new();
    let mut rows = stmt.query([]).map_err(|e: rusqlite::Error| e.to_string())?;

    while let Some(row) = rows.next().map_err(|e: rusqlite::Error| e.to_string())? {
        let status_str: String = row.get(3).unwrap_or_else(|_| "stopped".to_string());
        let status = match status_str.as_str() {
            "running" => ServerStatus::Running,
            "starting" => ServerStatus::Starting,
            "stopped" => ServerStatus::Stopped,
            "crashed" => ServerStatus::Crashed,
            "updating" => ServerStatus::Updating,
            "restarting" => ServerStatus::Restarting,
            "online" => ServerStatus::Online,
            _ => ServerStatus::Stopped,
        };

        let auto_start: i32 = row.get(13).unwrap_or(0);
        let auto_stop: i32 = row.get(14).unwrap_or(0);
        let intelligent_mode: i32 = row.get(15).unwrap_or(0);

        servers.push(Server {
            id: row.get(0).map_err(|e| e.to_string())?,
            name: row.get(1).map_err(|e| e.to_string())?,
            server_type: row.get::<_, String>(19).unwrap_or_else(|_| "ASA".to_string()),
            install_path: PathBuf::from(row.get::<_, String>(2).map_err(|e| e.to_string())?),
            status,
            ports: ServerPorts {
                game_port: row.get(4).map_err(|e| e.to_string())?,
                query_port: row.get(5).map_err(|e| e.to_string())?,
                rcon_port: row.get(6).map_err(|e| e.to_string())?,
            },
            config: ServerConfig {
                max_players: row.get(7).map_err(|e| e.to_string())?,
                server_password: row.get(8).map_err(|e| e.to_string())?,
                admin_password: row.get(9).map_err(|e| e.to_string())?,
                map_name: row.get::<_, String>(16).unwrap_or_default(),
                session_name: row.get::<_, String>(17).unwrap_or_default(),
                motd: None,
                mods: vec![],
                custom_args: row.get::<_, Option<String>>(18).unwrap_or(None),
            },
            rcon_config: RconConfig {
                enabled: true,
                password: "".to_string(),
            },
            ip_address: row.get(10).map_err(|e| e.to_string())?,
            created_at: row.get(11).map_err(|e| e.to_string())?,
            last_started: row.get(12).map_err(|e| e.to_string())?,
            auto_start: auto_start != 0,
            auto_stop: auto_stop != 0,
            intelligent_mode: intelligent_mode != 0,
        });
    }

    Ok(servers)
}

#[tauri::command]
pub async fn update_server_status_in_db(
    state: State<'_, AppState>,
    server_id: i64,
    status: String,
) -> Result<(), String> {
    let db = state
        .db
        .lock()
        .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
    let conn = db
        .get_connection()
        .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

    conn.execute(
        "UPDATE servers SET status = ?1 WHERE id = ?2",
        rusqlite::params![status, server_id],
    )
    .map_err(|e: rusqlite::Error| e.to_string())?;

    println!(
        "  📝 [DB] Updated server {} status to '{}'",
        server_id, status
    );
    Ok(())
}

#[tauri::command]
pub async fn get_server_by_id(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Option<Server>, String> {
    let db = state
        .db
        .lock()
        .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
    let conn = db
        .get_connection()
        .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, install_path, status, game_port, query_port, rcon_port, max_players, 
         server_password, admin_password, ip_address, created_at, last_started, 
         auto_start, auto_stop, intelligent_mode, map_name, session_name, custom_args, server_type FROM servers WHERE id = ?1",
        )
        .map_err(|e: rusqlite::Error| e.to_string())?;

    let mut rows = stmt.query([server_id]).map_err(|e: rusqlite::Error| e.to_string())?;

    if let Some(row) = rows.next().map_err(|e: rusqlite::Error| e.to_string())? {
        let status_str: String = row.get(3).unwrap_or_else(|_| "stopped".to_string());
        let status = match status_str.as_str() {
            "running" => ServerStatus::Running,
            "starting" => ServerStatus::Starting,
            "stopped" => ServerStatus::Stopped,
            "crashed" => ServerStatus::Crashed,
            "updating" => ServerStatus::Updating,
            "restarting" => ServerStatus::Restarting,
            "online" => ServerStatus::Online,
            _ => ServerStatus::Stopped,
        };

        let auto_start: i32 = row.get(13).unwrap_or(0);
        let auto_stop: i32 = row.get(14).unwrap_or(0);
        let intelligent_mode: i32 = row.get(15).unwrap_or(0);

        let server = Server {
            id: row.get(0).map_err(|e| e.to_string())?,
            name: row.get(1).map_err(|e| e.to_string())?,
            server_type: row.get::<_, String>(19).unwrap_or_else(|_| "ASA".to_string()),
            install_path: PathBuf::from(row.get::<_, String>(2).map_err(|e| e.to_string())?),
            status,
            ports: ServerPorts {
                game_port: row.get(4).map_err(|e| e.to_string())?,
                query_port: row.get(5).map_err(|e| e.to_string())?,
                rcon_port: row.get(6).map_err(|e| e.to_string())?,
            },
            config: ServerConfig {
                max_players: row.get(7).map_err(|e| e.to_string())?,
                server_password: row.get(8).map_err(|e| e.to_string())?,
                admin_password: row.get(9).map_err(|e| e.to_string())?,
                map_name: row.get::<_, String>(16).unwrap_or_default(),
                session_name: row.get::<_, String>(17).unwrap_or_default(),
                motd: None,
                mods: vec![],
                custom_args: row.get::<_, Option<String>>(18).unwrap_or(None),
            },
            rcon_config: RconConfig {
                enabled: true,
                password: "".to_string(),
            },
            ip_address: row.get(10).map_err(|e| e.to_string())?,
            created_at: row.get(11).map_err(|e| e.to_string())?,
            last_started: row.get(12).map_err(|e| e.to_string())?,
            auto_start: auto_start != 0,
            auto_stop: auto_stop != 0,
            intelligent_mode: intelligent_mode != 0,
        };
        Ok(Some(server))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn show_server_console(state: State<'_, AppState>, server_id: i64) -> Result<(), String> {
    println!("🖥️ Showing console for server {}", server_id);
    state
        .process_manager
        .show_server_window(server_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn install_server(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    install_path: String,
    name: String,
    session_name: String,
    map_name: String,
    game_port: u16,
    query_port: u16,
    rcon_port: u16,
    pve_mode: bool,
    crossplay: bool,
    server_type: String,
    max_players: i32,
    admin_password: Option<String>,
    server_password: Option<String>,
) -> Result<Server, String> {
    println!("🚀 Installing server: {} at {}", name, install_path);

    let path = PathBuf::from(&install_path);

    // Create the installer early so we can emit console logs during pre-flight
    let installer = ServerInstaller::new(app_handle, path.to_string_lossy().to_string());

    // ---------------------------------------------------------
    // PRE-FLIGHT: System specs analysis and validation
    // Runs BEFORE the heavy SteamCMD download to avoid wasting
    // bandwidth/disk if validation will fail.
    // ---------------------------------------------------------
    installer.emit_console("", "info");
    installer.emit_console("═══════════════════════════════════════════════════════════", "info");
    installer.emit_console("  PRE-FLIGHT SYSTEM CHECK", "info");
    installer.emit_console("═══════════════════════════════════════════════════════════", "info");
    installer.emit_console("", "info");

    let specs = crate::services::system_analyzer::get_system_specs(&path);

    installer.emit_console("═══════════════════════════════════════════════════════════", "info");
    installer.emit_console("  SYSTEM SPECIFICATIONS & HARDWARE ANALYSIS", "info");
    installer.emit_console("═══════════════════════════════════════════════════════════", "info");
    installer.emit_console(&format!("  Operating System : {} (Version: {})", specs.os_name, specs.os_version), "info");
    installer.emit_console(&format!("  CPU Model        : {} ({} Cores)", specs.cpu_brand, specs.cpu_cores), "info");
    installer.emit_console(&format!("  System Memory    : {:.2} GB Total ({:.2} GB Free)", specs.ram_total_gb, specs.ram_free_gb), "info");
    installer.emit_console(&format!("  Active Interface : {} (MAC: {})", specs.active_adapter, specs.mac_address), "info");
    installer.emit_console(&format!("  Local IP Address : {}", specs.local_ip), "info");
    installer.emit_console(&format!("  Install Drive    : Total: {:.2} GB | Free: {:.2} GB", specs.destination_total_gb, specs.destination_free_gb), "info");
    installer.emit_console("═══════════════════════════════════════════════════════════", "info");
    installer.emit_console("", "info");

    let final_admin_pwd = if admin_password.as_deref().unwrap_or("").trim().is_empty() {
        "admin123".to_string()
    } else {
        admin_password.clone().unwrap()
    };

    let validation = crate::services::system_analyzer::validate_server_details(
        &name,
        &map_name,
        game_port,
        query_port,
        rcon_port,
        &final_admin_pwd,
        &specs,
    );

    installer.emit_console("═══════════════════════════════════════════════════════════", "info");
    installer.emit_console("  ARK SERVER DETAILS VALIDATION PIPELINE", "info");
    installer.emit_console("═══════════════════════════════════════════════════════════", "info");
    installer.emit_console(&format!("  Server Name      : {}", name), "info");
    installer.emit_console(&format!("  Map Name         : {}", map_name), "info");
    installer.emit_console(&format!("  Game Port        : {} (UDP)", game_port), "info");
    installer.emit_console(&format!("  Query Port       : {} (UDP)", query_port), "info");
    installer.emit_console(&format!("  RCON Port        : {} (TCP)", rcon_port), "info");
    installer.emit_console(&format!("  Max Players      : {}", max_players), "info");
    installer.emit_console(&format!("  Game Mode        : {}", if pve_mode { "PvE" } else { "PvP" }), "info");
    installer.emit_console(&format!("  Crossplay        : {}", if crossplay { "Enabled" } else { "Disabled" }), "info");
    installer.emit_console("═══════════════════════════════════════════════════════════", "info");
    installer.emit_console("", "info");

    if validation.is_valid {
        installer.emit_console("✓ All configuration values validated successfully!", "success");
    } else {
        installer.emit_console("✗ Validation failed with the following errors:", "error");
        for err in &validation.errors {
            installer.emit_console(&format!("  - {}", err), "error");
        }
        // Abort before downloading — critical validation failures
        let error_summary = validation.errors.join("; ");
        return Err(format!("Pre-flight validation failed: {}", error_summary));
    }

    if !validation.warnings.is_empty() {
        installer.emit_console("⚠ Configuration Warnings:", "warning");
        for warn in &validation.warnings {
            installer.emit_console(&format!("  - {}", warn), "warning");
        }
    }
    installer.emit_console("", "info");
    installer.emit_console("Pre-flight checks passed. Starting server download...", "success");
    installer.emit_console("", "info");

    // ---------------------------------------------------------
    // INSTALL: Run SteamCMD to download/validate server files
    // ---------------------------------------------------------
    installer.install_server(&path, &server_type).await?;

    // ---------------------------------------------------------
    // POST-INSTALL: Create database entry and write configs
    // ---------------------------------------------------------

    // Create database entry (Scoped to drop mutex/lock before await)
    let (id, unique_name, effective_session_name, custom_args) = {
        let db = state
            .db
            .lock()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
        let conn = db
            .get_connection()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

        // Check if server name already exists and make it unique
        let mut unique_name = name.clone();
        let mut counter = 1;
        loop {
            let exists: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM servers WHERE name = ?1)",
                    [&unique_name],
                    |row| row.get(0),
                )
                .unwrap_or(false);

            if !exists {
                break;
            }
            counter += 1;
            unique_name = format!("{} ({})", name, counter);
        }

        // Use the provided session_name; fall back to the unique server name if empty
        let effective_session_name = if session_name.trim().is_empty() {
            unique_name.clone()
        } else {
            session_name.clone()
        };

        // Build custom_args with crossplay flag if enabled
        let custom_args: Option<String> = if crossplay {
            Some("-crossplay".to_string())
        } else {
            None
        };

        conn.execute(
            "INSERT INTO servers (name, install_path, status, game_port, query_port, rcon_port, 
             max_players, admin_password, server_password, map_name, session_name, server_type, custom_args) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            (
                &unique_name,
                &install_path,
                "stopped",
                game_port,
                query_port,
                rcon_port,
                max_players,
                &final_admin_pwd,
                server_password.as_deref().unwrap_or(""),
                &map_name,
                &effective_session_name,
                &server_type, // Server type - ARK: Survival Ascended or Evolved
                &custom_args,
            ),
        )
        .map_err(|e: rusqlite::Error| e.to_string())?;

        (conn.last_insert_rowid(), unique_name, effective_session_name, custom_args)
    };

    let server_obj = Server {
        id,
        name: unique_name.clone(),
        server_type: server_type.clone(),

        install_path: PathBuf::from(install_path),
        status: ServerStatus::Stopped,
        ports: ServerPorts {
            game_port,
            query_port,
            rcon_port,
        },
        config: ServerConfig {
            max_players,
            server_password: if server_password.as_deref().unwrap_or("").is_empty() {
                None
            } else {
                server_password.clone()
            },
            admin_password: final_admin_pwd.clone(),
            map_name: map_name.clone(),
            session_name: effective_session_name.clone(),
            motd: None,
            mods: vec![],
            custom_args: custom_args.clone(),
        },
        rcon_config: RconConfig {
            enabled: true,
            password: "".to_string(),
        },
        ip_address: None,
        created_at: chrono::Utc::now().to_rfc3339(),
        last_started: None,
        auto_start: false, // Default: OFF
        auto_stop: false,  // Default: OFF
        intelligent_mode: false,
    };

    // Attempt to create firewall rules (Best Effort)
    // This will prompt for UAC if rules don't exist
    println!(
        "🛡️ Attempting to create firewall rules for server {}...",
        id
    );
    let _ = crate::commands::firewall::create_firewall_rules(state, id).await;

    // ---------------------------------------------------------
    // Write configuration files (GameUserSettings.ini, Game.ini, Engine.ini)
    // ---------------------------------------------------------
    let mut initial_config = crate::services::config_generator::ServerConfig::default();
    initial_config.session_name = server_obj.config.session_name.clone();
    initial_config.map_name = server_obj.config.map_name.clone();
    initial_config.max_players = server_obj.config.max_players;
    initial_config.admin_password = final_admin_pwd;
    initial_config.server_password = server_obj.config.server_password.clone();
    initial_config.game_port = server_obj.ports.game_port;
    initial_config.query_port = server_obj.ports.query_port;
    initial_config.rcon_port = server_obj.ports.rcon_port;
    initial_config.rcon_enabled = server_obj.rcon_config.enabled;
    initial_config.pve_mode = pve_mode;
    initial_config.active_mods = server_obj.config.mods.clone();

    installer.emit_console("Writing server configuration files to disk...", "info");

    let config_write_result = crate::services::config_generator::ConfigGenerator::write_configs(
        &server_obj.install_path,
        &initial_config,
        false, // No backup needed for fresh install
        &server_type,
    );

    if let Err(e) = config_write_result {
        let err_msg = format!("✗ Failed to write configuration files: {}", e);
        installer.emit_console(&err_msg, "error");
        println!("{}", err_msg);
    } else {
        let sub_dir = crate::services::config_generator::ConfigGenerator::get_config_subdirectory(&server_obj.install_path, Some(&server_type));
        installer.emit_console("✓ Server configuration files successfully generated and saved:", "success");
        installer.emit_console(&format!("  - Path: ShooterGame/Saved/Config/{}/", sub_dir), "success");
        installer.emit_console("  - GameUserSettings.ini [Saved]", "success");
        installer.emit_console("  - Game.ini [Saved]", "success");
        installer.emit_console("  - Engine.ini [Saved]", "success");
        installer.emit_console("═══════════════════════════════════════════════════════════", "success");
    }

    installer.emit_complete("Installation completed successfully!");
    
    Ok(server_obj)
}

#[tauri::command]
pub async fn debug_database_check(state: State<'_, AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    // Count servers
    let server_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM servers", [], |row| row.get(0))
        .unwrap_or(-1);

    // Check servers_old
    let old_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM servers_old", [], |row| row.get(0))
        .unwrap_or(-1);

    // Check tables
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .map_err(|e| e.to_string())?;
    let tables: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(format!(
        "Servers: {}, Old_Servers: {}, Tables: {:?}",
        server_count, old_count, tables
    ))
}

/// Clone an existing server with offset ports
#[tauri::command]
pub async fn clone_server(
    state: State<'_, AppState>,
    source_server_id: i64,
) -> Result<Server, String> {
    println!("📋 Cloning server {}", source_server_id);

    // Get source server details
    let (
        name,
        install_path,
        map_name,
        _session_name,
        game_port,
        query_port,
        rcon_port,
        max_players,
        server_password,
        admin_password,
        ip_address,
        server_type,
    ) = {
        let db = state
            .db
            .lock()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
        let conn = db
            .get_connection()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

        conn.query_row(
            "SELECT name, install_path, map_name, session_name, game_port, query_port, rcon_port,
             max_players, server_password, admin_password, ip_address, server_type FROM servers WHERE id = ?1",
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
                    row.get::<_, i32>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, String>(9)?,
                    row.get::<_, Option<String>>(10)?,
                    row.get::<_, String>(11).unwrap_or_else(|_| "ASA".to_string()),
                ))
            },
        )
        .map_err(|e| format!("Source server not found: {}", e))?
    };

    // Generate unique clone name using a counter loop (avoids stuck "(Copy)" names)
    let new_name = {
        let db = state
            .db
            .lock()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
        let conn = db
            .get_connection()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

        let base_name = name.clone();
        let mut candidate = format!("{} (Clone)", base_name);
        let mut counter = 2u32;
        loop {
            let exists: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM servers WHERE name = ?1)",
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

    // Offset ports by 10 to avoid conflicts
    let new_game_port = game_port + 10;
    let new_query_port = query_port + 10;
    let new_rcon_port = rcon_port + 10;

    // Create new install directory
    std::fs::create_dir_all(&new_install_path)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    // Copy config files if they exist
    let sub_dir = crate::services::config_generator::ConfigGenerator::get_config_subdirectory(&source_path, Some(&server_type));
    let source_config_dir = source_path.join(format!("ShooterGame/Saved/Config/{}", sub_dir));
    let dest_config_dir = new_install_path.join(format!("ShooterGame/Saved/Config/{}", sub_dir));
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
    }

    // Insert new server into database
    let new_id = {
        let db = state
            .db
            .lock()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
        let conn = db
            .get_connection()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

        conn.execute(
            "INSERT INTO servers (name, install_path, status, game_port, query_port, rcon_port,
             max_players, admin_password, map_name, session_name, server_password, ip_address, server_type)
             VALUES (?1, ?2, 'stopped', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            rusqlite::params![
                new_name,
                new_install_path.to_string_lossy(),
                new_game_port,
                new_query_port,
                new_rcon_port,
                max_players,
                admin_password,
                map_name,
                new_name.clone(),
                server_password,
                ip_address,
                server_type.clone()
            ],
        )
        .map_err(|e: rusqlite::Error| e.to_string())?;

        conn.last_insert_rowid()
    };

    println!(
        "  ✅ Cloned server {} -> {} (ID: {})",
        source_server_id, new_name, new_id
    );

    Ok(Server {
        id: new_id,
        name: new_name.clone(),
        server_type: server_type.clone(),

        install_path: new_install_path,
        status: ServerStatus::Stopped,
        ports: ServerPorts {
            game_port: new_game_port,
            query_port: new_query_port,
            rcon_port: new_rcon_port,
        },
        config: ServerConfig {
            max_players,
            server_password,
            admin_password: admin_password.clone(),
            map_name,
            session_name: new_name.clone(),
            motd: None,
            mods: vec![],
            custom_args: None,
        },
        rcon_config: RconConfig {
            enabled: true,
            password: admin_password,
        },
        ip_address,
        created_at: chrono::Utc::now().to_rfc3339(),
        last_started: None,
        auto_start: false,
        auto_stop: false,
        intelligent_mode: false,
    })
}

/// Transfer settings (INI files) from one server to another
#[tauri::command]
pub async fn transfer_settings(
    state: State<'_, AppState>,
    source_server_id: i64,
    target_server_id: i64,
) -> Result<(), String> {
    println!(
        "📋 Transferring settings from server {} to {}",
        source_server_id, target_server_id
    );

    // Get both server paths
    let (source_path, target_path, server_type) = {
        let db = state
            .db
            .lock()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
        let conn = db
            .get_connection()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

        let source: String = conn
            .query_row(
                "SELECT install_path FROM servers WHERE id = ?1",
                [source_server_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Source server not found: {}", e))?;

        let target: String = conn
            .query_row(
                "SELECT install_path FROM servers WHERE id = ?1",
                [target_server_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Target server not found: {}", e))?;

        let server_type: String = conn
            .query_row(
                "SELECT server_type FROM servers WHERE id = ?1",
                [source_server_id],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| "ASA".to_string());

        (PathBuf::from(source), PathBuf::from(target), server_type)
    };

    // Copy config files
    let sub_dir = crate::services::config_generator::ConfigGenerator::get_config_subdirectory(&source_path, Some(&server_type));
    let source_config = source_path.join(format!("ShooterGame/Saved/Config/{}", sub_dir));
    let target_config = target_path.join(format!("ShooterGame/Saved/Config/{}", sub_dir));

    if !source_config.exists() {
        return Err("Source server has no config files".to_string());
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

    println!("  ✅ Settings transferred successfully");
    Ok(())
}

/// Extract save data (world/player) from one server to another
#[tauri::command]
pub async fn extract_save_data(
    state: State<'_, AppState>,
    source_server_id: i64,
    target_server_id: i64,
) -> Result<(), String> {
    println!(
        "📦 Extracting save data from server {} to {}",
        source_server_id, target_server_id
    );

    // Get both server paths
    let (source_path, target_path) = {
        let db = state
            .db
            .lock()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
        let conn = db
            .get_connection()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

        let source: String = conn
            .query_row(
                "SELECT install_path FROM servers WHERE id = ?1",
                [source_server_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Source server not found: {}", e))?;

        let target: String = conn
            .query_row(
                "SELECT install_path FROM servers WHERE id = ?1",
                [target_server_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Target server not found: {}", e))?;

        (PathBuf::from(source), PathBuf::from(target))
    };

    // Copy SavedArks folder (contains world and player data)
    let source_saves = source_path.join("ShooterGame/Saved/SavedArks");
    let target_saves = target_path.join("ShooterGame/Saved/SavedArks");

    if !source_saves.exists() {
        return Err("Source server has no save data".to_string());
    }

    // Create target directory
    std::fs::create_dir_all(&target_saves)
        .map_err(|e| format!("Failed to create target saves dir: {}", e))?;

    // Copy all files recursively (with overlap and depth protection)
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

                // Skip entries that resolve inside the destination (prevents infinite recursion)
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

    // Canonicalize source; create destination so it can be canonicalized
    let canon_source = std::fs::canonicalize(&source_saves)
        .map_err(|e| format!("Failed to resolve source path: {}", e))?;
    std::fs::create_dir_all(&target_saves)
        .map_err(|e| format!("Failed to create target saves dir: {}", e))?;
    let canon_target = std::fs::canonicalize(&target_saves)
        .map_err(|e| format!("Failed to resolve target path: {}", e))?;

    // CRITICAL: Reject overlapping paths
    if canon_source.starts_with(&canon_target) || canon_target.starts_with(&canon_source) {
        return Err(format!(
            "Source and target paths overlap — aborting to prevent infinite copy.\n  src: {}\n  dst: {}",
            canon_source.display(),
            canon_target.display()
        ));
    }

    copy_dir_recursive_safe(&canon_source, &canon_target, &canon_target, 0)
        .map_err(|e| format!("Failed to copy save data: {}", e))?;

    println!("  ✅ Save data extracted successfully");
    Ok(())
}

#[tauri::command]
pub async fn start_server(
    app_handle: tauri::AppHandle,
    server_id: i64,
    update_on_start: bool,
) -> Result<(), String> {
    println!(
        "▶️ Starting server {} (Synchronous, Update: {})",
        server_id, update_on_start
    );

    // Run startup logic directly and return the result
    perform_server_startup(&app_handle, server_id, update_on_start).await
}

// Extracted logic for readability and better error handling in the async block
async fn perform_server_startup(
    app_handle: &tauri::AppHandle,
    server_id: i64,
    update_on_start: bool,
) -> Result<(), String> {
    println!(
        "  🔍 [Debug] perform_server_startup entered for {}",
        server_id
    );
    let state = app_handle.state::<AppState>();

    {
        println!("  🔍 [Debug] Acquiring DB lock for Config Generation...");
        // Lock the database to pass a reference to generate_config
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        println!("  ✅ [Debug] DB lock acquired. Getting connection...");
        let conn = db_lock.get_connection().map_err(|e| e.to_string())?;

        println!("  🔍 [Debug] Calling ConfigGenerator::generate_config...");
        if let Err(e) = crate::services::config_generator::ConfigGenerator::generate_config(
            app_handle, &conn, server_id,
        ) {
            println!(
                "⚠️ Failed to sync config files (Server will start with current on-disk config): {}",
                e
            );
            // ... emit log ...
        } else {
            println!("✅ Configuration synced successfully.");
        }
    } // Lock released
    println!("  ✅ [Debug] Config block finished. DB lock released.");

    // === BUG FIX 3: Live Port conflict detection ===
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let (game_port, query_port, rcon_port): (u16, u16, u16) = conn
            .query_row(
                "SELECT game_port, query_port, rcon_port FROM servers WHERE id = ?1",
                [server_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|e| format!("Failed to get ports: {}", e))?;

        let my_ports = [game_port, query_port, rcon_port];

        for my_port in &my_ports {
            if crate::services::network::is_port_in_use(*my_port) {
                // Determine if we know who owns this port
                let mut owner_name = String::from("an unknown process");
                let mut owner_id = 0;
                
                let mut stmt = conn
                    .prepare("SELECT id, name, game_port, query_port, rcon_port FROM servers WHERE id != ?1")
                    .map_err(|e| e.to_string())?;
                let mut rows = stmt.query([server_id]).map_err(|e| e.to_string())?;

                while let Some(row) = rows.next().map_err(|e| e.to_string())? {
                    let other_id: i64 = row.get(0).map_err(|e| e.to_string())?;
                    let other_name_str: String = row.get(1).map_err(|e| e.to_string())?;
                    let other_ports: [u16; 3] = [
                        row.get(2).map_err(|e| e.to_string())?,
                        row.get(3).map_err(|e| e.to_string())?,
                        row.get(4).map_err(|e| e.to_string())?,
                    ];
                    
                    if other_ports.contains(my_port) {
                        owner_name = other_name_str;
                        owner_id = other_id;
                        break;
                    }
                }

                if owner_id > 0 {
                    return Err(format!(
                        "Port {} is actively in use by server '{}' (ID: {}). Stop the other server before starting.",
                        my_port, owner_name, owner_id
                    ));
                } else {
                    return Err(format!(
                        "Port {} is actively in use by an unknown process. Change the port before starting.",
                        my_port
                    ));
                }
            }
        }
        println!("  ✅ Port conflict check passed for server {}", server_id);
    }

    // Get server details including cluster info
    println!("  🔍 [Debug] Acquiring DB lock for Server Details...");
    let (
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
        _cluster_id,
        cluster_name,
        cluster_path,
        custom_args,
        server_type,
    ): (
        String,
        String,
        String,
        u16,
        u16,
        u16,
        i32,
        Option<String>,
        String,
        Option<String>,
        Option<i64>,
        Option<String>,
        Option<String>,
        Option<String>,
        String,
    ) = {
        let db = state
            .db
            .lock()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
        let conn = db
            .get_connection()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

        conn.query_row(
            "SELECT s.install_path, s.map_name, s.session_name, s.game_port, s.query_port, s.rcon_port, 
             s.max_players, s.server_password, s.admin_password, s.ip_address, s.cluster_id,
             c.name, c.cluster_path, s.custom_args, s.server_type
             FROM servers s
             LEFT JOIN clusters c ON s.cluster_id = c.id
             WHERE s.id = ?1",
            [server_id],
            |row: &Row| {
                Ok((
                    row.get::<usize, String>(0)?,
                    row.get::<usize, String>(1)?,
                    row.get::<usize, String>(2)?,
                    row.get::<usize, u16>(3)?,
                    row.get::<usize, u16>(4)?,
                    row.get::<usize, u16>(5)?,
                    row.get::<usize, i32>(6)?,
                    row.get::<usize, Option<String>>(7)?,
                    row.get::<usize, String>(8)?,
                    row.get::<usize, Option<String>>(9)?,
                    row.get::<usize, Option<i64>>(10)?,
                    row.get::<usize, Option<String>>(11)?,
                    row.get::<usize, Option<String>>(12)?,
                    row.get::<usize, Option<String>>(13)?,
                    row.get::<usize, String>(14).unwrap_or_else(|_| "ASA".to_string()),
                ))
            },
        )
        .map_err(|e| format!("Server not found: {}", e))?
    };

    // Get enabled mods for this server
    let enabled_mods: Vec<String> = {
        let db = state
            .db
            .lock()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
        let conn = db
            .get_connection()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

        let mut stmt = conn.prepare(
            "SELECT mod_id FROM mods WHERE server_id = ?1 AND enabled = 1 ORDER BY load_order ASC"
        ).map_err(|e: rusqlite::Error| e.to_string())?;

        let mut rows = stmt
            .query([server_id])
            .map_err(|e: rusqlite::Error| e.to_string())?;
        let mut mods = Vec::new();
        while let Some(row) = rows.next().map_err(|e: rusqlite::Error| e.to_string())? {
            if let Ok(mod_id) = row.get::<usize, String>(0) {
                mods.push(mod_id);
            }
        }
        mods
    };

    let install_path_buf = PathBuf::from(&install_path);

    // Pass all enabled mods to the server - ARK/CFCore will download any missing mods automatically
    if !enabled_mods.is_empty() {
        println!(
            "  🧩 Passing {} mods to server {} (ARK will download any missing mods)",
            enabled_mods.len(),
            server_id
        );
        for mod_id in &enabled_mods {
            println!("     - Mod: {}", mod_id);
        }
    }

    // Check if server executable exists
    let executable = if server_type == "ASE" {
        install_path_buf
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64")
            .join("ShooterGameServer.exe")
    } else {
        install_path_buf
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64")
            .join("ArkAscendedServer.exe")
    };

    if update_on_start {
        println!("  🔄 Update requested before start. Initiating SteamCMD update...");

        // Update status to 'updating'
        {
            let db = state
                .db
                .lock()
                .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
            let conn = db
                .get_connection()
                .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
            conn.execute(
                "UPDATE servers SET status = 'updating' WHERE id = ?1",
                [server_id],
            )
            .map_err(|e| rusqlite::Error::to_string(&e))?;
        }

        // Run update via SteamCMD
        let installer = ServerInstaller::new(app_handle.clone(), install_path_buf.to_string_lossy().to_string());
        installer.update_server(&install_path_buf, &server_type).await?;
        println!("  ✅ Server update complete.");
    } else if !executable.exists() {
        // Server executable not found, trigger installation
        println!("  📥 Server executable not found, starting automatic download...");

        // Update status to 'updating' to show download progress
        {
            let db = state
                .db
                .lock()
                .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
            let conn = db
                .get_connection()
                .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
            conn.execute(
                "UPDATE servers SET status = 'updating' WHERE id = ?1",
                [server_id],
            )
            .map_err(|e: rusqlite::Error| e.to_string())?;
        }

        // Run the installation via SteamCMD
        let installer = ServerInstaller::new(app_handle.clone(), install_path_buf.to_string_lossy().to_string());
        installer.install_server(&install_path_buf, &server_type).await?;

        println!("  ✅ Server download complete, now starting...");
    }

    // === BUG FIX 7: Mod integrity warnings (informational only — ARK auto-downloads missing) ===
    if !enabled_mods.is_empty() {
        let mods_dir = install_path_buf
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64")
            .join("ShooterGame")
            .join("Content")
            .join("Mods");
        for mod_id in &enabled_mods {
            let mod_path = mods_dir.join(mod_id);
            if !mod_path.exists() {
                println!("  ⚠️ Mod {} not found locally — ARK will attempt to download it on startup", mod_id);
                let _ = app_handle.emit(
                    "server_log",
                    serde_json::json!({
                        "server_id": server_id,
                        "line": format!("⚠️ Mod {} not found locally — will be downloaded on startup", mod_id),
                        "is_stderr": false
                    }),
                );
            }
        }
    }

    // === BUG FIX 6: Auto-create firewall rules on every start (idempotent) ===
    {
        let fw_state = app_handle.state::<AppState>();
        match crate::commands::firewall::create_firewall_rules(fw_state, server_id).await {
            Ok(result) => {
                if result.success {
                    println!("  🔥 Firewall rules verified/created for server {}", server_id);
                } else {
                    println!("  ⚠️ Firewall rule creation skipped or failed: {}", result.message);
                }
            }
            Err(e) => {
                println!("  ⚠️ Firewall check failed (non-blocking): {}", e);
            }
        }
    }

    // Start the server process with all enabled mods (ARK will download missing ones)
    let mods_option = if enabled_mods.is_empty() {
        None
    } else {
        Some(enabled_mods.as_slice())
    };

    println!(
        "  🔍 [Debug] Server params: Path={:?}, Port={}, Map={}",
        install_path_buf, game_port, map_name
    );

    state
        .process_manager
        .start_server(
            server_id,
            &server_type,
            &install_path_buf,
            &map_name,
            &session_name,
            game_port,
            query_port,
            rcon_port,
            max_players,
            server_password.as_deref() as Option<&str>,
            &admin_password,
            ip_address.as_deref() as Option<&str>,
            cluster_name.as_deref() as Option<&str>,
            cluster_path.as_deref() as Option<&str>,
            mods_option,
            custom_args.as_deref() as Option<&str>,
        )
        .map_err(|e: AnyhowError| {
            println!("  ❌ [Debug] Process Manager failed to start: {}", e);
            e.to_string()
        })?;

    println!("  ✅ [Debug] Process Manager returned success");

    // Update status in database
    {
        let db = state
            .db
            .lock()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
        let conn = db
            .get_connection()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
        conn.execute(
            "UPDATE servers SET status = 'running', last_started = datetime('now') WHERE id = ?1",
            [server_id],
        )
        .map_err(|e: rusqlite::Error| e.to_string())?;
    }

    println!("  ✅ Server {} started", server_id);

    // Start log watcher for anomaly detection
    let _ = state.log_watcher.start_watching(server_id, install_path_buf.clone());
    Ok(())
}

/// Start server explicitly without any mods (for troubleshooting)
#[tauri::command]
pub async fn start_server_no_mods(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<(), String> {
    println!("▶️ Starting server {} (NO MODS MODE)", server_id);

    // Get server details including cluster info
    let (
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
        cluster_name,
        cluster_path,
        custom_args,
        server_type,
    ): (
        String,
        String,
        String,
        u16,
        u16,
        u16,
        i32,
        Option<String>,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        String,
    ) = {
        let db = state
            .db
            .lock()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
        let conn = db
            .get_connection()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

        // Join with clusters table to get cluster details if assigned
        conn.query_row(
            "SELECT s.install_path, s.map_name, s.session_name, s.game_port, s.query_port, s.rcon_port, 
             s.max_players, s.server_password, s.admin_password, s.ip_address,
             c.name, c.cluster_path, s.custom_args, s.server_type
             FROM servers s
             LEFT JOIN clusters c ON s.cluster_id = c.id
             WHERE s.id = ?1",
            [server_id],
            |row: &Row| {
                Ok((
                    row.get::<usize, String>(0)?,
                    row.get::<usize, String>(1)?,
                    row.get::<usize, String>(2)?,
                    row.get::<usize, u16>(3)?,
                    row.get::<usize, u16>(4)?,
                    row.get::<usize, u16>(5)?,
                    row.get::<usize, i32>(6)?,
                    row.get::<usize, Option<String>>(7)?,
                    row.get::<usize, String>(8)?,
                    row.get::<usize, Option<String>>(9)?,
                    row.get::<usize, Option<String>>(10)?,
                    row.get::<usize, Option<String>>(11)?,
                    row.get::<usize, Option<String>>(12)?,
                    row.get::<usize, String>(13).unwrap_or_else(|_| "ASA".to_string()),
                ))
            },
        )
        .map_err(|e| format!("Server not found: {}", e))?
    };

    let install_path_buf = PathBuf::from(&install_path);

    // Check if server executable exists
    let executable = if server_type == "ASE" {
        install_path_buf
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64")
            .join("ShooterGameServer.exe")
    } else {
        install_path_buf
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64")
            .join("ArkAscendedServer.exe")
    };

    if !executable.exists() {
        println!("  📥 Server executable not found, starting automatic download...");
        // Send a temporary "updating" status so UI shows something happening
        {
            let db = state
                .db
                .lock()
                .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
            let conn = db
                .get_connection()
                .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
            conn.execute(
                "UPDATE servers SET status = 'updating' WHERE id = ?1",
                [server_id],
            )
            .map_err(|e: rusqlite::Error| e.to_string())?;
        }

        // Run the installation via SteamCMD
        let installer = ServerInstaller::new(app_handle.clone(), install_path_buf.to_string_lossy().to_string());
        installer.install_server(&install_path_buf, &server_type).await?;

        println!("  ✅ Server download complete, now starting...");
    }

    // Start server WITHOUT mods
    state
        .process_manager
        .start_server(
            server_id,
            &server_type,
            &install_path_buf,
            &map_name,
            &session_name,
            game_port,
            query_port,
            rcon_port,
            max_players,
            server_password.as_deref() as Option<&str>,
            &admin_password,
            ip_address.as_deref() as Option<&str>,
            cluster_name.as_deref() as Option<&str>,
            cluster_path.as_deref() as Option<&str>,
            None, // No mods
            custom_args.as_deref() as Option<&str>,
        )
        .map_err(|e: AnyhowError| e.to_string())?;

    // Update status in database
    {
        let db = state
            .db
            .lock()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
        let conn = db
            .get_connection()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
        conn.execute(
            "UPDATE servers SET status = 'running', last_started = datetime('now') WHERE id = ?1",
            [server_id],
        )
        .map_err(|e: rusqlite::Error| e.to_string())?;
    }

    println!("  ✅ Server {} started (NO MODS)", server_id);

    // Start log watcher for anomaly detection
    let _ = state.log_watcher.start_watching(server_id, install_path_buf.clone());
    Ok(())
}

/// Graceful stop helper: SaveWorld → DoExit → wait → force-kill fallback.
/// Used by both stop_server and restart_server to ensure world data is saved.
async fn graceful_stop(state: &State<'_, AppState>, server_id: i64) -> Result<(), String> {
    // Only attempt RCON graceful shutdown if the server process is actually running
    if state.process_manager.is_running(server_id) {
        // Get RCON connection details from DB
        let (rcon_port, admin_password): (u16, String) = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            conn.query_row(
                "SELECT rcon_port, admin_password FROM servers WHERE id = ?1",
                [server_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| format!("Server not found: {}", e))?
        };

        // Clean admin password for RCON auth
        let clean_password = admin_password
            .split("?ServerPassword=")
            .next()
            .unwrap_or(&admin_password)
            .to_string();

        let rcon = crate::services::rcon::RconService::new();

        // Step 1: Connect to RCON (short timeout — if server is unresponsive, skip to force-kill)
        println!("  📡 Attempting RCON connection for graceful shutdown...");
        let rcon_connected = match tokio::time::timeout(
            std::time::Duration::from_secs(5),
            rcon.connect(server_id, "127.0.0.1", rcon_port, &clean_password),
        )
        .await
        {
            Ok(Ok(resp)) => resp.success,
            _ => {
                println!("  ⚠️ RCON connection failed — skipping graceful shutdown");
                false
            }
        };

        if rcon_connected {
            // Step 2: SaveWorld
            println!("  💾 Sending SaveWorld command...");
            match tokio::time::timeout(
                std::time::Duration::from_secs(15),
                rcon.save_world(server_id),
            )
            .await
            {
                Ok(Ok(_)) => println!("  ✅ SaveWorld completed successfully"),
                Ok(Err(e)) => println!("  ⚠️ SaveWorld failed: {} — continuing shutdown", e),
                Err(_) => println!("  ⚠️ SaveWorld timed out (15s) — continuing shutdown"),
            }

            // Brief pause to let the save flush to disk
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;

            // Step 3: DoExit
            println!("  🚪 Sending DoExit command...");
            use tauri::Manager;
            if let Some(guardian) = state.app_handle.try_state::<crate::services::guardian::GuardianState>() {
                let guard = guardian.0.lock().await;
                guard.mark_as_stopping(server_id).await;
            }
            let _ = rcon.send_command(server_id, "DoExit").await;

            // Step 4: Wait up to 10 seconds for natural exit
            let mut wait_count = 0u32;
            while state.process_manager.is_running(server_id) && wait_count < 10 {
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                wait_count += 1;
            }

            if !state.process_manager.is_running(server_id) {
                println!("  ✅ Server {} exited gracefully after DoExit", server_id);
                return Ok(());
            }
            println!("  ⚠️ Server {} still running after DoExit — force stopping", server_id);
        }
    }

    // Step 5: Force-kill fallback
    state
        .process_manager
        .stop_server(server_id)
        .map_err(|e: AnyhowError| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn stop_server(state: State<'_, AppState>, server_id: i64) -> Result<(), String> {
    println!("⏹️ Stopping server {} (graceful)", server_id);

    graceful_stop(&state, server_id).await?;

    // Update status in database
    let db = state
        .db
        .lock()
        .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
    let conn = db
        .get_connection()
        .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
    conn.execute(
        "UPDATE servers SET status = 'stopped' WHERE id = ?1",
        [server_id],
    )
    .map_err(|e: rusqlite::Error| e.to_string())?;

    println!("  ✅ Server {} stopped", server_id);

    // Stop log watcher
    state.log_watcher.stop_watching(server_id);
    Ok(())
}

#[tauri::command]
pub async fn restart_server(state: State<'_, AppState>, server_id: i64) -> Result<(), String> {
    println!("🔄 Restarting server {} (graceful stop first)", server_id);

    // Graceful stop before restart — ensures SaveWorld is called
    graceful_stop(&state, server_id).await?;

    // Get server details including cluster info
    let (
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
        cluster_name,
        cluster_path,
        custom_args,
    ) = {
        let db = state
            .db
            .lock()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
        let conn = db
            .get_connection()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

        conn.query_row(
            "SELECT s.install_path, s.map_name, s.session_name, s.game_port, s.query_port, s.rcon_port, 
             s.max_players, s.server_password, s.admin_password, s.ip_address,
             c.name, c.cluster_path, s.custom_args
             FROM servers s
             LEFT JOIN clusters c ON s.cluster_id = c.id
             WHERE s.id = ?1",
            [server_id],
            |row: &Row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, u16>(3)?,
                    row.get::<_, u16>(4)?,
                    row.get::<_, u16>(5)?,
                    row.get::<_, i32>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, String>(8)?,
                    row.get::<_, Option<String>>(9)?,
                    row.get::<_, Option<String>>(10)?,
                    row.get::<_, Option<String>>(11)?,
                    row.get::<_, Option<String>>(12)?,
                ))
            },
        )
        .map_err(|e| format!("Server not found: {}", e))?
    };

    // Get enabled mods for this server
    let enabled_mods: Vec<String> = {
        let db = state
            .db
            .lock()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
        let conn = db
            .get_connection()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

        let mut stmt = conn.prepare(
            "SELECT mod_id FROM mods WHERE server_id = ?1 AND enabled = 1 ORDER BY load_order ASC"
        ).map_err(|e: rusqlite::Error| e.to_string())?;

        let mut rows = stmt
            .query([server_id])
            .map_err(|e: rusqlite::Error| e.to_string())?;
        let mut mods = Vec::new();
        while let Some(row) = rows.next().map_err(|e: rusqlite::Error| e.to_string())? {
            if let Ok(mod_id) = row.get::<usize, String>(0) {
                mods.push(mod_id);
            }
        }
        mods
    };

    if !enabled_mods.is_empty() {
        println!(
            "  🧩 Found {} enabled mods for server {}",
            enabled_mods.len(),
            server_id
        );
    }

    // Restart the server with mods
    let mods_option = if enabled_mods.is_empty() {
        None
    } else {
        Some(enabled_mods.as_slice())
    };

    // Server was already gracefully stopped above — just start fresh
    state
        .process_manager
        .start_server(
            server_id,
            "ASA",
            &PathBuf::from(&install_path),
            &map_name,
            &session_name,
            game_port,
            query_port,
            rcon_port,
            max_players,
            server_password.as_deref() as Option<&str>,
            &admin_password,
            ip_address.as_deref() as Option<&str>,
            cluster_name.as_deref() as Option<&str>,
            cluster_path.as_deref() as Option<&str>,
            mods_option,
            custom_args.as_deref() as Option<&str>,
        )
        .map_err(|e: AnyhowError| e.to_string())?;

    // Update status
    {
        let db = state
            .db
            .lock()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
        let conn = db
            .get_connection()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
        conn.execute(
            "UPDATE servers SET status = 'running', last_started = datetime('now') WHERE id = ?1",
            [server_id],
        )
        .map_err(|e: rusqlite::Error| e.to_string())?;
    }

    println!("  ✅ Server {} restarted", server_id);
    Ok(())
}

#[tauri::command]
pub async fn delete_server(state: State<'_, AppState>, server_id: i64) -> Result<(), String> {
    println!("🗑️ Deleting server {}", server_id);

    let db = state
        .db
        .lock()
        .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
    let conn = db
        .get_connection()
        .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

    conn.execute("DELETE FROM servers WHERE id = ?1", [server_id])
        .map_err(|e: rusqlite::Error| e.to_string())?;

    println!("  ✅ Server {} deleted", server_id);
    Ok(())
}

/// Update server settings in database (syncs INI changes with DB)
#[tauri::command]
pub async fn update_server_settings(
    state: State<'_, AppState>,
    server_id: i64,
    max_players: Option<i32>,
    server_password: Option<String>,
    admin_password: Option<String>,
    map_name: Option<String>,
    session_name: Option<String>,
    game_port: Option<u16>,
    query_port: Option<u16>,
    rcon_port: Option<u16>,
    ip_address: Option<String>,
    custom_args: Option<String>,
) -> Result<(), String> {
    println!("⚙️ Updating server settings for server {}", server_id);

    let db = state
        .db
        .lock()
        .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
    let conn = db
        .get_connection()
        .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

    // Build dynamic update query
    let mut updates = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(v) = max_players {
        updates.push("max_players = ?");
        params.push(Box::new(v));
    }
    if let Some(v) = server_password {
        updates.push("server_password = ?");
        params.push(Box::new(v));
    }
    if let Some(v) = admin_password {
        let clean_v = v.split("?ServerPassword=").next().unwrap_or(&v).to_string();
        updates.push("admin_password = ?");
        params.push(Box::new(clean_v));
    }
    if let Some(v) = map_name {
        updates.push("map_name = ?");
        params.push(Box::new(v));
    }
    if let Some(v) = session_name {
        updates.push("session_name = ?");
        params.push(Box::new(v));
    }
    if let Some(v) = game_port {
        updates.push("game_port = ?");
        params.push(Box::new(v as i32));
    }
    if let Some(v) = query_port {
        updates.push("query_port = ?");
        params.push(Box::new(v as i32));
    }
    if let Some(v) = rcon_port {
        updates.push("rcon_port = ?");
        params.push(Box::new(v as i32));
    }
    if let Some(v) = ip_address {
        updates.push("ip_address = ?");
        params.push(Box::new(v));
    }
    if let Some(v) = custom_args {
        updates.push("custom_args = ?");
        params.push(Box::new(v));
    }

    if updates.is_empty() {
        return Ok(());
    }

    let query = format!("UPDATE servers SET {} WHERE id = ?", updates.join(", "));
    params.push(Box::new(server_id));

    let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    conn.execute(&query, params_refs.as_slice())
        .map_err(|e: rusqlite::Error| e.to_string())?;

    println!("  ✅ Server {} settings updated", server_id);
    Ok(())
}

#[tauri::command]
pub async fn update_server(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<(), String> {
    println!("📥 Updating server {}", server_id);

    // Get server install path
    let (install_path, server_type) = {
        let db = state
            .db
            .lock()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
        let conn = db
            .get_connection()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

        conn.query_row(
            "SELECT install_path, server_type FROM servers WHERE id = ?1",
            [server_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1).unwrap_or_else(|_| "ASA".to_string())
                ))
            },
        )
        .map_err(|e| format!("Server not found: {}", e))?
    };

    // Update status to updating
    {
        let db = state
            .db
            .lock()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
        let conn = db
            .get_connection()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
        conn.execute(
            "UPDATE servers SET status = 'updating' WHERE id = ?1",
            [server_id],
        )
        .map_err(|e: rusqlite::Error| e.to_string())?;
    }

    // Run the update
    let installer = ServerInstaller::new(app_handle, install_path.clone());
    installer
        .update_server(&PathBuf::from(install_path), &server_type)
        .await?;

    // Update status back to stopped
    {
        let db = state
            .db
            .lock()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
        let conn = db
            .get_connection()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
        conn.execute(
            "UPDATE servers SET status = 'stopped' WHERE id = ?1",
            [server_id],
        )
        .map_err(|e: rusqlite::Error| e.to_string())?;
    }

    println!("  ✅ Server {} updated", server_id);
    Ok(())
}

#[tauri::command]
pub async fn check_server_reachability(port: u16, protocol: String) -> Result<String, String> {
    // 1. Get Public IP
    let public_ip = match network::get_public_ip().await {
        Ok(ip) => ip,
        Err(_) => return Ok("LAN".to_string()),
    };

    // 2. Check reachability using the correct protocol
    // UDP ports (game/query) need A2S_INFO query; TCP ports (RCON) use TCP connect
    let is_open = if protocol.to_uppercase() == "UDP" {
        network::query_server(&public_ip, port)
    } else {
        network::check_port_open(&public_ip, port)
    };

    if is_open {
        Ok("Public".to_string())
    } else {
        Ok("Offline".to_string())
    }
}

#[tauri::command]
pub async fn get_server_logs(
    server_id: i64,
    install_path: String,
) -> Result<Vec<crate::services::process_manager::ServerLogEvent>, String> {
    use crate::services::process_manager::ServerLogEvent;
    use std::fs::File;
    use std::io::{BufRead, BufReader, Seek, SeekFrom};

    let log_file_path = PathBuf::from(&install_path)
        .join("ShooterGame")
        .join("Saved")
        .join("Logs")
        .join("ShooterGame.log");

    let mut logs = Vec::new();

    // Check if log file exists
    if !log_file_path.exists() {
        logs.push(ServerLogEvent {
            server_id,
            line: format!("[Manager] Log file not found: {:?}", log_file_path),
            is_stderr: true,
        });
        return Ok(logs);
    }

    let file = match File::open(&log_file_path) {
        Ok(f) => f,
        Err(e) => {
            logs.push(ServerLogEvent {
                server_id,
                line: format!("[Manager] Failed to open log: {}", e),
                is_stderr: true,
            });
            return Ok(logs);
        }
    };

    let mut reader = BufReader::new(file);

    // Seek to get last 100KB of logs (recent history)
    let file_meta = std::fs::metadata(&log_file_path);
    if let Ok(meta) = file_meta {
        let file_size = meta.len() as i64;
        let seek_pos = std::cmp::max(0, file_size - 100000); // 100KB history
        if reader.seek(SeekFrom::Start(seek_pos as u64)).is_ok() {
            // Skip partial first line if we seeked into the middle
            if seek_pos > 0 {
                let mut skip = String::new();
                let _ = reader.read_line(&mut skip);
            }
        }
    }

    // Read all content
    for line in reader.lines().flatten() {
        let trimmed = line.trim_end().to_string();
        if !trimmed.is_empty() {
            logs.push(ServerLogEvent {
                server_id,
                line: trimmed,
                is_stderr: false,
            });
        }
    }

    Ok(logs)
}

struct CmdSettings {
    map_name: Option<String>,
    game_port: Option<u16>,
    query_port: Option<u16>,
    rcon_port: Option<u16>,
    rcon_enabled: Option<bool>,
    max_players: Option<u32>,
    session_name: Option<String>,
    server_password: Option<String>,
    admin_password: Option<String>,
    ip_address: Option<String>,
    cluster_id: Option<String>,
    active_mods: Option<String>,
    custom_args: Vec<String>,
}

fn split_cmd_line(line: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut quote_char = ' ';

    for c in line.chars() {
        if (c == '"' || c == '\'') && !in_quotes {
            in_quotes = true;
            quote_char = c;
        } else if in_quotes && c == quote_char {
            in_quotes = false;
        } else if c.is_whitespace() && !in_quotes {
            if !current.is_empty() {
                tokens.push(current.clone());
                current.clear();
            }
        } else {
            current.push(c);
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

fn parse_travel_url(token: &str) -> Option<(String, Vec<(String, String)>)> {
    if !token.contains('?') {
        return None;
    }
    let token = token.trim_matches('"').trim_matches('\'');
    let parts: Vec<&str> = token.split('?').collect();
    if parts.is_empty() {
        return None;
    }
    let map_part = parts[0];
    let map_name = map_part
        .split('/')
        .last()
        .unwrap_or("")
        .split('\\')
        .last()
        .unwrap_or("")
        .to_string();

    let mut options = Vec::new();
    for part in &parts[1..] {
        if let Some((k, v)) = part.split_once('=') {
            options.push((k.to_lowercase(), v.trim_matches('"').trim_matches('\'').to_string()));
        } else {
            options.push((part.to_lowercase(), String::new()));
        }
    }
    Some((map_name, options))
}

fn parse_cmd_line(line: &str) -> Option<CmdSettings> {
    let line_lower = line.to_lowercase();
    if !line_lower.contains("arkascendedserver") 
        && !line_lower.contains("shootergameserver") 
        && !line_lower.contains("?listen") {
        return None;
    }

    let tokens = split_cmd_line(line);
    let mut settings = CmdSettings {
        map_name: None,
        game_port: None,
        query_port: None,
        rcon_port: None,
        rcon_enabled: None,
        max_players: None,
        session_name: None,
        server_password: None,
        admin_password: None,
        ip_address: None,
        cluster_id: None,
        active_mods: None,
        custom_args: Vec::new(),
    };

    let mut found_launch = false;

    for token in tokens {
        if token.contains('?') && !token.starts_with('-') {
            if let Some((map, options)) = parse_travel_url(&token) {
                if !map.is_empty() {
                    settings.map_name = Some(map);
                    found_launch = true;
                }
                for (k, v) in options {
                    match k.as_str() {
                        "port" => settings.game_port = v.parse().ok(),
                        "queryport" => settings.query_port = v.parse().ok(),
                        "rconport" => settings.rcon_port = v.parse().ok(),
                        "rconenabled" => settings.rcon_enabled = Some(v.to_lowercase() == "true" || v == "1"),
                        "maxplayers" => settings.max_players = v.parse().ok(),
                        "sessionname" => settings.session_name = Some(v),
                        "serverpassword" => settings.server_password = Some(v),
                        "serveradminpassword" => settings.admin_password = Some(v),
                        "multihome" | "ipaddress" => settings.ip_address = Some(v),
                        _ => {}
                    }
                }
            }
        } else if let Some(arg) = token.strip_prefix('-') {
            if let Some((k, v)) = arg.split_once('=') {
                let key_lower = k.to_lowercase();
                let val = v.trim_matches('"').trim_matches('\'').to_string();
                match key_lower.as_str() {
                    "multihome" | "ipaddress" => settings.ip_address = Some(val),
                    "clusterid" => settings.cluster_id = Some(val),
                    "rconport" => settings.rcon_port = val.parse().ok(),
                    "rconenabled" => settings.rcon_enabled = Some(val.to_lowercase() == "true" || val == "1"),
                    "modids" | "activemods" => settings.active_mods = Some(val),
                    _ => {
                        settings.custom_args.push(token.clone());
                    }
                }
            } else {
                settings.custom_args.push(token.clone());
            }
        }
    }

    if found_launch || settings.game_port.is_some() || settings.query_port.is_some() {
        Some(settings)
    } else {
        None
    }
}

fn detect_batch_settings(install_path: &std::path::Path, _server_type: &str) -> Option<CmdSettings> {
    use std::fs;
    
    let search_dirs = vec![
        install_path.to_path_buf(),
        install_path.join("ShooterGame").join("Binaries").join("Win64"),
    ];

    for dir in search_dirs {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(ext) = path.extension() {
                    let ext_lower = ext.to_string_lossy().to_lowercase();
                    if ext_lower == "bat" || ext_lower == "cmd" {
                        if let Ok(content) = fs::read_to_string(&path) {
                            for line in content.lines() {
                                let line = line.trim();
                                if line.is_empty() {
                                    continue;
                                }
                                let line_lower = line.to_lowercase();
                                if line_lower.starts_with("rem") 
                                    || line_lower.starts_with("::") 
                                    || line_lower.starts_with("@rem") 
                                    || line_lower.starts_with("@::") {
                                    continue;
                                }
                                if let Some(settings) = parse_cmd_line(line) {
                                    println!("   ✅ Parsed launch settings from batch file: {:?}", path.file_name().unwrap_or_default());
                                    return Some(settings);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

/// Detect the map name from an ARK server installation path.
/// Checks GameUserSettings.ini for ServerMap/MapName, then scans .bat/.cmd files
/// for the travel URL pattern, and falls back to a default.
fn detect_map_name(install_path: &std::path::Path, server_type: &str) -> String {
    use std::fs;

    let default_map = if server_type == "ASE" { "TheIsland" } else { "TheIsland_WP" };

    // 1. Check batch files first because command line arguments override INI settings
    if let Some(batch) = detect_batch_settings(install_path, server_type) {
        if let Some(map) = batch.map_name {
            println!("   📍 Detected map from batch file: {}", map);
            return map;
        }
    }

    // 2. Check GameUserSettings.ini for ServerMap= or MapName= under [ServerSettings]
    let gus_path = install_path
        .join("ShooterGame")
        .join("Saved")
        .join("Config")
        .join("WindowsServer")
        .join("GameUserSettings.ini");

    if gus_path.exists() {
        if let Ok(content) = fs::read_to_string(&gus_path) {
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
                        if (key == "ServerMap" || key == "MapName") && !value.is_empty() {
                            println!("   📍 Detected map from INI: {}", value);
                            return value.to_string();
                        }
                    }
                }
            }
        }
    }

    println!("   ⚠️  No map name detected, using default: {}", default_map);
    default_map.to_string()
}

/// Parse an IP address from INI content (MultiHome= key) or startup scripts.
fn detect_ip_address(install_path: &std::path::Path) -> Option<String> {
    use std::fs;

    // 1. Check batch files first
    if let Some(batch) = detect_batch_settings(install_path, "") {
        if let Some(ip) = batch.ip_address {
            println!("   📍 Detected IP address from batch file: {}", ip);
            return Some(ip);
        }
    }

    // 2. Check GameUserSettings.ini for MultiHome=
    let gus_path = install_path
        .join("ShooterGame")
        .join("Saved")
        .join("Config")
        .join("WindowsServer")
        .join("GameUserSettings.ini");

    if gus_path.exists() {
        if let Ok(content) = fs::read_to_string(&gus_path) {
            for line in content.lines() {
                let trimmed = line.trim();
                if let Some((key, value)) = trimmed.split_once('=') {
                    if key.trim() == "MultiHome" && !value.trim().is_empty() {
                        return Some(value.trim().to_string());
                    }
                }
            }
        }
    }

    None
}

/// Import preview result returned to the frontend before committing.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub map_name: String,
    pub session_name: String,
    pub max_players: u32,
    pub game_port: u16,
    pub query_port: u16,
    pub rcon_port: u16,
    pub rcon_enabled: bool,
    pub admin_password: String,
    pub server_password: String,
    pub ip_address: Option<String>,
    pub active_mods: String,
    pub custom_args: String,
    pub cluster_id: String,
    pub warnings: Vec<String>,
}

/// Parse all importable settings from an ARK installation path (works for both ASA and ASE).
pub fn parse_import_settings(install_path: &std::path::Path, server_type: &str) -> ImportPreview {
    use std::fs;

    let mut warnings: Vec<String> = Vec::new();

    let config_dir = install_path
        .join("ShooterGame")
        .join("Saved")
        .join("Config")
        .join("WindowsServer");

    let gus_path = config_dir.join("GameUserSettings.ini");

    let mut max_players: u32 = 70;
    let mut session_name = String::new();
    let mut server_password = String::new();
    let mut admin_password = String::new();
    let mut game_port: u16 = 7777;
    let mut query_port: u16 = 27015;
    let mut rcon_port: u16 = 27020;
    let mut rcon_enabled = true;
    let mut active_mods = String::new();
    let mut custom_args = String::new();
    let mut cluster_id = String::new();

    if gus_path.exists() {
        if let Ok(content) = fs::read_to_string(&gus_path) {
            let mut current_section = String::new();

            for line in content.lines() {
                let trimmed = line.trim();

                if trimmed.starts_with('[') && trimmed.ends_with(']') {
                    current_section = trimmed[1..trimmed.len() - 1].to_string();
                    continue;
                }

                if let Some((key, value)) = trimmed.split_once('=') {
                    let key = key.trim();
                    let value = value.trim();

                    if current_section == "ServerSettings"
                        || current_section == "/Script/ShooterGame.ShooterGameMode"
                    {
                        match key {
                            "MaxPlayers" => max_players = value.parse().unwrap_or(70),
                            "ServerPassword" if !value.is_empty() => {
                                server_password = value.to_string();
                            }
                            "ServerAdminPassword" if !value.is_empty() => {
                                let clean = value.split("?ServerPassword=").next().unwrap_or(value);
                                admin_password = clean.to_string();
                            }
                            "SessionName" if !value.is_empty() => {
                                session_name = value.to_string();
                            }
                            "RCONEnabled" => {
                                rcon_enabled = value.to_lowercase() == "true" || value == "1";
                            }
                            "RCONPort" => rcon_port = value.parse().unwrap_or(27020),
                            "ActiveMods" if !value.is_empty() => {
                                active_mods = value.to_string();
                            }
                            _ => {}
                        }
                    }

                    if current_section == "URL" || current_section == "/Script/Engine.GameSession" {
                        match key {
                            "Port" => game_port = value.parse().unwrap_or(7777),
                            "QueryPort" => query_port = value.parse().unwrap_or(27015),
                            "MaxPlayers" => {
                                if let Ok(v) = value.parse::<u32>() {
                                    max_players = v;
                                }
                            }
                            _ => {}
                        }
                    }

                    if current_section == "ASM2" {
                        if key == "LauncherArgs" && !value.is_empty() {
                            custom_args = value.to_string();
                        }
                    }
                }
            }
        }
    } else {
        warnings.push("GameUserSettings.ini not found — using defaults for most settings.".into());
    }

    // Detect map name via helper
    let map_name = detect_map_name(install_path, server_type);

    // Detect IP address
    let mut ip_address = detect_ip_address(install_path);

    // Override / merge launch parameters from batch/cmd files if found
    if let Some(batch) = detect_batch_settings(install_path, server_type) {
        if let Some(port) = batch.game_port {
            game_port = port;
        }
        if let Some(port) = batch.query_port {
            query_port = port;
        }
        if let Some(port) = batch.rcon_port {
            rcon_port = port;
        }
        if let Some(enabled) = batch.rcon_enabled {
            rcon_enabled = enabled;
        }
        if let Some(players) = batch.max_players {
            max_players = players;
        }
        if let Some(name) = batch.session_name {
            session_name = name;
        }
        if let Some(pwd) = batch.server_password {
            server_password = pwd;
        }
        if let Some(pwd) = batch.admin_password {
            admin_password = pwd;
        }
        if let Some(ip) = batch.ip_address {
            ip_address = Some(ip);
        }
        if let Some(mods) = batch.active_mods {
            active_mods = mods;
        }
        if !batch.custom_args.is_empty() {
            custom_args = batch.custom_args.join(" ");
        }
        if let Some(cid) = batch.cluster_id {
            cluster_id = cid;
        }
    }

    if session_name.is_empty() {
        warnings.push("No SessionName found in INI or batch files — will use folder name.".into());
    }
    if admin_password.is_empty() {
        warnings.push("No ServerAdminPassword found — you should set one after import.".into());
    }

    ImportPreview {
        map_name,
        session_name,
        max_players,
        game_port,
        query_port,
        rcon_port,
        rcon_enabled,
        admin_password,
        server_password,
        ip_address,
        active_mods,
        custom_args,
        cluster_id,
        warnings,
    }
}

#[tauri::command]
pub async fn preview_import_settings(
    install_path: String,
    server_type: String,
) -> Result<ImportPreview, String> {
    let path = PathBuf::from(&install_path);
    if !path.exists() {
        return Err("Installation path does not exist.".to_string());
    }
    Ok(parse_import_settings(&path, &server_type))
}

#[tauri::command]
pub async fn import_server(
    state: State<'_, AppState>,
    install_path: String,
    name: String,
) -> Result<Server, String> {

    println!("📥 Importing server from: {}", install_path);

    let path = PathBuf::from(&install_path);

    // Validate that this looks like an ARK server installation
    let exe_path = path
        .join("ShooterGame")
        .join("Binaries")
        .join("Win64")
        .join("ArkAscendedServer.exe");

    let shooter_game_path = path.join("ShooterGame");

    if exe_path.exists() {
        println!("   ✅ Found server executable");
    } else if shooter_game_path.exists() {
        println!(
            "   ⚠️  ShooterGame folder found but no executable - will auto-download on first start"
        );
    } else {
        println!("   ⚠️  Empty folder - server will be downloaded on first start");
    }

    // Parse all settings from INI files
    let preview = parse_import_settings(&path, "ASA");

    let map_name = preview.map_name;
    let session_name = if preview.session_name.is_empty() { name.clone() } else { preview.session_name };
    let server_password: Option<String> = if preview.server_password.is_empty() { None } else { Some(preview.server_password) };
    let admin_password = preview.admin_password;
    let game_port = preview.game_port;
    let query_port = preview.query_port;
    let rcon_port = preview.rcon_port;
    let rcon_enabled = preview.rcon_enabled;
    let max_players = preview.max_players;
    let ip_address = preview.ip_address;
    let mods_str = preview.active_mods;
    let custom_args = preview.custom_args;

    println!(
        "   Detected settings: Session={}, Map={}, MaxPlayers={}, Ports={}/{}/{}, Mods={}",
        session_name, map_name, max_players, game_port, query_port, rcon_port,
        if mods_str.is_empty() { "none" } else { &mods_str }
    );

    // Create database entry
    let db = state
        .db
        .lock()
        .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
    let conn = db
        .get_connection()
        .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

    // Check if this path is already registered
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM servers WHERE install_path = ?1)",
            [&install_path],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if exists {
        return Err("A server with this installation path already exists.".to_string());
    }

    // Ensure unique name
    let mut unique_name = name.clone();
    let mut counter = 1;
    loop {
        let name_exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM servers WHERE name = ?1)",
                [&unique_name],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if !name_exists {
            break;
        }
        counter += 1;
        unique_name = format!("{} ({})", name, counter);
    }

    conn.execute(
        "INSERT INTO servers (name, install_path, status, game_port, query_port, rcon_port, 
         max_players, admin_password, server_password, map_name, session_name, rcon_enabled, ip_address, custom_args) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        rusqlite::params![
            &unique_name,
            &install_path,
            "stopped",
            game_port,
            query_port,
            rcon_port,
            max_players,
            &admin_password,
            &server_password,
            &map_name,
            &session_name,
            rcon_enabled,
            &ip_address,
            if custom_args.is_empty() { None } else { Some(&custom_args) },
        ],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    // Parse mods list from comma-separated string
    let mods_vec: Vec<String> = if mods_str.is_empty() {
        vec![]
    } else {
        mods_str.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect()
    };

    println!("✅ Server imported with ID: {} (map: {}, mods: {})", id, map_name, mods_vec.len());

    Ok(Server {
        id,
        name: unique_name.clone(),
        server_type: "ASA".to_string(),
        install_path: PathBuf::from(install_path),
        status: ServerStatus::Stopped,
        ports: ServerPorts {
            game_port,
            query_port,
            rcon_port,
        },
        config: ServerConfig {
            max_players: max_players as i32,
            server_password,
            admin_password: admin_password.clone(),
            map_name,
            session_name,
            motd: None,
            mods: mods_vec,
            custom_args: if custom_args.is_empty() { None } else { Some(custom_args) },
        },
        rcon_config: RconConfig {
            enabled: rcon_enabled,
            password: admin_password,
        },
        ip_address,
        created_at: chrono::Utc::now().to_rfc3339(),
        last_started: None,
        auto_start: false,
        auto_stop: false,
        intelligent_mode: false,
    })
}

#[tauri::command]
pub async fn toggle_automation(
    state: State<'_, AppState>,
    server_id: i64,
    toggle_type: String, // "auto_start" or "auto_stop"
    enabled: bool,
) -> Result<(), String> {
    println!(
        "⚙️ Toggling automation {} for server {}: {}",
        toggle_type, server_id, enabled
    );

    let (db, _app_handle) = {
        let db = state
            .db
            .lock()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
        (db, state.app_handle.clone())
    };

    // Update DB
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let column = match toggle_type.as_str() {
        "auto_start" => "auto_start",
        "auto_stop" => "auto_stop",
        "intelligent_mode" => "intelligent_mode",
        _ => return Err("Invalid toggle type".to_string()),
    };

    let query = format!("UPDATE servers SET {} = ?1 WHERE id = ?2", column);
    conn.execute(&query, rusqlite::params![enabled as i32, server_id])
        .map_err(|e| format!("Failed to update database: {}", e))?;

    // Handle File Watcher logic for Auto-Stop and Intelligent Mode
    if toggle_type == "auto_stop" || toggle_type == "intelligent_mode" {
        if enabled {
            // Get install path
            let install_path: String = conn
                .query_row(
                    "SELECT install_path FROM servers WHERE id = ?1",
                    [server_id],
                    |row| row.get(0),
                )
                .map_err(|e| format!("Server not found: {}", e))?;

            state
                .file_watcher
                .start_watching(server_id, PathBuf::from(install_path))?;
        } else {
            state.file_watcher.stop_watching(server_id);
        }
    }

    Ok(())
}

// ==========================================
// SteamCMD Recovery Commands
// ==========================================

#[tauri::command]
pub async fn repair_steamcmd(app_handle: tauri::AppHandle) -> Result<(), String> {
    use crate::services::steamcmd::SteamCmdService;
    let steamcmd = SteamCmdService::new(app_handle);
    steamcmd
        .repair()
        .await
        .map_err(|e| format!("Failed to repair SteamCMD: {}", e))
}

#[tauri::command]
pub async fn clear_steamcmd_cache(app_handle: tauri::AppHandle) -> Result<(), String> {
    use crate::services::steamcmd::SteamCmdService;
    let steamcmd = SteamCmdService::new(app_handle);
    steamcmd
        .clear_cache()
        .map_err(|e| format!("Failed to clear SteamCMD cache: {}", e))
}

#[tauri::command]
pub async fn get_steamcmd_health(
    app_handle: tauri::AppHandle,
) -> Result<crate::services::steamcmd::SteamCmdHealth, String> {
    use crate::services::steamcmd::SteamCmdService;
    let steamcmd = SteamCmdService::new(app_handle);
    steamcmd
        .check_health()
        .map_err(|e| format!("Failed to check SteamCMD health: {}", e))
}

// ==========================================
// Port Conflict Detection
// ==========================================

#[derive(serde::Serialize)]
pub struct PortConflict {
    pub port_type: String,
    pub port_number: u16,
    pub conflicting_server_name: Option<String>,
    pub is_running: bool,
}

#[derive(serde::Serialize)]
pub struct ConflictCheckResult {
    pub has_active_conflicts: bool,
    pub has_inactive_conflicts: bool,
    pub conflicts: Vec<PortConflict>,
}

#[tauri::command]
pub async fn check_port_conflicts(
    state: tauri::State<'_, AppState>,
    server_id: i64,
) -> Result<ConflictCheckResult, String> {
    let mut conflicts = Vec::new();
    let mut has_active_conflicts = false;
    let mut has_inactive_conflicts = false;

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let (game_port, query_port, rcon_port): (u16, u16, u16) = conn
        .query_row(
            "SELECT game_port, query_port, rcon_port FROM servers WHERE id = ?1",
            [server_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| format!("Failed to get ports: {}", e))?;

    let my_ports = [
        ("Game", game_port),
        ("Query", query_port),
        ("RCON", rcon_port)
    ];

    for (port_type, port) in &my_ports {
        let is_in_use = crate::services::network::is_port_in_use(*port);

        let mut owner_name = None;

        let mut stmt = conn
            .prepare("SELECT id, name, game_port, query_port, rcon_port FROM servers WHERE id != ?1")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query([server_id]).map_err(|e| e.to_string())?;

        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let other_name_str: String = row.get(1).map_err(|e| e.to_string())?;
            let other_ports: [u16; 3] = [
                row.get(2).map_err(|e| e.to_string())?,
                row.get(3).map_err(|e| e.to_string())?,
                row.get(4).map_err(|e| e.to_string())?,
            ];

            if other_ports.contains(port) {
                owner_name = Some(other_name_str);
                break;
            }
        }

        if is_in_use || owner_name.is_some() {
            if is_in_use {
                has_active_conflicts = true;
            } else {
                has_inactive_conflicts = true;
            }
            conflicts.push(PortConflict {
                port_type: port_type.to_string(),
                port_number: *port,
                conflicting_server_name: owner_name,
                is_running: is_in_use,
            });
        }
    }

    Ok(ConflictCheckResult {
        has_active_conflicts,
        has_inactive_conflicts,
        conflicts,
    })
}
