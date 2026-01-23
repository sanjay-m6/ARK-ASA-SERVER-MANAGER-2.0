use crate::models::ModInfo;
use reqwest::Client;
use scraper::{Html, Selector};
use serde::Deserialize;
use std::error::Error;

const CURSEFORGE_API_URL: &str = "https://api.curseforge.com/v1";

#[derive(Debug, Deserialize)]
struct CurseForgeSearchResponse {
    data: Vec<CurseForgeMod>,
}

#[derive(Debug, Deserialize)]
struct CurseForgeMod {
    id: i32,
    name: String,
    summary: String,
    authors: Vec<CurseForgeAuthor>,
    logo: Option<CurseForgeImage>,
    links: CurseForgeLinks,
    #[serde(rename = "downloadCount")]
    download_count: f64,
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

/// Search CurseForge for ASA mods
/// This is the primary mod source for ARK: Survival Ascended
pub async fn search_curseforge(
    query: &str,
    api_key: Option<String>,
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
        }]);
    }

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()?;

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
            })
            .collect());
    }

    // ARK Survival Ascended Game ID on CurseForge
    // Primary ID: 83374 (ARK: Survival Ascended)
    let game_id = 83374;

    let url = if query.is_empty() || query.len() < 2 {
        // If no search query, get popular mods
        format!(
            "{}/mods/search?gameId={}&sortField=2&sortOrder=desc&pageSize=20",
            CURSEFORGE_API_URL, game_id
        )
    } else {
        format!(
            "{}/mods/search?gameId={}&searchFilter={}&sortField=2&sortOrder=desc&pageSize=20",
            CURSEFORGE_API_URL, game_id, query
        )
    };

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
                                                    .first()
                                                    .map(|a| a.name.clone()),
                                                version: None,
                                                downloads: Some(cf_mod.download_count as i64),
                                                description: Some(cf_mod.summary),
                                                thumbnail_url: cf_mod.logo.map(|l| l.thumbnail_url),
                                                curseforge_url: Some(cf_mod.links.website_url),
                                                enabled: false,
                                                load_order: 0,
                                                last_updated: cf_mod.date_modified,
                                            })
                                            .collect();

                                        return Ok(mods);
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
                    // Invalid API key - don't retry
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
    let client = Client::new();
    let resp = client.get(&url).header("x-api-key", api_key).send().await?;

    if !resp.status().is_success() {
        return Ok("Failed to load description".to_string());
    }

    let body: StringResponse = resp.json().await?;
    Ok(body.data)
}

/// Deprecated: Steam Workshop search (kept for reference only, ASA uses CurseForge)
#[allow(dead_code)]
pub async fn search_steam_workshop(query: &str) -> Result<Vec<ModInfo>, Box<dyn Error>> {
    let client = Client::new();

    // If query is generic (like 'ark'), show trending instead of text search
    let url = if query.len() <= 3 {
        "https://steamcommunity.com/workshop/browse/?appid=346110&browsesort=trend&section=readytouseitems".to_string()
    } else {
        format!(
            "https://steamcommunity.com/workshop/browse/?appid=346110&searchtext={}&childpublishedfileid=0&browsesort=textsearch&section=items",
            query
        )
    };

    let html = client.get(&url).send().await?.text().await?;
    let document = Html::parse_document(&html);

    let item_selector = Selector::parse(".workshopItem").unwrap();
    let title_selector = Selector::parse(".workshopItemTitle").unwrap();
    let author_selector = Selector::parse(".workshopItemAuthorName a").unwrap();
    let link_selector = Selector::parse("a.ugc").unwrap();
    let image_selector = Selector::parse(".workshopItemPreviewImage").unwrap();

    let mut mods = Vec::new();

    for element in document.select(&item_selector) {
        let title = element
            .select(&title_selector)
            .next()
            .map(|e| e.text().collect::<String>())
            .unwrap_or_default();
        let author = element
            .select(&author_selector)
            .next()
            .map(|e| e.text().collect::<String>())
            .unwrap_or_default();

        let link_element = element.select(&link_selector).next();
        let workshop_url = link_element
            .and_then(|e| e.value().attr("href"))
            .unwrap_or_default()
            .to_string();

        let id = workshop_url
            .split("id=")
            .nth(1)
            .and_then(|s| s.split('&').next())
            .unwrap_or_default()
            .to_string();
        let thumbnail_url = element
            .select(&image_selector)
            .next()
            .and_then(|e| e.value().attr("src"))
            .unwrap_or_default()
            .to_string();

        if !id.is_empty() {
            mods.push(ModInfo {
                id,
                curseforge_id: None,
                name: title,
                author: Some(author),
                version: None,
                downloads: None,
                description: Some("Steam Workshop Mod (deprecated)".to_string()),
                thumbnail_url: Some(thumbnail_url),
                curseforge_url: Some(workshop_url),
                enabled: false,
                load_order: 0,
                last_updated: None,
            });
        }
    }

    Ok(mods)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_search_curseforge_no_key() {
        // Ensure env var is unset
        std::env::remove_var("CURSEFORGE_API_KEY");
        let results = search_curseforge("dino", None).await;
        assert!(results.is_ok());
        let mods = results.unwrap();
        assert_eq!(mods.len(), 1);
        assert_eq!(mods[0].name, "API Key Missing");
    }
}
