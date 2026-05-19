use crate::ase::models::AseScheduledTask;
use crate::AppState;
use tauri::State;

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
