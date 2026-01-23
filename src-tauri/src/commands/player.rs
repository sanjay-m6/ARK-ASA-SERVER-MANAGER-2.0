// Player Intelligence Commands for ASA Server Manager
// Exposes player tracking and statistics functionality to the frontend

use crate::models::{PlayerSession, PlayerStats};
use crate::services::player_intelligence::PlayerIntelligenceService;
use crate::AppState;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

pub struct PlayerIntelligenceState(pub Arc<Mutex<PlayerIntelligenceService>>);

/// Get player statistics by Steam ID
#[tauri::command]
pub async fn get_player_stats(
    state: State<'_, AppState>,
    steam_id: String,
) -> Result<PlayerStats, String> {
    println!("📊 Getting player stats for {}", steam_id);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT steam_id, display_name, first_seen, last_seen, total_playtime_minutes, 
                total_sessions, notes, is_whitelisted, is_banned 
         FROM players WHERE steam_id = ?1",
        [&steam_id],
        |row| {
            Ok(PlayerStats {
                steam_id: row.get(0)?,
                display_name: row.get(1)?,
                first_seen: row.get(2)?,
                last_seen: row.get(3)?,
                total_playtime_minutes: row.get(4)?,
                total_sessions: row.get(5)?,
                notes: row.get(6)?,
                is_whitelisted: row.get(7)?,
                is_banned: row.get(8)?,
            })
        },
    )
    .map_err(|e| format!("Player not found: {}", e))
}

/// Get all known players with their stats
#[tauri::command]
pub async fn get_all_players(
    state: State<'_, AppState>,
    limit: Option<i32>,
    offset: Option<i32>,
) -> Result<Vec<PlayerStats>, String> {
    println!("📋 Getting all players");

    let limit = limit.unwrap_or(100);
    let offset = offset.unwrap_or(0);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT steam_id, display_name, first_seen, last_seen, total_playtime_minutes, 
                    total_sessions, notes, is_whitelisted, is_banned 
             FROM players ORDER BY last_seen DESC LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    let mut rows = stmt.query([limit, offset]).map_err(|e| e.to_string())?;

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        result.push(PlayerStats {
            steam_id: row.get(0).unwrap_or_default(),
            display_name: row.get(1).unwrap_or_default(),
            first_seen: row.get(2).unwrap_or_default(),
            last_seen: row.get(3).unwrap_or_default(),
            total_playtime_minutes: row.get(4).unwrap_or(0),
            total_sessions: row.get(5).unwrap_or(0),
            notes: row.get(6).unwrap_or(None),
            is_whitelisted: row.get(7).unwrap_or(false),
            is_banned: row.get(8).unwrap_or(false),
        });
    }

    println!("  Found {} players", result.len());
    Ok(result)
}

/// Get player session history
#[tauri::command]
pub async fn get_player_sessions(
    state: State<'_, AppState>,
    steam_id: String,
    limit: Option<i32>,
) -> Result<Vec<PlayerSession>, String> {
    println!("📜 Getting sessions for player {}", steam_id);

    let limit = limit.unwrap_or(50);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, server_id, steam_id, player_name, joined_at, left_at 
             FROM player_sessions WHERE steam_id = ?1 ORDER BY joined_at DESC LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    let mut rows = stmt
        .query(rusqlite::params![steam_id, limit])
        .map_err(|e| e.to_string())?;

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        result.push(PlayerSession {
            id: row.get(0).unwrap_or(0),
            server_id: row.get(1).unwrap_or(0),
            steam_id: row.get(2).unwrap_or_default(),
            player_name: row.get(3).unwrap_or_default(),
            joined_at: row.get(4).unwrap_or_default(),
            left_at: row.get(5).unwrap_or(None),
        });
    }

    println!("  Found {} sessions", result.len());
    Ok(result)
}

/// Update player notes
#[tauri::command]
pub async fn update_player_notes(
    state: State<'_, AppState>,
    steam_id: String,
    notes: Option<String>,
) -> Result<(), String> {
    println!("📝 Updating notes for player {}", steam_id);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE players SET notes = ?1 WHERE steam_id = ?2",
        rusqlite::params![notes, steam_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Set player whitelist status
#[tauri::command]
pub async fn set_player_whitelist(
    state: State<'_, AppState>,
    steam_id: String,
    whitelisted: bool,
) -> Result<(), String> {
    println!(
        "📋 Setting whitelist for player {}: {}",
        steam_id, whitelisted
    );

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE players SET is_whitelisted = ?1 WHERE steam_id = ?2",
        rusqlite::params![whitelisted, steam_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Set player ban status
#[tauri::command]
pub async fn set_player_ban(
    state: State<'_, AppState>,
    steam_id: String,
    banned: bool,
) -> Result<(), String> {
    println!("🚫 Setting ban for player {}: {}", steam_id, banned);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE players SET is_banned = ?1 WHERE steam_id = ?2",
        rusqlite::params![banned, steam_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Record a player session (usually called when player leaves)
#[tauri::command]
pub async fn record_player_session(
    state: State<'_, AppState>,
    session: PlayerSession,
) -> Result<(), String> {
    println!("📥 Recording session for player {}", session.steam_id);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    // Insert session
    conn.execute(
        "INSERT INTO player_sessions (server_id, steam_id, player_name, joined_at, left_at) 
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![
            session.server_id,
            session.steam_id,
            session.player_name,
            session.joined_at,
            session.left_at,
        ],
    )
    .map_err(|e| e.to_string())?;

    // Calculate session duration in minutes
    let duration_minutes = if let Some(ref left_at) = session.left_at {
        if let (Ok(joined), Ok(left)) = (
            chrono::DateTime::parse_from_rfc3339(&session.joined_at),
            chrono::DateTime::parse_from_rfc3339(left_at),
        ) {
            left.signed_duration_since(joined).num_minutes()
        } else {
            0
        }
    } else {
        0
    };

    // Update or insert player stats
    conn.execute(
        "INSERT INTO players (steam_id, display_name, first_seen, last_seen, total_playtime_minutes, total_sessions, is_whitelisted, is_banned) 
         VALUES (?1, ?2, ?3, ?4, ?5, 1, 0, 0)
         ON CONFLICT(steam_id) DO UPDATE SET 
            display_name = ?2,
            last_seen = ?4,
            total_playtime_minutes = total_playtime_minutes + ?5,
            total_sessions = total_sessions + 1",
        rusqlite::params![
            session.steam_id,
            session.player_name,
            session.joined_at,
            session.left_at.as_ref().unwrap_or(&session.joined_at),
            duration_minutes,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Search players by name or Steam ID
#[tauri::command]
pub async fn search_players(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<PlayerStats>, String> {
    println!("🔍 Searching players: {}", query);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let search_pattern = format!("%{}%", query);

    let mut stmt = conn
        .prepare(
            "SELECT steam_id, display_name, first_seen, last_seen, total_playtime_minutes, 
                    total_sessions, notes, is_whitelisted, is_banned 
             FROM players 
             WHERE steam_id LIKE ?1 OR display_name LIKE ?1 
             ORDER BY last_seen DESC LIMIT 50",
        )
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    let mut rows = stmt.query([&search_pattern]).map_err(|e| e.to_string())?;

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        result.push(PlayerStats {
            steam_id: row.get(0).unwrap_or_default(),
            display_name: row.get(1).unwrap_or_default(),
            first_seen: row.get(2).unwrap_or_default(),
            last_seen: row.get(3).unwrap_or_default(),
            total_playtime_minutes: row.get(4).unwrap_or(0),
            total_sessions: row.get(5).unwrap_or(0),
            notes: row.get(6).unwrap_or(None),
            is_whitelisted: row.get(7).unwrap_or(false),
            is_banned: row.get(8).unwrap_or(false),
        });
    }

    println!("  Found {} players", result.len());
    Ok(result)
}
