// RCON Commands for ASA Server Manager
// Exposes RCON functionality to the frontend

use crate::models::{RconPlayer, RconResponse};
use crate::services::rcon::RconService;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

pub struct RconState(pub Arc<Mutex<RconService>>);

/// Connect to a server's RCON
#[tauri::command]
pub async fn rcon_connect(
    state: State<'_, RconState>,
    server_id: i64,
    address: String,
    port: u16,
    password: String,
) -> Result<RconResponse, String> {
    let service = state.0.lock().await;
    service.connect(server_id, &address, port, &password).await
}

/// Disconnect from a server's RCON
#[tauri::command]
pub async fn rcon_disconnect(
    state: State<'_, RconState>,
    server_id: i64,
) -> Result<RconResponse, String> {
    let service = state.0.lock().await;
    service.disconnect(server_id).await
}

/// Send a raw RCON command
#[tauri::command]
pub async fn rcon_send_command(
    state: State<'_, RconState>,
    server_id: i64,
    command: String,
) -> Result<RconResponse, String> {
    let service = state.0.lock().await;
    service.send_command(server_id, &command).await
}

/// Get list of online players
#[tauri::command]
pub async fn rcon_get_players(
    state: State<'_, RconState>,
    server_id: i64,
) -> Result<Vec<RconPlayer>, String> {
    let service = state.0.lock().await;
    service.get_players(server_id).await
}

/// Broadcast a message to all players
#[tauri::command]
pub async fn rcon_broadcast(
    state: State<'_, RconState>,
    server_id: i64,
    message: String,
) -> Result<RconResponse, String> {
    let service = state.0.lock().await;
    service.broadcast(server_id, &message).await
}

/// Kick a player from the server
#[tauri::command]
pub async fn rcon_kick_player(
    state: State<'_, RconState>,
    server_id: i64,
    steam_id: String,
    reason: Option<String>,
) -> Result<RconResponse, String> {
    let service = state.0.lock().await;
    service
        .kick_player(server_id, &steam_id, reason.as_deref())
        .await
}

/// Ban a player from the server
#[tauri::command]
pub async fn rcon_ban_player(
    state: State<'_, RconState>,
    server_id: i64,
    steam_id: String,
) -> Result<RconResponse, String> {
    let service = state.0.lock().await;
    service.ban_player(server_id, &steam_id).await
}

/// Unban a player
#[tauri::command]
pub async fn rcon_unban_player(
    state: State<'_, RconState>,
    server_id: i64,
    steam_id: String,
) -> Result<RconResponse, String> {
    let service = state.0.lock().await;
    service.unban_player(server_id, &steam_id).await
}

/// Save the world
#[tauri::command]
pub async fn rcon_save_world(
    state: State<'_, RconState>,
    server_id: i64,
) -> Result<RconResponse, String> {
    let service = state.0.lock().await;
    service.save_world(server_id).await
}

/// Destroy all wild dinos
#[tauri::command]
pub async fn rcon_destroy_wild_dinos(
    state: State<'_, RconState>,
    server_id: i64,
) -> Result<RconResponse, String> {
    let service = state.0.lock().await;
    service.destroy_wild_dinos(server_id).await
}

/// Set the time of day
#[tauri::command]
pub async fn rcon_set_time(
    state: State<'_, RconState>,
    server_id: i64,
    hour: u8,
    minute: u8,
) -> Result<RconResponse, String> {
    let service = state.0.lock().await;
    service.set_time(server_id, hour, minute).await
}

/// Send a private message to a player
#[tauri::command]
pub async fn rcon_message_player(
    state: State<'_, RconState>,
    server_id: i64,
    steam_id: String,
    message: String,
) -> Result<RconResponse, String> {
    let service = state.0.lock().await;
    service.message_player(server_id, &steam_id, &message).await
}

/// Check if RCON is connected to a server
#[tauri::command]
pub async fn rcon_is_connected(
    state: State<'_, RconState>,
    server_id: i64,
) -> Result<bool, String> {
    let service = state.0.lock().await;
    Ok(service.is_connected(server_id).await)
}
