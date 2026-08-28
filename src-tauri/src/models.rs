use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub mod server_organization;

// ARK Server Manager 2.0 - ASA and ASE Models

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ServerStatus {
    Stopped,
    Starting,
    Running,
    Crashed,
    Updating,
    Restarting,
    Online,
}

impl ToString for ServerStatus {
    fn to_string(&self) -> String {
        match self {
            ServerStatus::Stopped => "stopped".to_string(),
            ServerStatus::Starting => "starting".to_string(),
            ServerStatus::Running => "running".to_string(),
            ServerStatus::Crashed => "crashed".to_string(),
            ServerStatus::Updating => "updating".to_string(),
            ServerStatus::Restarting => "restarting".to_string(),
            ServerStatus::Online => "online".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Server {
    pub id: i64,
    pub name: String,
    pub server_type: String,

    pub install_path: PathBuf,
    pub status: ServerStatus,
    pub ports: ServerPorts,
    pub config: ServerConfig,
    pub rcon_config: RconConfig,
    pub ip_address: Option<String>,
    pub created_at: String,
    pub last_started: Option<String>,
    pub auto_start: bool,
    pub auto_stop: bool,
    pub intelligent_mode: bool,
    pub battleye: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerPorts {
    pub game_port: u16,
    pub query_port: u16,
    pub rcon_port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerConfig {
    pub max_players: i32,
    pub server_password: Option<String>,
    pub admin_password: String,
    pub map_name: String,
    pub session_name: String,
    pub motd: Option<String>,
    pub mods: Vec<String>,
    pub custom_args: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RconConfig {
    pub enabled: bool,
    pub password: String,
}

// CurseForge Mod Info (for ASA mods)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModInfo {
    pub id: String,
    #[serde(default)]
    pub curseforge_id: Option<i64>,
    pub name: String,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub thumbnail_url: Option<String>,
    #[serde(default)]
    pub downloads: Option<i64>,
    #[serde(default)]
    pub curseforge_url: Option<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub load_order: i32,
    #[serde(default)]
    pub last_updated: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub is_local: Option<bool>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Backup {
    pub id: i64,
    pub server_id: i64,
    pub backup_type: BackupType,
    pub file_path: PathBuf,
    pub size: i64,
    pub includes_configs: bool,
    pub includes_mods: bool,
    pub includes_saves: bool,
    pub includes_cluster: bool,
    pub verified: bool,
    pub created_at: String,
    pub label: Option<String>,
    pub notes: Option<String>,
    pub is_protected: bool,
    pub status: String,
    pub hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPolicy {
    pub server_id: i64,
    pub enabled: bool,
    pub interval_hours: i32,
    pub retention_days: i32,
    pub retention_count: i32,
    pub storage_quota_gb: f64,
    pub backup_before_update: bool,
    pub backup_before_restart: bool,
    pub compression_enabled: bool,
    pub cloud_sync_enabled: bool,
    pub discord_webhook: Option<String>,
    pub custom_backup_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BackupType {
    Auto,
    Manual,
    PreUpdate,
    PreRestart,
}

impl ToString for BackupType {
    fn to_string(&self) -> String {
        match self {
            BackupType::Auto => "auto".to_string(),
            BackupType::Manual => "manual".to_string(),
            BackupType::PreUpdate => "pre-update".to_string(),
            BackupType::PreRestart => "pre-restart".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cluster {
    pub id: i64,
    pub name: String,
    pub cluster_path: PathBuf,
    pub server_ids: Vec<i64>,
    pub cluster_id_string: Option<String>,
    pub created_at: String,
}

// Cluster status for multi-server monitoring
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClusterStatus {
    pub cluster_id: i64,
    pub cluster_name: String,
    pub total_servers: i32,
    pub running_servers: i32,
    pub total_players: i32,
    pub server_statuses: Vec<ServerStatusInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatusInfo {
    pub server_id: i64,
    pub server_name: String,
    pub status: ServerStatus,
    pub player_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub cpu_usage: f32,
    pub ram_usage: f64,
    pub ram_total: f64,
    pub disk_usage: f64,
    pub disk_total: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct PerformanceMetrics {
    pub server_id: i64,
    pub cpu_usage: f32,
    pub memory_usage: f64,
    pub player_count: i32,
    pub uptime: i64,
    pub timestamp: String,
}

// RCON Models
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RconPlayer {
    pub id: i64,
    pub name: String,
    pub steam_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RconResponse {
    pub success: bool,
    pub message: String,
    pub data: Option<String>,
}

// Player Intelligence Models
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerStats {
    pub steam_id: String,
    pub display_name: String,
    pub first_seen: String,
    pub last_seen: String,
    pub total_playtime_minutes: i64,
    pub total_sessions: i32,
    pub notes: Option<String>,
    pub is_whitelisted: bool,
    pub is_banned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSession {
    pub id: i64,
    pub server_id: i64,
    pub steam_id: String,
    pub player_name: String,
    pub joined_at: String,
    pub left_at: Option<String>,
}

// Backup Options
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupOptions {
    pub include_configs: bool,
    pub include_mods: bool,
    pub include_saves: bool,
    pub include_cluster: bool,
    pub compression_level: i32, // 0-9
}

impl Default for BackupOptions {
    fn default() -> Self {
        Self {
            include_configs: true,
            include_mods: false,
            include_saves: true,
            include_cluster: false,
            compression_level: 6,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreOptions {
    pub restore_configs: bool,
    pub restore_saves: bool,
    pub stop_server_first: bool,
    pub restart_after: bool,
}

impl Default for RestoreOptions {
    fn default() -> Self {
        Self {
            restore_configs: true,
            restore_saves: true,
            stop_server_first: true,
            restart_after: false,
        }
    }
}

// Scheduled Tasks
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct ScheduledTask {
    pub id: i64,
    pub server_id: i64,
    pub task_type: TaskType,
    pub cron_expression: String,
    pub command: Option<String>,
    pub message: Option<String>,
    pub pre_warning_minutes: i32,
    pub enabled: bool,
    pub last_run: Option<String>,
    pub next_run: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
#[allow(dead_code)]
pub enum TaskType {
    Restart,
    Backup,
    RconCommand,
    Announcement,
    Update,
    SaveWorld,
    DestroyWildDinos,
}

impl ToString for TaskType {
    fn to_string(&self) -> String {
        match self {
            TaskType::Restart => "restart".to_string(),
            TaskType::Backup => "backup".to_string(),
            TaskType::RconCommand => "rcon-command".to_string(),
            TaskType::Announcement => "announcement".to_string(),
            TaskType::Update => "update".to_string(),
            TaskType::SaveWorld => "save-world".to_string(),
            TaskType::DestroyWildDinos => "destroy-wild-dinos".to_string(),
        }
    }
}

// Discord Webhook Config
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct DiscordConfig {
    pub webhook_url: Option<String>,
    pub notify_server_start: bool,
    pub notify_server_stop: bool,
    pub notify_server_crash: bool,
    pub notify_player_join: bool,
    pub notify_player_leave: bool,
    pub notify_scheduled_task: bool,
}

impl Default for DiscordConfig {
    fn default() -> Self {
        Self {
            webhook_url: None,
            notify_server_start: true,
            notify_server_stop: true,
            notify_server_crash: true,
            notify_player_join: false,
            notify_player_leave: false,
            notify_scheduled_task: true,
        }
    }
}

// Plugin Status Enum for ASA Server API Plugins
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum PluginStatus {
    Enabled,
    Disabled,
    Error,
    Missing,
}

// Plugin Info for ASA Server API Plugins
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    pub id: String,
    pub name: String,
    pub folder_name: String,
    pub version: Option<String>,
    pub description: Option<String>,
    pub author: Option<String>,
    pub enabled: bool,
    pub installed_path: String,
    pub dependencies: Vec<String>,
    pub last_loaded_at: Option<String>,
    pub status: PluginStatus,
    pub status_message: Option<String>,
}

// Result of scanning a server's plugin directory
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginScanResult {
    pub plugins: Vec<PluginInfo>,
    pub loader_installed: bool,
    pub plugins_dir: String,
    pub launch_executable: String,
    pub active_plugin_count: usize,
    pub api_loader_enabled: bool,
    pub pdb_missing: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchedulerSettings {
    pub server_id: i64,
    pub mode: String, // 'basic', 'advanced', 'disabled'
    pub basic_interval_hours: i32,
    pub basic_warning_minutes: String, // "30,15,10,5,1"
    #[serde(default)]
    pub next_run_basic: Option<String>,
    // Advanced fields
    #[serde(default)]
    pub advanced_time: Option<String>,
    #[serde(default)]
    pub advanced_days: Option<String>,
    #[serde(default)]
    pub advanced_warning_minutes: Option<String>,
    #[serde(default)]
    pub advanced_shutdown: Option<bool>,
    #[serde(default)]
    pub advanced_backup: Option<bool>,
    #[serde(default)]
    pub advanced_update: Option<bool>,
    #[serde(default)]
    pub advanced_restart: Option<bool>,
    #[serde(default)]
    pub advanced_dino_wipe: Option<bool>,
    #[serde(default)]
    pub watchdog_enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordUser {
    pub discord_id: String,
    pub steam_id: String,
    pub discord_username: String,
    pub linked_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportTicket {
    pub id: i64,
    pub discord_user_id: Option<String>,
    pub steam_id: Option<String>,
    pub issue_text: String,
    pub status: String,
    pub admin_notes: Option<String>,
    pub created_at: String,
    pub resolved_at: Option<String>,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareAllocation {
    pub server_id: i64,
    pub use_all_cores: bool,
    pub cpu_affinity: String,
    pub process_priority: String,
}
