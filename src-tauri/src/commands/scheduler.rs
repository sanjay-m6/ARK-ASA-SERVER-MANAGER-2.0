// Scheduler Commands for ASA Server Manager
// Provides persistence for scheduled tasks

use crate::models::SchedulerSettings;
use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledTask {
    pub id: i64,
    pub server_id: i64,
    pub task_name: Option<String>,
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
    pub task_name: Option<String>,
    pub task_type: String,
    pub cron_expression: String,
    pub command: Option<String>,
    pub message: Option<String>,
    pub pre_warning_minutes: i32,
}

/// Validate a cron expression format
/// Expects 5 fields: minute hour day month weekday (standard cron format)
/// Each field can be *, a number, or a range/step expression
fn validate_cron_expression(expr: &str) -> Result<(), String> {
    if expr == "@online" {
        return Ok(());
    }
    let parts: Vec<&str> = expr.split_whitespace().collect();

    if parts.len() != 5 {
        return Err(format!(
            "Invalid cron expression: expected 5 parts (minute hour day month weekday), got {}",
            parts.len()
        ));
    }

    let ranges = [
        (0, 59, "minute"),
        (0, 23, "hour"),
        (1, 31, "day"),
        (1, 12, "month"),
        (0, 7, "weekday"), // 0 and 7 are Sunday
    ];

    for (part, (min, max, name)) in parts.iter().zip(ranges.iter()) {
        if *part == "*" {
            continue;
        }

        // Handle step expressions: */5
        if let Some(step_str) = part.strip_prefix("*/") {
            match step_str.parse::<i32>() {
                Ok(step) if step > 0 => continue,
                _ => return Err(format!("Invalid step value in {} field: {}", name, part)),
            }
        }

        // Handle range: 1-5
        if part.contains('-') {
            let range_parts: Vec<&str> = part.split('-').collect();
            if range_parts.len() == 2 {
                let start: i32 = range_parts[0]
                    .parse()
                    .map_err(|_| format!("Invalid range start in {} field: {}", name, part))?;
                let end: i32 = range_parts[1]
                    .parse()
                    .map_err(|_| format!("Invalid range end in {} field: {}", name, part))?;
                if start >= *min && end <= *max && start <= end {
                    continue;
                }
                return Err(format!(
                    "Range out of bounds in {} field: {} (valid: {}-{})",
                    name, part, min, max
                ));
            }
        }

        // Handle comma-separated values: 1,2,3
        if part.contains(',') {
            for val in part.split(',') {
                let num: i32 = val
                    .parse()
                    .map_err(|_| format!("Invalid value '{}' in {} field", val, name))?;
                if num < *min || num > *max {
                    return Err(format!(
                        "Value {} out of range in {} field (valid: {}-{})",
                        num, name, min, max
                    ));
                }
            }
            continue;
        }

        // Handle single number
        let num: i32 = part
            .parse()
            .map_err(|_| format!("Invalid {} field: '{}' (expected number or *)", name, part))?;
        if num < *min || num > *max {
            return Err(format!(
                "{} field value {} out of range (valid: {}-{})",
                name, num, min, max
            ));
        }
    }

    Ok(())
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
                    pre_warning_minutes, enabled, last_run, created_at, task_name
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
                task_name: row.get(10).unwrap_or(None),
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

    // Validate cron expression
    validate_cron_expression(&request.cron_expression)?;

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO scheduled_tasks (server_id, task_name, task_type, cron_expression, command, message, pre_warning_minutes, enabled)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)",
        rusqlite::params![
            request.server_id,
            request.task_name,
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
        task_name: request.task_name,
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

fn calculate_future_basic_run(interval_hours: i32) -> String {
    let now = chrono::Local::now();
    let midnight = match now.date_naive().and_hms_opt(0, 0, 0) {
        Some(naive) => match naive.and_local_timezone(chrono::Local) {
            chrono::LocalResult::Single(t) => t,
            _ => now,
        },
        None => now,
    };

    let interval = if interval_hours <= 0 { 24 } else { interval_hours as i64 };
    let p_interval = chrono::Duration::hours(interval);
    let mut target = midnight;
    let threshold = now + chrono::Duration::minutes(1);

    while target <= threshold {
        target += p_interval;
    }

    target.to_rfc3339()
}

/// Get scheduler settings for a server (Basic vs Advanced mode)
#[tauri::command]
pub async fn get_scheduler_settings(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<SchedulerSettings, String> {
    println!("⚙️ Getting scheduler settings for server {}", server_id);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let result = conn.query_row(
        "SELECT mode, basic_interval_hours, basic_warning_minutes, next_run_basic,
                advanced_time, advanced_days, advanced_warning_minutes, 
                advanced_shutdown, advanced_backup, advanced_update, advanced_restart, advanced_dino_wipe,
                watchdog_enabled
         FROM scheduler_settings WHERE server_id = ?1",
        [server_id],
        |row| {
            Ok(SchedulerSettings {
                server_id,
                mode: row.get(0)?,
                basic_interval_hours: row.get(1)?,
                basic_warning_minutes: row.get(2)?,
                next_run_basic: row.get(3)?,
                advanced_time: row.get(4).unwrap_or(None),
                advanced_days: row.get(5).unwrap_or(None),
                advanced_warning_minutes: row.get(6).unwrap_or(None),
                advanced_shutdown: row.get(7).unwrap_or(Some(false)),
                advanced_backup: row.get(8).unwrap_or(Some(false)),
                advanced_update: row.get(9).unwrap_or(Some(false)),
                advanced_restart: row.get(10).unwrap_or(Some(false)),
                advanced_dino_wipe: row.get(11).unwrap_or(Some(false)),
                watchdog_enabled: row.get(12).unwrap_or(Some(false)),
            })
        },
    );

    match result {
        Ok(mut settings) => {
            if settings.mode == "basic" {
                let is_stale = match &settings.next_run_basic {
                    Some(nr) => match crate::services::scheduler::parse_db_datetime_local(nr) {
                        Some(dt) => dt < chrono::Local::now() - chrono::Duration::minutes(1),
                        None => true,
                    },
                    None => true,
                };
                if is_stale {
                    let future_run = calculate_future_basic_run(settings.basic_interval_hours);
                    let _ = conn.execute(
                        "UPDATE scheduler_settings SET next_run_basic = ?1 WHERE server_id = ?2",
                        rusqlite::params![future_run, server_id],
                    );
                    settings.next_run_basic = Some(future_run);
                }
            }
            Ok(settings)
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            // Return default settings if no record exists
            Ok(SchedulerSettings {
                server_id,
                mode: "disabled".to_string(), // Default safe state
                basic_interval_hours: 6,      // Default 6 hours
                basic_warning_minutes: "30,10,5,1".to_string(),
                next_run_basic: None,
                advanced_time: Some("06:00".to_string()),
                advanced_days: None,
                advanced_warning_minutes: Some("30,15,10,5,1".to_string()),
                advanced_shutdown: Some(false),
                advanced_backup: Some(false),
                advanced_update: Some(false),
                advanced_restart: Some(false),
                advanced_dino_wipe: Some(false),
                watchdog_enabled: Some(false),
            })
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Save scheduler settings
#[tauri::command]
pub async fn save_scheduler_settings(
    state: State<'_, AppState>,
    guardian: State<'_, crate::services::guardian::GuardianState>,
    mut settings: SchedulerSettings,
) -> Result<(), String> {
    println!(
        "💾 Saving scheduler settings for server {}",
        settings.server_id
    );

    if settings.mode == "basic" {
        let is_stale = match &settings.next_run_basic {
            Some(nr) => match crate::services::scheduler::parse_db_datetime_local(nr) {
                Some(dt) => dt <= chrono::Local::now(),
                None => true,
            },
            None => true,
        };
        if is_stale {
            settings.next_run_basic = Some(calculate_future_basic_run(settings.basic_interval_hours));
        }
    }

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO scheduler_settings (
                server_id, mode, basic_interval_hours, basic_warning_minutes, next_run_basic,
                advanced_time, advanced_days, advanced_warning_minutes,
                advanced_shutdown, advanced_backup, advanced_update, advanced_restart, advanced_dino_wipe, watchdog_enabled
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
             ON CONFLICT(server_id) DO UPDATE SET
                mode = excluded.mode,
                basic_interval_hours = excluded.basic_interval_hours,
                basic_warning_minutes = excluded.basic_warning_minutes,
                next_run_basic = excluded.next_run_basic,
                advanced_time = excluded.advanced_time,
                advanced_days = excluded.advanced_days,
                advanced_warning_minutes = excluded.advanced_warning_minutes,
                advanced_shutdown = excluded.advanced_shutdown,
                advanced_backup = excluded.advanced_backup,
                advanced_update = excluded.advanced_update,
                advanced_restart = excluded.advanced_restart,
                advanced_dino_wipe = excluded.advanced_dino_wipe,
                watchdog_enabled = excluded.watchdog_enabled",
            rusqlite::params![
                settings.server_id,
                settings.mode,
                settings.basic_interval_hours,
                settings.basic_warning_minutes,
                settings.next_run_basic,
                settings.advanced_time,
                settings.advanced_days,
                settings.advanced_warning_minutes,
                settings.advanced_shutdown,
                settings.advanced_backup,
                settings.advanced_update,
                settings.advanced_restart,
                settings.advanced_dino_wipe,
                settings.watchdog_enabled,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    // Sync Guardian watchdog state
    let _ = crate::services::guardian::set_auto_restart(
        guardian,
        settings.server_id,
        settings.watchdog_enabled.unwrap_or(false),
    )
    .await;

    Ok(())
}
