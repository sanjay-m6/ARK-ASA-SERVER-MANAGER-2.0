use crate::ase::models::AseScheduledTask;
use crate::AppState;
use tauri::State;
use tauri::Manager;

#[tauri::command]
pub async fn get_ase_scheduled_tasks(server_id: i64, state: State<'_, AppState>) -> Result<Vec<AseScheduledTask>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, server_id, task_type, cron_expr, enabled, last_run \
         FROM ase_scheduled_tasks WHERE server_id = ?1"
    ).map_err(|e| e.to_string())?;

    let mut tasks = Vec::new();
    let mut rows = stmt.query([server_id]).map_err(|e| e.to_string())?;

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        tasks.push(AseScheduledTask {
            id: row.get(0).map_err(|e| e.to_string())?,
            server_id: row.get(1).map_err(|e| e.to_string())?,
            task_type: row.get(2).map_err(|e| e.to_string())?,
            cron_expr: row.get(3).map_err(|e| e.to_string())?,
            enabled: row.get(4).map_err(|e| e.to_string())?,
            last_run: row.get(5).map_err(|e| e.to_string())?,
        });
    }

    Ok(tasks)
}

#[tauri::command]
pub async fn create_ase_scheduled_task(
    server_id: i64, task_type: String, cron_expr: String, enabled: bool,
    state: State<'_, AppState>,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO ase_scheduled_tasks (server_id, task_type, cron_expr, enabled) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![server_id, task_type, cron_expr, enabled],
    ).map_err(|e| e.to_string())?;

    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub async fn toggle_ase_scheduled_task(task_id: i64, enabled: bool, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE ase_scheduled_tasks SET enabled = ?1 WHERE id = ?2",
        rusqlite::params![enabled, task_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_ase_scheduled_task(task_id: i64, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM ase_scheduled_tasks WHERE id = ?1", [task_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

use crate::ase::models::AseSchedulerSettings;

#[tauri::command]
pub async fn get_ase_scheduler_settings(
    server_id: i64,
    state: State<'_, AppState>,
) -> Result<AseSchedulerSettings, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    // Try querying first
    let row_result = conn.query_row(
        "SELECT server_id, mode, basic_interval_hours, basic_warning_minutes, next_run_basic, \
         advanced_time, advanced_days, advanced_warning_minutes, advanced_shutdown, advanced_update, \
         advanced_restart, advanced_dino_wipe, watchdog_enabled, backup_on_restart, backup_on_update, include_cluster_backup \
         FROM ase_scheduler_settings WHERE server_id = ?1",
        [server_id],
        |row| {
            Ok(AseSchedulerSettings {
                server_id: row.get(0)?,
                mode: row.get(1)?,
                basic_interval_hours: row.get(2)?,
                basic_warning_minutes: row.get(3)?,
                next_run_basic: row.get(4)?,
                advanced_time: row.get(5)?,
                advanced_days: row.get(6)?,
                advanced_warning_minutes: row.get(7)?,
                advanced_shutdown: row.get::<_, i32>(8)? != 0,
                advanced_update: row.get::<_, i32>(9)? != 0,
                advanced_restart: row.get::<_, i32>(10)? != 0,
                advanced_dino_wipe: row.get::<_, i32>(11)? != 0,
                watchdog_enabled: row.get::<_, i32>(12)? != 0,
                backup_on_restart: row.get::<_, i32>(13)? != 0,
                backup_on_update: row.get::<_, i32>(14)? != 0,
                include_cluster_backup: row.get::<_, i32>(15)? != 0,
            })
        },
    );

    match row_result {
        Ok(settings) => Ok(settings),
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            // Insert defaults and return
            conn.execute(
                "INSERT INTO ase_scheduler_settings (server_id, mode, basic_interval_hours, basic_warning_minutes, \
                 advanced_shutdown, advanced_update, advanced_restart, advanced_dino_wipe, watchdog_enabled, \
                 backup_on_restart, backup_on_update, include_cluster_backup) \
                 VALUES (?1, 'disabled', 24, '30,15,10,5,1', 0, 0, 0, 0, 0, 0, 0, 0)",
                [server_id],
            ).map_err(|e| e.to_string())?;

            Ok(AseSchedulerSettings {
                server_id,
                mode: "disabled".to_string(),
                basic_interval_hours: 24,
                basic_warning_minutes: "30,15,10,5,1".to_string(),
                next_run_basic: None,
                advanced_time: None,
                advanced_days: None,
                advanced_warning_minutes: None,
                advanced_shutdown: false,
                advanced_update: false,
                advanced_restart: false,
                advanced_dino_wipe: false,
                watchdog_enabled: false,
                backup_on_restart: false,
                backup_on_update: false,
                include_cluster_backup: false,
            })
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn save_ase_scheduler_settings(
    settings: AseSchedulerSettings,
    state: State<'_, AppState>,
) -> Result<(), String> {
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO ase_scheduler_settings (server_id, mode, basic_interval_hours, basic_warning_minutes, next_run_basic, \
             advanced_time, advanced_days, advanced_warning_minutes, advanced_shutdown, advanced_update, \
             advanced_restart, advanced_dino_wipe, watchdog_enabled, backup_on_restart, backup_on_update, include_cluster_backup) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16) \
             ON CONFLICT(server_id) DO UPDATE SET \
             mode = ?2, basic_interval_hours = ?3, basic_warning_minutes = ?4, next_run_basic = ?5, \
             advanced_time = ?6, advanced_days = ?7, advanced_warning_minutes = ?8, advanced_shutdown = ?9, \
             advanced_update = ?10, advanced_restart = ?11, advanced_dino_wipe = ?12, watchdog_enabled = ?13, \
             backup_on_restart = ?14, backup_on_update = ?15, include_cluster_backup = ?16",
            rusqlite::params![
                settings.server_id,
                settings.mode,
                settings.basic_interval_hours,
                settings.basic_warning_minutes,
                settings.next_run_basic,
                settings.advanced_time,
                settings.advanced_days,
                settings.advanced_warning_minutes,
                settings.advanced_shutdown as i32,
                settings.advanced_update as i32,
                settings.advanced_restart as i32,
                settings.advanced_dino_wipe as i32,
                settings.watchdog_enabled as i32,
                settings.backup_on_restart as i32,
                settings.backup_on_update as i32,
                settings.include_cluster_backup as i32,
            ],
        ).map_err(|e| e.to_string())?;
    }

    // Update in-memory auto-restart cache in Guardian Service
    if let Some(guardian) = state.app_handle.try_state::<crate::services::guardian::GuardianState>() {
        let service = guardian.0.lock().await;
        service.set_auto_restart(-settings.server_id, settings.watchdog_enabled).await;
    }

    Ok(())
}
