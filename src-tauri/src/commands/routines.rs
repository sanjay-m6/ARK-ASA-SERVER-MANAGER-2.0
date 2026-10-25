use crate::services::routines::{self, Routine, RunningRoutine, SELECT_COLUMNS};
use crate::AppState;
use tauri::State;

fn validate(routine: &Routine) -> Result<(), String> {
    if routine.name.trim().is_empty() {
        return Err("Routine name is required".into());
    }
    if routine.steps.is_empty() {
        return Err("Add at least one step".into());
    }
    let cron = routine.cron_expression.trim();
    if cron != "@manual" && cron.split_whitespace().count() != 5 {
        return Err(format!("Invalid schedule '{}'", cron));
    }
    Ok(())
}

#[tauri::command]
pub async fn get_routines(state: State<'_, AppState>, server_id: Option<i64>) -> Result<Vec<Routine>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    routines::ensure_table(&conn)?;
    let sql = format!(
        "SELECT {} FROM scheduled_routines WHERE (?1 IS NULL OR server_id = ?1) ORDER BY server_id, name",
        SELECT_COLUMNS
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([server_id], routines::row_to_routine)
        .map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

/// Insert (id == 0) or update a routine; returns its id
#[tauri::command]
pub async fn save_routine(state: State<'_, AppState>, routine: Routine) -> Result<i64, String> {
    validate(&routine)?;
    let steps_json = serde_json::to_string(&routine.steps).map_err(|e| e.to_string())?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    routines::ensure_table(&conn)?;
    if routine.id > 0 {
        conn.execute(
            "UPDATE scheduled_routines SET server_id = ?1, name = ?2, enabled = ?3, cron_expression = ?4,
                 run_once = ?5, steps_json = ?6 WHERE id = ?7",
            rusqlite::params![
                routine.server_id, routine.name.trim(), routine.enabled, routine.cron_expression.trim(),
                routine.run_once, steps_json, routine.id
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(routine.id)
    } else {
        conn.execute(
            "INSERT INTO scheduled_routines (server_id, name, enabled, cron_expression, run_once, steps_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                routine.server_id, routine.name.trim(), routine.enabled, routine.cron_expression.trim(),
                routine.run_once, steps_json
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(conn.last_insert_rowid())
    }
}

#[tauri::command]
pub async fn delete_routine(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    routines::ensure_table(&conn)?;
    conn.execute("DELETE FROM scheduled_routines WHERE id = ?1", [id])
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_routine_enabled(state: State<'_, AppState>, id: i64, enabled: bool) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    routines::ensure_table(&conn)?;
    conn.execute("UPDATE scheduled_routines SET enabled = ?1 WHERE id = ?2", rusqlite::params![enabled, id])
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn run_routine_now(app_handle: tauri::AppHandle, state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let routine = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        routines::ensure_table(&conn)?;
        conn.query_row(
            &format!("SELECT {} FROM scheduled_routines WHERE id = ?1", SELECT_COLUMNS),
            [id],
            routines::row_to_routine,
        )
        .map_err(|e| format!("Routine not found: {}", e))?
    };
    routines::start(app_handle, routine)
}

#[tauri::command]
pub async fn cancel_routine(server_id: i64) -> Result<bool, String> {
    Ok(routines::cancel(server_id))
}

#[tauri::command]
pub async fn get_running_routines() -> Result<Vec<RunningRoutine>, String> {
    Ok(routines::running_routines())
}
