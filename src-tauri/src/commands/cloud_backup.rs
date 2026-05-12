use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use crate::services::cloud_backup_service::{CloudBackupService, CloudBackupSettings, CloudProviderConfig};

#[tauri::command]
pub async fn get_cloud_backup_settings(
    _cloud_service: State<'_, Arc<CloudBackupService>>,
) -> Result<CloudBackupSettings, String> {
    // In a real app, you would load this from the DB instead of just relying on the service state.
    // For now, we will return the current in-memory settings.
    Ok(CloudBackupSettings::default())
}

#[tauri::command]
pub async fn save_cloud_backup_settings(
    settings: CloudBackupSettings,
    cloud_service: State<'_, Arc<CloudBackupService>>,
) -> Result<(), String> {
    cloud_service.update_settings(settings).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn test_cloud_provider_connection(
    config: CloudProviderConfig,
    cloud_service: State<'_, Arc<CloudBackupService>>,
) -> Result<(), String> {
    cloud_service.initialize_provider(config).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_cloud_backups(
    server_id: String,
    cloud_service: State<'_, Arc<CloudBackupService>>,
) -> Result<Vec<String>, String> {
    cloud_service.list_backups(&server_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn trigger_manual_cloud_backup(
    server_id: String,
    local_backup_path: String,
    cloud_service: State<'_, Arc<CloudBackupService>>,
) -> Result<(), String> {
    let path = PathBuf::from(local_backup_path);
    cloud_service.upload_backup(&server_id, &path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_cloud_backup(
    remote_path: String,
    target_extraction_path: String,
    cloud_service: State<'_, Arc<CloudBackupService>>,
) -> Result<(), String> {
    let path = PathBuf::from(target_extraction_path);
    cloud_service.download_and_restore_backup(&remote_path, &path).await.map_err(|e| e.to_string())
}
