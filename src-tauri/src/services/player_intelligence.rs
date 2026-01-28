// Player Intelligence Service for ASA Server Manager
// Tracks player sessions, playtime, and provides analytics

use crate::models::{PlayerSession, PlayerStats};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Service for tracking player activity and statistics
#[allow(dead_code)]
pub struct PlayerIntelligenceService {
    /// Active sessions: steam_id -> (server_id, player_name, join_time)
    active_sessions: Arc<Mutex<HashMap<String, (i64, String, chrono::DateTime<chrono::Local>)>>>,
}

#[allow(dead_code)]
impl PlayerIntelligenceService {
    pub fn new() -> Self {
        Self {
            active_sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Record a player joining a server
    pub async fn player_joined(&self, server_id: i64, steam_id: &str, player_name: &str) {
        let mut sessions = self.active_sessions.lock().await;
        let now = chrono::Local::now();

        sessions.insert(
            steam_id.to_string(),
            (server_id, player_name.to_string(), now),
        );

        println!(
            "📥 Player joined: {} ({}) on server {}",
            player_name, steam_id, server_id
        );
    }

    /// Record a player leaving a server, returns session duration in minutes
    pub async fn player_left(&self, steam_id: &str) -> Option<PlayerSession> {
        let mut sessions = self.active_sessions.lock().await;

        if let Some((server_id, player_name, join_time)) = sessions.remove(steam_id) {
            let now = chrono::Local::now();
            let duration = now.signed_duration_since(join_time);

            println!(
                "📤 Player left: {} ({}) after {} minutes",
                player_name,
                steam_id,
                duration.num_minutes()
            );

            Some(PlayerSession {
                id: 0, // Will be set by database
                server_id,
                steam_id: steam_id.to_string(),
                player_name,
                joined_at: join_time.to_rfc3339(),
                left_at: Some(now.to_rfc3339()),
            })
        } else {
            None
        }
    }

    /// Get active session for a player
    pub async fn get_active_session(&self, steam_id: &str) -> Option<(i64, String)> {
        let sessions = self.active_sessions.lock().await;
        sessions
            .get(steam_id)
            .map(|(server_id, name, _)| (*server_id, name.clone()))
    }

    /// Get all active sessions
    pub async fn get_all_active_sessions(&self) -> Vec<(String, i64, String)> {
        let sessions = self.active_sessions.lock().await;
        sessions
            .iter()
            .map(|(steam_id, (server_id, name, _))| (steam_id.clone(), *server_id, name.clone()))
            .collect()
    }

    /// Get active player count per server
    pub async fn get_player_counts(&self) -> HashMap<i64, i32> {
        let sessions = self.active_sessions.lock().await;
        let mut counts: HashMap<i64, i32> = HashMap::new();

        for (_, (server_id, _, _)) in sessions.iter() {
            *counts.entry(*server_id).or_insert(0) += 1;
        }

        counts
    }

    /// Clear all sessions for a server (e.g., when server stops)
    pub async fn clear_server_sessions(&self, server_id: i64) -> Vec<PlayerSession> {
        let mut sessions = self.active_sessions.lock().await;
        let now = chrono::Local::now();

        let mut ended_sessions = Vec::new();
        let to_remove: Vec<String> = sessions
            .iter()
            .filter(|(_, (sid, _, _))| *sid == server_id)
            .map(|(steam_id, _)| steam_id.clone())
            .collect();

        for steam_id in to_remove {
            if let Some((server_id, player_name, join_time)) = sessions.remove(&steam_id) {
                ended_sessions.push(PlayerSession {
                    id: 0,
                    server_id,
                    steam_id,
                    player_name,
                    joined_at: join_time.to_rfc3339(),
                    left_at: Some(now.to_rfc3339()),
                });
            }
        }

        ended_sessions
    }
}

impl Default for PlayerIntelligenceService {
    fn default() -> Self {
        Self::new()
    }
}

/// Parse PlayerStats from database row data
#[allow(dead_code)]
pub fn create_player_stats(
    steam_id: String,
    display_name: String,
    first_seen: String,
    last_seen: String,
    total_playtime_minutes: i64,
    total_sessions: i32,
    notes: Option<String>,
    is_whitelisted: bool,
    is_banned: bool,
) -> PlayerStats {
    PlayerStats {
        steam_id,
        display_name,
        first_seen,
        last_seen,
        total_playtime_minutes,
        total_sessions,
        notes,
        is_whitelisted,
        is_banned,
    }
}
