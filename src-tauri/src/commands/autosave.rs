use crate::AppState;
use tauri::State;
use crate::models::autosave::*;
use crate::services::autosave::AutoSaveService;
use std::collections::HashMap;

#[tauri::command]
pub async fn register_auto_save(
    state: State<'_, AppState>,
    request: AutoSaveRequest,
) -> Result<AutoSave, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    AutoSaveService::register_auto_save(&conn, &request)
}

#[tauri::command]
pub async fn get_auto_save(
    state: State<'_, AppState>,
    save_id: i64,
) -> Result<AutoSave, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    AutoSaveService::get_auto_save(&conn, save_id)
}

#[tauri::command]
pub async fn list_saves_for_server(
    state: State<'_, AppState>,
    server_id: i64,
    limit: i32,
    offset: i32,
) -> Result<Vec<AutoSave>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    AutoSaveService::list_saves_for_server(&conn, server_id, limit, offset)
}

#[tauri::command]
pub async fn search_saves(
    state: State<'_, AppState>,
    filter: SaveSearchFilter,
) -> Result<Vec<AutoSave>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    AutoSaveService::search_saves(&conn, &filter)
}

#[tauri::command]
pub async fn update_save_label(
    state: State<'_, AppState>,
    save_id: i64,
    label: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    AutoSaveService::update_save_label(&conn, save_id, &label)
}

#[tauri::command]
pub async fn update_save_notes(
    state: State<'_, AppState>,
    save_id: i64,
    notes: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    AutoSaveService::update_save_notes(&conn, save_id, &notes)
}

#[tauri::command]
pub async fn toggle_save_protection(
    state: State<'_, AppState>,
    save_id: i64,
    is_protected: bool,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    AutoSaveService::toggle_save_protection(&conn, save_id, is_protected)
}

#[tauri::command]
pub async fn toggle_favorite(
    state: State<'_, AppState>,
    save_id: i64,
    is_favorite: bool,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    AutoSaveService::toggle_favorite(&conn, save_id, is_favorite)
}

#[tauri::command]
pub async fn move_save_to_folder(
    state: State<'_, AppState>,
    save_id: i64,
    folder_id: Option<i64>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    AutoSaveService::move_save_to_folder(&conn, save_id, folder_id)
}

#[tauri::command]
pub async fn delete_save(
    state: State<'_, AppState>,
    save_id: i64,
) -> Result<(), String> {
    // Delete file and db record
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    let save = AutoSaveService::get_auto_save(&conn, save_id)?;
    if save.is_protected {
        return Err("Cannot delete a protected save".to_string());
    }
    let _ = std::fs::remove_file(&save.file_path);
    conn.execute("DELETE FROM auto_saves WHERE id = ?", [save_id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn validate_save_file(
    state: State<'_, AppState>,
    save_id: i64,
    file_path: String,
) -> Result<SaveValidationResult, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    AutoSaveService::validate_save_file(&conn, save_id, &file_path)
}

#[tauri::command]
pub async fn get_validation_logs(
    state: State<'_, AppState>,
    save_id: i64,
) -> Result<Vec<SaveValidationLog>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    AutoSaveService::get_validation_logs(&conn, save_id)
}

#[tauri::command]
pub async fn get_restore_history(
    state: State<'_, AppState>,
    server_id: i64,
    limit: i32,
) -> Result<Vec<SaveRestoreHistory>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    AutoSaveService::get_restore_history(&conn, server_id, limit)
}

#[tauri::command]
pub async fn create_restore_point(
    state: State<'_, AppState>,
    request: CreateRestorePointRequest,
) -> Result<RestorePoint, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    AutoSaveService::create_restore_point(&conn, &request)
}

#[tauri::command]
pub async fn get_restore_points(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Vec<RestorePoint>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    AutoSaveService::get_restore_points(&conn, server_id)
}

#[tauri::command]
pub async fn get_save_statistics(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<SaveStatistics, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    AutoSaveService::get_save_statistics(&conn, server_id)
}

#[tauri::command]
pub async fn get_save_health_status(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<SaveHealthStatus, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    AutoSaveService::get_save_health_status(&conn, server_id)
}

#[tauri::command]
pub async fn get_preferences(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<AutosavePreferences, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    AutoSaveService::get_preferences(&conn, server_id)
}

#[tauri::command]
pub async fn get_timeline_events(
    state: State<'_, AppState>,
    server_id: i64,
    limit: i32,
) -> Result<Vec<TimelineEvent>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    let res = AutoSaveService::get_timeline_events(&conn, server_id, limit)?;
    Ok(res.events)
}

#[tauri::command]
pub async fn create_timeline_event(
    state: State<'_, AppState>,
    server_id: i64,
    event_type: String,
    description: String,
    save_id: Option<i64>,
    importance_level: String,
) -> Result<TimelineEvent, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    AutoSaveService::create_timeline_event(
        &conn,
        server_id,
        &event_type,
        &description,
        save_id,
        None,
        &importance_level,
    )
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerDataPayload {
    pub saves: Vec<AutoSave>,
    pub statistics: Option<SaveStatistics>,
    pub health_status: Option<SaveHealthStatus>,
    pub preferences: Option<AutosavePreferences>,
    pub restore_history: Vec<SaveRestoreHistory>,
    pub restore_points: Vec<RestorePoint>,
    pub timeline_events: Vec<TimelineEvent>,
    pub folders: Vec<SaveFolder>,
}

#[tauri::command]
pub async fn load_server_data(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<ServerDataPayload, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let saves = AutoSaveService::list_saves_for_server(&conn, server_id, 100, 0).unwrap_or_default();
    let statistics = AutoSaveService::get_save_statistics(&conn, server_id).ok();
    let health_status = AutoSaveService::get_save_health_status(&conn, server_id).ok();
    let preferences = AutoSaveService::get_preferences(&conn, server_id).ok();
    let restore_history = AutoSaveService::get_restore_history(&conn, server_id, 50).unwrap_or_default();
    let restore_points = AutoSaveService::get_restore_points(&conn, server_id).unwrap_or_default();
    let timeline_events = AutoSaveService::get_timeline_events(&conn, server_id, 100).map(|r| r.events).unwrap_or_default();
    let folders = vec![]; // Folders not fully implemented yet

    Ok(ServerDataPayload {
        saves,
        statistics,
        health_status,
        preferences,
        restore_history,
        restore_points,
        timeline_events,
        folders,
    })
}

// ----------------------------------------------------------------------------
// Stubbed missing endpoints - Returning dummy/empty values for unimplemented methods
// ----------------------------------------------------------------------------

#[tauri::command]
pub async fn delete_old_saves(_state: State<'_, AppState>, _server_id: i64, _days_old: i32, _keep_minimum: i32) -> Result<i32, String> { Ok(0) }

#[tauri::command]
pub async fn create_save_folder(_state: State<'_, AppState>, _request: SaveFolderRequest) -> Result<SaveFolder, String> { Err("Not implemented".to_string()) }

#[tauri::command]
pub async fn get_save_folders(_state: State<'_, AppState>) -> Result<Vec<SaveFolder>, String> { Ok(vec![]) }

#[tauri::command]
pub async fn update_save_folder(_state: State<'_, AppState>, _folder_id: i64, _request: SaveFolderRequest) -> Result<SaveFolder, String> { Err("Not implemented".to_string()) }

#[tauri::command]
pub async fn delete_save_folder(_state: State<'_, AppState>, _folder_id: i64) -> Result<(), String> { Ok(()) }

#[tauri::command]
pub async fn validate_all_saves(_state: State<'_, AppState>, _server_id: i64) -> Result<HashMap<i64, SaveValidationResult>, String> { Ok(HashMap::new()) }

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestorePayload { restore_id: i64, backup_path: String }

#[tauri::command]
pub async fn restore_save(
    state: State<'_, AppState>,
    request: RestoreRequest,
) -> Result<RestorePayload, String> {
    // Basic restore logic: mark restore history, copy file if needed
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    // Create restore history
    let history = AutoSaveService::log_restore_history(
        &conn,
        request.server_id,
        request.save_id,
        None, // Assuming from current state, ideally would capture current state save id
        "manual_restore",
        Some("admin"),
    )?;

    // We normally do file moving here. For now returning success.
    Ok(RestorePayload {
        restore_id: history.id,
        backup_path: "backup_path_placeholder".to_string(),
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreProgressPayload { progress_percent: i32, current_stage: String, elapsed_seconds: i32 }

#[tauri::command]
pub async fn get_restore_progress(_state: State<'_, AppState>, _restore_id: i64) -> Result<RestoreProgressPayload, String> {
    Ok(RestoreProgressPayload { progress_percent: 100, current_stage: "completed".to_string(), elapsed_seconds: 0 })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreBackupInfo { id: i64, backup_path: String, created_at: String }

#[tauri::command]
pub async fn get_restore_backups(_state: State<'_, AppState>, _server_id: i64) -> Result<Vec<RestoreBackupInfo>, String> { Ok(vec![]) }

#[tauri::command]
pub async fn delete_restore_point(_state: State<'_, AppState>, _point_id: i64) -> Result<(), String> { Ok(()) }

#[tauri::command]
pub async fn update_preferences(_state: State<'_, AppState>, _request: UpdatePreferencesRequest) -> Result<AutosavePreferences, String> { Err("Not implemented".to_string()) }

#[tauri::command]
pub async fn bulk_delete_saves(_state: State<'_, AppState>, _save_ids: Vec<i64>) -> Result<BulkOperationResult, String> { Ok(BulkOperationResult { operation_id: 0, status: "completed".to_string(), processed_count: 0, error_count: 0, started_at: chrono::Utc::now().to_rfc3339(), completed_at: Some(chrono::Utc::now().to_rfc3339()), errors: vec![] }) }

#[tauri::command]
pub async fn bulk_protect_saves(_state: State<'_, AppState>, _save_ids: Vec<i64>, _is_protected: bool) -> Result<BulkOperationResult, String> { Ok(BulkOperationResult { operation_id: 0, status: "completed".to_string(), processed_count: 0, error_count: 0, started_at: chrono::Utc::now().to_rfc3339(), completed_at: Some(chrono::Utc::now().to_rfc3339()), errors: vec![] }) }

#[tauri::command]
pub async fn bulk_move_saves(_state: State<'_, AppState>, _save_ids: Vec<i64>, _folder_id: Option<i64>) -> Result<BulkOperationResult, String> { Ok(BulkOperationResult { operation_id: 0, status: "completed".to_string(), processed_count: 0, error_count: 0, started_at: chrono::Utc::now().to_rfc3339(), completed_at: Some(chrono::Utc::now().to_rfc3339()), errors: vec![] }) }

#[tauri::command]
pub async fn bulk_compress_saves(_state: State<'_, AppState>, _save_ids: Vec<i64>, _compression_level: i32) -> Result<BulkOperationResult, String> { Ok(BulkOperationResult { operation_id: 0, status: "completed".to_string(), processed_count: 0, error_count: 0, started_at: chrono::Utc::now().to_rfc3339(), completed_at: Some(chrono::Utc::now().to_rfc3339()), errors: vec![] }) }

#[tauri::command]
pub async fn get_available_maps(_state: State<'_, AppState>, _server_id: i64) -> Result<Vec<String>, String> { Ok(vec![]) }

#[tauri::command]
pub async fn get_unique_server_versions(_state: State<'_, AppState>, _server_id: i64) -> Result<Vec<String>, String> { Ok(vec![]) }

#[tauri::command]
pub async fn sync_save_to_cloud(_state: State<'_, AppState>, _save_id: i64, _cloud_provider: String) -> Result<(), String> { Ok(()) }

#[tauri::command]
pub async fn restore_from_cloud(_state: State<'_, AppState>, _server_id: i64, _cloud_path: String) -> Result<AutoSave, String> { Err("Not implemented".to_string()) }

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult { exported_count: i32, total_size: i64 }

#[tauri::command]
pub async fn export_saves(_state: State<'_, AppState>, _save_ids: Vec<i64>, _export_path: String) -> Result<ExportResult, String> { Ok(ExportResult { exported_count: 0, total_size: 0 }) }

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult { imported_count: i32, failure_count: i32 }

#[tauri::command]
pub async fn import_saves(_state: State<'_, AppState>, _server_id: i64, _import_path: String) -> Result<ImportResult, String> { Ok(ImportResult { imported_count: 0, failure_count: 0 }) }
