use tauri::{plugin::{Builder as PluginBuilder, TauriPlugin}, Runtime, State};
use crate::AppState;
use crate::models::server_organization::*;
use crate::services::server_organization::ServerOrganizationService;
use serde_json::json;
use std::collections::HashMap;

// ============================================================================
// Folder Commands
// ============================================================================

#[tauri::command]
pub async fn create_folder(
    state: State<'_, AppState>,
    request: ServerFolderRequest,
) -> Result<ServerFolder, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    ServerOrganizationService::create_folder(&conn, &request).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_all_folders(
    state: State<'_, AppState>,
) -> Result<Vec<ServerFolder>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    ServerOrganizationService::get_all_folders(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_folder_hierarchy(
    state: State<'_, AppState>,
    folder_id: i64,
) -> Result<ServerFolder, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    ServerOrganizationService::get_folder_hierarchy(&conn, folder_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_folder(
    state: State<'_, AppState>,
    folder_id: i64,
    name: Option<String>,
    description: Option<Option<String>>,
    color: Option<String>,
    icon: Option<Option<String>>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    
    let name_ref = name.as_deref();
    let description_ref = description.as_ref().map(|opt| opt.as_deref());
    let color_ref = color.as_deref();
    let icon_ref = icon.as_ref().map(|opt| opt.as_deref());
    
    ServerOrganizationService::update_folder(
        &conn,
        folder_id,
        name_ref,
        description_ref,
        color_ref,
        icon_ref,
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_folder(
    state: State<'_, AppState>,
    folder_id: i64,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    ServerOrganizationService::delete_folder(&conn, folder_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_server_to_folder(
    state: State<'_, AppState>,
    server_id: i64,
    folder_id: i64,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    ServerOrganizationService::add_server_to_folder(&conn, server_id, folder_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_server_from_folder(
    state: State<'_, AppState>,
    server_id: i64,
    folder_id: i64,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    ServerOrganizationService::remove_server_from_folder(&conn, server_id, folder_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_server_folders(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Vec<ServerFolder>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    ServerOrganizationService::get_server_folders(&conn, server_id).map_err(|e| e.to_string())
}

// ============================================================================
// Archive Commands
// ============================================================================

#[tauri::command]
pub async fn archive_server(
    state: State<'_, AppState>,
    server_id: i64,
    reason: Option<String>,
    notes: Option<String>,
) -> Result<ServerArchive, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    let request = ArchiveRequest {
        server_id,
        reason,
        notes,
    };
    ServerOrganizationService::archive_server(&conn, &request).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_server(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    ServerOrganizationService::restore_server(&conn, server_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn is_server_archived(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<bool, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    ServerOrganizationService::is_server_archived(&conn, server_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_archived_servers(
    state: State<'_, AppState>,
) -> Result<Vec<ServerArchive>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    ServerOrganizationService::get_archived_servers(&conn).map_err(|e| e.to_string())
}

// ============================================================================
// Customization Commands
// ============================================================================

#[tauri::command]
pub async fn update_server_customization(
    state: State<'_, AppState>,
    request: CustomizationRequest,
) -> Result<ServerCustomization, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    ServerOrganizationService::update_server_customization(&conn, &request).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_server_customization(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Option<ServerCustomization>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    ServerOrganizationService::get_server_customization(&conn, server_id).map_err(|e| e.to_string())
}

// ============================================================================
// Layout Commands
// ============================================================================

#[tauri::command]
pub async fn create_dashboard_layout(
    state: State<'_, AppState>,
    user_id: String,
    request: DashboardLayoutRequest,
) -> Result<DashboardLayout, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    ServerOrganizationService::create_dashboard_layout(&conn, &user_id, &request).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_user_layouts(
    state: State<'_, AppState>,
    user_id: String,
) -> Result<Vec<DashboardLayout>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    ServerOrganizationService::get_user_layouts(&conn, &user_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_layout(
    state: State<'_, AppState>,
    layout_id: i64,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    ServerOrganizationService::delete_layout(&conn, layout_id).map_err(|e| e.to_string())
}

// ============================================================================
// Group Commands
// ============================================================================

#[tauri::command]
pub async fn create_server_group(
    state: State<'_, AppState>,
    request: ServerGroupRequest,
) -> Result<ServerGroup, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    ServerOrganizationService::create_server_group(&conn, &request).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_all_server_groups(
    state: State<'_, AppState>,
) -> Result<Vec<ServerGroup>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    ServerOrganizationService::get_all_server_groups(&conn).map_err(|e| e.to_string())
}

// ============================================================================
// Activity and Analytics Commands
// ============================================================================

#[tauri::command]
pub async fn log_server_activity(
    state: State<'_, AppState>,
    server_id: i64,
    activity_type: String,
    player_count: Option<i32>,
    uptime_seconds: Option<i32>,
    cpu_usage: Option<f64>,
    ram_usage: Option<f64>,
    description: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    ServerOrganizationService::log_server_activity(
        &conn,
        server_id,
        &activity_type,
        player_count,
        uptime_seconds,
        cpu_usage,
        ram_usage,
        description.as_deref(),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_server_activity_stats(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Option<ServerActivityStats>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    ServerOrganizationService::get_server_activity_stats(&conn, server_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_dashboard_statistics(
    state: State<'_, AppState>,
) -> Result<DashboardStatistics, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    ServerOrganizationService::get_dashboard_statistics(&conn).map_err(|e| e.to_string())
}

// ============================================================================
// Bulk Action Implementations
// ============================================================================

#[tauri::command]
pub async fn bulk_move_servers(
    state: State<'_, AppState>,
    server_ids: Vec<i64>,
    target_folder_id: i64,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    
    conn.execute("BEGIN TRANSACTION", []).map_err(|e| e.to_string())?;
    for server_id in server_ids {
        let _ = conn.execute(
            "DELETE FROM server_folder_members WHERE server_id = ?1",
            rusqlite::params![server_id],
        );
        let _ = ServerOrganizationService::add_server_to_folder(&conn, server_id, target_folder_id);
    }
    conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn bulk_archive_servers(
    state: State<'_, AppState>,
    server_ids: Vec<i64>,
    reason: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    
    conn.execute("BEGIN TRANSACTION", []).map_err(|e| e.to_string())?;
    for server_id in server_ids {
        let request = ArchiveRequest {
            server_id,
            reason: reason.clone(),
            notes: None,
        };
        let _ = ServerOrganizationService::archive_server(&conn, &request);
    }
    conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn bulk_tag_servers(
    state: State<'_, AppState>,
    server_ids: Vec<i64>,
    tags: Vec<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    
    conn.execute("BEGIN TRANSACTION", []).map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let tags_json = serde_json::to_string(&tags).map_err(|e| e.to_string())?;
    
    for server_id in server_ids {
        let exists: bool = conn.query_row(
            "SELECT COUNT(*) FROM server_customization WHERE server_id = ?1",
            rusqlite::params![server_id],
            |row| row.get(0),
        ).unwrap_or(0) > 0;
        
        if exists {
            let _ = conn.execute(
                "UPDATE server_customization SET tags = ?1, updated_at = ?2 WHERE server_id = ?3",
                rusqlite::params![tags_json, now, server_id],
            );
        } else {
            let _ = conn.execute(
                "INSERT INTO server_customization (server_id, tags, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![server_id, tags_json, now, now],
            );
        }
    }
    conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn bulk_color_servers(
    state: State<'_, AppState>,
    server_ids: Vec<i64>,
    color: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    
    conn.execute("BEGIN TRANSACTION", []).map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    
    for server_id in server_ids {
        let exists: bool = conn.query_row(
            "SELECT COUNT(*) FROM server_customization WHERE server_id = ?1",
            rusqlite::params![server_id],
            |row| row.get(0),
        ).unwrap_or(0) > 0;
        
        if exists {
            let _ = conn.execute(
                "UPDATE server_customization SET color_tag = ?1, updated_at = ?2 WHERE server_id = ?3",
                rusqlite::params![color, now, server_id],
            );
        } else {
            let _ = conn.execute(
                "INSERT INTO server_customization (server_id, color_tag, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![server_id, color, now, now],
            );
        }
    }
    conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================================
// Search and Filtering Commands
// ============================================================================

#[tauri::command]
pub async fn search_servers(
    state: State<'_, AppState>,
    query: String,
    _filters: Option<serde_json::Value>,
) -> Result<Vec<serde_json::Value>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    
    let search_pattern = format!("%{}%", query);
    
    let mut stmt = conn.prepare(
        "SELECT id, name, status, map_name, max_players 
         FROM servers 
         WHERE name LIKE ?1 OR map_name LIKE ?1"
    ).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map(rusqlite::params![search_pattern], |row| {
        let id: i64 = row.get(0)?;
        let name: String = row.get(1)?;
        let status: String = row.get(2)?;
        let map_name: String = row.get(3)?;
        let max_players: i32 = row.get(4)?;
        
        Ok(json!({
            "id": id,
            "name": name,
            "status": status,
            "mapName": map_name,
            "maxPlayers": max_players,
            "playerCount": 0,
            "isFavorite": false,
            "isArchived": false,
            "tags": Vec::<String>::new()
        }))
    }).map_err(|e| e.to_string())?;
    
    let mut results = Vec::new();
    for row in rows {
        if let Ok(mut val) = row {
            let server_id = val["id"].as_i64().unwrap();
            
            let is_archived: bool = conn.query_row(
                "SELECT COUNT(*) FROM server_archive WHERE server_id = ?1",
                rusqlite::params![server_id],
                |r| r.get(0),
            ).unwrap_or(0) > 0;
            val["isArchived"] = json!(is_archived);
            
            if let Ok(custom) = ServerOrganizationService::get_server_customization(&conn, server_id) {
                if let Some(c) = custom {
                    val["isFavorite"] = json!(c.favorite);
                    val["tags"] = json!(c.tags);
                }
            }
            
            results.push(val);
        }
    }
    
    Ok(results)
}

#[tauri::command]
pub async fn get_servers_by_status(
    state: State<'_, AppState>,
    status: String,
) -> Result<Vec<serde_json::Value>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT id, name, status, map_name, max_players 
         FROM servers 
         WHERE status = ?1"
    ).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map(rusqlite::params![status], |row| {
        let id: i64 = row.get(0)?;
        let name: String = row.get(1)?;
        let status: String = row.get(2)?;
        let map_name: String = row.get(3)?;
        let max_players: i32 = row.get(4)?;
        
        Ok(json!({
            "id": id,
            "name": name,
            "status": status,
            "mapName": map_name,
            "maxPlayers": max_players
        }))
    }).map_err(|e| e.to_string())?;
    
    let mut results = Vec::new();
    for row in rows.flatten() {
        results.push(row);
    }
    Ok(results)
}

#[tauri::command]
pub async fn get_servers_by_map(
    state: State<'_, AppState>,
    map_name: String,
) -> Result<Vec<serde_json::Value>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT id, name, status, map_name, max_players 
         FROM servers 
         WHERE map_name = ?1"
    ).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map(rusqlite::params![map_name], |row| {
        let id: i64 = row.get(0)?;
        let name: String = row.get(1)?;
        let status: String = row.get(2)?;
        let map_name: String = row.get(3)?;
        let max_players: i32 = row.get(4)?;
        
        Ok(json!({
            "id": id,
            "name": name,
            "status": status,
            "mapName": map_name,
            "maxPlayers": max_players
        }))
    }).map_err(|e| e.to_string())?;
    
    let mut results = Vec::new();
    for row in rows.flatten() {
        results.push(row);
    }
    Ok(results)
}

#[tauri::command]
pub async fn get_servers_by_group(
    state: State<'_, AppState>,
    group_id: i64,
) -> Result<Vec<serde_json::Value>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT grouping_type, criteria FROM server_groups WHERE id = ?1"
    ).map_err(|e| e.to_string())?;
    
    let (grouping_type, criteria_str): (String, String) = stmt.query_row(rusqlite::params![group_id], |row| {
        Ok((row.get(0)?, row.get(1)?))
    }).map_err(|e| e.to_string())?;
    
    let criteria: serde_json::Value = serde_json::from_str(&criteria_str).unwrap_or(json!({}));
    
    let mut stmt_servers = conn.prepare(
        "SELECT id, name, status, map_name, max_players FROM servers"
    ).map_err(|e| e.to_string())?;
    
    let server_rows = stmt_servers.query_map([], |row| {
        let id: i64 = row.get(0)?;
        let name: String = row.get(1)?;
        let status: String = row.get(2)?;
        let map_name: String = row.get(3)?;
        let max_players: i32 = row.get(4)?;
        
        Ok(json!({
            "id": id,
            "name": name,
            "status": status,
            "mapName": map_name,
            "maxPlayers": max_players
        }))
    }).map_err(|e| e.to_string())?;
    
    let mut results = Vec::new();
    for row in server_rows.flatten() {
        let mut matches = false;
        
        if grouping_type == "status" {
            if let Some(target_status) = criteria.as_str() {
                matches = row["status"].as_str().unwrap_or("") == target_status;
            }
        } else if grouping_type == "map" {
            if let Some(target_map) = criteria.as_str() {
                matches = row["mapName"].as_str().unwrap_or("") == target_map;
            }
        } else {
            matches = true;
        }
        
        if matches {
            results.push(row);
        }
    }
    
    Ok(results)
}

#[tauri::command]
pub async fn get_servers_by_tag(
    state: State<'_, AppState>,
    tag: String,
) -> Result<Vec<serde_json::Value>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT id, name, status, map_name, max_players FROM servers"
    ).map_err(|e| e.to_string())?;
    
    let server_rows = stmt.query_map([], |row| {
        let id: i64 = row.get(0)?;
        let name: String = row.get(1)?;
        let status: String = row.get(2)?;
        let map_name: String = row.get(3)?;
        let max_players: i32 = row.get(4)?;
        
        Ok(json!({
            "id": id,
            "name": name,
            "status": status,
            "mapName": map_name,
            "maxPlayers": max_players
        }))
    }).map_err(|e| e.to_string())?;
    
    let mut results = Vec::new();
    for row in server_rows.flatten() {
        let server_id = row["id"].as_i64().unwrap();
        if let Ok(Some(custom)) = ServerOrganizationService::get_server_customization(&conn, server_id) {
            if custom.tags.contains(&tag) {
                results.push(row);
            }
        }
    }
    
    Ok(results)
}

#[tauri::command]
pub async fn get_active_servers(
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT id, name, status, map_name, max_players 
         FROM servers 
         WHERE id NOT IN (SELECT server_id FROM server_archive)"
    ).map_err(|e| e.to_string())?;
    
    let server_rows = stmt.query_map([], |row| {
        let id: i64 = row.get(0)?;
        let name: String = row.get(1)?;
        let status: String = row.get(2)?;
        let map_name: String = row.get(3)?;
        let max_players: i32 = row.get(4)?;
        
        Ok(json!({
            "id": id,
            "name": name,
            "status": status,
            "mapName": map_name,
            "maxPlayers": max_players
        }))
    }).map_err(|e| e.to_string())?;
    
    let mut results = Vec::new();
    for row in server_rows.flatten() {
        results.push(row);
    }
    
    Ok(results)
}

#[tauri::command]
pub async fn get_inactive_servers(
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT s.id, s.name, s.status, s.map_name, s.max_players 
         FROM servers s
         JOIN server_archive sa ON s.id = sa.server_id"
    ).map_err(|e| e.to_string())?;
    
    let server_rows = stmt.query_map([], |row| {
        let id: i64 = row.get(0)?;
        let name: String = row.get(1)?;
        let status: String = row.get(2)?;
        let map_name: String = row.get(3)?;
        let max_players: i32 = row.get(4)?;
        
        Ok(json!({
            "id": id,
            "name": name,
            "status": status,
            "mapName": map_name,
            "maxPlayers": max_players
        }))
    }).map_err(|e| e.to_string())?;
    
    let mut results = Vec::new();
    for row in server_rows.flatten() {
        results.push(row);
    }
    
    Ok(results)
}

// ============================================================================
// Snapshot and Advanced Commands
// ============================================================================

#[tauri::command]
pub async fn get_organization_snapshot(
    state: State<'_, AppState>,
) -> Result<ServerOrganizationSnapshot, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    
    let folders = ServerOrganizationService::get_all_folders(&conn).unwrap_or_default();
    let groups = ServerOrganizationService::get_all_server_groups(&conn).unwrap_or_default();
    
    let statistics = ServerOrganizationService::get_dashboard_statistics(&conn).unwrap_or(DashboardStatistics {
        total_servers: 0,
        active_servers: 0,
        archived_servers: 0,
        total_players: 0,
        total_uptime_hours: 0,
        avg_cpu_usage: 0.0,
        avg_ram_usage: 0.0,
        server_count_by_status: HashMap::new(),
        server_count_by_map: HashMap::new(),
    });
    
    let layouts = ServerOrganizationService::get_user_layouts(&conn, "default").unwrap_or_default();
    
    let mut stmt = conn.prepare("SELECT id, name, status FROM servers").map_err(|e| e.to_string())?;
    let servers_iter = stmt.query_map([], |row| {
        let id: i64 = row.get(0)?;
        let name: String = row.get(1)?;
        let status: String = row.get(2)?;
        Ok((id, name, status))
    }).map_err(|e| e.to_string())?;
    
    let mut servers = Vec::new();
    for server_row in servers_iter.flatten() {
        let (id, name, status) = server_row;
        
        let customization = ServerOrganizationService::get_server_customization(&conn, id).unwrap_or(None);
        let archive_info = if let Ok(is_archived) = ServerOrganizationService::is_server_archived(&conn, id) {
            if is_archived {
                Some(ServerArchive {
                    id: 1,
                    server_id: id,
                    archived_at: "".to_string(),
                    archive_reason: Some("Archived".to_string()),
                    archived_by: None,
                    notes: None,
                })
            } else {
                None
            }
        } else {
            None
        };
        
        let activity_stats = ServerOrganizationService::get_server_activity_stats(&conn, id).unwrap_or(None);
        
        let folder_ids = if let Ok(mut folder_stmt) = conn.prepare("SELECT folder_id FROM server_folder_members WHERE server_id = ?1") {
            folder_stmt.query_map([id], |r| r.get::<_, i64>(0))
                .map(|rows| rows.flatten().collect::<Vec<i64>>())
                .unwrap_or_default()
        } else {
            Vec::new()
        };
            
        servers.push(EnhancedServerInfo {
            id,
            name,
            status,
            customization,
            archive_info,
            activity_stats,
            folder_ids,
            group_ids: Vec::new(),
            tags: Vec::new(),
        });
    }
    
    Ok(ServerOrganizationSnapshot {
        servers,
        folders,
        groups,
        statistics,
        layouts,
    })
}

#[tauri::command]
pub async fn export_server_organization(
    state: State<'_, AppState>,
) -> Result<String, String> {
    let snapshot = get_organization_snapshot(state).await?;
    serde_json::to_string(&snapshot).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_server_organization(
    state: State<'_, AppState>,
    data: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    
    let snapshot: ServerOrganizationSnapshot = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    
    conn.execute("BEGIN TRANSACTION", []).map_err(|e| e.to_string())?;
    
    let _ = conn.execute("DELETE FROM server_folders", []);
    let _ = conn.execute("DELETE FROM server_folder_members", []);
    let _ = conn.execute("DELETE FROM server_customization", []);
    let _ = conn.execute("DELETE FROM server_groups", []);
    
    for folder in snapshot.folders {
        let request = ServerFolderRequest {
            name: folder.name,
            description: folder.description,
            color: Some(folder.color),
            icon: folder.icon,
            parent_folder_id: folder.parent_folder_id,
        };
        let _ = ServerOrganizationService::create_folder(&conn, &request);
    }
    
    for group in snapshot.groups {
        let request = ServerGroupRequest {
            name: group.name,
            description: group.description,
            grouping_type: Some(group.grouping_type),
            criteria: Some(group.criteria),
            color: Some(group.color),
        };
        let _ = ServerOrganizationService::create_server_group(&conn, &request);
    }
    
    for server in snapshot.servers {
        if let Some(custom) = server.customization {
            let request = CustomizationRequest {
                server_id: server.id,
                display_name: custom.display_name,
                custom_icon: custom.custom_icon,
                custom_banner: custom.custom_banner,
                color_tag: custom.color_tag,
                is_pinned: Some(custom.is_pinned),
                tags: Some(custom.tags),
                favorite: Some(custom.favorite),
                notes: custom.notes,
            };
            let _ = ServerOrganizationService::update_server_customization(&conn, &request);
        }
    }
    
    conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn reorder_servers(
    state: State<'_, AppState>,
    server_ids: Vec<i64>,
    _folder_id: Option<i64>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    
    conn.execute("BEGIN TRANSACTION", []).map_err(|e| e.to_string())?;
    for (index, server_id) in server_ids.iter().enumerate() {
        let _ = conn.execute(
            "UPDATE server_customization SET pin_order = ?1 WHERE server_id = ?2",
            rusqlite::params![index as i32, server_id],
        );
    }
    conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn assign_server_priority(
    state: State<'_, AppState>,
    server_id: i64,
    priority: i32,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    
    let _ = conn.execute(
        "UPDATE servers SET startup_priority = ?1 WHERE id = ?2",
        rusqlite::params![priority, server_id],
    );
    Ok(())
}

#[tauri::command]
pub async fn auto_archive_inactive_servers(
    state: State<'_, AppState>,
    inactive_days: i32,
) -> Result<i32, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    
    let cutoff = (chrono::Utc::now() - chrono::Duration::days(inactive_days as i64)).to_rfc3339();
    
    let mut stmt = conn.prepare(
        "SELECT id FROM servers 
         WHERE last_started < ?1 AND id NOT IN (SELECT server_id FROM server_archive)"
    ).map_err(|e| e.to_string())?;
    
    let server_ids: Vec<i64> = stmt.query_map(rusqlite::params![cutoff], |row| row.get::<_, i64>(0)).unwrap()
        .flatten()
        .collect();
        
    let count = server_ids.len() as i32;
    
    conn.execute("BEGIN TRANSACTION", []).map_err(|e| e.to_string())?;
    for server_id in server_ids {
        let request = ArchiveRequest {
            server_id,
            reason: Some(format!("Auto-archived (inactive for {} days)", inactive_days)),
            notes: None,
        };
        let _ = ServerOrganizationService::archive_server(&conn, &request);
    }
    conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
    
    Ok(count)
}

#[tauri::command]
pub async fn get_server_comparison_stats(
    state: State<'_, AppState>,
    server_id_1: i64,
    server_id_2: i64,
) -> Result<serde_json::Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    
    let stats1 = ServerOrganizationService::get_server_activity_stats(&conn, server_id_1).unwrap_or(None);
    let stats2 = ServerOrganizationService::get_server_activity_stats(&conn, server_id_2).unwrap_or(None);
    
    Ok(json!({
        "server1": stats1,
        "server2": stats2
    }))
}

// ============================================================================
// Plugin Initialization
// ============================================================================

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    PluginBuilder::new("server-org")
        .invoke_handler(tauri::generate_handler![
            create_folder,
            get_all_folders,
            get_folder_hierarchy,
            update_folder,
            delete_folder,
            add_server_to_folder,
            remove_server_from_folder,
            get_server_folders,
            archive_server,
            restore_server,
            is_server_archived,
            get_archived_servers,
            update_server_customization,
            get_server_customization,
            create_dashboard_layout,
            get_user_layouts,
            delete_layout,
            create_server_group,
            get_all_server_groups,
            log_server_activity,
            get_server_activity_stats,
            get_dashboard_statistics,
            bulk_move_servers,
            bulk_archive_servers,
            bulk_tag_servers,
            bulk_color_servers,
            search_servers,
            get_servers_by_status,
            get_servers_by_map,
            get_servers_by_group,
            get_servers_by_tag,
            get_active_servers,
            get_inactive_servers,
            get_organization_snapshot,
            export_server_organization,
            import_server_organization,
            reorder_servers,
            assign_server_priority,
            auto_archive_inactive_servers,
            get_server_comparison_stats,
        ])
        .build()
}
