use crate::models::ModInfo;
use crate::services::mod_scraper;
use crate::AppState;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub async fn search_mods(
    state: State<'_, AppState>,
    query: String,
    _server_type: String,
    category_id: Option<i32>,
    sort_field: Option<i32>,
    sort_order: Option<String>,
    page: Option<i32>,
) -> Result<Vec<ModInfo>, String> {
    println!(
        "🔍 search_mods called: query='{}', cat={:?}, sort={:?}, page={:?}",
        query, category_id, sort_field, page
    );

    // ASA-only: use CurseForge for mod search
    let api_key = crate::services::api_key_manager::ApiKeyManager::get_curseforge_key(&state);
    
    let result = mod_scraper::search_curseforge(&query, api_key, category_id, sort_field, sort_order, page)
        .await
        .map_err(|e| e.to_string());
        
    match &result {
        Ok(mods) => println!("  ✅ Found {} CurseForge mods", mods.len()),
        Err(e) => println!("  ❌ CurseForge search failed: {}", e),
    }
    result
}

#[tauri::command]
pub async fn get_mod_categories(
    state: State<'_, AppState>,
) -> Result<Vec<mod_scraper::CurseForgeCategory>, String> {
    let api_key = crate::services::api_key_manager::ApiKeyManager::get_curseforge_key(&state);
    mod_scraper::get_categories(api_key).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn verify_curseforge_key(
    api_key: String,
) -> Result<bool, String> {
    println!("🔑 Verifying CurseForge API Key...");
    let is_valid = mod_scraper::verify_api_key(api_key).await;
    
    if is_valid {
        println!("  ✅ API Key is VALID");
    } else {
        println!("  ❌ API Key is INVALID");
    }

    Ok(is_valid)
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
pub async fn get_mod_screenshots(
    state: State<'_, AppState>,
    mod_id: String,
) -> Result<Vec<String>, String> {
    println!("🖼️ Fetching screenshots for mod: {}", mod_id);
    let api_key = crate::services::api_key_manager::ApiKeyManager::get_curseforge_key(&state);
    
    let curseforge_id = mod_id.parse::<i64>().map_err(|_| "Invalid Mod ID".to_string())?;

    mod_scraper::get_mod_screenshots(curseforge_id, api_key)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn install_mod(
    state: State<'_, AppState>,
    server_id: i64,
    mod_info: ModInfo,
) -> Result<(), String> {
    let raw_input = mod_info.id.trim();
    // Extract numeric Mod ID (handles raw digits, "Mod 927084", URLs, etc.)
    let extracted_id = if !raw_input.is_empty() && raw_input.chars().all(|c| c.is_ascii_digit()) {
        Some(raw_input.to_string())
    } else {
        raw_input.split(|c: char| !c.is_ascii_digit())
            .find(|s| s.len() >= 4 && s != &"0")
            .map(|s| s.to_string())
    };

    let clean_id = match extracted_id {
        Some(id) if !id.is_empty() && id != "0" => id,
        _ => return Err("Cannot install mod: Invalid Mod ID. Please enter a valid numeric Mod ID (e.g. 927084).".to_string()),
    };

    let mut final_mod_info = mod_info;
    final_mod_info.id = clean_id.clone();

    // Fetch real mod details from CurseForge if name is generic (e.g. "Mod 949310") or missing details
    if (final_mod_info.name.starts_with("Mod ") || final_mod_info.thumbnail_url.is_none()) && final_mod_info.id.chars().all(|c| c.is_ascii_digit()) {
        if let Ok(id_num) = final_mod_info.id.parse::<i64>() {
            let api_key = crate::services::api_key_manager::ApiKeyManager::get_curseforge_key(&state);
            if let Ok(fetched) = crate::services::mod_scraper::get_mod_by_id(id_num, api_key).await {
                println!("  ✨ Enriching mod metadata for ID {}: {}", id_num, fetched.name);
                final_mod_info.name = fetched.name;
                if fetched.author.is_some() { final_mod_info.author = fetched.author; }
                if fetched.description.is_some() { final_mod_info.description = fetched.description; }
                if fetched.thumbnail_url.is_some() { final_mod_info.thumbnail_url = fetched.thumbnail_url; }
                if fetched.curseforge_url.is_some() { final_mod_info.curseforge_url = fetched.curseforge_url; }
            }
        }
    }

    println!(
        "📦 Installing mod: {} (ID: {}) for server {}",
        final_mod_info.name, final_mod_info.id, server_id
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
            "INSERT OR REPLACE INTO mods (server_id, mod_id, name, version, author, description, workshop_url, thumbnail_url, server_type, enabled, load_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'ASA', 1, ?9)",
            rusqlite::params![
                server_id,
                final_mod_info.id,
                final_mod_info.name,
                final_mod_info.version.clone().unwrap_or_default(),
                final_mod_info.author.clone().unwrap_or_default(),
                final_mod_info.description.clone().unwrap_or_default(),
                final_mod_info.curseforge_url.clone().unwrap_or_default(),
                final_mod_info.thumbnail_url.clone().unwrap_or_default(),
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

    let mut mods = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT mod_id, name, version, author, description, workshop_url, thumbnail_url, enabled, load_order 
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
                    thumbnail_url: row.get::<_, Option<String>>(6).ok().flatten(),
                    downloads: None,
                    curseforge_url: row.get::<_, Option<String>>(5).ok().flatten(),
                    enabled: row.get::<_, bool>(7).unwrap_or(true),
                    load_order: row.get::<_, i32>(8).unwrap_or(0),
                    last_updated: None,
                    is_local: None,
                })
            })
            .map_err(|e| e.to_string())?;

        mod_iter.filter_map(|m| m.ok()).collect::<Vec<_>>()
    };

    let mods_dir = PathBuf::from(&install_path)
        .join("ShooterGame")
        .join("Binaries")
        .join("Win64")
        .join("ShooterGame")
        .join("Mods");

    for m in &mut mods {
        let mod_path = mods_dir.join(&m.id);
        let exists = mod_path.exists() && mod_path.is_dir();
        
        // We consider it "local fallback" if it exists locally on disk, but has no curseforge_url (or has never successfully updated from CurseForge)
        if exists && (m.curseforge_url.is_none() || m.curseforge_url.as_ref().map_or(true, |u| u.is_empty())) {
            m.is_local = Some(true);
        } else {
            m.is_local = Some(false);
        }
    }

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
pub async fn toggle_all_mods(
    state: State<'_, AppState>,
    server_id: i64,
    enabled: bool,
) -> Result<(), String> {
    println!(
        "⚡ Toggling ALL mods to {} for server {}",
        enabled, server_id
    );

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE mods SET enabled = ?1 WHERE server_id = ?2",
            rusqlite::params![enabled, server_id],
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
            .map(|m| m.trim().to_string())
            .filter(|m| !m.is_empty() && m != "0" && m.chars().all(|c| c.is_ascii_digit()))
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
    let (install_path, _session_name, map_name, game_port, query_port, mod_ids) = {
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
            "\"{}\" {}?listen?Port={}?QueryPort={} -NoBattlEye",
            exe_path.display(),
            map_name,
            game_port,
            query_port
        )
    } else {
        format!(
            "\"{}\" {}?listen?Port={}?QueryPort={} -NoBattlEye -mods=\"{}\"",
            exe_path.display(),
            map_name,
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

    // 1. Fetch Server Details & Config (LEFT JOIN clusters for cluster_path)
    let (install_path, session_name, map_name, game_port, query_port, rcon_port, max_players, server_password, admin_password, ip_address, cluster_id, cluster_dir, custom_args, battleye) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        
        conn.query_row(
            "SELECT s.install_path, s.session_name, s.map_name, s.game_port, s.query_port, s.rcon_port, s.max_players, s.server_password, s.admin_password, s.ip_address, s.cluster_id, c.cluster_path, s.custom_args, s.battleye 
             FROM servers s
             LEFT JOIN clusters c ON s.cluster_id = c.id
             WHERE s.id = ?1",
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
                row.get::<_, Option<i64>>(10)?.map(|id| id.to_string()), // cluster_id
                row.get::<_, Option<String>>(11)?, // cluster_path (from clusters table)
                row.get::<_, Option<String>>(12)?, // custom_args
                row.get::<_, i32>(13).unwrap_or(1) != 0, // battleye
            )),
        ).map_err(|e| e.to_string())?
    };

    let path_buf = PathBuf::from(&install_path);

    // 2. Stop Server
    println!("  ⏹️ Stopping server...");
    state.process_manager.stop_server_with_reason(server_id, crate::services::process_manager::StopReason::UpdateRequired).map_err(|e| e.to_string())?;
    
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
    state.process_manager.force_cleanup_server_entry(server_id);
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
        battleye,
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
                        is_local: None,
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

// =============================================================================
// MOD CONFLICT SCANNER (A1)
// =============================================================================

#[derive(serde::Serialize)]
pub struct ModConflict {
    pub mod_a_id: String,
    pub mod_a_name: String,
    pub mod_b_id: String,
    pub mod_b_name: String,
    pub reason: String,
    pub severity: String, // "critical", "warning", "info"
}

/// Known conflict pairs for ASA mods (hardcoded knowledge base)
fn get_known_conflicts() -> Vec<(String, String, String, String)> {
    // (mod_id_a, mod_id_b, reason, severity)
    vec![
        // Structure mods that override the same base classes
        ("928793".to_string(), "927090".to_string(), "Both mods override core structure placement logic, causing placement failures".to_string(), "critical".to_string()),
        // Stacking mods that conflict
        ("929820".to_string(), "928988".to_string(), "Duplicate stack size overrides — items may duplicate or vanish".to_string(), "critical".to_string()),
        // Map extension conflicts
        ("935813".to_string(), "936220".to_string(), "Both mods modify world composition, causing terrain glitches".to_string(), "warning".to_string()),
        // Dino overhaul conflicts
        ("927131".to_string(), "930568".to_string(), "Conflicting creature stat overrides may cause server instability".to_string(), "warning".to_string()),
        // UI mods that clash
        ("931455".to_string(), "932701".to_string(), "Both mods replace the HUD overlay, only one will render".to_string(), "info".to_string()),
    ]
}

/// Check installed mods for known conflicts
#[tauri::command]
pub async fn check_mod_conflicts(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Vec<ModConflict>, String> {
    println!("🔍 Checking mod conflicts for server {}", server_id);

    // Get installed mods
    let mods = get_installed_mods(state.clone(), server_id).await?;
    let mod_ids: std::collections::HashSet<String> = mods.iter().map(|m| m.id.clone()).collect();
    let mod_names: std::collections::HashMap<String, String> = mods
        .iter()
        .map(|m| (m.id.clone(), m.name.clone()))
        .collect();

    let known_conflicts = get_known_conflicts();
    let mut conflicts = Vec::new();

    for (id_a, id_b, reason, severity) in &known_conflicts {
        if mod_ids.contains(id_a) && mod_ids.contains(id_b) {
            conflicts.push(ModConflict {
                mod_a_id: id_a.clone(),
                mod_a_name: mod_names
                    .get(id_a)
                    .cloned()
                    .unwrap_or_else(|| format!("Mod {}", id_a)),
                mod_b_id: id_b.clone(),
                mod_b_name: mod_names
                    .get(id_b)
                    .cloned()
                    .unwrap_or_else(|| format!("Mod {}", id_b)),
                reason: reason.clone(),
                severity: severity.clone(),
            });
        }
    }

    // Also check for duplicate mod IDs (shouldn't happen but worth detecting)
    let mut seen = std::collections::HashSet::new();
    for m in &mods {
        if !seen.insert(m.id.clone()) {
            conflicts.push(ModConflict {
                mod_a_id: m.id.clone(),
                mod_a_name: m.name.clone(),
                mod_b_id: m.id.clone(),
                mod_b_name: m.name.clone(),
                reason: "Duplicate mod ID detected — mod is installed twice".to_string(),
                severity: "critical".to_string(),
            });
        }
    }

    println!(
        "  ✅ Found {} conflicts among {} installed mods",
        conflicts.len(),
        mods.len()
    );
    Ok(conflicts)
}

// =============================================================================
// MODPACK EXPORT / IMPORT (A2)
// =============================================================================

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ModpackData {
    pub name: String,
    pub version: i32,
    pub created_at: String,
    pub server_name: String,
    pub mods: Vec<ModpackEntry>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ModpackEntry {
    pub mod_id: String,
    pub name: String,
    pub author: Option<String>,
    pub load_order: i32,
}

/// Export all installed mods as a shareable modpack JSON
#[tauri::command]
pub async fn export_modpack(
    state: State<'_, AppState>,
    server_id: i64,
    modpack_name: String,
) -> Result<String, String> {
    println!("📦 Exporting modpack for server {}", server_id);

    let server_name: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT session_name FROM servers WHERE id = ?1",
            [server_id],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "Unknown Server".to_string())
    };

    let mods = get_installed_mods(state.clone(), server_id).await?;

    let modpack = ModpackData {
        name: modpack_name,
        version: 1,
        created_at: chrono::Utc::now().to_rfc3339(),
        server_name,
        mods: mods
            .iter()
            .enumerate()
            .map(|(i, m)| ModpackEntry {
                mod_id: m.id.clone(),
                name: m.name.clone(),
                author: m.author.clone(),
                load_order: i as i32,
            })
            .collect(),
    };

    let json = serde_json::to_string_pretty(&modpack).map_err(|e| e.to_string())?;
    println!("  ✅ Exported {} mods", modpack.mods.len());
    Ok(json)
}

/// Import a modpack JSON and install missing mods
#[tauri::command]
pub async fn import_modpack(
    state: State<'_, AppState>,
    server_id: i64,
    modpack_json: String,
) -> Result<ModpackImportResult, String> {
    println!("📦 Importing modpack for server {}", server_id);

    let modpack: ModpackData =
        serde_json::from_str(&modpack_json).map_err(|e| format!("Invalid modpack format: {}", e))?;

    // Get currently installed mod IDs
    let existing_mods = get_installed_mods(state.clone(), server_id).await?;
    let existing_ids: std::collections::HashSet<String> =
        existing_mods.iter().map(|m| m.id.clone()).collect();

    let mut installed_count = 0;
    let mut skipped_count = 0;
    let mut failed_ids = Vec::new();

    // Get highest load order
    let mut max_order: i32 = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT COALESCE(MAX(load_order), 0) FROM mods WHERE server_id = ?1",
            [server_id],
            |row| row.get(0),
        )
        .unwrap_or(0)
    };

    for entry in &modpack.mods {
        if existing_ids.contains(&entry.mod_id) {
            skipped_count += 1;
            continue;
        }

        max_order += 1;

        let result = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT OR REPLACE INTO mods (server_id, mod_id, name, version, author, description, workshop_url, server_type, enabled, load_order)
                 VALUES (?1, ?2, ?3, '', ?4, '', '', 'ASA', 1, ?5)",
                rusqlite::params![
                    server_id,
                    entry.mod_id,
                    entry.name,
                    entry.author.as_deref().unwrap_or(""),
                    max_order
                ],
            )
        };

        match result {
            Ok(_) => installed_count += 1,
            Err(e) => {
                println!("  ❌ Failed to install mod {}: {}", entry.mod_id, e);
                failed_ids.push(entry.mod_id.clone());
            }
        }
    }

    // Sync to INI
    sync_mods_to_ini(&state, server_id).await?;

    println!(
        "  ✅ Import complete: {} installed, {} skipped, {} failed",
        installed_count, skipped_count, failed_ids.len()
    );

    Ok(ModpackImportResult {
        modpack_name: modpack.name,
        total_mods: modpack.mods.len(),
        installed_count,
        skipped_count,
        failed_ids,
    })
}

#[derive(serde::Serialize)]
pub struct ModpackImportResult {
    pub modpack_name: String,
    pub total_mods: usize,
    pub installed_count: usize,
    pub skipped_count: usize,
    pub failed_ids: Vec<String>,
}

// =============================================================================
// BAN-LIST SYNC (A3)
// =============================================================================

/// Sync a remote ban list into the server's BanList.txt
#[tauri::command]
pub async fn sync_banlist(
    state: State<'_, AppState>,
    server_id: i64,
    url: String,
) -> Result<BanlistSyncResult, String> {
    println!("🚫 Syncing ban list from {} for server {}", url, server_id);

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

    // Fetch remote ban list
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch ban list: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Ban list server returned HTTP {}",
            response.status()
        ));
    }

    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read ban list response: {}", e))?;

    // Parse remote bans (one Steam ID per line, skip comments and empty lines)
    let remote_bans: std::collections::HashSet<String> = body
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty() && !l.starts_with('#') && !l.starts_with("//"))
        .collect();

    // Read existing BanList.txt
    let ban_file = PathBuf::from(&install_path)
        .join("ShooterGame/Saved/BanList.txt");

    let existing_bans: std::collections::HashSet<String> = if ban_file.exists() {
        std::fs::read_to_string(&ban_file)
            .unwrap_or_default()
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect()
    } else {
        std::collections::HashSet::new()
    };

    // Merge (union)
    let new_bans: Vec<String> = remote_bans
        .difference(&existing_bans)
        .cloned()
        .collect();
    let new_count = new_bans.len();

    let merged: Vec<String> = existing_bans
        .union(&remote_bans)
        .cloned()
        .collect();

    // Ensure parent directory exists
    if let Some(parent) = ban_file.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Write merged ban list
    std::fs::write(&ban_file, merged.join("\n") + "\n").map_err(|e| e.to_string())?;

    println!(
        "  ✅ Ban list synced: {} new bans added, {} total",
        new_count,
        merged.len()
    );

    Ok(BanlistSyncResult {
        new_bans_added: new_count,
        total_bans: merged.len(),
        source_url: url,
    })
}

#[derive(serde::Serialize)]
pub struct BanlistSyncResult {
    pub new_bans_added: usize,
    pub total_bans: usize,
    pub source_url: String,
}
