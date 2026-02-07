use crate::commands::rcon::RconState;
use crate::commands::scheduler::ScheduledTask;
use crate::AppState;
use chrono::{DateTime, Datelike, Local, Timelike};
// use std::sync::Arc; // Unused
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tokio::time::sleep;

pub struct SchedulerService {
    app_handle: AppHandle,
}

// Helper struct for Basic Mode settings
struct BasicSetting {
    server_id: i64,
    interval: i32,
    warnings: String,
    next_run: Option<String>,
}

impl SchedulerService {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    pub fn start(&self) {
        let app_handle = self.app_handle.clone();

        tauri::async_runtime::spawn(async move {
            println!("📅 Scheduler Service Started");

            loop {
                // Wait for the next minute to start
                let now = Local::now();
                let _verify_time = now; // Capture time for loop processing

                // Calculate seconds until next minute
                let seconds_until_next_minute = 60 - now.second();
                sleep(Duration::from_secs(seconds_until_next_minute as u64)).await;

                // Little buffer to ensure we are in the new minute
                sleep(Duration::from_millis(500)).await;

                let check_time = Local::now();
                Self::process_tasks(&app_handle, check_time).await;
            }
        });
    }

    async fn process_tasks(app_handle: &AppHandle, time: DateTime<Local>) {
        let state = app_handle.state::<AppState>();

        // 1. Process Advanced Tasks
        let advanced_tasks = {
            let db = match state.db.lock() {
                Ok(guard) => guard,
                Err(_) => return,
            };
            let conn = match db.get_connection() {
                Ok(conn) => conn,
                Err(_) => return,
            };

            // Fetch tasks where scheduler mode is Advanced or NULL (Legacy)
            // We ignore servers that are set to 'basic' or 'disabled'
            let mut stmt = match conn.prepare(
                "SELECT t.id, t.server_id, t.task_type, t.cron_expression, t.command, t.message, t.pre_warning_minutes, t.last_run 
                 FROM scheduled_tasks t 
                 LEFT JOIN scheduler_settings s ON t.server_id = s.server_id 
                 WHERE t.enabled = 1 AND (s.mode IS NULL OR s.mode = 'advanced')"
            ) {
                Ok(s) => s,
                Err(_) => return,
            };

            let iter = stmt.query_map([], |row| {
                Ok(ScheduledTask {
                    id: row.get(0)?,
                    server_id: row.get(1)?,
                    task_type: row.get(2)?,
                    cron_expression: row.get(3)?,
                    command: row.get(4)?,
                    message: row.get(5)?,
                    pre_warning_minutes: row.get(6)?,
                    enabled: true,
                    last_run: row.get(7)?,
                    created_at: String::new(),
                })
            });

            match iter {
                Ok(rows) => rows.filter_map(|r| r.ok()).collect::<Vec<_>>(),
                Err(_) => Vec::new(),
            }
        };

        for task in advanced_tasks {
            if Self::is_due(&task.cron_expression, &time) {
                println!(
                    "🚀 Scheduler: Executing Advanced Task {} ({})",
                    task.id, task.task_type
                );
                Self::execute_task(app_handle, &task).await;

                if let Ok(db) = state.db.lock() {
                    if let Ok(conn) = db.get_connection() {
                        let _ = conn.execute(
                            "UPDATE scheduled_tasks SET last_run = CURRENT_TIMESTAMP WHERE id = ?1",
                            [task.id],
                        );
                    }
                }
            } else if task.pre_warning_minutes > 0 {
                // Legacy Cron Warning Logic: hard to predict exactly without parsing cron ahead of time.
                // Advanced mode usually implies user knows cron.
                // We could add a "next_run" column to scheduled_tasks and pre-calc it like Basic mode.
                // For now, retaining primitive support or relying on user to add separate Warning tasks.
            }
        }

        // 2. Process Basic Tasks
        let basic_settings = {
            let db = match state.db.lock() {
                Ok(g) => g,
                Err(_) => return,
            };
            let conn = match db.get_connection() {
                Ok(c) => c,
                Err(_) => return,
            };

            let mut stmt = match conn.prepare("SELECT server_id, basic_interval_hours, basic_warning_minutes, next_run_basic FROM scheduler_settings WHERE mode = 'basic'") {
                 Ok(s) => s,
                 Err(_) => return,
             };

            let iter = stmt.query_map([], |row| {
                Ok(BasicSetting {
                    server_id: row.get(0)?,
                    interval: row.get(1)?,
                    warnings: row.get(2)?,
                    next_run: row.get(3)?,
                })
            });

            match iter {
                Ok(rows) => rows.filter_map(|r| r.ok()).collect::<Vec<_>>(),
                Err(_) => Vec::new(),
            }
        };

        for setting in basic_settings {
            Self::process_basic_mode(app_handle, setting).await;
        }
    }

    async fn process_basic_mode(app_handle: &AppHandle, setting: BasicSetting) {
        let now = Local::now();

        // 1. Determine Target Time
        let next_run = if let Some(nr_str) = &setting.next_run {
            match DateTime::parse_from_rfc3339(nr_str) {
                Ok(dt) => dt.with_timezone(&Local),
                Err(_) => {
                    // Invalid, reset
                    Self::update_next_run(app_handle, setting.server_id, setting.interval, now)
                        .await
                }
            }
        } else {
            // First run? Initialize
            Self::update_next_run(app_handle, setting.server_id, setting.interval, now).await
        };

        let diff = next_run.signed_duration_since(now);
        let seconds_left = diff.num_seconds();

        // 2. Execute if due (within approx 1 min window)
        // Since the loop sleeps to ensure we land in the minute, execution at seconds <= 5 is safe.
        // If we missed it (system down), negative seconds also triggers.
        if seconds_left <= 5 {
            println!(
                "🚀 Basic Scheduler: Restarting Server {}",
                setting.server_id
            );

            // Execute Restart (Basic Mode is Loop Restart)
            let task = ScheduledTask {
                id: 0,
                server_id: setting.server_id,
                task_type: "Restart".to_string(),
                cron_expression: "".to_string(),
                command: None,
                message: None,
                pre_warning_minutes: 0,
                enabled: true,
                last_run: None,
                created_at: String::new(),
            };
            Self::execute_task(app_handle, &task).await;

            // Schedule Next
            Self::update_next_run(app_handle, setting.server_id, setting.interval, next_run).await;
            return;
        }

        // 3. Check Warnings
        let warning_minutes: Vec<i64> = setting
            .warnings
            .split(',')
            .filter_map(|s| s.trim().parse::<i64>().ok())
            .collect();

        let minutes_left = diff.num_minutes();

        if warning_minutes.contains(&minutes_left) {
            // Avoid double spam: only if seconds are "high" (beginning of minute)?
            // Actually, next_run is HH:MM:00. Now is HH:MM-30:SS.
            // diff = 30m 00s -> minutes_left = 30.
            // We only run once per minute. So simplistic check "contains" is fine.

            println!(
                "⚠️ Basic Scheduler: Warning Server {} - {} mins left",
                setting.server_id, minutes_left
            );
            let rcon_state = app_handle.state::<RconState>();
            let rcon = rcon_state.0.lock().await;
            let msg = format!("SERVER RESTARTING IN {} MINUTES", minutes_left);
            let _ = rcon
                .send_command(setting.server_id, &format!("ServerChat {}", msg))
                .await;
            let _ = rcon
                .send_command(setting.server_id, &format!("Broadcast {}", msg))
                .await;
        }
    }

    async fn update_next_run(
        app_handle: &AppHandle,
        server_id: i64,
        interval: i32,
        from_time: DateTime<Local>,
    ) -> DateTime<Local> {
        // Calculate next target: Round Up to next Interval
        // e.g. Interval 6.
        // If last run was 12:00, next is 18:00.
        // If just enabled (from_time = now = 13:00), we want 18:00? Or 19:00 (13+6)?
        // User Requirement: "Simple recurring restart loop".
        // Usually implies absolute time predictability (00, 06, 12, 18).
        // Let's use absolute logic: Next Multiplier of Interval starting from midnight.
        // If interval is 24, next is Midnight.

        // Reset to midnight of From Time
        let midnight = from_time
            .date_naive()
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_local_timezone(Local)
            .unwrap();

        // Add intervals until > from_time
        let mut target = midnight;
        let p_interval = chrono::Duration::hours(interval as i64);

        // Safety: if interval is 0 or negative (db error), default to 24
        let p_interval = if interval <= 0 {
            chrono::Duration::hours(24)
        } else {
            p_interval
        };

        // We want target > from_time + 1 minute (to ensure we don't pick "now" if we just ran)
        let future_threshold = from_time + chrono::Duration::minutes(1);

        while target <= future_threshold {
            target = target + p_interval;
        }

        // Persist
        let state = app_handle.state::<AppState>();
        if let Ok(db) = state.db.lock() {
            if let Ok(conn) = db.get_connection() {
                let _ = conn.execute(
                    "UPDATE scheduler_settings SET next_run_basic = ?1 WHERE server_id = ?2",
                    [target.to_rfc3339(), server_id.to_string()],
                );
            }
        }
        target
    }

    fn is_due(cron_expr: &str, time: &DateTime<Local>) -> bool {
        // Simple Cron Parser matching the one in commands/scheduler.rs validation logic
        // Format: minute hour day month weekday
        let parts: Vec<&str> = cron_expr.trim().split_whitespace().collect();
        if parts.len() != 5 {
            return false;
        }

        let minute = time.minute();
        let hour = time.hour();
        let day = time.day();
        let month = time.month();
        let weekday = time.weekday().num_days_from_sunday(); // 0 = Sunday

        Self::match_cron_part(parts[0], minute as i32, 0, 59)
            && Self::match_cron_part(parts[1], hour as i32, 0, 23)
            && Self::match_cron_part(parts[2], day as i32, 1, 31)
            && Self::match_cron_part(parts[3], month as i32, 1, 12)
            && Self::match_cron_part(parts[4], weekday as i32, 0, 7)
    }

    fn match_cron_part(part: &str, value: i32, _min: i32, _max: i32) -> bool {
        if part == "*" {
            return true;
        }

        // Stepped: */5
        if let Some(step_str) = part.strip_prefix("*/") {
            if let Ok(step) = step_str.parse::<i32>() {
                return value % step == 0;
            }
        }

        // Range: 1-5
        if let Some((start, end)) = part.split_once('-') {
            if let (Ok(s), Ok(e)) = (start.parse::<i32>(), end.parse::<i32>()) {
                return value >= s && value <= e;
            }
        }

        // List: 1,2,3
        if part.contains(',') {
            for v in part.split(',') {
                if let Ok(num) = v.parse::<i32>() {
                    if num == value {
                        return true;
                    }
                }
            }
            return false;
        }

        // Single value
        if let Ok(num) = part.parse::<i32>() {
            return num == value;
        }

        false
    }

    async fn execute_task(app_handle: &AppHandle, task: &ScheduledTask) {
        let state = app_handle.state::<AppState>();

        match task.task_type.as_str() {
            "Restart" => {
                let _ = commands_restart(app_handle, task).await;
            }
            "Stop" => {
                let _ = state.process_manager.stop_server(task.server_id);
            }
            "Start" => {
                // Placeholder
            }
            "RconCommand" => {
                if let Some(cmd) = &task.command {
                    let rcon_state = app_handle.state::<RconState>();
                    let rcon = rcon_state.0.lock().await;
                    let _ = rcon.send_command(task.server_id, cmd).await;
                }
            }
            "BoostStart" => {
                if let Some(cmd) = &task.command {
                    let rcon_state = app_handle.state::<RconState>();
                    let rcon = rcon_state.0.lock().await;

                    if let Some(msg) = &task.message {
                        let _ = rcon
                            .send_command(task.server_id, &format!("ServerChat {}", msg))
                            .await;
                    }

                    let _ = rcon.send_command(task.server_id, cmd).await;
                    println!("🚀 Boost Started for server {}: {}", task.server_id, cmd);
                }
            }
            "BoostEnd" => {
                if let Some(cmd) = &task.command {
                    let rcon_state = app_handle.state::<RconState>();
                    let rcon = rcon_state.0.lock().await;

                    if let Some(msg) = &task.message {
                        let _ = rcon
                            .send_command(task.server_id, &format!("ServerChat {}", msg))
                            .await;
                    }

                    let _ = rcon.send_command(task.server_id, cmd).await;
                    println!("🚀 Boost Ended for server {}: {}", task.server_id, cmd);
                }
            }
            _ => {
                println!("Unknown task type: {}", task.task_type);
            }
        }
    }
}

// Logic helpers
async fn commands_restart(app_handle: &AppHandle, task: &ScheduledTask) {
    let _state = app_handle.state::<AppState>();

    // Warn players if configured (Legacy handling for explicit tasks)
    if task.pre_warning_minutes > 0 {
        let rcon_state = app_handle.state::<RconState>();
        let rcon = rcon_state.0.lock().await;
        let msg = format!(
            "⚠️ SERVER RESTARTING IN {} MINUTES",
            task.pre_warning_minutes
        );
        let _ = rcon
            .send_command(task.server_id, &format!("ServerChat {}", msg))
            .await;
    }

    // Call restart command from server module
    let state = app_handle.state::<AppState>();
    match crate::commands::server::restart_server(state, task.server_id).await {
        Ok(_) => println!(
            "  ✅ Scheduled restart initiated for server {}",
            task.server_id
        ),
        Err(e) => println!(
            "  ❌ Scheduled restart failed for server {}: {}",
            task.server_id, e
        ),
    }
}
