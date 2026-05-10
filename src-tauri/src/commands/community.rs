use crate::db::Database;
use crate::models::{DiscordUser, SupportTicket};
use serde::Serialize;
use std::sync::Arc;
use tauri::State;

#[derive(Serialize)]
pub struct PointsUpdateResult {
    pub success: bool,
    pub new_balance: i32,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn get_support_tickets(
    db: State<'_, Arc<Database>>,
    status_filter: Option<String>,
) -> Result<Vec<SupportTicket>, String> {
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    
    let mut query = "SELECT id, discord_user_id, steam_id, issue_text, status, admin_notes, created_at, resolved_at FROM support_tickets".to_string();
    if let Some(ref status) = status_filter {
        query.push_str(&format!(" WHERE status = '{}'", status));
    }
    query.push_str(" ORDER BY created_at DESC");
    
    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    
    let tickets = stmt.query_map([], |row| {
        Ok(SupportTicket {
            id: row.get(0)?,
            discord_user_id: row.get(1)?,
            steam_id: row.get(2)?,
            issue_text: row.get(3)?,
            status: row.get(4)?,
            admin_notes: row.get(5)?,
            created_at: row.get(6)?,
            resolved_at: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|t| t.ok())
    .collect();
    
    Ok(tickets)
}

#[tauri::command]
pub async fn update_ticket_status(
    db: State<'_, Arc<Database>>,
    ticket_id: i64,
    status: String,
    admin_notes: Option<String>,
) -> Result<bool, String> {
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    
    let resolved_at = if status == "resolved" || status == "closed" {
        Some(chrono::Utc::now().to_rfc3339())
    } else {
        None
    };
    
    conn.execute(
        "UPDATE support_tickets SET status = ?1, admin_notes = ?2, resolved_at = COALESCE(?3, resolved_at) WHERE id = ?4",
        rusqlite::params![status, admin_notes, resolved_at, ticket_id],
    ).map_err(|e| e.to_string())?;
    
    Ok(true)
}

#[tauri::command]
pub async fn get_discord_users(
    db: State<'_, Arc<Database>>,
) -> Result<Vec<DiscordUser>, String> {
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT discord_id, steam_id, discord_username, linked_at FROM discord_users").map_err(|e| e.to_string())?;
    
    let users = stmt.query_map([], |row| {
        Ok(DiscordUser {
            discord_id: row.get(0)?,
            steam_id: row.get(1)?,
            discord_username: row.get(2)?,
            linked_at: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|t| t.ok())
    .collect();
    
    Ok(users)
}

#[tauri::command]
pub async fn add_player_points(
    db: State<'_, Arc<Database>>,
    steam_id: String,
    points: i32,
) -> Result<PointsUpdateResult, String> {
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    
    conn.execute(
        "UPDATE player_stats SET points = points + ?1 WHERE steam_id = ?2",
        rusqlite::params![points, steam_id],
    ).map_err(|e| e.to_string())?;
    
    let current_points: i32 = conn.query_row(
        "SELECT points FROM player_stats WHERE steam_id = ?1",
        rusqlite::params![steam_id],
        |row| row.get(0)
    ).unwrap_or(0);
    
    Ok(PointsUpdateResult {
        success: true,
        new_balance: current_points,
        error: None,
    })
}
