#![allow(dead_code)]
// Server Organization Models for ARK Server Manager
// This module contains all data structures for the advanced server organization system

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============================================================================
// Server Folder and Organization Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerFolder {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub color: String,
    pub icon: Option<String>,
    pub parent_folder_id: Option<i64>,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub children: Vec<ServerFolder>,
    #[serde(default)]
    pub server_ids: Vec<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerFolderRequest {
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub parent_folder_id: Option<i64>,
}

// ============================================================================
// Server Archive/Inactive Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerArchive {
    pub id: i64,
    pub server_id: i64,
    pub archived_at: String,
    pub archive_reason: Option<String>,
    pub archived_by: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveRequest {
    pub server_id: i64,
    pub reason: Option<String>,
    pub notes: Option<String>,
}

// ============================================================================
// Server Customization Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerCustomization {
    pub server_id: i64,
    pub display_name: Option<String>,
    pub custom_icon: Option<String>,
    pub custom_banner: Option<String>,
    pub color_tag: Option<String>,
    pub is_pinned: bool,
    pub pin_order: i32,
    pub is_minimized: bool,
    pub tags: Vec<String>,
    pub favorite: bool,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomizationRequest {
    pub server_id: i64,
    pub display_name: Option<String>,
    pub custom_icon: Option<String>,
    pub custom_banner: Option<String>,
    pub color_tag: Option<String>,
    pub is_pinned: Option<bool>,
    pub tags: Option<Vec<String>>,
    pub favorite: Option<bool>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerTag {
    pub id: String,
    pub name: String,
    pub color: String,
}

// ============================================================================
// Dashboard Layout Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardLayout {
    pub id: i64,
    pub user_id: String,
    pub name: String,
    pub description: Option<String>,
    pub layout_type: String, // grid, list, compact, custom
    pub view_mode: String,   // expanded, compact, minimized
    pub is_default: bool,
    pub sections: Vec<LayoutSection>,
    pub filters: HashMap<String, serde_json::Value>,
    pub sort_by: String,
    pub sort_order: String,
    pub show_inactive: bool,
    pub show_archived: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutSection {
    pub id: String,
    pub name: String,
    pub section_type: String, // folder, group, favorites, recent, status
    pub visible: bool,
    pub position: i32,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub config: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardLayoutRequest {
    pub name: String,
    pub description: Option<String>,
    pub layout_type: Option<String>,
    pub view_mode: Option<String>,
    pub sections: Option<Vec<LayoutSection>>,
    pub filters: Option<HashMap<String, serde_json::Value>>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
    pub show_inactive: Option<bool>,
    pub show_archived: Option<bool>,
}

// ============================================================================
// Server Grouping Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerGroup {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub grouping_type: String, // custom, map, cluster, status
    pub criteria: serde_json::Value,
    pub sort_order: i32,
    pub color: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerGroupRequest {
    pub name: String,
    pub description: Option<String>,
    pub grouping_type: Option<String>,
    pub criteria: Option<serde_json::Value>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GroupingCriteria {
    Map(String),
    Cluster(i64),
    Status(String),
    Custom(HashMap<String, String>),
}

// ============================================================================
// Bulk Actions Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkAction {
    pub id: i64,
    pub action_type: String, // move, archive, delete, enable, disable, tag, color
    pub server_ids: Vec<i64>,
    pub action_data: serde_json::Value,
    pub status: String, // pending, in-progress, completed, failed
    pub created_at: String,
    pub executed_at: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkActionRequest {
    pub action_type: String,
    pub server_ids: Vec<i64>,
    pub action_data: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkMoveRequest {
    pub server_ids: Vec<i64>,
    pub target_folder_id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkArchiveRequest {
    pub server_ids: Vec<i64>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkTagRequest {
    pub server_ids: Vec<i64>,
    pub tags: Vec<String>,
}

// ============================================================================
// Server Activity and Analytics Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerActivityLog {
    pub id: i64,
    pub server_id: i64,
    pub activity_type: String,
    pub player_count: Option<i32>,
    pub uptime_seconds: Option<i32>,
    pub cpu_usage: Option<f64>,
    pub ram_usage: Option<f64>,
    pub description: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerActivityStats {
    pub server_id: i64,
    pub total_uptime_minutes: i64,
    pub avg_player_count: f64,
    pub peak_player_count: i32,
    pub last_activity: String,
    pub activity_count: i64,
    pub crash_count: i64,
    pub restart_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardStatistics {
    pub total_servers: i32,
    pub active_servers: i32,
    pub archived_servers: i32,
    pub total_players: i32,
    pub total_uptime_hours: i64,
    pub avg_cpu_usage: f64,
    pub avg_ram_usage: f64,
    pub server_count_by_status: HashMap<String, i32>,
    pub server_count_by_map: HashMap<String, i32>,
}

// ============================================================================
// Server Organization Preferences
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerOrgPreferences {
    pub id: i64,
    pub user_id: String,
    pub auto_archive_enabled: bool,
    pub auto_archive_days: i32,
    pub show_hints: bool,
    pub animation_enabled: bool,
    pub compact_mode: bool,
    pub show_statistics: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgPreferencesRequest {
    pub auto_archive_enabled: Option<bool>,
    pub auto_archive_days: Option<i32>,
    pub show_hints: Option<bool>,
    pub animation_enabled: Option<bool>,
    pub compact_mode: Option<bool>,
    pub show_statistics: Option<bool>,
}

// ============================================================================
// Server Search and Filter Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerFilter {
    pub search_query: Option<String>,
    pub status: Option<Vec<String>>,
    pub map_name: Option<Vec<String>>,
    pub folder_id: Option<i64>,
    pub group_id: Option<i64>,
    pub tags: Option<Vec<String>>,
    pub is_favorite: Option<bool>,
    pub is_archived: Option<bool>,
    pub is_pinned: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerSortOptions {
    pub sort_by: String, // name, status, activity, uptime, players, created_at, last_started
    pub sort_order: String, // asc, desc
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerSearchResult {
    pub id: i64,
    pub name: String,
    pub status: String,
    pub map_name: String,
    pub player_count: Option<i32>,
    pub max_players: i32,
    pub is_favorite: bool,
    pub is_archived: bool,
    pub folder_id: Option<i64>,
    pub tags: Vec<String>,
}

// ============================================================================
// Enhanced Server Response Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnhancedServerInfo {
    pub id: i64,
    pub name: String,
    pub status: String,
    pub customization: Option<ServerCustomization>,
    pub archive_info: Option<ServerArchive>,
    pub activity_stats: Option<ServerActivityStats>,
    pub folder_ids: Vec<i64>,
    pub group_ids: Vec<i64>,
    pub tags: Vec<ServerTag>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerOrganizationSnapshot {
    pub servers: Vec<EnhancedServerInfo>,
    pub folders: Vec<ServerFolder>,
    pub groups: Vec<ServerGroup>,
    pub statistics: DashboardStatistics,
    pub layouts: Vec<DashboardLayout>,
}
