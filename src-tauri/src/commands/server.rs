use crate::models::{RconConfig, Server, ServerConfig, ServerPorts, ServerStatus};
use crate::services::network;
use crate::services::server_installer::ServerInstaller;
use crate::AppState;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub async fn get_all_servers(state: State<'_, AppState>) -> Result<Vec<Server>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, install_path, status, game_port, query_port, rcon_port, 
             max_players, server_password, admin_password, map_name, session_name, 
             motd, mods, custom_args, rcon_enabled, created_at, last_started, ip_address 
             FROM servers",
        )
        .map_err(|e| e.to_string())?;

    let mut servers = Vec::new();
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let status_str: String = row.get(3).unwrap_or_else(|_| "stopped".to_string());
        let status = match status_str.as_str() {
            "running" => ServerStatus::Running,
            "starting" => ServerStatus::Starting,
            "stopped" => ServerStatus::Stopped,
            "crashed" => ServerStatus::Crashed,
            "updating" => ServerStatus::Updating,
            "restarting" => ServerStatus::Restarting,
            _ => ServerStatus::Stopped,
        };

        let mods_str: String = row.get(13).unwrap_or_else(|_| String::new());
        let mods: Vec<String> = if mods_str.is_empty() {
            vec![]
        } else {
            mods_str.split(',').map(|s| s.to_string()).collect()
        };

        servers.push(Server {
            id: row.get(0).unwrap_or(0),
            name: row.get(1).unwrap_or_else(|_| "Unknown".to_string()),
            install_path: PathBuf::from(row.get::<_, String>(2).unwrap_or_default()),
            status,
            ports: ServerPorts {
                game_port: row.get(4).unwrap_or(7777),
                query_port: row.get(5).unwrap_or(27015),
                rcon_port: row.get(6).unwrap_or(27020),
            },
            config: ServerConfig {
                max_players: row.get(7).unwrap_or(70),
                server_password: row.get(8).ok(),
                admin_password: row.get(9).unwrap_or_else(|_| "admin123".to_string()),
                map_name: row.get(10).unwrap_or_else(|_| "TheIsland_WP".to_string()),
                session_name: row.get(11).unwrap_or_else(|_| "My Server".to_string()),
                motd: row.get(12).ok(),
                mods,
                custom_args: row.get(14).ok(),
            },
            rcon_config: RconConfig {
                enabled: row.get(15).unwrap_or(true),
                password: row
                    .get::<_, String>(9)
                    .unwrap_or_else(|_| "admin123".to_string()),
            },
            ip_address: row.get(18).ok(),
            created_at: row
                .get(16)
                .unwrap_or_else(|_| chrono::Utc::now().to_rfc3339()),
            last_started: row.get(17).ok(),
        });
    }

    Ok(servers)
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

    // Create database entry
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

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
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

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
    })
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
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

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
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

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
        .map_err(|e| e.to_string())?;

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
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

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
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

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
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<(), String> {
    println!("▶️ Starting server {}", server_id);

    // Sync critical settings from INI to DB before starting
    // This ensures that if the user manually edited INI files, the changes are respected
    // and passed correctly to the command line arguments
    let _ = crate::commands::config::save_config(
        state.clone(),
        server_id,
        "GameUserSettings".to_string(), // This triggers the sync logic we added to save_config
        crate::commands::config::read_config(
            state.clone(),
            server_id,
            "GameUserSettings".to_string(),
        )
        .await?,
    )
    .await;

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
        _cluster_id,
        cluster_name,
        cluster_path,
    ) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.query_row(
            "SELECT s.install_path, s.map_name, s.session_name, s.game_port, s.query_port, s.rcon_port, 
             s.max_players, s.server_password, s.admin_password, s.ip_address, s.cluster_id,
             c.name, c.cluster_path
             FROM servers s
             LEFT JOIN clusters c ON s.cluster_id = c.id
             WHERE s.id = ?1",
            [server_id],
            |row| {
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
                    row.get::<_, Option<i64>>(10)?,
                    row.get::<_, Option<String>>(11)?,
                    row.get::<_, Option<String>>(12)?,
                ))
            },
        )
        .map_err(|e| format!("Server not found: {}", e))?
    };

    // Get enabled mods for this server
    let enabled_mods: Vec<String> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let mut stmt = conn.prepare(
            "SELECT mod_id FROM mods WHERE server_id = ?1 AND enabled = 1 ORDER BY load_order ASC"
        ).map_err(|e| e.to_string())?;

        let mut rows = stmt.query([server_id]).map_err(|e| e.to_string())?;
        let mut mods = Vec::new();
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            if let Ok(mod_id) = row.get::<_, String>(0) {
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

    if !executable.exists() {
        // Server executable not found, trigger installation
        println!("  📥 Server executable not found, starting automatic download...");

        // Update status to 'updating' to show download progress
        {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            conn.execute(
                "UPDATE servers SET status = 'updating' WHERE id = ?1",
                [server_id],
            )
            .map_err(|e| e.to_string())?;
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
            server_password.as_deref(),
            &admin_password,
            ip_address.as_deref(),
            cluster_name.as_deref(),
            cluster_path.as_deref(),
            mods_option,
        )
        .map_err(|e| e.to_string())?;

    // Update status in database
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE servers SET status = 'running', last_started = datetime('now') WHERE id = ?1",
            [server_id],
        )
        .map_err(|e| e.to_string())?;
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

    // Get server details
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
    ) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.query_row(
            "SELECT s.install_path, s.map_name, s.session_name, s.game_port, s.query_port, s.rcon_port, 
             s.max_players, s.server_password, s.admin_password, s.ip_address,
             c.name, c.cluster_path
             FROM servers s
             LEFT JOIN clusters c ON s.cluster_id = c.id
             WHERE s.id = ?1",
            [server_id],
            |row| {
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
            server_password.as_deref(),
            &admin_password,
            ip_address.as_deref(),
            cluster_name.as_deref(),
            cluster_path.as_deref(),
            None, // No mods
        )
        .map_err(|e| e.to_string())?;

    // Update status in database
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE servers SET status = 'running', last_started = datetime('now') WHERE id = ?1",
            [server_id],
        )
        .map_err(|e| e.to_string())?;
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
        .map_err(|e| e.to_string())?;

    // Update status in database
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE servers SET status = 'stopped' WHERE id = ?1",
        [server_id],
    )
    .map_err(|e| e.to_string())?;

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
    ) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.query_row(
            "SELECT s.install_path, s.map_name, s.session_name, s.game_port, s.query_port, s.rcon_port, 
             s.max_players, s.server_password, s.admin_password, s.ip_address,
             c.name, c.cluster_path
             FROM servers s
             LEFT JOIN clusters c ON s.cluster_id = c.id
             WHERE s.id = ?1",
            [server_id],
            |row| {
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
                ))
            },
        )
        .map_err(|e| format!("Server not found: {}", e))?
    };

    // Get enabled mods for this server
    let enabled_mods: Vec<String> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let mut stmt = conn.prepare(
            "SELECT mod_id FROM mods WHERE server_id = ?1 AND enabled = 1 ORDER BY load_order ASC"
        ).map_err(|e| e.to_string())?;

        let mut rows = stmt.query([server_id]).map_err(|e| e.to_string())?;
        let mut mods = Vec::new();
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            if let Ok(mod_id) = row.get::<_, String>(0) {
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
            server_password.as_deref(),
            &admin_password,
            ip_address.as_deref(),
            cluster_name.as_deref(),
            cluster_path.as_deref(),
            mods_option,
        )
        .map_err(|e| e.to_string())?;

    // Update status
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE servers SET status = 'running', last_started = datetime('now') WHERE id = ?1",
            [server_id],
        )
        .map_err(|e| e.to_string())?;
    }

    println!("  ✅ Server {} restarted", server_id);
    Ok(())
}

#[tauri::command]
pub async fn delete_server(state: State<'_, AppState>, server_id: i64) -> Result<(), String> {
    println!("🗑️ Deleting server {}", server_id);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM servers WHERE id = ?1", [server_id])
        .map_err(|e| e.to_string())?;

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
) -> Result<(), String> {
    println!("⚙️ Updating server settings for server {}", server_id);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

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

    if updates.is_empty() {
        return Ok(());
    }

    let query = format!("UPDATE servers SET {} WHERE id = ?", updates.join(", "));
    params.push(Box::new(server_id));

    let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    conn.execute(&query, params_refs.as_slice())
        .map_err(|e| e.to_string())?;

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
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.query_row(
            "SELECT install_path FROM servers WHERE id = ?1",
            [server_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|e| format!("Server not found: {}", e))?
    };

    // Update status to updating
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE servers SET status = 'updating' WHERE id = ?1",
            [server_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // Run the update
    let installer = ServerInstaller::new(app_handle);
    installer
        .update_server(&PathBuf::from(&install_path))
        .await?;

    // Update status back to stopped
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE servers SET status = 'stopped' WHERE id = ?1",
            [server_id],
        )
        .map_err(|e| e.to_string())?;
    }

    println!("  ✅ Server {} updated", server_id);
    Ok(())
}

#[tauri::command]
pub async fn check_server_reachability(
    state: State<'_, AppState>,
    server_id: i64,
    port: u16,
) -> Result<String, String> {
    // 1. Get Public IP
    let public_ip = match network::get_public_ip().await {
        Ok(ip) => ip,
        Err(_) => return Ok("LAN".to_string()), // If we can't get public IP, assume LAN or Offline
    };

    // 2. Always update IP in database if we found one
    // This allows the UI to show the correct Public IP even if the port is currently closed (e.g. server updating)
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let _ = conn.execute(
            "UPDATE servers SET ip_address = ?1 WHERE id = ?2",
            [&public_ip, &server_id.to_string()],
        );
    }

    // 3. Check if port is open on that IP
    // Note: This checks if the port is reachable from "externally" (or at least hairpinned)
    let is_open = network::check_port_open(&public_ip, port);

    if is_open {
        Ok("Public".to_string())
    } else {
        Ok("LAN".to_string())
    }
}

#[tauri::command]
pub async fn start_log_watcher(
    server_id: i64,
    install_path: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    use crate::services::process_manager::ServerLogEvent;
    use std::fs::File;
    use std::io::{BufRead, BufReader, Seek, SeekFrom};
    use tauri::Emitter;

    let log_file_path = PathBuf::from(&install_path)
        .join("ShooterGame")
        .join("Saved")
        .join("Logs")
        .join("ShooterGame.log");

    // Spawn log watcher thread
    std::thread::spawn(move || {
        // Check if log file exists immediately (no waiting)
        if !log_file_path.exists() {
            let _ = app_handle.emit(
                "server_log",
                ServerLogEvent {
                    server_id,
                    line: format!("[Manager] Log file not found: {:?}", log_file_path),
                    is_stderr: true,
                },
            );
            return;
        }

        let file = match File::open(&log_file_path) {
            Ok(f) => f,
            Err(e) => {
                let _ = app_handle.emit(
                    "server_log",
                    ServerLogEvent {
                        server_id,
                        line: format!("[Manager] Failed to open log: {}", e),
                        is_stderr: true,
                    },
                );
                return;
            }
        };

        let mut reader = BufReader::new(file);

        // Seek to get last 100KB of logs (recent history)
        let file_meta = std::fs::metadata(&log_file_path);
        if let Ok(meta) = file_meta {
            let file_size = meta.len() as i64;
            let seek_pos = std::cmp::max(0, file_size - 100000);
            let _ = reader.seek(SeekFrom::Start(seek_pos as u64));
            // Skip partial first line if we seeked into the middle
            if seek_pos > 0 {
                let mut skip = String::new();
                let _ = reader.read_line(&mut skip);
            }
        }

        // First pass: read all existing content quickly
        loop {
            let mut line = String::new();
            match reader.read_line(&mut line) {
                Ok(0) => break, // No more data, exit first pass
                Ok(_) => {
                    let line = line.trim_end().to_string();
                    if !line.is_empty() {
                        let _ = app_handle.emit(
                            "server_log",
                            ServerLogEvent {
                                server_id,
                                line,
                                is_stderr: false,
                            },
                        );
                    }
                }
                Err(_) => break,
            }
        }

        // Second pass: tail new lines as they appear
        loop {
            let mut line = String::new();
            match reader.read_line(&mut line) {
                Ok(0) => {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
                Ok(_) => {
                    let line = line.trim_end().to_string();
                    if !line.is_empty() {
                        let _ = app_handle.emit(
                            "server_log",
                            ServerLogEvent {
                                server_id,
                                line,
                                is_stderr: false,
                            },
                        );
                    }
                }
                Err(_) => {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
            }
        }
    });

    Ok(())
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
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

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
    })
}
