use crate::AppState;
use crate::services::mod_watchdog::WatchdogConfig;
use tauri::State;

#[tauri::command]
pub async fn get_watchdog_config(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<WatchdogConfig, String> {
    Ok(state.mod_watchdog.get_config(server_id).await)
}

#[tauri::command]
pub async fn set_watchdog_config(
    state: State<'_, AppState>,
    server_id: i64,
    config: WatchdogConfig,
) -> Result<(), String> {
    state.mod_watchdog.set_config(server_id, config).await;
    Ok(())
}
