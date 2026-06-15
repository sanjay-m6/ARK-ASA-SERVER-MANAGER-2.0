use crate::AppState;

pub struct ApiKeyManager;

impl ApiKeyManager {
    pub fn get_curseforge_key(state: &AppState) -> Option<String> {
        // 1. Try to get from Database
        let db = state.db.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Ok(Some(key)) = db.get_setting("curseforge_api_key") {
            if !key.trim().is_empty() {
                return Some(key.trim().to_string());
            }
        }

        // 2. Fallback to Environment Variable
        if let Ok(key) = std::env::var("CURSEFORGE_API_KEY") {
            if !key.trim().is_empty() {
                return Some(key.trim().to_string());
            }
        }

        None
    }

    pub fn get_steam_key(state: &AppState) -> Option<String> {
        // 1. Try to get from Database
        let db = state.db.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Ok(Some(key)) = db.get_setting("steam_api_key") {
            if !key.trim().is_empty() {
                return Some(key.trim().to_string());
            }
        }

        // 2. Fallback to Environment Variable
        if let Ok(key) = std::env::var("STEAM_API_KEY") {
            if !key.trim().is_empty() {
                return Some(key.trim().to_string());
            }
        }

        None
    }
}
