use crate::models::ModInfo;
use crate::services::mod_scraper;
use crate::AppState;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub async fn search_mods(
    state: State<'_, AppState>,
    query: String,
    server_type: String,
) -> Result<Vec<ModInfo>, String> {
    println!(
        "🔍 search_mods called: query='{}', type='{}'",
        query, server_type
    );

    // ASA-only: use CurseForge for mod search
    let api_key = crate::services::api_key_manager::ApiKeyManager::get_curseforge_key(&state);
    println!(
        "  → CurseForge API Key: {}",
        if api_key.is_some() {
            "Set ✓"
        } else {
            "Missing ✗"
        }
    );

    let result = mod_scraper::search_curseforge(&query, api_key)
        .await
        .map_err(|e| e.to_string());
    match &result {
        Ok(mods) => println!("  ✅ Found {} CurseForge mods", mods.len()),
        Err(e) => println!("  ❌ CurseForge search failed: {}", e),
    }
    result
}

#[tauri::command]
pub async fn get_mod_description(
    state: State<'_, AppState>,
    mod_id: String,
) -> Result<String, String> {
    println!("📖 Fetching description for mod: {}", mod_id);
    let api_key = crate::services::api_key_manager::ApiKeyManager::get_curseforge_key(&state);
    
    // Convert string ID to i64 if possible
    let curseforge_id = mod_id.parse::<i64>().map_err(|_| "Invalid Mod ID".to_string())?;

    mod_scraper::get_mod_description(curseforge_id, api_key)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn install_mod(
    state: State<'_, AppState>,
    server_id: i64,
    mod_info: ModInfo,
) -> Result<(), String> {
    println!(
        "📦 Installing mod: {} (ID: {}) for server {}",
        mod_info.name, mod_info.id, server_id
    );

    // Get highest load order
    let max_order: i32 = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT COALESCE(MAX(load_order), 0) FROM mods WHERE server_id = ?1",
            [server_id],
            |row| row.get(0),
        )
        .unwrap_or(0)
    };

    // Insert mod into database
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO mods (server_id, mod_id, name, version, author, description, workshop_url, server_type, enabled, load_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'ASA', 1, ?8)",
            rusqlite::params![
                server_id,
                mod_info.id,
                mod_info.name,
                mod_info.version.clone().unwrap_or_default(),
                mod_info.author.clone().unwrap_or_default(),
                mod_info.description.clone().unwrap_or_default(),
                mod_info.curseforge_url.clone().unwrap_or_default(),
                max_order + 1
            ],
        ).map_err(|e| e.to_string())?;
    }

    // Update GameUserSettings.ini with mod ID
    sync_mods_to_ini(&state, server_id).await?;

    println!("  ✅ Mod installed successfully");
    Ok(())
}

#[tauri::command]
pub async fn uninstall_mod(
    state: State<'_, AppState>,
    server_id: i64,
    mod_id: String,
) -> Result<(), String> {
    println!("🗑️ Uninstalling mod: {} from server {}", mod_id, server_id);

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM mods WHERE server_id = ?1 AND mod_id = ?2",
            rusqlite::params![server_id, mod_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // Update GameUserSettings.ini
    sync_mods_to_ini(&state, server_id).await?;

    Ok(())
}

#[tauri::command]
pub async fn get_installed_mods(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Vec<ModInfo>, String> {
    println!("📋 Getting installed mods for server {}", server_id);

    let mods = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT mod_id, name, version, author, description, workshop_url, enabled, load_order 
             FROM mods WHERE server_id = ?1 ORDER BY load_order ASC"
        ).map_err(|e| e.to_string())?;

        let mod_iter = stmt
            .query_map([server_id], |row| {
                Ok(ModInfo {
                    id: row.get(0)?,
                    curseforge_id: None,
                    name: row.get(1)?,
                    version: row.get::<_, Option<String>>(2).ok().flatten(),
                    author: row.get::<_, Option<String>>(3).ok().flatten(),
                    description: row.get::<_, Option<String>>(4).ok().flatten(),
                    thumbnail_url: None,
                    downloads: None,
                    curseforge_url: row.get::<_, Option<String>>(5).ok().flatten(),
                    enabled: row.get::<_, bool>(6).unwrap_or(true),
                    load_order: row.get::<_, i32>(7).unwrap_or(0),
                    last_updated: None,
                })
            })
            .map_err(|e| e.to_string())?;

        mod_iter.filter_map(|m| m.ok()).collect::<Vec<_>>()
    };

    println!("  Found {} installed mods", mods.len());
    Ok(mods)
}

#[tauri::command]
pub async fn update_mod_order(
    state: State<'_, AppState>,
    server_id: i64,
    mod_ids: Vec<String>,
) -> Result<(), String> {
    println!("🔄 Updating mod load order for server {}", server_id);

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        for (index, mod_id) in mod_ids.iter().enumerate() {
            conn.execute(
                "UPDATE mods SET load_order = ?1 WHERE server_id = ?2 AND mod_id = ?3",
                rusqlite::params![index as i32, server_id, mod_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    // Update GameUserSettings.ini with new order
    sync_mods_to_ini(&state, server_id).await?;

    println!("  ✅ Load order updated: {:?}", mod_ids);
    Ok(())
}

#[tauri::command]
pub async fn toggle_mod(
    state: State<'_, AppState>,
    server_id: i64,
    mod_id: String,
    enabled: bool,
) -> Result<(), String> {
    println!(
        "⚡ Toggling mod {} to {} for server {}",
        mod_id, enabled, server_id
    );

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE mods SET enabled = ?1 WHERE server_id = ?2 AND mod_id = ?3",
            rusqlite::params![enabled, server_id, mod_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // Update GameUserSettings.ini
    sync_mods_to_ini(&state, server_id).await?;

    Ok(())
}

#[tauri::command]
pub async fn verify_mod_integrity(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Vec<ModIntegrityResult>, String> {
    println!("🔍 Verifying mod integrity for server {}", server_id);

    // Get server install path
    let install_path: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT install_path FROM servers WHERE id = ?1",
            [server_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?
    };

    // Get installed mods from DB
    let mods = get_installed_mods(state.clone(), server_id).await?;

    let mods_dir = PathBuf::from(&install_path).join("ShooterGame/Binaries/Win64/ShooterGame/Mods");

    let mut results = Vec::new();

    for mod_info in mods {
        let ucas_exists = std::fs::read_dir(&mods_dir)
            .map(|entries| {
                entries.flatten().any(|e| {
                    let name = e.file_name().to_string_lossy().to_string();
                    name.contains(&mod_info.id) && name.ends_with(".ucas")
                })
            })
            .unwrap_or(false);

        let utoc_exists = std::fs::read_dir(&mods_dir)
            .map(|entries| {
                entries.flatten().any(|e| {
                    let name = e.file_name().to_string_lossy().to_string();
                    name.contains(&mod_info.id) && name.ends_with(".utoc")
                })
            })
            .unwrap_or(false);

        let status = if ucas_exists && utoc_exists {
            "valid"
        } else if !ucas_exists && !utoc_exists {
            "missing"
        } else {
            "corrupted"
        };

        results.push(ModIntegrityResult {
            mod_id: mod_info.id.clone(),
            mod_name: mod_info.name.clone(),
            status: status.to_string(),
            ucas_exists,
            utoc_exists,
        });
    }

    println!("  ✅ Verified {} mods", results.len());
    Ok(results)
}

#[derive(serde::Serialize)]
pub struct ModIntegrityResult {
    pub mod_id: String,
    pub mod_name: String,
    pub status: String, // "valid", "missing", "corrupted"
    pub ucas_exists: bool,
    pub utoc_exists: bool,
}

/// Sync installed mods to GameUserSettings.ini ActiveMods line
async fn sync_mods_to_ini(state: &State<'_, AppState>, server_id: i64) -> Result<(), String> {
    // Get server install path
    let install_path: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT install_path FROM servers WHERE id = ?1",
            [server_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?
    };

    // Get enabled mods in order
    let mod_ids: Vec<String> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT mod_id FROM mods WHERE server_id = ?1 AND enabled = 1 ORDER BY load_order ASC"
        ).map_err(|e| e.to_string())?;

        let ids = stmt
            .query_map([server_id], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        ids
    };

    // Update GameUserSettings.ini
    let config_path = PathBuf::from(&install_path)
        .join("ShooterGame/Saved/Config/WindowsServer/GameUserSettings.ini");

    if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        let active_mods_line = format!("ActiveMods={}", mod_ids.join(","));

        let new_content = if content.contains("ActiveMods=") {
            // Replace existing line
            let lines: Vec<&str> = content.lines().collect();
            lines
                .iter()
                .map(|line| {
                    if line.starts_with("ActiveMods=") {
                        active_mods_line.as_str()
                    } else {
                        *line
                    }
                })
                .collect::<Vec<_>>()
                .join("\n")
        } else {
            // Add to [ServerSettings] section
            let mut result = String::new();
            let mut added = false;
            for line in content.lines() {
                result.push_str(line);
                result.push('\n');
                if line.starts_with("[ServerSettings]") && !added {
                    result.push_str(&active_mods_line);
                    result.push('\n');
                    added = true;
                }
            }
            if !added {
                result.push_str("\n[ServerSettings]\n");
                result.push_str(&active_mods_line);
                result.push('\n');
            }
            result
        };

        std::fs::write(&config_path, new_content).map_err(|e| e.to_string())?;
        println!("  📝 Updated ActiveMods in INI: {} mods", mod_ids.len());
    }

    Ok(())
}

// =============================================================================
// NEW MOD INSTALLATION COMMANDS
// =============================================================================

#[derive(serde::Serialize)]
pub struct ModValidationResult {
    pub valid: bool,
    pub mod_id: String,
    pub error: Option<String>,
}

#[derive(serde::Serialize)]
pub struct ModConfigPreview {
    pub ini_section: String,
    pub startup_command: String,
    pub mod_count: usize,
    pub validation_errors: Vec<String>,
}

/// Validate mod IDs - ensure they are numeric and properly formatted
#[tauri::command]
pub async fn validate_mod_ids(mod_ids: Vec<String>) -> Result<Vec<ModValidationResult>, String> {
    println!("🔍 Validating {} mod IDs", mod_ids.len());

    let mut results = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    for mod_id in mod_ids {
        let trimmed = mod_id.trim().to_string();

        // Check if empty
        if trimmed.is_empty() {
            results.push(ModValidationResult {
                valid: false,
                mod_id: trimmed,
                error: Some("Mod ID cannot be empty".to_string()),
            });
            continue;
        }

        // Check if numeric
        if !trimmed.chars().all(|c| c.is_ascii_digit()) {
            results.push(ModValidationResult {
                valid: false,
                mod_id: trimmed,
                error: Some("Mod ID must be numeric only".to_string()),
            });
            continue;
        }

        // Check for duplicates
        if seen_ids.contains(&trimmed) {
            results.push(ModValidationResult {
                valid: false,
                mod_id: trimmed.clone(),
                error: Some("Duplicate mod ID".to_string()),
            });
            continue;
        }
        seen_ids.insert(trimmed.clone());

        // Valid!
        results.push(ModValidationResult {
            valid: true,
            mod_id: trimmed,
            error: None,
        });
    }

    let valid_count = results.iter().filter(|r| r.valid).count();
    println!(
        "  ✅ {} valid, {} invalid",
        valid_count,
        results.len() - valid_count
    );

    Ok(results)
}

/// Generate mod configuration preview (INI + startup command)
#[tauri::command]
pub async fn generate_mod_config(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<ModConfigPreview, String> {
    println!("📄 Generating mod config preview for server {}", server_id);

    // Single DB access to get all needed data
    let (install_path, session_name, map_name, game_port, query_port, mod_ids) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        
        // Get server info
        let (path, session, map, g_port, q_port) = conn.query_row(
            "SELECT install_path, session_name, map_name, game_port, query_port FROM servers WHERE id = ?1",
            [server_id],
            |row| Ok((
                row.get::<_, String>(0)?, 
                row.get::<_, String>(1)?, 
                row.get::<_, String>(2)?, 
                row.get::<_, i32>(3)?, 
                row.get::<_, i32>(4)?
            )),
        ).map_err(|e| e.to_string())?;
        
        // Get enabled mods
        let mut stmt = conn.prepare(
            "SELECT mod_id FROM mods WHERE server_id = ?1 AND enabled = 1 ORDER BY load_order ASC"
        ).map_err(|e| e.to_string())?;

        let ids: Vec<String> = stmt.query_map([server_id], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
            
        (path, session, map, g_port, q_port, ids)
    };

    // Generate INI section
    let ini_section = format!("[ServerSettings]\nActiveMods={}", mod_ids.join(","));

    // Generate startup command
    let exe_path =
        PathBuf::from(&install_path).join("ShooterGame/Binaries/Win64/ArkAscendedServer.exe");

    let startup_command = if mod_ids.is_empty() {
        format!(
            "\"{}\" {}?listen?SessionName=\"{}\"?Port={}?QueryPort={} -NoBattlEye",
            exe_path.display(),
            map_name,
            session_name,
            game_port,
            query_port
        )
    } else {
        format!(
            "\"{}\" {}?listen?SessionName=\"{}\"?Port={}?QueryPort={} -NoBattlEye -mods=\"{}\"",
            exe_path.display(),
            map_name,
            session_name,
            game_port,
            query_port,
            mod_ids.join(",")
        )
    };

    // Validate mod IDs
    let validation_errors: Vec<String> = mod_ids
        .iter()
        .filter(|id| !id.chars().all(|c| c.is_ascii_digit()))
        .map(|id| format!("Invalid mod ID: {}", id))
        .collect();

    Ok(ModConfigPreview {
        ini_section,
        startup_command,
        mod_count: mod_ids.len(),
        validation_errors,
    })
}

/// Apply mods to server - write to INI and return startup command
#[tauri::command]
pub async fn apply_mods_to_server(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<ModConfigPreview, String> {
    println!("🚀 Applying mods to server {}", server_id);

    // First sync mods to INI
    sync_mods_to_ini(&state, server_id).await?;

    // Then generate and return the preview
    let preview = generate_mod_config(state, server_id).await?;

    println!("  ✅ Mods applied! {} mods configured", preview.mod_count);
    Ok(preview)
}

/// Get post-install instructions for mod installation
#[tauri::command]
pub async fn get_mod_install_instructions() -> Result<Vec<String>, String> {
    Ok(vec![
        "1. ✅ Mods have been added to GameUserSettings.ini".to_string(),
        "2. 🔄 RESTART your server for mods to take effect".to_string(),
        "3. ⏳ Server will auto-download mods on startup (this may take a few minutes)".to_string(),
        "4. 🎮 Players will see 'Downloading Mods...' when joining".to_string(),
        "5. 📋 Check server logs for: 'Mod [ID] loaded successfully'".to_string(),
        "".to_string(),
        "⚠️ TROUBLESHOOTING:".to_string(),
        "• If mods don't load, verify mod IDs are correct on CurseForge".to_string(),
        "• Ensure server has internet access for mod downloads".to_string(),
        "• Check that mods are compatible with current game version".to_string(),
    ])
}
/// Delete the mod download cache (.temp folder)
fn delete_mod_cache(install_path: &PathBuf) -> Result<(), String> {
    let temp_dir = install_path
        .join("ShooterGame/Binaries/Win64/ShooterGame/Mods/.temp");

    if temp_dir.exists() {
        println!("🗑️ removing mod cache at {:?}", temp_dir);
        std::fs::remove_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn hardcore_retry_mods(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<(), String> {
    println!("☢️ Hardcore Mod Retry initiated for server {}", server_id);

    // 1. Fetch Server Details & Config
    let (install_path, session_name, map_name, game_port, query_port, rcon_port, max_players, server_password, admin_password, ip_address, cluster_id, cluster_dir, custom_args) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        
        conn.query_row(
            "SELECT install_path, session_name, map_name, game_port, query_port, rcon_port, max_players, server_password, admin_password, ip_address, cluster_id, cluster_dir, custom_args 
             FROM servers WHERE id = ?1",
            [server_id],
            |row| Ok((
                row.get::<_, String>(0)?, // install_path
                row.get::<_, String>(1)?, // session_name
                row.get::<_, String>(2)?, // map_name
                row.get::<_, i32>(3)?,    // game_port
                row.get::<_, i32>(4)?,    // query_port
                row.get::<_, i32>(5)?,    // rcon_port
                row.get::<_, i32>(6)?,    // max_players
                row.get::<_, Option<String>>(7)?, // server_password
                row.get::<_, String>(8)?, // admin_password
                row.get::<_, Option<String>>(9)?, // ip_address
                row.get::<_, Option<String>>(10)?, // cluster_id
                row.get::<_, Option<String>>(11)?, // cluster_dir
                row.get::<_, Option<String>>(12)?, // custom_args
            )),
        ).map_err(|e| e.to_string())?
    };

    let path_buf = PathBuf::from(&install_path);

    // 2. Stop Server
    println!("  ⏹️ Stopping server...");
    state.process_manager.stop_server(server_id).map_err(|e| e.to_string())?;
    
    // Wait a bit to ensure file handles are released
    std::thread::sleep(std::time::Duration::from_secs(3));

    // 3. Delete Cache
    println!("  🧹 Clearing mod cache...");
    delete_mod_cache(&path_buf)?;

    // 4. Get Enabled Mods (for restart)
    let enabled_mods: Vec<String> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT mod_id FROM mods WHERE server_id = ?1 AND enabled = 1 ORDER BY load_order ASC"
        ).map_err(|e| e.to_string())?;

        let ids: Vec<String> = stmt.query_map([server_id], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        ids
    };

    let mods_option = if enabled_mods.is_empty() {
        None
    } else {
        Some(enabled_mods.as_slice())
    };

    // 5. Start Server
    println!("  🚀 Restarting server...");
    state.process_manager.start_server(
        server_id,
        "ASA", // Assuming ASA for now as this is mod related
        &path_buf,
        &map_name,
        &session_name,
        game_port as u16,
        query_port as u16,
        rcon_port as u16,
        max_players,
        server_password.as_deref(),
        &admin_password,
        ip_address.as_deref(),
        cluster_id.as_deref(),
        cluster_dir.as_deref(),
        mods_option,
        custom_args.as_deref(),
    ).map_err(|e| e.to_string())?;

    println!("  ✅ Hardcore retry complete!");
    Ok(())
}

/// Copy all mods from source server to target server
#[tauri::command]
pub async fn copy_mods_to_server(
    state: State<'_, AppState>,
    source_server_id: i64,
    target_server_id: i64,
) -> Result<(), String> {
    println!(
        "📦 Copying mods from server {} to {}",
        source_server_id, target_server_id
    );

    // Scope DB operations to ensure MutexGuard is dropped before await
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        // 1. Get enabled mods from source server with load order
        let source_mods: Vec<ModInfo> = {
            let mut stmt = conn
                .prepare(
                    "SELECT mod_id, name, version, author, description, workshop_url
                     FROM mods WHERE server_id = ?1 AND enabled = 1 ORDER BY load_order ASC",
                )
                .map_err(|e| e.to_string())?;

            let mods = stmt
                .query_map([source_server_id], |row| {
                    Ok(ModInfo {
                        id: row.get(0)?,
                        curseforge_id: None, 
                        name: row.get(1)?,
                        version: row.get::<_, Option<String>>(2).ok().flatten(),
                        author: row.get::<_, Option<String>>(3).ok().flatten(),
                        description: row.get::<_, Option<String>>(4).ok().flatten(),
                        thumbnail_url: None, 
                        downloads: None, 
                        curseforge_url: row.get::<_, Option<String>>(5).ok().flatten(),
                        enabled: true,
                        load_order: 0, 
                        last_updated: None, 
                    })
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<ModInfo>, _>>()
                .map_err(|e| e.to_string())?;
                
            mods
        };

        if source_mods.is_empty() {
            return Err("Source server has no enabled mods".to_string());
        }

        // 2. Clear existing mods on target server or Append
        conn.execute("BEGIN TRANSACTION", []).map_err(|e| e.to_string())?;

        let mut max_order: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(load_order), 0) FROM mods WHERE server_id = ?1",
                [target_server_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let mut copied_count = 0;

        for mod_info in source_mods {
            let exists: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM mods WHERE server_id = ?1 AND mod_id = ?2)",
                    (target_server_id, &mod_info.id),
                    |row| row.get(0),
                )
                .unwrap_or(false);

            if !exists {
                max_order += 1;
                // Only insert columns that definitely exist in schema
                conn.execute(
                    "INSERT INTO mods (
                        server_id, mod_id, name, version, author, description, 
                        workshop_url, enabled, load_order, server_type
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, 'ASA')",
                    rusqlite::params![
                        target_server_id,
                        mod_info.id,
                        mod_info.name,
                        mod_info.version,
                        mod_info.author,
                        mod_info.description,
                        mod_info.curseforge_url,
                        max_order
                    ],
                )
                .map_err(|e| e.to_string())?;
                copied_count += 1;
            } else {
                 conn.execute(
                    "UPDATE mods SET enabled = 1 WHERE server_id = ?1 AND mod_id = ?2",
                    (target_server_id, &mod_info.id),
                )
                .map_err(|e| e.to_string())?;
            }
        }

        conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
        println!("  ✅ Copied {} new mods to server {}", copied_count, target_server_id);
    } // MutexGuard (db) is dropped here

    // 3. Sync target server INI - Safe to await now
    sync_mods_to_ini(&state, target_server_id).await?;

    Ok(())
}


