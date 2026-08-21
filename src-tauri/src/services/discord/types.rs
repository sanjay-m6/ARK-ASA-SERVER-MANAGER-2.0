// Core types for Discord Bridge Service & Management Center
#![allow(dead_code)]
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum RoleTier {
    Player = 0,
    Moderator = 1,
    Admin = 2,
    Owner = 3,
}

impl std::fmt::Display for RoleTier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RoleTier::Player => write!(f, "Player"),
            RoleTier::Moderator => write!(f, "Moderator"),
            RoleTier::Admin => write!(f, "Administrator"),
            RoleTier::Owner => write!(f, "Server Owner"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscordServerStatus {
    pub server_id: i64,
    pub server_name: String,
    pub map: String,
    pub state: String, // "online" | "offline" | "starting" | "stopping" | "updating" | "crashed" | "recovering" | "restarting"
    pub players: i32,
    pub max_players: i32,
    pub cpu_percent: Option<f64>,
    pub memory_used_gb: Option<f64>,
    pub memory_total_gb: Option<f64>,
    pub tick_rate: Option<f64>,
    pub uptime_seconds: Option<u64>,
    pub last_updated: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscordAuditLog {
    pub id: i64,
    pub guild_id: String,
    pub discord_user_id: String,
    pub server_id: Option<i64>,
    pub action: String,
    pub target: Option<String>,
    pub status: String,
    pub reason: Option<String>,
    pub created_at: String,
    pub metadata_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscordPendingAction {
    pub id: String,
    pub action_type: String,
    pub guild_id: String,
    pub discord_user_id: String,
    pub server_id: Option<i64>,
    pub payload_json: Option<String>,
    pub expires_at: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscordDiagnosticsInfo {
    pub bot_connected: bool,
    pub gateway_healthy: bool,
    pub guild_synced: bool,
    pub dashboard_healthy: bool,
    pub cross_chat_healthy: bool,
    pub rcon_healthy: bool,
    pub mod_watchdog_healthy: bool,
    pub db_healthy: bool,
    pub last_discord_event: Option<String>,
    pub last_dashboard_update: Option<String>,
    pub active_cluster_id: i64,
    pub guild_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscordChatRelay {
    pub message_id: String,
    pub origin: String, // "discord" | "ark"
    pub origin_id: String,
    pub guild_id: String,
    pub channel_id: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscordPlayerLinkRecord {
    pub discord_user_id: String,
    pub guild_id: String,
    pub steam_id: String,
    pub eos_id: String,
    pub player_name: Option<String>,
    pub cluster_id: i64,
    pub linked_at: String,
    pub verified: bool,
    pub last_verified_at: String,
}
