use crate::ase::models::AseInstalledMod;
use crate::AppState;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Workshop search result from Steam API
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkshopSearchResult {
    pub workshop_id: String,
    pub title: String,
    pub description: String,
    pub preview_url: String,
    pub subscriptions: u64,
    pub file_size: u64,
    pub time_updated: u64,
    pub author: String,
    pub workshop_url: String,
    pub tags: Vec<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModDownloadProgress {
    pub workshop_id: String,
    pub status: String,
    pub progress: f64,
    pub message: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModValidationReport {
    pub workshop_id: String,
    pub is_valid: bool,
    pub issues: Vec<String>,
    pub file_count: usize,
    pub total_size: u64,
    pub mod_dir: String,
    pub has_ucas: bool,            // Backward compatibility (mod.info)
    pub has_utoc: bool,            // Backward compatibility (assets)
    pub has_mod_file: bool,        // Parent <ModID>.mod file exists
    pub has_mod_info: bool,        // mod.info inside directory
    pub has_modmeta_info: bool,    // modmeta.info inside directory (optional)
    pub has_assets: bool,          // Compiled assets (.uasset, .umap) exist
    pub has_active_mods_entry: bool, // Present in GameUserSettings.ini ActiveMods
    pub has_unextracted_z: bool,   // Leftover compressed .z files detected
}

#[tauri::command]
pub async fn search_ase_workshop(
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<WorkshopSearchResult>, String> {
    let key = crate::services::api_key_manager::ApiKeyManager::get_steam_key(&state).unwrap_or_default();
    let key = key.trim();

    if key.is_empty() {
        return Ok(vec![WorkshopSearchResult {
            workshop_id: "0".to_string(),
            title: "Steam Web API Key Missing".to_string(),
            description: "Please register and save your Steam Web API Key in Settings -> API Keys to enable Steam Workshop mod search for ASE.".to_string(),
            preview_url: "".to_string(),
            subscriptions: 0,
            file_size: 0,
            time_updated: 0,
            author: "Unknown".to_string(),
            workshop_url: "".to_string(),
            tags: vec![],
        }]);
    }

    let url = format!(
        "https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/\
         ?key={}&query_type=1&page=1&numperpage=20&appid=346110\
         &search_text={}&return_previews=true",
        key,
        urlencoding::encode(&query)
    );

    let resp = reqwest::get(&url).await.map_err(|e| format!("HTTP request failed: {}", e))?;
    let status = resp.status();
    if !status.is_success() {
        if status.as_u16() == 401 || status.as_u16() == 403 {
            return Ok(vec![WorkshopSearchResult {
                workshop_id: "0".to_string(),
                title: "Invalid Steam API Key".to_string(),
                description: "Your Steam Web API Key appears to be invalid or expired. Please update it in Settings.".to_string(),
                preview_url: "".to_string(),
                subscriptions: 0,
                file_size: 0,
                time_updated: 0,
                author: "Unknown".to_string(),
                workshop_url: "".to_string(),
                tags: vec![],
            }]);
        }
        return Err(format!("Steam API returned error status: {}", status));
    }

    let body: serde_json::Value = resp.json().await.map_err(|e| format!("JSON parse failed: {}", e))?;

    let mut results = Vec::new();
    if let Some(files) = body["response"]["publishedfiledetails"].as_array() {
        for file in files {
            let tags: Vec<String> = file["tags"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|t| t["tag"].as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();

            let published_id = file["publishedfileid"].as_str().unwrap_or("");

            results.push(WorkshopSearchResult {
                workshop_id: published_id.to_string(),
                title: file["title"].as_str().unwrap_or("Unknown Mod").to_string(),
                description: file["file_description"].as_str().unwrap_or("").chars().take(200).collect(),
                preview_url: file["preview_url"].as_str().unwrap_or("").to_string(),
                subscriptions: file["subscriptions"].as_u64().unwrap_or(0),
                file_size: file["file_size"].as_u64().unwrap_or(0),
                time_updated: file["time_updated"].as_u64().unwrap_or(0),
                author: file["creator"].as_str().unwrap_or("Unknown").to_string(),
                workshop_url: format!(
                    "https://steamcommunity.com/sharedfiles/filedetails/?id={}",
                    published_id
                ),
                tags,
            });
        }
    }

    Ok(results)
}

#[tauri::command]
pub async fn get_ase_workshop_details(
    workshop_ids: Vec<String>,
) -> Result<Vec<WorkshopSearchResult>, String> {
    let client = reqwest::Client::new();

    let mut form_params = vec![
        ("itemcount".to_string(), workshop_ids.len().to_string()),
    ];
    for (i, id) in workshop_ids.iter().enumerate() {
        form_params.push((format!("publishedfileids[{}]", i), id.clone()));
    }

    let resp = client
        .post("https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/")
        .form(&form_params)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Steam API returned error status: {}", resp.status()));
    }

    let body: serde_json::Value = resp.json().await.map_err(|e| format!("JSON parse failed: {}", e))?;

    let mut results = Vec::new();
    if let Some(files) = body["response"]["publishedfiledetails"].as_array() {
        for file in files {
            let title = file["title"].as_str().unwrap_or("").to_string();
            if title.is_empty() { continue; }

            let published_id = file["publishedfileid"].as_str().unwrap_or("");
            let tags: Vec<String> = file["tags"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|t| t["tag"].as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();

            results.push(WorkshopSearchResult {
                workshop_id: published_id.to_string(),
                title,
                description: file["file_description"].as_str().unwrap_or("").chars().take(200).collect(),
                preview_url: file["preview_url"].as_str().unwrap_or("").to_string(),
                subscriptions: file["subscriptions"].as_u64().unwrap_or(0),
                file_size: file["file_size"]
                    .as_str()
                    .and_then(|s| s.parse::<u64>().ok())
                    .or_else(|| file["file_size"].as_u64())
                    .unwrap_or(0),
                time_updated: file["time_updated"].as_u64().unwrap_or(0),
                author: file["creator"].as_str().unwrap_or("Unknown").to_string(),
                workshop_url: format!(
                    "https://steamcommunity.com/sharedfiles/filedetails/?id={}",
                    published_id
                ),
                tags,
            });
        }
    }

    Ok(results)
}

#[tauri::command]
pub async fn download_ase_workshop_mod(
    app_handle: AppHandle,
    server_id: i64,
    workshop_id: String,
    mod_name: String,
    state: State<'_, AppState>,
) -> Result<AseInstalledMod, String> {
    download_ase_workshop_mod_with_retry(&app_handle, server_id, &workshop_id, &mod_name, &state, 3).await
}

async fn download_ase_workshop_mod_with_retry(
    app_handle: &AppHandle,
    server_id: i64,
    workshop_id: &str,
    mod_name: &str,
    state: &State<'_, AppState>,
    max_retries: usize,
) -> Result<AseInstalledMod, String> {
    let mut last_error = String::new();

    for attempt in 1..=max_retries {
        if attempt > 1 {
            println!("[ASE Mod Loader] Retry attempt {}/{} for mod {}", attempt, max_retries, workshop_id);
            tokio::time::sleep(std::time::Duration::from_secs(2 * attempt as u64)).await;
        }

        match download_ase_workshop_mod_internal(app_handle, server_id, workshop_id, mod_name, state).await {
            Ok(mod_info) => return Ok(mod_info),
            Err(e) => {
                println!("[ASE Mod Loader] Attempt {} failed: {}", attempt, e);
                last_error = e;
                let _ = clean_failed_download(app_handle, workshop_id, state).await;
            }
        }
    }

    Err(format!("Failed to download mod {} after {} attempts: {}", workshop_id, max_retries, last_error))
}

async fn download_ase_workshop_mod_internal(
    app_handle: &AppHandle,
    server_id: i64,
    workshop_id: &str,
    mod_name: &str,
    state: &State<'_, AppState>,
) -> Result<AseInstalledMod, String> {
    let install_path: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT install_path FROM ase_servers WHERE id = ?1",
            [server_id], |row| row.get(0),
        ).map_err(|e| format!("Server not found: {}", e))?
    };

    let steamcmd_service = crate::services::steamcmd::SteamCmdService::new(app_handle.clone());
    if !steamcmd_service.check_installation() {
        println!("[ASE Mod Loader] SteamCMD not installed. Attempting to install automatically...");
        steamcmd_service.install().await.map_err(|e| format!("Auto-installation of SteamCMD failed: {}", e))?;
    }
    let steamcmd_exe = steamcmd_service.get_steamcmd_exe().map_err(|e| e.to_string())?;

    let mut cmd = tokio::process::Command::new(&steamcmd_exe);
    cmd.args([
        "+login", "anonymous",
        "+workshop_download_item", "346110", workshop_id,
        "+quit",
    ]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output()
        .await
        .map_err(|e| format!("SteamCMD failed to start: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !output.status.success() && !stdout.contains("Success") {
        return Err(format!("SteamCMD workshop download failed. stdout: {}, stderr: {}", stdout, stderr));
    }

    let app_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app dir: {}", e))?;
    let steamcmd_content = app_dir
        .join("steamcmd").join("steamapps").join("workshop")
        .join("content").join("346110").join(workshop_id);

    let mods_dir = PathBuf::from(&install_path)
        .join("ShooterGame").join("Content").join("Mods").join(workshop_id);

    if !steamcmd_content.exists() {
        return Err("SteamCMD did not produce any download content".to_string());
    }

    if !mods_dir.exists() {
        std::fs::create_dir_all(&mods_dir)
            .map_err(|e| format!("Failed to create mod directory: {}", e))?;
    }

    copy_and_extract_mod(&steamcmd_content, &mods_dir)?;

    let mod_file_in_subdir = mods_dir.join(format!("{}.mod", workshop_id));
    if mod_file_in_subdir.exists() {
        let parent_mods_dir = mods_dir.parent().ok_or("Failed to get parent Mods directory")?;
        let target_mod_file = parent_mods_dir.join(format!("{}.mod", workshop_id));
        std::fs::copy(&mod_file_in_subdir, &target_mod_file)
            .map_err(|e| format!("Failed to copy .mod file to parent Mods folder: {}", e))?;
        println!("[ASE Mod Loader] Moved .mod file to parent: {:?}", target_mod_file);
    } else {
        println!("[ASE Mod Loader] Warning: {}.mod file not found in extracted files!", workshop_id);
    }

    update_active_mods(&install_path, workshop_id, true)?;

    let api_key = crate::services::api_key_manager::ApiKeyManager::get_steam_key(state).unwrap_or_default();
    let mut final_name = mod_name.to_string();
    let mut final_description = None;
    let mut final_author = None;
    let mut final_preview_url = None;
    let mut final_subscribers = None;
    let mut final_file_size = None;
    let mut final_time_updated = None;
    let mut final_time_created = None;
    let mut final_tags = None;

    if !api_key.trim().is_empty() {
        if let Ok(details) = crate::services::workshop_metadata::fetch_workshop_details(
            vec![workshop_id.to_string()],
            api_key,
        ).await {
            if let Some(detail) = details.get(workshop_id) {
                if let Some(t) = &detail.title {
                    final_name = t.clone();
                }
                final_description = detail.file_description.clone();
                final_author = detail.creator.clone();
                final_preview_url = detail.preview_url.clone();
                final_subscribers = detail.subscriptions.as_ref().and_then(|s| s.parse::<u64>().ok());
                final_file_size = detail.file_size.as_ref().and_then(|s| s.parse::<u64>().ok());
                final_time_updated = detail.time_updated;
                final_time_created = detail.time_created;
                final_tags = detail.tags.as_ref().map(|tags| tags.iter().map(|t| t.tag.clone()).collect());

                if let Some(preview_url) = &detail.preview_url {
                    if !preview_url.is_empty() {
                        let _ = crate::services::workshop_metadata::cache_workshop_image(
                            preview_url.clone(),
                            workshop_id.to_string(),
                            app_handle,
                        ).await;
                    }
                }
            }
        }
    }

    let cached_image = crate::services::workshop_metadata::get_cached_image_path(workshop_id, app_handle);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    let max_order: i32 = conn.query_row(
        "SELECT COALESCE(MAX(load_order), 0) FROM ase_mods WHERE server_id = ?1",
        [server_id], |row| row.get(0),
    ).unwrap_or(0);

    let tags_json = final_tags.as_ref().map(|t| serde_json::to_string(&t).unwrap_or_default());

    conn.execute(
        "INSERT INTO ase_mods (server_id, workshop_id, name, version, installed_at, enabled, load_order, description, author, preview_url, subscribers, file_size, time_updated, time_created, tags) \
         VALUES (?1, ?2, ?3, '1.0', ?4, 1, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        rusqlite::params![
            server_id, workshop_id, final_name, now, max_order + 1,
            final_description, final_author, final_preview_url,
            final_subscribers.map(|v| v.to_string()),
            final_file_size.map(|v| v.to_string()),
            final_time_updated.map(|v| v.to_string()),
            final_time_created.map(|v| v.to_string()),
            tags_json
        ],
    ).map_err(|e| e.to_string())?;

    let mod_id = conn.last_insert_rowid();

    Ok(AseInstalledMod {
        id: mod_id,
        server_id,
        workshop_id: workshop_id.to_string(),
        name: final_name,
        version: "1.0".into(),
        installed_at: now,
        enabled: true,
        load_order: max_order + 1,
        description: final_description,
        author: final_author,
        preview_url: final_preview_url,
        cached_image_url: cached_image,
        workshop_url: Some(format!("https://steamcommunity.com/sharedfiles/filedetails/?id={}", workshop_id)),
        subscribers: final_subscribers,
        file_size: final_file_size,
        time_updated: final_time_updated,
        time_created: final_time_created,
        tags: final_tags,
        mod_status: Some("installed".to_string()),
        download_status: Some("completed".to_string()),
        health_status: Some("healthy".to_string()),
        dependencies: None,
    })
}

async fn clean_failed_download(
    app_handle: &AppHandle,
    workshop_id: &str,
    state: &State<'_, AppState>,
) -> Result<(), String> {
    let app_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app dir: {}", e))?;
    let steamcmd_content = app_dir
        .join("steamcmd").join("steamapps").join("workshop")
        .join("content").join("346110").join(workshop_id);

    if steamcmd_content.exists() {
        let _ = std::fs::remove_dir_all(&steamcmd_content);
    }

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    let _ = conn.execute(
        "DELETE FROM ase_mods WHERE workshop_id = ?1",
        rusqlite::params![workshop_id],
    );

    Ok(())
}

/// Copy mod files, extracting .z compressed files using flate2
fn copy_and_extract_mod(src: &PathBuf, dest: &PathBuf) -> Result<(), String> {
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let file_name = entry.file_name();
        let dest_path = dest.join(&file_name);

        if path.is_dir() {
            std::fs::create_dir_all(&dest_path).map_err(|e| e.to_string())?;
            copy_and_extract_mod(&path, &dest_path)?;
        } else if path.extension().map_or(false, |ext| ext == "z") {
            let compressed = std::fs::read(&path).map_err(|e| e.to_string())?;
            if compressed.len() > 8 {
                match decompress_ark_z(&compressed) {
                    Ok(decompressed) => {
                        let out_name = file_name.to_string_lossy().trim_end_matches(".z").to_string();
                        std::fs::write(dest.join(out_name), decompressed).map_err(|e| e.to_string())?;
                    }
                    Err(e) => {
                        eprintln!("[ASE Mod Loader] Failed to decompress {:?}: {}", file_name, e);
                        std::fs::copy(&path, &dest_path).map_err(|e| e.to_string())?;
                    }
                }
            } else {
                std::fs::copy(&path, &dest_path).map_err(|e| e.to_string())?;
            }
        } else {
            std::fs::copy(&path, &dest_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Decompress ARK's .z file format (custom header + zlib data)
fn decompress_ark_z(data: &[u8]) -> Result<Vec<u8>, String> {
    use std::io::Read;
    if data.len() < 8 {
        return Err("File too small to be a valid .z archive".into());
    }

    let mut decoder = flate2::read::ZlibDecoder::new(&data[8..]);
    let mut result = Vec::new();
    match decoder.read_to_end(&mut result) {
        Ok(_) => {
            if result.is_empty() {
                Err("Decompressed data is empty".into())
            } else {
                Ok(result)
            }
        }
        Err(_) => {
            let mut decoder2 = flate2::read::DeflateDecoder::new(&data[..]);
            let mut result2 = Vec::new();
            decoder2.read_to_end(&mut result2)
                .map_err(|e| format!("Failed to decompress .z file: {}", e))?;
            if result2.is_empty() {
                Err("Decompressed data is empty after fallback".into())
            } else {
                Ok(result2)
            }
        }
    }
}

/// Update ActiveMods= line in GameUserSettings.ini
fn update_active_mods(install_path: &str, workshop_id: &str, add: bool) -> Result<(), String> {
    let config_path = PathBuf::from(install_path)
        .join("ShooterGame").join("Saved").join("Config")
        .join("WindowsServer").join("GameUserSettings.ini");

    if !config_path.exists() {
        return Ok(());
    }

    let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let mut lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();
    let mut found = false;

    for line in lines.iter_mut() {
        if line.starts_with("ActiveMods=") {
            found = true;
            let current = line.trim_start_matches("ActiveMods=");
            let mut mod_ids: Vec<String> = current.split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();

            if add && !mod_ids.contains(&workshop_id.to_string()) {
                mod_ids.push(workshop_id.to_string());
            } else if !add {
                mod_ids.retain(|id| id != workshop_id);
            }

            *line = format!("ActiveMods={}", mod_ids.join(","));
            break;
        }
    }

    if !found && add {
        let mut insert_idx = lines.len();
        for (i, line) in lines.iter().enumerate() {
            if line.trim() == "[ServerSettings]" {
                insert_idx = i + 1;
                break;
            }
        }
        lines.insert(insert_idx, format!("ActiveMods={}", workshop_id));
    }

    std::fs::write(&config_path, lines.join("\n")).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn remove_ase_workshop_mod(
    server_id: i64, workshop_id: String, state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let install_path: String = conn.query_row(
        "SELECT install_path FROM ase_servers WHERE id = ?1",
        [server_id], |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let mods_dir = PathBuf::from(&install_path)
        .join("ShooterGame").join("Content").join("Mods").join(&workshop_id);
    if mods_dir.exists() {
        std::fs::remove_dir_all(&mods_dir).map_err(|e| e.to_string())?;
    }

    let parent_mods_dir = PathBuf::from(&install_path)
        .join("ShooterGame").join("Content").join("Mods");
    let target_mod_file = parent_mods_dir.join(format!("{}.mod", workshop_id));
    if target_mod_file.exists() {
        let _ = std::fs::remove_file(&target_mod_file);
        println!("[ASE Mod Loader] Removed parent mod file: {:?}", target_mod_file);
    }

    update_active_mods(&install_path, &workshop_id, false)?;

    conn.execute(
        "DELETE FROM ase_mods WHERE server_id = ?1 AND workshop_id = ?2",
        rusqlite::params![server_id, workshop_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_installed_ase_mods(server_id: i64, state: State<'_, AppState>, app_handle: AppHandle) -> Result<Vec<AseInstalledMod>, String> {
    let mods = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let mut stmt = conn.prepare(
            "SELECT id, server_id, workshop_id, name, version, installed_at, enabled, load_order, description, author, preview_url, subscribers, file_size, time_updated, time_created, tags \
             FROM ase_mods WHERE server_id = ?1 ORDER BY load_order"
        ).map_err(|e| e.to_string())?;

        let mut mods = Vec::new();
        let mut rows = stmt.query([server_id]).map_err(|e| e.to_string())?;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let tags_str: Option<String> = row.get(15).ok().flatten();
            let tags: Option<Vec<String>> = tags_str.and_then(|s| serde_json::from_str(&s).ok());

            let subscribers: Option<u64> = row.get::<_, Option<String>>(11).ok().flatten().and_then(|s| s.parse().ok());
            let file_size: Option<u64> = row.get::<_, Option<String>>(12).ok().flatten().and_then(|s| s.parse().ok());
            let time_updated: Option<u64> = row.get::<_, Option<String>>(13).ok().flatten().and_then(|s| s.parse().ok());
            let time_created: Option<u64> = row.get::<_, Option<String>>(14).ok().flatten().and_then(|s| s.parse().ok());

            let preview_url: Option<String> = row.get(10).ok().flatten();
            let workshop_id: String = row.get(2).map_err(|e| e.to_string())?;
            let cached_image = if preview_url.is_some() {
                crate::services::workshop_metadata::get_cached_image_path(&workshop_id, &app_handle)
            } else {
                None
            };

            mods.push(AseInstalledMod {
                id: row.get(0).map_err(|e| e.to_string())?,
                server_id: row.get(1).map_err(|e| e.to_string())?,
                workshop_id: workshop_id.clone(),
                name: row.get(3).map_err(|e| e.to_string())?,
                version: row.get(4).map_err(|e| e.to_string())?,
                installed_at: row.get(5).map_err(|e| e.to_string())?,
                enabled: row.get(6).map_err(|e| e.to_string())?,
                load_order: row.get(7).map_err(|e| e.to_string())?,
                description: row.get(8).ok().flatten(),
                author: row.get(9).ok().flatten(),
                preview_url: preview_url.clone(),
                cached_image_url: cached_image,
                workshop_url: Some(format!("https://steamcommunity.com/sharedfiles/filedetails/?id={}", workshop_id)),
                subscribers,
                file_size,
                time_updated,
                time_created,
                tags,
                mod_status: Some("installed".to_string()),
                download_status: Some("completed".to_string()),
                health_status: Some("healthy".to_string()),
                dependencies: None,
            });
        }
        mods
    };

    let api_key = crate::services::api_key_manager::ApiKeyManager::get_steam_key(&state).unwrap_or_default();
    let enriched = crate::services::workshop_metadata::enrich_installed_mods(mods, api_key, &app_handle).await;

    // Persist enriched details back to the SQLite DB
    {
        if let Ok(db) = state.db.lock() {
            if let Ok(conn) = db.get_connection() {
                for m in &enriched {
                    let tags_str = m.tags.as_ref().and_then(|t| serde_json::to_string(t).ok());
                    let subscribers_str = m.subscribers.map(|s| s.to_string());
                    let file_size_str = m.file_size.map(|f| f.to_string());
                    let time_updated_str = m.time_updated.map(|t| t.to_string());
                    let time_created_str = m.time_created.map(|t| t.to_string());

                    conn.execute(
                        "UPDATE ase_mods SET \
                         name = ?1, \
                         description = ?2, \
                         author = ?3, \
                         preview_url = ?4, \
                         subscribers = ?5, \
                         file_size = ?6, \
                         time_updated = ?7, \
                         time_created = ?8, \
                         tags = ?9 \
                         WHERE server_id = ?10 AND workshop_id = ?11",
                        rusqlite::params![
                            m.name,
                            m.description,
                            m.author,
                            m.preview_url,
                            subscribers_str,
                            file_size_str,
                            time_updated_str,
                            time_created_str,
                            tags_str,
                            server_id,
                            m.workshop_id,
                        ]
                    ).ok();
                }
            }
        }
    }

    Ok(enriched)
}

#[tauri::command]
pub async fn update_ase_mod_order(
    state: State<'_, AppState>,
    server_id: i64,
    workshop_ids: Vec<String>,
) -> Result<(), String> {
    println!("Updating ASE mod load order for server {}", server_id);

    let install_path: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.query_row(
            "SELECT install_path FROM ase_servers WHERE id = ?1",
            [server_id], |row| row.get(0),
        ).map_err(|e| format!("Server not found: {}", e))?
    };

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        for (index, id) in workshop_ids.iter().enumerate() {
            conn.execute(
                "UPDATE ase_mods SET load_order = ?1 WHERE server_id = ?2 AND workshop_id = ?3",
                rusqlite::params![index as i32, server_id, id],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    let enabled_workshop_ids: Vec<String> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT workshop_id FROM ase_mods WHERE server_id = ?1 AND enabled = 1 ORDER BY load_order ASC"
        ).map_err(|e| e.to_string())?;

        let mut rows = stmt.query([server_id]).map_err(|e| e.to_string())?;
        let mut ids = Vec::new();
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            ids.push(row.get(0).map_err(|e| e.to_string())?);
        }
        ids
    };

    sync_ase_mods_to_ini(&install_path, &enabled_workshop_ids)?;

    println!("  ASE load order updated successfully");
    Ok(())
}

#[tauri::command]
pub async fn toggle_ase_mod(
    state: State<'_, AppState>,
    server_id: i64,
    workshop_id: String,
    enabled: bool,
) -> Result<(), String> {
    println!("Toggling ASE mod {} to {} for server {}", workshop_id, enabled, server_id);

    let install_path: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.query_row(
            "SELECT install_path FROM ase_servers WHERE id = ?1",
            [server_id], |row| row.get(0),
        ).map_err(|e| format!("Server not found: {}", e))?
    };

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE ase_mods SET enabled = ?1 WHERE server_id = ?2 AND workshop_id = ?3",
            rusqlite::params![enabled, server_id, workshop_id],
        )
        .map_err(|e| e.to_string())?;
    }

    let enabled_workshop_ids: Vec<String> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT workshop_id FROM ase_mods WHERE server_id = ?1 AND enabled = 1 ORDER BY load_order ASC"
        ).map_err(|e| e.to_string())?;

        let mut rows = stmt.query([server_id]).map_err(|e| e.to_string())?;
        let mut ids = Vec::new();
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            ids.push(row.get(0).map_err(|e| e.to_string())?);
        }
        ids
    };

    sync_ase_mods_to_ini(&install_path, &enabled_workshop_ids)?;

    Ok(())
}

pub(crate) fn sync_ase_mods_to_ini(install_path: &str, mod_ids: &[String]) -> Result<(), String> {
    let config_path = PathBuf::from(install_path)
        .join("ShooterGame").join("Saved").join("Config")
        .join("WindowsServer").join("GameUserSettings.ini");

    if !config_path.exists() {
        return Ok(());
    }

    // 1. Create a backup copy before any INI modification
    let backup_path = config_path.with_extension("ini.bak");
    if let Err(e) = std::fs::copy(&config_path, &backup_path) {
        eprintln!("[ASE Load Order Sync] Warning: Failed to create GameUserSettings.ini backup: {}", e);
    } else {
        println!("[ASE Load Order Sync] Successfully created config backup at {:?}", backup_path);
    }

    let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let mut lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();
    let mut found = false;

    // 2. Prevent duplicate mod IDs in ActiveMods by deduplicating
    let mut unique_ids = Vec::new();
    for id in mod_ids {
        if !unique_ids.contains(id) {
            unique_ids.push(id.clone());
        }
    }

    let active_mods_line = format!("ActiveMods={}", unique_ids.join(","));

    for line in lines.iter_mut() {
        if line.starts_with("ActiveMods=") {
            found = true;
            *line = active_mods_line.clone();
            break;
        }
    }

    if !found {
        let mut insert_idx = lines.len();
        for (i, line) in lines.iter().enumerate() {
            if line.trim() == "[ServerSettings]" {
                insert_idx = i + 1;
                break;
            }
        }
        lines.insert(insert_idx, active_mods_line);
    }

    std::fs::write(&config_path, lines.join("\n")).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn force_download_ase_mod(
    app_handle: AppHandle,
    server_id: i64,
    workshop_id: String,
    state: State<'_, AppState>,
) -> Result<AseInstalledMod, String> {
    println!("[ASE Mod Loader] Force downloading mod {}", workshop_id);

    let install_path: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT install_path FROM ase_servers WHERE id = ?1",
            [server_id], |row| row.get(0),
        ).map_err(|e| format!("Server not found: {}", e))?
    };

    let mods_dir = PathBuf::from(&install_path)
        .join("ShooterGame").join("Content").join("Mods").join(&workshop_id);

    if mods_dir.exists() {
        std::fs::remove_dir_all(&mods_dir).map_err(|e| format!("Failed to clear existing mod: {}", e))?;
    }

    let parent_mod_file = PathBuf::from(&install_path)
        .join("ShooterGame").join("Content").join("Mods").join(format!("{}.mod", workshop_id));
    if parent_mod_file.exists() {
        let _ = std::fs::remove_file(&parent_mod_file);
    }

    let _ = clean_failed_download(&app_handle, &workshop_id, &state).await;

    let mod_name = format!("Workshop Mod {}", workshop_id);
    download_ase_workshop_mod_with_retry(&app_handle, server_id, &workshop_id, &mod_name, &state, 5).await
}

#[tauri::command]
pub async fn force_reinstall_ase_mod(
    app_handle: AppHandle,
    server_id: i64,
    workshop_id: String,
    state: State<'_, AppState>,
) -> Result<AseInstalledMod, String> {
    println!("[ASE Mod Loader] Force reinstalling mod {}", workshop_id);

    let install_path: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT install_path FROM ase_servers WHERE id = ?1",
            [server_id], |row| row.get(0),
        ).map_err(|e| format!("Server not found: {}", e))?
    };

    let mods_dir = PathBuf::from(&install_path)
        .join("ShooterGame").join("Content").join("Mods").join(&workshop_id);

    if mods_dir.exists() {
        std::fs::remove_dir_all(&mods_dir).map_err(|e| format!("Failed to remove mod directory: {}", e))?;
        println!("[ASE Mod Loader] Removed mod directory: {:?}", mods_dir);
    }

    let parent_mods_dir = PathBuf::from(&install_path)
        .join("ShooterGame").join("Content").join("Mods");
    let parent_mod_file = parent_mods_dir.join(format!("{}.mod", &workshop_id));
    if parent_mod_file.exists() {
        let _ = std::fs::remove_file(&parent_mod_file);
        println!("[ASE Mod Loader] Removed parent .mod file: {:?}", parent_mod_file);
    }

    update_active_mods(&install_path, &workshop_id, false)?;

    let _ = clean_failed_download(&app_handle, &workshop_id, &state).await;

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM ase_mods WHERE server_id = ?1 AND workshop_id = ?2",
            rusqlite::params![server_id, workshop_id],
        ).map_err(|e| e.to_string())?;
    }

    let cache_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workshop_images");
    let cached_image = cache_dir.join(format!("{}.jpg", &workshop_id));
    if cached_image.exists() {
        let _ = std::fs::remove_file(&cached_image);
    }

    let mod_name = format!("Workshop Mod {}", workshop_id);
    download_ase_workshop_mod_with_retry(&app_handle, server_id, &workshop_id, &mod_name, &state, 5).await
}

#[tauri::command]
pub async fn validate_ase_mod(
    server_id: i64,
    workshop_id: String,
    state: State<'_, AppState>,
) -> Result<ModValidationReport, String> {
    println!("[ASE Mod Loader] Validating mod {}", workshop_id);

    let install_path: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT install_path FROM ase_servers WHERE id = ?1",
            [server_id], |row| row.get(0),
        ).map_err(|e| format!("Server not found: {}", e))?
    };

    let mods_dir = PathBuf::from(&install_path)
        .join("ShooterGame").join("Content").join("Mods").join(&workshop_id);

    let mod_dir_str = mods_dir.to_string_lossy().replace("\\", "/");
    let mut issues = Vec::new();

    if !mods_dir.exists() {
        issues.push("Mod directory does not exist".to_string());
        return Ok(ModValidationReport {
            workshop_id,
            is_valid: false,
            issues,
            file_count: 0,
            total_size: 0,
            mod_dir: mod_dir_str,
            has_ucas: false,
            has_utoc: false,
            has_mod_file: false,
            has_mod_info: false,
            has_modmeta_info: false,
            has_assets: false,
            has_active_mods_entry: false,
            has_unextracted_z: false,
        });
    }

    struct FileScanResult {
        file_count: usize,
        total_size: u64,
        has_mod_info: bool,
        has_modmeta_info: bool,
        has_assets: bool,
        has_unextracted_z: bool,
    }

    fn scan_mod_directory(dir: &std::path::Path) -> Result<FileScanResult, String> {
        let mut result = FileScanResult {
            file_count: 0,
            total_size: 0,
            has_mod_info: false,
            has_modmeta_info: false,
            has_assets: false,
            has_unextracted_z: false,
        };

        for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            
            // Resolve metadata (following symbolic links if any)
            if let Ok(metadata) = std::fs::metadata(&path) {
                if metadata.is_dir() {
                    let sub = scan_mod_directory(&path)?;
                    result.file_count += sub.file_count;
                    result.total_size += sub.total_size;
                    result.has_mod_info |= sub.has_mod_info;
                    result.has_modmeta_info |= sub.has_modmeta_info;
                    result.has_assets |= sub.has_assets;
                    result.has_unextracted_z |= sub.has_unextracted_z;
                } else {
                    let file_size = metadata.len();
                    if file_size > 0 {
                        result.file_count += 1;
                        result.total_size += file_size;
                    }
                    if let Some(name) = path.file_name() {
                        let name_str = name.to_string_lossy().to_lowercase();
                        if name_str == "mod.info" {
                            result.has_mod_info = true;
                        } else if name_str == "modmeta.info" {
                            result.has_modmeta_info = true;
                        } else if name_str.ends_with(".uasset") || name_str.ends_with(".umap") {
                            result.has_assets = true;
                        } else if name_str.ends_with(".z") {
                            result.has_unextracted_z = true;
                        }
                    }
                }
            }
        }
        Ok(result)
    }

    let scan = scan_mod_directory(&mods_dir)?;
    let file_count = scan.file_count;
    let total_size = scan.total_size;
    let has_mod_info = scan.has_mod_info;
    let has_modmeta_info = scan.has_modmeta_info;
    let has_assets = scan.has_assets;
    let has_unextracted_z = scan.has_unextracted_z;

    // Check parent .mod file in ShooterGame/Content/Mods/
    let parent_mod_file = PathBuf::from(&install_path)
        .join("ShooterGame").join("Content").join("Mods").join(format!("{}.mod", &workshop_id));
    let has_mod_file = parent_mod_file.exists();

    // GameUserSettings.ini ActiveMods check
    let mut has_active_mods_entry = false;
    let config_dir = PathBuf::from(&install_path)
        .join("ShooterGame").join("Saved").join("Config");
    
    for platform in &["WindowsServer", "LinuxServer"] {
        let ini_path = config_dir.join(platform).join("GameUserSettings.ini");
        if ini_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&ini_path) {
                for line in content.lines() {
                    if line.trim().starts_with("ActiveMods=") {
                        let mods_part = line.trim_start_matches("ActiveMods=");
                        let active_ids: Vec<&str> = mods_part.split(',').map(|s| s.trim()).collect();
                        if active_ids.contains(&workshop_id.as_str()) {
                            has_active_mods_entry = true;
                            break;
                        }
                    }
                }
            }
        }
        if has_active_mods_entry {
            break;
        }
    }

    if !has_mod_info {
        issues.push("Missing mod.info metadata file inside folder".to_string());
    }
    if !has_assets {
        issues.push("Missing compiled assets (.uasset or .umap)".to_string());
    }
    if !has_mod_file {
        issues.push("Missing parent .mod file in ShooterGame/Content/Mods/".to_string());
    }
    if !has_active_mods_entry {
        issues.push("Mod ID missing in ActiveMods line of GameUserSettings.ini".to_string());
    }
    if has_unextracted_z {
        issues.push("Leftover compressed (.z) files found: extraction is incomplete or failed".to_string());
    }
    if file_count == 0 {
        issues.push("Mod directory is empty".to_string());
    }

    let is_valid = issues.is_empty();

    Ok(ModValidationReport {
        workshop_id,
        is_valid,
        issues,
        file_count,
        total_size,
        mod_dir: mod_dir_str,
        has_ucas: has_mod_info,      // Map to mod.info for backward compatibility
        has_utoc: has_assets,        // Map to assets for backward compatibility
        has_mod_file,
        has_mod_info,
        has_modmeta_info,
        has_assets,
        has_active_mods_entry,
        has_unextracted_z,
    })
}

#[tauri::command]
pub async fn repair_ase_mod(
    app_handle: AppHandle,
    server_id: i64,
    workshop_id: String,
    state: State<'_, AppState>,
) -> Result<ModValidationReport, String> {
    println!("[ASE Mod Loader] Repairing mod {}", workshop_id);

    let install_path: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT install_path FROM ase_servers WHERE id = ?1",
            [server_id], |row| row.get(0),
        ).map_err(|e| format!("Server not found: {}", e))?
    };

    let app_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app dir: {}", e))?;
    
    let steamcmd_cache = app_dir
        .join("steamcmd").join("steamapps").join("workshop")
        .join("content").join("346110").join(&workshop_id);

    let mods_parent_dir = PathBuf::from(&install_path)
        .join("ShooterGame").join("Content").join("Mods");
    
    let mods_dir = mods_parent_dir.join(&workshop_id);

    let mut used_local_cache = false;

    // 1. Try local rapid repair if cache exists and has files
    if steamcmd_cache.exists() {
        if let Ok(entries) = std::fs::read_dir(&steamcmd_cache) {
            let files: Vec<_> = entries.filter_map(|e| e.ok()).collect();
            if !files.is_empty() {
                println!("[ASE Mod Loader] Found local cache for mod {} with {} files. Repairing locally...", workshop_id, files.len());
                
                // Clear existing target directory to ensure clean re-extraction
                if mods_dir.exists() {
                    let _ = std::fs::remove_dir_all(&mods_dir);
                }
                let _ = std::fs::create_dir_all(&mods_dir);

                // Copy and extract files from local cache
                if let Ok(_) = copy_and_extract_mod(&steamcmd_cache, &mods_dir) {
                    let mod_file_in_subdir = mods_dir.join(format!("{}.mod", &workshop_id));
                    if mod_file_in_subdir.exists() {
                        let target_mod_file = mods_parent_dir.join(format!("{}.mod", &workshop_id));
                        let _ = std::fs::copy(&mod_file_in_subdir, &target_mod_file);
                    }
                    used_local_cache = true;
                    println!("[ASE Mod Loader] Local rapid repair completed for mod {}", workshop_id);
                }
            }
        }
    }

    // 2. If local cache could not be used, fall back to steamcmd download
    if !used_local_cache {
        println!("[ASE Mod Loader] Local cache missing or corrupted for mod {}. Falling back to full download...", workshop_id);
        
        if mods_dir.exists() {
            let _ = std::fs::remove_dir_all(&mods_dir);
        }
        let _ = std::fs::create_dir_all(&mods_dir);

        let parent_mod_file = mods_parent_dir.join(format!("{}.mod", &workshop_id));
        if parent_mod_file.exists() {
            let _ = std::fs::remove_file(&parent_mod_file);
        }

        let _ = clean_failed_download(&app_handle, &workshop_id, &state).await;
        
        let mod_name = format!("Workshop Mod {}", workshop_id);
        let _ = download_ase_workshop_mod_with_retry(&app_handle, server_id, &workshop_id, &mod_name, &state, 5).await?;
    }

    // 3. Ensure ActiveMods entry is synchronized in GameUserSettings.ini
    let _ = update_active_mods(&install_path, &workshop_id, true);

    // 4. Validate again and return the updated report
    validate_ase_mod(server_id, workshop_id, state).await
}

#[tauri::command]
pub async fn clear_ase_workshop_cache(app_handle: AppHandle) -> Result<String, String> {
    println!("[ASE Mod Loader] Clearing workshop cache");

    let images_cleared = crate::services::workshop_metadata::clear_workshop_image_cache(&app_handle)?;

    let app_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let steamcmd_workshop = app_dir
        .join("steamcmd").join("steamapps").join("workshop")
        .join("content").join("346110");

    let mut steamcmd_cleared = 0;
    if steamcmd_workshop.exists() {
        for entry in std::fs::read_dir(&steamcmd_workshop).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                let _ = std::fs::remove_dir_all(entry.path());
                steamcmd_cleared += 1;
            }
        }
    }

    Ok(format!(
        "Cache cleared: {} images, {} workshop downloads",
        images_cleared, steamcmd_cleared
    ))
}

#[tauri::command]
pub async fn get_ase_workshop_details_batch(
    workshop_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Vec<WorkshopSearchResult>, String> {
    if workshop_ids.is_empty() {
        return Ok(vec![]);
    }

    let api_key = crate::services::api_key_manager::ApiKeyManager::get_steam_key(&state).unwrap_or_default();

    if api_key.trim().is_empty() {
        return Err("Steam Web API Key is required for batch details lookup".to_string());
    }

    let details = crate::services::workshop_metadata::fetch_workshop_details(
        workshop_ids.clone(),
        api_key,
    ).await?;

    let mut results = Vec::new();
    for id in &workshop_ids {
        if let Some(detail) = details.get(id) {
            let title = detail.title.clone().unwrap_or_default();
            if title.is_empty() {
                continue;
            }

            let tags: Vec<String> = detail.tags.as_ref()
                .map(|t| t.iter().map(|tag| tag.tag.clone()).collect())
                .unwrap_or_default();

            results.push(WorkshopSearchResult {
                workshop_id: id.clone(),
                title,
                description: detail.file_description.clone().unwrap_or_default().chars().take(200).collect(),
                preview_url: detail.preview_url.clone().unwrap_or_default(),
                subscriptions: detail.subscriptions.as_ref().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0),
                file_size: detail.file_size.as_ref().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0),
                time_updated: detail.time_updated.unwrap_or(0),
                author: detail.creator.clone().unwrap_or("Unknown".to_string()),
                workshop_url: format!(
                    "https://steamcommunity.com/sharedfiles/filedetails/?id={}",
                    id
                ),
                tags,
            });
        }
    }

    Ok(results)
}

#[tauri::command]
pub async fn batch_download_ase_mods(
    app_handle: AppHandle,
    server_id: i64,
    workshop_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Vec<Result<AseInstalledMod, String>>, String> {
    println!("[ASE Mod Loader] Batch downloading {} mods for server {}", workshop_ids.len(), server_id);

    let mut results = Vec::new();

    for workshop_id in &workshop_ids {
        let mod_name = format!("Workshop Mod {}", workshop_id);
        let result = download_ase_workshop_mod_with_retry(
            &app_handle,
            server_id,
            workshop_id,
            &mod_name,
            &state,
            3,
        ).await;
        results.push(result);
    }

    Ok(results)
}
