use crate::models::{RconConfig, Server, ServerConfig, ServerPorts, ServerStatus};
use crate::services::network;
use crate::services::server_installer::ServerInstaller;
use crate::AppState;
use anyhow::Error as AnyhowError;
use rusqlite::Row;
use std::path::PathBuf;
use tauri::{Manager, State};

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
         auto_start, auto_stop, intelligent_mode, map_name, session_name, custom_args FROM servers",
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
    _state: State<'_, AppState>,
    _server_id: i64,
) -> Result<Option<Server>, String> {
    // TODO: Implement
    Ok(None)
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
    map_name: String,
    game_port: u16,
    query_port: u16,
    rcon_port: u16,
) -> Result<Server, String> {
    println!("🚀 Installing server: {} at {}", name, install_path);

    let path = PathBuf::from(&install_path);

    // Create the installer and run the installation
    let installer = ServerInstaller::new(app_handle);
    installer.install_asa_server(&path).await?;

    // Create database entry (Scoped to drop mutex/lock before await)
    let (id, unique_name) = {
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

        conn.execute(
            "INSERT INTO servers (name, install_path, status, game_port, query_port, rcon_port, 
             max_players, admin_password, map_name, session_name, server_type) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            (
                &unique_name,
                &install_path,
                "stopped",
                game_port,
                query_port,
                rcon_port,
                70,
                "admin123",
                &map_name,
                &unique_name,
                "ASA", // Server type - ARK: Survival Ascended
            ),
        )
        .map_err(|e: rusqlite::Error| e.to_string())?;

        (conn.last_insert_rowid(), unique_name)
    };

    let server_obj = Server {
        id,
        name: unique_name.clone(),

        install_path: PathBuf::from(install_path),
        status: ServerStatus::Stopped,
        ports: ServerPorts {
            game_port,
            query_port,
            rcon_port,
        },
        config: ServerConfig {
            max_players: 70,
            server_password: None,
            admin_password: "admin123".to_string(),
            map_name: map_name.clone(),
            session_name: unique_name,
            motd: None,
            mods: vec![],
            custom_args: None,
        },
        rcon_config: RconConfig {
            enabled: true,
            password: "admin123".to_string(),
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
    // CRITICAL FIX: Write initial config files to disk
    // ---------------------------------------------------------
    println!("📝 Generating initial server configuration files...");

    // Map models::ServerConfig to config_generator::ServerConfig
    let mut initial_config = crate::services::config_generator::ServerConfig::default();

    // Identity & Ports
    initial_config.session_name = server_obj.config.session_name.clone();
    initial_config.map_name = server_obj.config.map_name.clone();
    initial_config.max_players = server_obj.config.max_players;
    initial_config.admin_password = server_obj.config.admin_password.clone();
    initial_config.server_password = server_obj.config.server_password.clone();
    initial_config.game_port = server_obj.ports.game_port;
    initial_config.query_port = server_obj.ports.query_port;
    initial_config.rcon_port = server_obj.ports.rcon_port;
    initial_config.rcon_enabled = server_obj.rcon_config.enabled;

    // Mods
    initial_config.active_mods = server_obj.config.mods.clone();

    let config_write_result = crate::services::config_generator::ConfigGenerator::write_configs(
        &server_obj.install_path,
        &initial_config,
        false, // No backup needed for fresh install
    );

    if let Err(e) = config_write_result {
        println!("❌ Failed to write initial config files: {}", e);
        // We don't fail the whole install, but we log the error.
        // The server might start with defaults, but at least the DB is correct.
    } else {
        println!("✅ Initial config files created successfully.");
    }

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
        session_name,
        game_port,
        query_port,
        rcon_port,
        max_players,
        server_password,
        admin_password,
        ip_address,
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
             max_players, server_password, admin_password, ip_address FROM servers WHERE id = ?1",
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
                ))
            },
        )
        .map_err(|e| format!("Source server not found: {}", e))?
    };

    // Generate new name and paths
    let new_name = format!("{} (Copy)", name);
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
             max_players, admin_password, map_name, session_name, server_password, ip_address)
             VALUES (?1, ?2, 'stopped', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                new_name,
                new_install_path.to_string_lossy(),
                new_game_port,
                new_query_port,
                new_rcon_port,
                max_players,
                admin_password,
                map_name,
                format!("{} (Copy)", session_name),
                server_password,
                ip_address
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
            session_name: format!("{} (Copy)", session_name),
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

    // Copy config files
    let source_config = source_path.join("ShooterGame/Saved/Config/WindowsServer");
    let target_config = target_path.join("ShooterGame/Saved/Config/WindowsServer");

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

    // Copy all files recursively
    fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
        if src.is_dir() {
            std::fs::create_dir_all(dst)?;
            for entry in std::fs::read_dir(src)? {
                let entry = entry?;
                let src_path = entry.path();
                let dst_path = dst.join(entry.file_name());
                if src_path.is_dir() {
                    copy_dir_recursive(&src_path, &dst_path)?;
                } else {
                    std::fs::copy(&src_path, &dst_path)?;
                }
            }
        }
        Ok(())
    }

    copy_dir_recursive(&source_saves, &target_saves)
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
            app_handle, &*conn, server_id,
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
             c.name, c.cluster_path, s.custom_args
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
    let executable = install_path_buf
        .join("ShooterGame")
        .join("Binaries")
        .join("Win64")
        .join("ArkAscendedServer.exe");

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
        let installer = ServerInstaller::new(app_handle.clone());
        installer.update_server(&install_path_buf).await?;
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
        let installer = ServerInstaller::new(app_handle.clone());
        installer.install_asa_server(&install_path_buf).await?;

        println!("  ✅ Server download complete, now starting...");
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
            "ASA",
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
             c.name, c.cluster_path, s.custom_args
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
                ))
            },
        )
        .map_err(|e| format!("Server not found: {}", e))?
    };

    let install_path_buf = PathBuf::from(&install_path);

    // Check if server executable exists
    let executable = install_path_buf
        .join("ShooterGame")
        .join("Binaries")
        .join("Win64")
        .join("ArkAscendedServer.exe");

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
        let installer = ServerInstaller::new(app_handle.clone());
        installer.install_asa_server(&install_path_buf).await?;

        println!("  ✅ Server download complete, now starting...");
    }

    // Start server WITHOUT mods
    state
        .process_manager
        .start_server(
            server_id,
            "ASA",
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
    Ok(())
}

#[tauri::command]
pub async fn stop_server(state: State<'_, AppState>, server_id: i64) -> Result<(), String> {
    println!("⏹️ Stopping server {}", server_id);

    state
        .process_manager
        .stop_server(server_id)
        .map_err(|e: AnyhowError| e.to_string())?;

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
    Ok(())
}

#[tauri::command]
pub async fn restart_server(state: State<'_, AppState>, server_id: i64) -> Result<(), String> {
    println!("🔄 Restarting server {}", server_id);

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

    state
        .process_manager
        .restart_server(
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
        updates.push("admin_password = ?");
        params.push(Box::new(v));
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
    let install_path = {
        let db = state
            .db
            .lock()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
        let conn = db
            .get_connection()
            .map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

        conn.query_row(
            "SELECT install_path FROM servers WHERE id = ?1",
            [server_id],
            |row| row.get::<_, String>(0),
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
    let installer = ServerInstaller::new(app_handle);
    installer
        .update_server(&PathBuf::from(&install_path))
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
pub async fn check_server_reachability(
    _state: State<'_, AppState>,
    _server_id: i64,
    port: u16,
) -> Result<String, String> {
    // 1. Get Public IP
    let public_ip = match network::get_public_ip().await {
        Ok(ip) => ip,
        Err(_) => return Ok("LAN".to_string()), // If we can't get public IP, assume LAN or Offline
    };

    // 2. Check if port is open on that IP
    // NOTE: We intentionally do NOT write public_ip to the database here.
    // The ip_address column holds the user-configured IP and must never be
    // overwritten by auto-detected network state.
    // Note: This checks if the port is reachable from "externally" (or at least hairpinned)
    let is_open = network::check_port_open(&public_ip, port);

    if is_open {
        Ok("Public".to_string())
    } else {
        Ok("LAN".to_string())
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
        if let Ok(_) = reader.seek(SeekFrom::Start(seek_pos as u64)) {
            // Skip partial first line if we seeked into the middle
            if seek_pos > 0 {
                let mut skip = String::new();
                let _ = reader.read_line(&mut skip);
            }
        }
    }

    // Read all content
    for line in reader.lines() {
        if let Ok(line) = line {
            let trimmed = line.trim_end().to_string();
            if !trimmed.is_empty() {
                logs.push(ServerLogEvent {
                    server_id,
                    line: trimmed,
                    is_stderr: false,
                });
            }
        }
    }

    Ok(logs)
}

/// Import an existing server installation
/// Reads settings from GameUserSettings.ini and creates a database entry
#[tauri::command]
pub async fn import_server(
    state: State<'_, AppState>,
    install_path: String,
    name: String,
) -> Result<Server, String> {
    use std::fs;

    println!("📥 Importing server from: {}", install_path);

    let path = PathBuf::from(&install_path);

    // Validate that this looks like an ARK server installation
    // We check for either:
    // 1. The server executable (fully installed)
    // 2. OR the ShooterGame folder (partially installed)
    // 3. OR we just accept any folder (will auto-download on first start)
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

    // Read GameUserSettings.ini to extract settings
    let config_path = path
        .join("ShooterGame")
        .join("Saved")
        .join("Config")
        .join("WindowsServer")
        .join("GameUserSettings.ini");

    let mut max_players = 70;
    let map_name = "TheIsland_WP".to_string();
    let mut session_name = name.clone();
    let mut server_password: Option<String> = None;
    let mut admin_password = "admin123".to_string();
    let mut game_port: u16 = 7777;
    let mut query_port: u16 = 27015;
    let mut rcon_port: u16 = 27020;
    let mut rcon_enabled = true;

    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            let mut current_section = String::new();

            for line in content.lines() {
                let line = line.trim();

                // Section header
                if line.starts_with('[') && line.ends_with(']') {
                    current_section = line[1..line.len() - 1].to_string();
                    continue;
                }

                // Key=Value pair
                if let Some((key, value)) = line.split_once('=') {
                    let key = key.trim();
                    let value = value.trim();

                    if current_section == "ServerSettings"
                        || current_section == "/Script/ShooterGame.ShooterGameMode"
                    {
                        match key {
                            "MaxPlayers" => max_players = value.parse().unwrap_or(70),
                            "ServerPassword" if !value.is_empty() => {
                                server_password = Some(value.to_string())
                            }
                            "ServerAdminPassword" if !value.is_empty() => {
                                admin_password = value.to_string()
                            }
                            "SessionName" if !value.is_empty() => session_name = value.to_string(),
                            "RCONEnabled" => rcon_enabled = value.to_lowercase() == "true",
                            "RCONPort" => rcon_port = value.parse().unwrap_or(27020),
                            _ => {}
                        }
                    }

                    if current_section == "URL" || current_section == "/Script/Engine.GameSession" {
                        match key {
                            "Port" => game_port = value.parse().unwrap_or(7777),
                            "QueryPort" => query_port = value.parse().unwrap_or(27015),
                            _ => {}
                        }
                    }
                }
            }
        }
    }

    println!(
        "   Detected settings: Session={}, Map={}, MaxPlayers={}",
        session_name, map_name, max_players
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
         max_players, admin_password, server_password, map_name, session_name, rcon_enabled) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
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
        ],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    println!("✅ Server imported with ID: {}", id);

    Ok(Server {
        id,
        name: unique_name.clone(),

        install_path: PathBuf::from(install_path),
        status: ServerStatus::Stopped,
        ports: ServerPorts {
            game_port,
            query_port,
            rcon_port,
        },
        config: ServerConfig {
            max_players,
            server_password,
            admin_password: admin_password.clone(),
            map_name,
            session_name,
            motd: None,
            mods: vec![],
            custom_args: None,
        },
        rcon_config: RconConfig {
            enabled: rcon_enabled,
            password: admin_password,
        },
        ip_address: None,
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
