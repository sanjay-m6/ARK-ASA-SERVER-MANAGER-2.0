#![allow(dead_code)]
use crate::ase::models::AseInstalledMod;
use reqwest::Client;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Manager;

const STEAM_API_BASE: &str = "https://api.steampowered.com";
const ASE_APP_ID: &str = "346110";
const IMAGE_CACHE_TTL_SECONDS: u64 = 86400;

#[derive(Debug, Deserialize)]
struct SteamApiResponse {
    response: Option<SteamResponseData>,
    publishedfiledetails: Option<Vec<SteamFileDetail>>,
}

#[derive(Debug, Deserialize)]
struct SteamResponseData {
    publishedfiledetails: Option<Vec<SteamFileDetail>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SteamFileDetail {
    pub publishedfileid: String,
    pub result: Option<u32>,
    pub creator: Option<String>,
    pub title: Option<String>,
    pub file_description: Option<String>,
    pub preview_url: Option<String>,
    pub subscriptions: Option<String>,
    pub file_size: Option<String>,
    pub time_created: Option<u64>,
    pub time_updated: Option<u64>,
    pub url: Option<String>,
    pub tags: Option<Vec<SteamTag>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SteamTag {
    pub tag: String,
}

lazy_static::lazy_static! {
    static ref METADATA_CACHE: Mutex<HashMap<String, (SteamFileDetail, u64)>> = Mutex::new(HashMap::new());
}

pub async fn fetch_workshop_details(
    workshop_ids: Vec<String>,
    _api_key: String,
) -> Result<HashMap<String, SteamFileDetail>, String> {
    if workshop_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let mut result = HashMap::new();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let mut ids_to_fetch = Vec::new();

    for id in &workshop_ids {
        let cache = METADATA_CACHE.lock().unwrap();
        if let Some((detail, cached_at)) = cache.get(id) {
            if now - cached_at < IMAGE_CACHE_TTL_SECONDS {
                result.insert(id.clone(), detail.clone());
            } else {
                ids_to_fetch.push(id.clone());
            }
        } else {
            ids_to_fetch.push(id.clone());
        }
    }

    if ids_to_fetch.is_empty() {
        return Ok(result);
    }

    let mut form_params = vec![
        ("itemcount".to_string(), ids_to_fetch.len().to_string()),
        ("includetags".to_string(), "true".to_string()),
        ("includepreviews".to_string(), "true".to_string()),
        ("includekvtags".to_string(), "true".to_string()),
    ];

    for (i, id) in ids_to_fetch.iter().enumerate() {
        form_params.push((format!("publishedfileids[{}]", i), id.clone()));
    }

    let url = format!(
        "{}/ISteamRemoteStorage/GetPublishedFileDetails/v1/",
        STEAM_API_BASE
    );

    let resp = client
        .post(&url)
        .form(&form_params)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Steam API returned: {}", resp.status()));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("JSON parse failed: {}", e))?;

    if let Some(files) = body["response"]["publishedfiledetails"].as_array() {
        let mut cache = METADATA_CACHE.lock().unwrap();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        for file in files {
            let publishedfileid = file["publishedfileid"]
                .as_str()
                .map(|s| s.to_string())
                .or_else(|| file["publishedfileid"].as_u64().map(|n| n.to_string()))
                .unwrap_or_default();

            let result_val = file["result"]
                .as_u64()
                .or_else(|| file["result"].as_str().and_then(|s| s.parse::<u64>().ok()))
                .unwrap_or(1);

            if result_val != 1 {
                continue;
            }

            let detail = SteamFileDetail {
                publishedfileid,
                result: Some(result_val as u32),
                creator: file["creator"]
                    .as_str()
                    .map(|s| s.to_string())
                    .or_else(|| file["creator"].as_u64().map(|n| n.to_string())),
                title: file["title"]
                    .as_str()
                    .map(|s| s.to_string()),
                file_description: file["file_description"]
                    .as_str()
                    .map(|s| s.to_string()),
                preview_url: file["preview_url"]
                    .as_str()
                    .map(|s| s.to_string()),
                subscriptions: file["subscriptions"]
                    .as_str()
                    .map(|s| s.to_string())
                    .or_else(|| file["subscriptions"].as_u64().map(|n| n.to_string())),
                file_size: file["file_size"]
                    .as_str()
                    .map(|s| s.to_string())
                    .or_else(|| file["file_size"].as_u64().map(|n| n.to_string())),
                time_created: file["time_created"]
                    .as_u64()
                    .or_else(|| file["time_created"].as_str().and_then(|s| s.parse::<u64>().ok())),
                time_updated: file["time_updated"]
                    .as_u64()
                    .or_else(|| file["time_updated"].as_str().and_then(|s| s.parse::<u64>().ok())),
                url: file["url"]
                    .as_str()
                    .map(|s| s.to_string()),
                tags: file["tags"].as_array().map(|arr| {
                    arr.iter()
                        .filter_map(|t| {
                            Some(SteamTag {
                                tag: t["tag"].as_str()?.to_string(),
                            })
                        })
                        .collect()
                }),
            };

            let id = detail.publishedfileid.clone();
            result.insert(id.clone(), detail.clone());
            cache.insert(id, (detail, now));
        }
    }

    Ok(result)
}

pub async fn cache_workshop_image(
    preview_url: String,
    workshop_id: String,
    app_handle: &tauri::AppHandle,
) -> Result<Option<String>, String> {
    if preview_url.is_empty() {
        return Ok(None);
    }

    let cache_dir = app_handle
        .clone()
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workshop_images");

    if !cache_dir.exists() {
        std::fs::create_dir_all(&cache_dir)
            .map_err(|e| format!("Failed to create image cache dir: {}", e))?;
    }

    let image_path = cache_dir.join(format!("{}.jpg", workshop_id));

    if image_path.exists() {
        let metadata = std::fs::metadata(&image_path).map_err(|e| e.to_string())?;
        if let Ok(modified) = metadata.modified() {
            if let Ok(elapsed) = modified.elapsed() {
                if elapsed.as_secs() < IMAGE_CACHE_TTL_SECONDS {
                    return Ok(Some(image_path.to_string_lossy().to_string()));
                }
            }
        }
    }

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let resp = client
        .get(&preview_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download image: {}", e))?;

    if resp.status().is_success() {
        let bytes = resp
            .bytes()
            .await
            .map_err(|e| format!("Failed to read image bytes: {}", e))?;

        std::fs::write(&image_path, bytes).map_err(|e| format!("Failed to save image: {}", e))?;

        Ok(Some(image_path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

pub fn get_cached_image_path(workshop_id: &str, app_handle: &tauri::AppHandle) -> Option<String> {
    let cache_dir = app_handle
        .clone()
        .path()
        .app_data_dir()
        .ok()?
        .join("workshop_images");
    let image_path = cache_dir.join(format!("{}.jpg", workshop_id));

    if image_path.exists() {
        Some(image_path.to_string_lossy().to_string())
    } else {
        None
    }
}

pub async fn enrich_installed_mods(
    mods: Vec<AseInstalledMod>,
    api_key: String,
    app_handle: &tauri::AppHandle,
) -> Vec<AseInstalledMod> {
    if mods.is_empty() {
        return mods;
    }

    let workshop_ids: Vec<String> = mods.iter().map(|m| m.workshop_id.clone()).collect();

    match fetch_workshop_details(workshop_ids, api_key).await {
        Ok(details) => {
            let mut enriched = Vec::new();

            for mut mod_info in mods {
                if let Some(detail) = details.get(&mod_info.workshop_id) {
                    mod_info.name = detail.title.clone().unwrap_or(mod_info.name);
                    mod_info.description = detail.file_description.clone();
                    mod_info.author = detail.creator.clone();
                    mod_info.preview_url = detail.preview_url.clone();
                    mod_info.subscribers = detail
                        .subscriptions
                        .as_ref()
                        .and_then(|s| s.parse::<u64>().ok());
                    mod_info.file_size = detail
                        .file_size
                        .as_ref()
                        .and_then(|s| s.parse::<u64>().ok());
                    mod_info.time_updated = detail.time_updated;
                    mod_info.time_created = detail.time_created;
                    mod_info.tags = detail
                        .tags
                        .as_ref()
                        .map(|tags| tags.iter().map(|t| t.tag.clone()).collect());
                    mod_info.workshop_url = Some(format!(
                        "https://steamcommunity.com/sharedfiles/filedetails/?id={}",
                        mod_info.workshop_id
                    ));

                    if let Some(preview_url) = &detail.preview_url {
                        if !preview_url.is_empty() {
                            if let Ok(cached_path) = cache_workshop_image(
                                preview_url.clone(),
                                mod_info.workshop_id.clone(),
                                app_handle,
                            )
                            .await
                            {
                                mod_info.cached_image_url = cached_path;
                            }
                        }
                    }

                    mod_info.health_status = Some("healthy".to_string());
                } else {
                    mod_info.health_status = Some("metadata_unavailable".to_string());
                    if let Some(cached_path) =
                        get_cached_image_path(&mod_info.workshop_id, app_handle)
                    {
                        mod_info.cached_image_url = Some(cached_path);
                    }
                }

                enriched.push(mod_info);
            }

            enriched
        }
        Err(e) => {
            eprintln!("Failed to enrich mods: {}", e);
            mods.into_iter()
                .map(|mut m| {
                    m.health_status = Some("metadata_error".to_string());
                    m
                })
                .collect()
        }
    }
}

pub fn clear_workshop_image_cache(app_handle: &tauri::AppHandle) -> Result<usize, String> {
    let cache_dir = app_handle
        .clone()
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workshop_images");

    if !cache_dir.exists() {
        return Ok(0);
    }

    let mut count = 0;
    for entry in std::fs::read_dir(&cache_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().map(|ft| ft.is_file()).unwrap_or(false) {
            std::fs::remove_file(entry.path()).ok();
            count += 1;
        }
    }

    let mut cache = METADATA_CACHE.lock().unwrap();
    cache.clear();

    Ok(count)
}
