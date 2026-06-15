use crate::ase::models::AseInstalledMod;
use crate::AppState;
use std::path::PathBuf;
use tauri::{AppHandle, State, Manager};
use crate::ase::services::mod_manager::{AseModManager, ModValidationReport};

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

#[tauri::command]
pub async fn search_ase_workshop(
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<WorkshopSearchResult>, String> {
    let trimmed = query.trim();
    let is_numeric = !trimmed.is_empty() && trimmed.chars().all(|c| c.is_ascii_digit());

    if is_numeric {
        return get_ase_workshop_details(vec![trimmed.to_string()]).await;
    }

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
         ?key={}&query_type=12&page=1&numperpage=20&appid=346110\
         &search_text={}&return_previews=true",
        key,
        urlencoding::encode(trimmed)
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
                description: file["description"]
                    .as_str()
                    .or_else(|| file["file_description"].as_str())
                    .unwrap_or("")
                    .chars()
                    .take(200)
                    .collect(),
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
    AseModManager::download_mod_with_retry(&app_handle, server_id, &workshop_id, &mod_name, &state, 3).await
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

    AseModManager::update_active_mods(&install_path, &workshop_id, false)?;

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

    AseModManager::sync_ase_mods_to_ini(&install_path, &enabled_workshop_ids)?;

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

    AseModManager::sync_ase_mods_to_ini(&install_path, &enabled_workshop_ids)?;

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

    let _ = AseModManager::clean_failed_download(&app_handle, &workshop_id, server_id, &state).await;

    let mod_name = format!("Workshop Mod {}", workshop_id);
    AseModManager::download_mod_with_retry(&app_handle, server_id, &workshop_id, &mod_name, &state, 5).await
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

    AseModManager::update_active_mods(&install_path, &workshop_id, false)?;

    let _ = AseModManager::clean_failed_download(&app_handle, &workshop_id, server_id, &state).await;

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
    AseModManager::download_mod_with_retry(&app_handle, server_id, &workshop_id, &mod_name, &state, 5).await
}

#[tauri::command]
pub async fn validate_ase_mod(
    server_id: i64,
    workshop_id: String,
    state: State<'_, AppState>,
) -> Result<ModValidationReport, String> {
    AseModManager::validate_mod(server_id, workshop_id, &state).await
}

#[tauri::command]
pub async fn repair_ase_mod(
    app_handle: AppHandle,
    server_id: i64,
    workshop_id: String,
    state: State<'_, AppState>,
) -> Result<ModValidationReport, String> {
    AseModManager::repair_mod(app_handle, server_id, workshop_id, &state).await
}

#[tauri::command]
pub async fn clear_ase_workshop_cache(app_handle: AppHandle) -> Result<String, String> {
    println!("[ASE Mod Loader] Clearing workshop cache");

    let images_cleared = crate::services::workshop_metadata::clear_workshop_image_cache(&app_handle)?;

    let app_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let steamcmd_workshop = app_dir
        .join("steamcmd").join("steamapps").join("workshop");
    
    let content_dir = steamcmd_workshop.join("content").join("346110");
    let mut steamcmd_cleared = 0;
    if content_dir.exists() {
        for entry in std::fs::read_dir(&content_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                let _ = std::fs::remove_dir_all(entry.path());
                steamcmd_cleared += 1;
            }
        }
    }

    let downloads_dir = steamcmd_workshop.join("downloads").join("346110");
    if downloads_dir.exists() {
        let _ = std::fs::remove_dir_all(&downloads_dir);
    }

    let temp_dir = steamcmd_workshop.join("temp");
    if temp_dir.exists() {
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    let acf_file = steamcmd_workshop.join("appworkshop_346110.acf");
    if acf_file.exists() {
        let _ = std::fs::remove_file(&acf_file);
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
        let result = AseModManager::download_mod_with_retry(
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
