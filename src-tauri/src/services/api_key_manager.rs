use crate::AppState;
use tauri::State;

pub struct ApiKeyManager;

impl ApiKeyManager {
    pub fn get_curseforge_key(state: &State<'_, AppState>) -> Option<String> {
        // 1. Try to get from Database
        if let Ok(db) = state.db.lock() {
            if let Ok(Some(key)) = db.get_setting("curseforge_api_key") {
                if !key.trim().is_empty() {
                    return Some(key.trim().to_string());
                }
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
}
