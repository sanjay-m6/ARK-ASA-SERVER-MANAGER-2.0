use crate::models::ModInfo;
use reqwest::Client;
// use scraper::{Html, Selector}; // Removed unused imports
use serde::Deserialize;
use std::error::Error;

const CURSEFORGE_API_URL: &str = "https://api.curseforge.com/v1";

#[derive(Debug, Deserialize)]
struct CurseForgeSearchResponse {
    data: Vec<CurseForgeMod>,
}

#[derive(Debug, Deserialize)]
struct CurseForgeGetModResponse {
    data: CurseForgeMod,
}

#[derive(Debug, Deserialize)]
struct CurseForgeCategoryResponse {
    data: Vec<CurseForgeCategory>,
}

#[derive(Debug, Deserialize, serde::Serialize)]
pub struct CurseForgeCategory {
    pub id: i32,
    pub name: String,
    #[serde(rename = "iconUrl")]
    pub icon_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CurseForgeMod {
    id: i32,
    #[serde(rename = "gameId")]
    game_id: i32,
    name: String,
    summary: Option<String>,
    authors: Option<Vec<CurseForgeAuthor>>,
    logo: Option<CurseForgeImage>,
    links: Option<CurseForgeLinks>,
    #[serde(rename = "downloadCount")]
    download_count: Option<f64>,
    #[serde(rename = "dateModified")]
    date_modified: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CurseForgeAuthor {
    name: String,
}

#[derive(Debug, Deserialize)]
struct CurseForgeImage {
    #[serde(rename = "thumbnailUrl")]
    thumbnail_url: String,
}

#[derive(Debug, Deserialize)]
struct CurseForgeLinks {
    #[serde(rename = "websiteUrl")]
    website_url: String,
}

/// Get available categories for ASA
pub async fn get_categories(
    api_key: Option<String>,
) -> Result<Vec<CurseForgeCategory>, Box<dyn Error>> {
    let api_key = api_key
        .or_else(|| std::env::var("CURSEFORGE_API_KEY").ok())
        .unwrap_or_default();

    if api_key.trim().is_empty() {
        return Ok(vec![]);
    }

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;

    // Game ID for ASA = 83374
    let url = format!("{}/categories?gameId=83374", CURSEFORGE_API_URL);

    let resp = client.get(&url).header("x-api-key", api_key).send().await?;

    if resp.status().is_success() {
        let body = resp.text().await?;
        let cat_resp: CurseForgeCategoryResponse = serde_json::from_str(&body)?;
        // Filter out root categories if needed, or just return all
        // Usually we want Main categories.
        // For now return all, frontend can filter.
        Ok(cat_resp.data)
    } else {
        Ok(vec![])
    }
}

/// Search CurseForge for ASA mods
/// This is the primary mod source for ARK: Survival Ascended
pub async fn search_curseforge(
    query: &str,
    api_key: Option<String>,
    category_id: Option<i32>,
    sort_field: Option<i32>,
    sort_order: Option<String>,
) -> Result<Vec<ModInfo>, Box<dyn Error>> {
    let api_key = api_key
        .or_else(|| std::env::var("CURSEFORGE_API_KEY").ok())
        .unwrap_or_default();
    let api_key = api_key.trim();

    if api_key.is_empty() {
        return Ok(vec![ModInfo {
            id: "0".to_string(),
            curseforge_id: None,
            name: "API Key Missing".to_string(),
            author: Some("System".to_string()),
            version: None,
            downloads: None,
            description: Some(
                "Please add your CurseForge API Key in Settings to search ASA mods.".to_string(),
            ),
            thumbnail_url: None,
            curseforge_url: None,
            enabled: false,
            load_order: 0,
            last_updated: None,
            is_local: None,
        }]);
    }

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;

    // ARK Survival Ascended Game ID on CurseForge
    // Primary ID: 83374 (ARK: Survival Ascended)
    let game_id = 83374;

    // 1. Direct ID Lookup Logic
    // Only attempt if NO category filter is set, as ID is specific
    if category_id.is_none() {
        if let Ok(direct_id) = query.parse::<i32>() {
            println!(
                "  🔢 Query '{}' looks like an ID, attempting direct lookup...",
                query
            );
            let id_url = format!("{}/mods/{}", CURSEFORGE_API_URL, direct_id);

            match client
                .get(&id_url)
                .header("x-api-key", api_key)
                .send()
                .await
            {
                Ok(resp) => {
                    if resp.status().is_success() {
                        if let Ok(body_text) = resp.text().await {
                            if let Ok(mod_resp) =
                                serde_json::from_str::<CurseForgeGetModResponse>(&body_text)
                            {
                                let cf_mod = mod_resp.data;
                                // Verify it belongs to ASA (83374)
                                if cf_mod.game_id == game_id {
                                    println!(
                                        "  ✅ Found mod via Direct ID lookup: {}",
                                        cf_mod.name
                                    );
                                    return Ok(vec![ModInfo {
                                        id: cf_mod.id.to_string(),
                                        curseforge_id: Some(cf_mod.id as i64),
                                        name: cf_mod.name,
                                        author: cf_mod.authors.as_ref().and_then(|a| a.first()).map(|a| a.name.clone()),
                                        version: None,
                                        downloads: cf_mod.download_count.map(|d| d as i64),
                                        description: cf_mod.summary,
                                        thumbnail_url: cf_mod.logo.map(|l| l.thumbnail_url),
                                        curseforge_url: cf_mod.links.map(|l| l.website_url),
                                        enabled: false,
                                        load_order: 0,
                                        last_updated: cf_mod.date_modified,
                                        is_local: None,
                                    }]);
                                }
                            }
                        }
                    }
                }
                Err(_) => { /* Ignore direct lookup errors, fall back to search */ }
            }
        }
    }

    // SPECIAL DEBUG COMMAND:
    // SPECIAL DEBUG COMMAND:
    if query == "debug_games" {
        let url = format!("{}/games", CURSEFORGE_API_URL);
        let resp = client.get(&url).header("x-api-key", api_key).send().await?;
        let body_text = resp.text().await?;
        println!("Raw Games Response: {}", body_text);

        #[derive(Deserialize)]
        struct GameResponse {
            data: Vec<GameItem>,
        }
        #[derive(Deserialize)]
        struct GameItem {
            id: i32,
            name: String,
        }

        let games: GameResponse =
            serde_json::from_str(&body_text).unwrap_or(GameResponse { data: vec![] });

        return Ok(games
            .data
            .into_iter()
            .map(|g| ModInfo {
                id: g.id.to_string(),
                curseforge_id: Some(g.id as i64),
                name: format!("GAME: {} (ID: {})", g.name, g.id),
                author: Some("System".to_string()),
                version: None,
                downloads: None,
                description: Some(format!("Found Game ID: {}", g.id)),
                thumbnail_url: None,
                curseforge_url: None,
                enabled: false,
                load_order: 0,
                last_updated: None,
                is_local: None,
            })
            .collect());
    }

    // ... normal search logic ...
    let mut params = vec![format!("gameId={}", game_id), "pageSize=20".to_string()];

    if !query.is_empty() && query.len() >= 2 {
        params.push(format!("searchFilter={}", query));
    }

    if let Some(cat) = category_id {
        if cat > 0 {
            params.push(format!("categoryId={}", cat));
        }
    }

    // Default to Popularity (2) if not specified
    // 1=Featured, 2=Popularity, 3=LastUpdated, 4=Name, 5=Author, 6=TotalDownloads
    let sort = sort_field.unwrap_or(2);
    params.push(format!("sortField={}", sort));

    // Default to desc
    let order = sort_order.unwrap_or_else(|| "desc".to_string());
    params.push(format!("sortOrder={}", order));

    let url = format!("{}/mods/search?{}", CURSEFORGE_API_URL, params.join("&"));

    println!("  🔍 CurseForge search: {}", url);

    // Retry logic with exponential backoff
    let max_retries = 3;
    let mut last_error = String::from("Unknown error");

    for attempt in 0..max_retries {
        if attempt > 0 {
            let delay = std::time::Duration::from_millis(500 * 2u64.pow(attempt));
            println!("  ⏳ Retry attempt {} after {:?}", attempt + 1, delay);
            tokio::time::sleep(delay).await;
        }

        match client.get(&url).header("x-api-key", api_key).send().await {
            Ok(resp) => {
                let status = resp.status();
                if status.is_success() {
                    match resp.text().await {
                        Ok(body_text) => {
                            match serde_json::from_str::<CurseForgeSearchResponse>(&body_text) {
                                Ok(search_results) => {
                                    if !search_results.data.is_empty() {
                                        println!("  ✅ Found {} mods", search_results.data.len());

                                        let mods = search_results
                                            .data
                                            .into_iter()
                                            .map(|cf_mod| ModInfo {
                                                id: cf_mod.id.to_string(),
                                                curseforge_id: Some(cf_mod.id as i64),
                                                name: cf_mod.name,
                                                author: cf_mod
                                                    .authors
                                                    .as_ref()
                                                    .and_then(|a| a.first())
                                                    .map(|a| a.name.clone()),
                                                version: None,
                                                downloads: cf_mod.download_count.map(|d| d as i64),
                                                description: cf_mod.summary,
                                                thumbnail_url: cf_mod.logo.map(|l| l.thumbnail_url),
                                                curseforge_url: cf_mod.links.map(|l| l.website_url),
                                                enabled: false,
                                                load_order: 0,
                                                last_updated: cf_mod.date_modified,
                                                is_local: None,
                                            })
                                            .collect();

                                        return Ok(mods);
                                    } else {
                                        // Empty results is a valid result
                                        return Ok(vec![]);
                                    }
                                }
                                Err(e) => {
                                    last_error = format!("Failed to parse response: {}", e);
                                    println!("  ⚠️ {}", last_error);
                                }
                            }
                        }
                        Err(e) => {
                            last_error = format!("Failed to read response body: {}", e);
                            println!("  ⚠️ {}", last_error);
                        }
                    }
                } else if status.as_u16() == 401 || status.as_u16() == 403 {
                    // Invalid API key - don't retry, return specific error mod
                    return Ok(vec![ModInfo {
                        id: "0".to_string(),
                        curseforge_id: None,
                        name: "Invalid API Key".to_string(),
                        author: Some("System".to_string()),
                        version: None,
                        downloads: None,
                        description: Some(
                            "Your CurseForge API Key is invalid or expired. Please update it in Settings.".to_string(),
                        ),
                        thumbnail_url: None,
                        curseforge_url: Some("https://console.curseforge.com/".to_string()),
                        enabled: false,
                        load_order: 0,
                        last_updated: None,
                        is_local: None,
                    }]);
                } else if status.as_u16() == 429 {
                    // Rate limited - wait longer before retry
                    last_error = "Rate limited by CurseForge API".to_string();
                    println!("  ⚠️ Rate limited, waiting longer...");
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                } else {
                    last_error = format!("HTTP error: {}", status);
                    println!("  ⚠️ {}", last_error);
                }
            }
            Err(e) => {
                last_error = format!("Request failed: {}", e);
                println!("  ⚠️ {}", last_error);
            }
        }
    }

    // All retries failed
    println!("  ❌ All retries failed: {}", last_error);
    Ok(vec![ModInfo {
        id: "0".to_string(),
        curseforge_id: None,
        name: "Search Failed".to_string(),
        author: Some("System".to_string()),
        version: None,
        downloads: None,
        description: Some(format!(
            "Could not search CurseForge after {} attempts. Error: {}. Check your internet connection and API key.",
            max_retries, last_error
        )),
        thumbnail_url: None,
        curseforge_url: Some("https://www.curseforge.com/ark-survival-ascended".to_string()),
        enabled: false,
        load_order: 0,
        last_updated: None,
        is_local: None,
    }])
}

#[derive(Debug, Deserialize)]
struct StringResponse {
    data: String,
}

pub async fn get_mod_description(
    mod_id: i64,
    api_key: Option<String>,
) -> Result<String, Box<dyn Error>> {
    let api_key = api_key
        .or_else(|| std::env::var("CURSEFORGE_API_KEY").ok())
        .unwrap_or_default();

    if api_key.is_empty() {
        return Ok("API Key missing".to_string());
    }

    let url = format!("{}/mods/{}/description", CURSEFORGE_API_URL, mod_id);
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;
    let resp = client.get(&url).header("x-api-key", api_key).send().await?;

    if !resp.status().is_success() {
        return Ok("Failed to load description".to_string());
    }

    let body: StringResponse = resp.json().await?;
    Ok(body.data)
}

/// Verify if a CurseForge API key is valid by making a lightweight request
pub async fn verify_api_key(api_key: String) -> bool {
    if api_key.trim().is_empty() {
        return false;
    }

    let client = match Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };

    // Use the /games endpoint as a lightweight check
    let url = format!("{}/games?pageSize=1", CURSEFORGE_API_URL);

    match client.get(&url).header("x-api-key", api_key).send().await {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

#[derive(Debug, serde::Serialize)]
struct GetModsBody {
    #[serde(rename = "modIds")]
    mod_ids: Vec<i32>,
}

/// Check for updates for a list of mods
/// Returns the latest info for each mod found
pub async fn check_mod_updates(
    mod_ids: Vec<i32>,
    api_key: Option<String>,
) -> Result<Vec<ModInfo>, Box<dyn Error + Send + Sync>> {
    let api_key = api_key
        .or_else(|| std::env::var("CURSEFORGE_API_KEY").ok())
        .unwrap_or_default();

    if api_key.trim().is_empty() || mod_ids.is_empty() {
        return Ok(vec![]);
    }

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()?;

    let url = format!("{}/mods", CURSEFORGE_API_URL);
    let body = GetModsBody { mod_ids };

    let resp = client
        .post(&url)
        .header("x-api-key", api_key)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await?;

    if resp.status().is_success() {
        let body_text = resp.text().await?;
        let search_resp: CurseForgeSearchResponse = serde_json::from_str(&body_text)?;

        let mods = search_resp
            .data
            .into_iter()
            .map(|cf_mod| ModInfo {
                id: cf_mod.id.to_string(),
                curseforge_id: Some(cf_mod.id as i64),
                name: cf_mod.name,
                author: cf_mod.authors.as_ref().and_then(|a| a.first()).map(|a| a.name.clone()),
                version: None, // We could fetch latest file version here if needed
                downloads: cf_mod.download_count.map(|d| d as i64),
                description: cf_mod.summary,
                thumbnail_url: cf_mod.logo.map(|l| l.thumbnail_url),
                curseforge_url: cf_mod.links.map(|l| l.website_url),
                enabled: true,
                load_order: 0,
                last_updated: cf_mod.date_modified,
                is_local: None,
            })
            .collect();

        Ok(mods)
    } else {
        println!("❌ Failed to check mod updates: {}", resp.status());
        Ok(vec![])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_search_curseforge_no_key() {
        // Ensure env var is unset
        std::env::remove_var("CURSEFORGE_API_KEY");
        let results = search_curseforge("dino", None, None, None, None).await;
        assert!(results.is_ok());
        if let Ok(mods) = results {
            assert_eq!(mods.len(), 1);
            assert_eq!(mods[0].name, "API Key Missing");
        }
    }
}
