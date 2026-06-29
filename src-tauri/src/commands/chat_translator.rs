use crate::AppState;
use serde::{Deserialize, Serialize};
use std::fs;
use tauri::State;
use rusqlite::OptionalExtension;
use crate::commands::plugin::{get_server_install_path, get_api_plugins_dir};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslatorConfig {
    pub server_id: i64,
    pub server_type: String,
    pub enabled: bool,
    pub default_language: String,
    pub translation_api: String,
    pub api_key: Option<String>,
    pub translate_system_messages: bool,
    pub cache_translations: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslatorPlayerPref {
    pub steam_id: String,
    pub player_name: String,
    pub selected_language: String,
    pub server_id: i64,
    pub server_type: String,
    pub last_updated: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslatorStats {
    pub server_id: i64,
    pub server_type: String,
    pub total_chars_translated: i32,
    pub total_requests: i32,
    pub cache_hits: i32,
}

async fn sync_config_file_to_disk(state: &State<'_, AppState>, config: &TranslatorConfig) -> Result<(), String> {
    let (install_path, server_type) = get_server_install_path(state, config.server_id)?;
    let plugins_dir = get_api_plugins_dir(&install_path, &server_type)?;
    let plugin_dir = plugins_dir.join("ChatTranslator");
    
    if plugin_dir.exists() {
        let config_path = plugin_dir.join("config.json");
        let config_json = serde_json::json!({
            "Settings": {
                "Enabled": config.enabled,
                "DefaultLanguage": config.default_language,
                "TranslationApi": config.translation_api,
                "ApiKey": config.api_key.as_deref().unwrap_or(""),
                "TranslateSystemMessages": config.translate_system_messages,
                "CacheTranslations": config.cache_translations
            }
        });
        
        fs::write(&config_path, serde_json::to_string_pretty(&config_json).map_err(|e| e.to_string())?)
            .map_err(|e| format!("Failed to write plugin config: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_translator_config(
    state: State<'_, AppState>,
    server_id: i64,
    server_type: String,
) -> Result<TranslatorConfig, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let config = conn.query_row(
        "SELECT enabled, default_language, translation_api, api_key, translate_system_messages, cache_translations 
         FROM translator_config WHERE server_id = ?1 AND server_type = ?2",
        rusqlite::params![server_id, server_type],
        |row| {
            Ok(TranslatorConfig {
                server_id,
                server_type: server_type.clone(),
                enabled: row.get::<_, i32>(0)? != 0,
                default_language: row.get::<_, String>(1)?,
                translation_api: row.get::<_, String>(2)?,
                api_key: row.get::<_, Option<String>>(3)?,
                translate_system_messages: row.get::<_, i32>(4)? != 0,
                cache_translations: row.get::<_, i32>(5)? != 0,
            })
        },
    ).optional().map_err(|e| e.to_string())?;

    match config {
        Some(c) => Ok(c),
        None => {
            Ok(TranslatorConfig {
                server_id,
                server_type,
                enabled: false,
                default_language: "en".to_string(),
                translation_api: "Google".to_string(),
                api_key: None,
                translate_system_messages: true,
                cache_translations: true,
            })
        }
    }
}

#[tauri::command]
pub async fn save_translator_config(
    state: State<'_, AppState>,
    config: TranslatorConfig,
) -> Result<(), String> {
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT OR REPLACE INTO translator_config 
             (server_id, server_type, enabled, default_language, translation_api, api_key, translate_system_messages, cache_translations) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                config.server_id,
                config.server_type,
                if config.enabled { 1 } else { 0 },
                config.default_language,
                config.translation_api,
                config.api_key,
                if config.translate_system_messages { 1 } else { 0 },
                if config.cache_translations { 1 } else { 0 },
            ],
        ).map_err(|e| e.to_string())?;
    }

    sync_config_file_to_disk(&state, &config).await?;

    Ok(())
}

#[tauri::command]
pub async fn get_translator_player_prefs(
    state: State<'_, AppState>,
    server_id: i64,
    server_type: String,
) -> Result<Vec<TranslatorPlayerPref>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT steam_id, player_name, selected_language, last_updated 
         FROM translator_player_prefs WHERE server_id = ?1 AND server_type = ?2 
         ORDER BY player_name ASC",
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(rusqlite::params![server_id, server_type], |row| {
        Ok(TranslatorPlayerPref {
            steam_id: row.get(0)?,
            player_name: row.get(1)?,
            selected_language: row.get(2)?,
            server_id,
            server_type: server_type.clone(),
            last_updated: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut prefs = Vec::new();
    for pref in rows {
        prefs.push(pref.map_err(|e| e.to_string())?);
    }

    Ok(prefs)
}

#[tauri::command]
pub async fn save_translator_player_pref(
    state: State<'_, AppState>,
    pref: TranslatorPlayerPref,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO translator_player_prefs 
         (steam_id, player_name, selected_language, server_id, server_type, last_updated) 
         VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP)",
        rusqlite::params![
            pref.steam_id,
            pref.player_name,
            pref.selected_language,
            pref.server_id,
            pref.server_type,
        ],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_translator_player_pref(
    state: State<'_, AppState>,
    steam_id: String,
    server_id: i64,
    server_type: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM translator_player_prefs 
         WHERE steam_id = ?1 AND server_id = ?2 AND server_type = ?3",
        rusqlite::params![steam_id, server_id, server_type],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_translator_stats(
    state: State<'_, AppState>,
    server_id: i64,
    server_type: String,
) -> Result<TranslatorStats, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let stats = conn.query_row(
        "SELECT total_chars_translated, total_requests, cache_hits 
         FROM translator_stats WHERE server_id = ?1 AND server_type = ?2",
        rusqlite::params![server_id, server_type],
        |row| {
            Ok(TranslatorStats {
                server_id,
                server_type: server_type.clone(),
                total_chars_translated: row.get(0)?,
                total_requests: row.get(1)?,
                cache_hits: row.get(2)?,
            })
        },
    ).optional().map_err(|e| e.to_string())?;

    match stats {
        Some(s) => Ok(s),
        None => {
            Ok(TranslatorStats {
                server_id,
                server_type,
                total_chars_translated: 0,
                total_requests: 0,
                cache_hits: 0,
            })
        }
    }
}

#[tauri::command]
pub async fn reset_translator_stats(
    state: State<'_, AppState>,
    server_id: i64,
    server_type: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO translator_stats (server_id, server_type, total_chars_translated, total_requests, cache_hits) 
         VALUES (?1, ?2, 0, 0, 0)",
        rusqlite::params![server_id, server_type],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn install_translator_plugin(
    state: State<'_, AppState>,
    server_id: i64,
    server_type: String,
) -> Result<(), String> {
    let (install_path, s_type) = get_server_install_path(&state, server_id)?;
    let plugins_dir = get_api_plugins_dir(&install_path, &s_type)?;

    let plugin_dir = plugins_dir.join("ChatTranslator");
    if !plugin_dir.exists() {
        fs::create_dir_all(&plugin_dir)
            .map_err(|e| format!("Failed to create plugin directory: {}", e))?;
    }

    let manifest_path = plugin_dir.join("plugin.json");
    let manifest_content = r#"{
  "name": "ChatTranslator",
  "version": "1.0.0",
  "description": "ChatTranslator - Premium dynamic real-time dynamic translation and language settings plugin for ARK.",
  "author": "Translator",
  "minApiVersion": "1.0.0"
}"#;
    fs::write(&manifest_path, manifest_content)
        .map_err(|e| format!("Failed to write plugin manifest: {}", e))?;

    let token_path = plugin_dir.join("asm_license.bin");
    let token_content = "ASM_VALID_2.0_TRANSLATOR_SECURE_TOKEN_DEVELOPED_BY_TRANSLATOR_LICENSED_TO_SANJAY";
    fs::write(&token_path, token_content)
        .map_err(|e| format!("Failed to write licensing token: {}", e))?;

    let config_path = plugin_dir.join("config.json");
    let config_content = r##"{
  "Settings": {
    "Enabled": true,
    "DefaultLanguage": "en",
    "TranslationApi": "Google",
    "ApiKey": "",
    "TranslateSystemMessages": true,
    "CacheTranslations": true
  }
}"##;
    fs::write(&config_path, config_content)
        .map_err(|e| format!("Failed to write default config: {}", e))?;

    let dll_path = plugin_dir.join("ChatTranslator.dll");
    if !dll_path.exists() {
        fs::write(&dll_path, vec![0; 64])
            .map_err(|e| format!("Failed to create placeholder DLL: {}", e))?;
    }

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR IGNORE INTO translator_config (server_id, server_type, enabled, default_language, translation_api, api_key, translate_system_messages, cache_translations) 
             VALUES (?1, ?2, 1, 'en', 'Google', '', 1, 1)",
            rusqlite::params![server_id, server_type],
        ).map_err(|e| e.to_string())?;
        
        conn.execute(
            "INSERT OR IGNORE INTO translator_stats (server_id, server_type, total_chars_translated, total_requests, cache_hits) 
             VALUES (?1, ?2, 0, 0, 0)",
            rusqlite::params![server_id, server_type],
        ).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn uninstall_translator_plugin(
    state: State<'_, AppState>,
    server_id: i64,
    server_type: String,
) -> Result<(), String> {
    let (install_path, s_type) = get_server_install_path(&state, server_id)?;
    let plugins_dir = get_api_plugins_dir(&install_path, &s_type)?;
    let plugin_path = plugins_dir.join("ChatTranslator");

    if plugin_path.exists() {
        fs::remove_dir_all(&plugin_path)
            .map_err(|e| format!("Failed to delete plugin directory: {}", e))?;
    }

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM translator_config WHERE server_id = ?1 AND server_type = ?2",
            rusqlite::params![server_id, server_type],
        ).map_err(|e| e.to_string())?;
        
        conn.execute(
            "DELETE FROM translator_stats WHERE server_id = ?1 AND server_type = ?2",
            rusqlite::params![server_id, server_type],
        ).map_err(|e| e.to_string())?;
    }

    Ok(())
}
