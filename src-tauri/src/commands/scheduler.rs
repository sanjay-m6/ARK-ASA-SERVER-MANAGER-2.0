// Scheduler Commands for ASA Server Manager
// Provides persistence for scheduled tasks

use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledTask {
    pub id: i64,
    pub server_id: i64,
    pub task_type: String,
    pub cron_expression: String,
    pub command: Option<String>,
    pub message: Option<String>,
    pub pre_warning_minutes: i32,
    pub enabled: bool,
    pub last_run: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskRequest {
    pub server_id: i64,
    pub task_type: String,
    pub cron_expression: String,
    pub command: Option<String>,
    pub message: Option<String>,
    pub pre_warning_minutes: i32,
}

/// Get all scheduled tasks for a server
#[tauri::command]
pub async fn get_scheduled_tasks(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Vec<ScheduledTask>, String> {
    println!("📅 Getting scheduled tasks for server {}", server_id);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, server_id, task_type, cron_expression, command, message, 
                    pre_warning_minutes, enabled, last_run, created_at 
             FROM scheduled_tasks WHERE server_id = ?1 ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let task_iter = stmt
        .query_map([server_id], |row| {
            Ok(ScheduledTask {
                id: row.get(0)?,
                server_id: row.get(1)?,
                task_type: row.get(2)?,
                cron_expression: row.get(3)?,
                command: row.get(4)?,
                message: row.get(5)?,
                pre_warning_minutes: row.get(6)?,
                enabled: row.get::<_, i32>(7)? == 1,
                last_run: row.get(8)?,
                created_at: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let tasks: Vec<ScheduledTask> = task_iter.filter_map(|t| t.ok()).collect();

    println!("  Found {} tasks", tasks.len());
    Ok(tasks)
}

/// Create a new scheduled task
#[tauri::command]
pub async fn create_scheduled_task(
    state: State<'_, AppState>,
    request: CreateTaskRequest,
) -> Result<ScheduledTask, String> {
    println!(
        "➕ Creating scheduled task: {} for server {}",
        request.task_type, request.server_id
    );

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO scheduled_tasks (server_id, task_type, cron_expression, command, message, pre_warning_minutes, enabled)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)",
        rusqlite::params![
            request.server_id,
            request.task_type,
            request.cron_expression,
            request.command,
            request.message,
            request.pre_warning_minutes,
        ],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    let task = ScheduledTask {
        id,
        server_id: request.server_id,
        task_type: request.task_type,
        cron_expression: request.cron_expression,
        command: request.command,
        message: request.message,
        pre_warning_minutes: request.pre_warning_minutes,
        enabled: true,
        last_run: None,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    println!("  ✅ Created task with ID {}", id);
    Ok(task)
}

/// Update a scheduled task's enabled status
#[tauri::command]
pub async fn toggle_scheduled_task(
    state: State<'_, AppState>,
    task_id: i64,
    enabled: bool,
) -> Result<(), String> {
    println!("🔄 Toggling task {} to {}", task_id, enabled);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE scheduled_tasks SET enabled = ?1 WHERE id = ?2",
        rusqlite::params![if enabled { 1 } else { 0 }, task_id],
    )
    .map_err(|e| e.to_string())?;

    println!("  ✅ Task updated");
    Ok(())
}

/// Delete a scheduled task
#[tauri::command]
pub async fn delete_scheduled_task(state: State<'_, AppState>, task_id: i64) -> Result<(), String> {
    println!("🗑️ Deleting scheduled task {}", task_id);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM scheduled_tasks WHERE id = ?1", [task_id])
        .map_err(|e| e.to_string())?;

    println!("  ✅ Task deleted");
    Ok(())
}

/// Update task's last run time
#[tauri::command]
pub async fn update_task_last_run(state: State<'_, AppState>, task_id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE scheduled_tasks SET last_run = CURRENT_TIMESTAMP WHERE id = ?1",
        [task_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
