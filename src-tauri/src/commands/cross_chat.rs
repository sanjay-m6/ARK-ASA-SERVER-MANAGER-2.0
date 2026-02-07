use crate::services::cross_chat::CrossChatServer;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn enable_cross_chat(
    state: State<'_, AppState>,
    cluster_id: i64,
    servers: Vec<CrossChatServer>,
) -> Result<(), String> {
    // 1. Enable RCON connection and store config
    state
        .cross_chat
        .enable_for_cluster(cluster_id, servers.clone())
        .await?;

    // 2. Start Log Watchers for chat relay
    let service = state.cross_chat.clone();
    tokio::spawn(async move {
        service.start_chat_relay(cluster_id, servers).await;
    });

    Ok(())
}

#[tauri::command]
pub async fn disable_cross_chat(state: State<'_, AppState>, cluster_id: i64) -> Result<(), String> {
    state.cross_chat.disable_for_cluster(cluster_id).await
}

#[tauri::command]
pub async fn is_cross_chat_enabled(
    state: State<'_, AppState>,
    cluster_id: i64,
) -> Result<bool, String> {
    Ok(state.cross_chat.is_enabled(cluster_id).await)
}
