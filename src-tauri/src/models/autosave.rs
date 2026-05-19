#![allow(dead_code)]
// Auto-Save Management System Models
// Comprehensive data structures for save browsing, restoration, and management

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============================================================================
// Core Auto-Save Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoSave {
    pub id: i64,
    pub server_id: i64,
    pub file_name: String,
    pub file_path: String,
    pub file_size: i64,
    pub checksum: Option<String>,
    pub created_at: String,
    pub save_timestamp: Option<String>,
    pub is_valid: bool,
    pub is_corrupted: bool,
    pub corruption_reason: Option<String>,
    pub player_count: Option<i32>,
    pub uptime_seconds: Option<i32>,
    pub server_version: Option<String>,
    pub mod_count: Option<i32>,
    pub map_name: Option<String>,
    pub is_protected: bool,
    pub custom_label: Option<String>,
    pub notes: Option<String>,
    pub is_favorite: bool,
    pub folder_id: Option<i64>,
    pub created_by: Option<String>,
    pub indexed_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoSaveRequest {
    pub server_id: i64,
    pub file_name: String,
    pub file_path: String,
    pub file_size: i64,
    pub player_count: Option<i32>,
    pub uptime_seconds: Option<i32>,
    pub server_version: Option<String>,
    pub mod_count: Option<i32>,
    pub map_name: Option<String>,
}

// ============================================================================
// Save Folder Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFolder {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub color: String,
    pub parent_folder_id: Option<i64>,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip)]
    pub children: Vec<SaveFolder>,
    #[serde(skip)]
    pub save_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFolderRequest {
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub parent_folder_id: Option<i64>,
}

// ============================================================================
// Save Restore Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveRestoreHistory {
    pub id: i64,
    pub server_id: i64,
    pub from_save_id: Option<i64>,
    pub to_save_id: i64,
    pub restored_at: String,
    pub restored_by: Option<String>,
    pub restore_duration_seconds: Option<i32>,
    pub restore_method: String, // manual, automatic, scheduled, emergency
    pub success: bool,
    pub error_message: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreRequest {
    pub server_id: i64,
    pub save_id: i64,
    pub create_backup: bool,
    pub restore_method: String,
    pub skip_restart: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveBackupSnapshot {
    pub id: i64,
    pub server_id: i64,
    pub restore_history_id: Option<i64>,
    pub backup_path: String,
    pub backup_size: i64,
    pub created_at: String,
    pub is_valid: bool,
}

// ============================================================================
// Save Metadata Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveMetadata {
    pub id: i64,
    pub auto_save_id: i64,
    pub game_mode: Option<String>,
    pub difficulty_level: Option<String>,
    pub max_players: Option<i32>,
    pub current_players_list: Vec<String>,
    pub mods_list: Vec<ModInfo>,
    pub server_settings: HashMap<String, serde_json::Value>,
    pub world_statistics: HashMap<String, serde_json::Value>,
    pub creatures_count: Option<i32>,
    pub structures_count: Option<i32>,
    pub items_count: Option<i32>,
    pub parsed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModInfo {
    pub name: String,
    pub version: Option<String>,
    pub mod_id: Option<String>,
}

// ============================================================================
// Validation Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveValidationLog {
    pub id: i64,
    pub auto_save_id: i64,
    pub check_type: String, // integrity, corruption, completeness, compatibility
    pub check_status: String, // passed, failed, warning, skipped
    pub details: HashMap<String, String>,
    pub checked_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveValidationResult {
    pub is_valid: bool,
    pub is_corrupted: bool,
    pub corruption_reason: Option<String>,
    pub warnings: Vec<String>,
    pub errors: Vec<String>,
    pub file_size_ok: bool,
    pub checksum_ok: Option<bool>,
    pub compatible: bool,
}

// ============================================================================
// Restore Points Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestorePoint {
    pub id: i64,
    pub server_id: i64,
    pub auto_save_id: i64,
    pub point_name: String,
    pub description: Option<String>,
    pub point_type: String, // manual, scheduled, critical, post-crash
    pub created_at: String,
    pub is_protected: bool,
    pub created_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRestorePointRequest {
    pub server_id: i64,
    pub save_id: i64,
    pub point_name: String,
    pub description: Option<String>,
    pub point_type: Option<String>,
}

// ============================================================================
// Save Comparison Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveComparison {
    pub save_id_1: i64,
    pub save_id_2: i64,
    pub size_difference: i64,
    pub timestamp_difference_seconds: i64,
    pub player_count_difference: i32,
    pub uptime_difference_seconds: i32,
    pub mod_changes: ModChanges,
    pub setting_changes: Vec<SettingChange>,
    pub has_corruption_change: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModChanges {
    pub added_mods: Vec<String>,
    pub removed_mods: Vec<String>,
    pub updated_mods: Vec<ModUpdate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModUpdate {
    pub mod_name: String,
    pub old_version: String,
    pub new_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingChange {
    pub setting_name: String,
    pub old_value: String,
    pub new_value: String,
}

// ============================================================================
// Timeline Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineEvent {
    pub id: i64,
    pub server_id: i64,
    pub event_type: String, // save_created, restored, protected, deleted, validated
    pub auto_save_id: Option<i64>,
    pub restore_history_id: Option<i64>,
    pub event_time: String,
    pub description: String,
    pub metadata: HashMap<String, String>,
    pub importance_level: String, // low, normal, high, critical
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineResponse {
    pub events: Vec<TimelineEvent>,
    pub total_events: i32,
    pub server_id: i64,
}

// ============================================================================
// Archive and Compression Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveArchive {
    pub id: i64,
    pub server_id: i64,
    pub archive_path: String,
    pub archive_size: i64,
    pub save_ids: Vec<i64>,
    pub created_at: String,
    pub is_verified: bool,
    pub last_accessed: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressionRequest {
    pub server_id: i64,
    pub save_ids: Vec<i64>,
    pub compression_level: Option<i32>,
}

// ============================================================================
// Cloud Sync Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCloudSync {
    pub id: i64,
    pub auto_save_id: i64,
    pub cloud_path: Option<String>,
    pub sync_status: String, // pending, syncing, synced, failed
    pub last_sync_at: Option<String>,
    pub sync_error: Option<String>,
    pub cloud_version: Option<String>,
}

// ============================================================================
// Preferences Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutosavePreferences {
    pub id: i64,
    pub server_id: i64,
    pub auto_index_enabled: bool,
    pub auto_validate_enabled: bool,
    pub auto_compress_old_saves: bool,
    pub compress_after_days: i32,
    pub auto_cleanup_enabled: bool,
    pub cleanup_after_days: i32,
    pub keep_minimum_saves: i32,
    pub create_restore_points: bool,
    pub restore_point_frequency: String, // hourly, daily, weekly, manual
    pub notify_on_restore: bool,
    pub notify_on_corruption: bool,
    pub index_metadata: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePreferencesRequest {
    pub server_id: i64,
    pub auto_index_enabled: Option<bool>,
    pub auto_validate_enabled: Option<bool>,
    pub auto_compress_old_saves: Option<bool>,
    pub compress_after_days: Option<i32>,
    pub auto_cleanup_enabled: Option<bool>,
    pub cleanup_after_days: Option<i32>,
    pub keep_minimum_saves: Option<i32>,
    pub create_restore_points: Option<bool>,
    pub restore_point_frequency: Option<String>,
    pub notify_on_restore: Option<bool>,
    pub notify_on_corruption: Option<bool>,
    pub index_metadata: Option<bool>,
}

// ============================================================================
// Statistics and Analytics Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveStatistics {
    pub server_id: i64,
    pub total_saves: i32,
    pub protected_saves: i32,
    pub corrupted_saves: i32,
    pub total_storage_used: i64,
    pub oldest_save_date: Option<String>,
    pub newest_save_date: Option<String>,
    pub average_save_size: i64,
    pub total_restores: i32,
    pub last_restore_date: Option<String>,
    pub favorite_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveHealthStatus {
    pub health_score: f64, // 0-100
    pub status: String, // excellent, good, fair, poor, critical
    pub issues_count: i32,
    pub warnings: Vec<String>,
    pub recommendations: Vec<String>,
}

// ============================================================================
// Bulk Operation Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkSaveOperation {
    pub operation_type: String, // delete, protect, tag, compress, export
    pub save_ids: Vec<i64>,
    pub operation_data: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkOperationResult {
    pub operation_id: i64,
    pub status: String, // pending, in-progress, completed, failed
    pub processed_count: i32,
    pub error_count: i32,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub errors: Vec<String>,
}

// ============================================================================
// Search and Filter Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSearchFilter {
    pub search_query: Option<String>,
    pub server_id: Option<i64>,
    pub date_range: Option<DateRange>,
    pub status: Option<Vec<String>>, // valid, corrupted, protected, favorite
    pub map_names: Option<Vec<String>>,
    pub min_size: Option<i64>,
    pub max_size: Option<i64>,
    pub player_count_range: Option<(i32, i32)>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DateRange {
    pub start: String,
    pub end: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSortOptions {
    pub sort_by: String, // date, size, players, uptime, name
    pub sort_order: String, // asc, desc
}

// ============================================================================
// Restore Progress Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreProgress {
    pub restore_id: i64,
    pub progress_percent: i32,
    pub current_stage: String,
    pub stage_progress: i32,
    pub total_stages: i32,
    pub elapsed_seconds: i32,
    pub estimated_remaining_seconds: i32,
    pub bytes_processed: i64,
    pub bytes_total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    pub restore_id: i64,
    pub success: bool,
    pub duration_seconds: i32,
    pub message: String,
    pub restored_save_id: i64,
    pub backup_created_path: Option<String>,
    pub warnings: Vec<String>,
}
