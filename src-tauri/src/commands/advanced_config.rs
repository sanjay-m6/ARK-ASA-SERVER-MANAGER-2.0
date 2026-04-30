use crate::services::advanced_config::EventProfile;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_event_profiles(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Vec<EventProfile>, String> {
    state.advanced_config.get_event_profiles(server_id)
}

#[tauri::command]
pub async fn save_event_profile(
    state: State<'_, AppState>,
    profile: EventProfile,
) -> Result<i64, String> {
    state.advanced_config.save_event_profile(profile)
}

#[tauri::command]
pub async fn activate_event_profile(
    state: State<'_, AppState>,
    server_id: i64,
    profile_id: Option<i64>,
) -> Result<(), String> {
    state
        .advanced_config
        .activate_profile(server_id, profile_id)
        .map_err(|e| e.to_string())?;

    // Regenerate server config to apply changes immediately
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    crate::services::config_generator::ConfigGenerator::generate_config(
        &state.app_handle,
        &conn,
        server_id,
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_transfer_policy(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Option<crate::services::advanced_config::TransferPolicy>, String> {
    state.advanced_config.get_transfer_policy(server_id)
}

#[tauri::command]
pub async fn save_transfer_policy(
    state: State<'_, AppState>,
    policy: crate::services::advanced_config::TransferPolicy,
) -> Result<i64, String> {
    let server_id = policy.server_id;
    let id = state
        .advanced_config
        .save_transfer_policy(policy)
        .map_err(|e| e.to_string())?;

    // Regenerate config to apply/remove NoTributeDownloads
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    crate::services::config_generator::ConfigGenerator::generate_config(
        &state.app_handle,
        &conn,
        server_id,
    )
    .map_err(|e| e.to_string())?;

    Ok(id)
}
