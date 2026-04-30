use crate::commands::rcon::RconState;
use crate::commands::scheduler::ScheduledTask;
use crate::models::{Backup, BackupOptions, BackupType, RestoreOptions};
use crate::services::backup_service::BackupService;
use crate::AppState;
use chrono::{DateTime, Datelike, Local, Timelike};
use rusqlite::params;
use std::path::PathBuf;
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
            log::info!("📅 Scheduler Service Started");

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
                "SELECT t.id, t.server_id, t.task_type, t.cron_expression, t.command, t.message, t.pre_warning_minutes, t.last_run, t.task_name 
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
                    task_name: row.get(8).unwrap_or(None),
                })
            });

            match iter {
                Ok(rows) => rows.filter_map(|r| r.ok()).collect::<Vec<_>>(),
                Err(_) => Vec::new(),
            }
        };

        for task in advanced_tasks {
            if Self::is_due(&task.cron_expression, &time) {
                log::info!(
                    "🚀 Scheduler: Executing Advanced Task {} ({})",
                    task.id,
                    task.task_type
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
            log::info!(
                "🚀 Basic Scheduler: Restarting Server {}",
                setting.server_id
            );

            // Execute Restart (Basic Mode is Loop Restart)
            let task = ScheduledTask {
                id: 0,
                server_id: setting.server_id,
                task_name: Some("Basic Scheduler Restart".to_string()),
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

            log::warn!(
                "⚠️ Basic Scheduler: Warning Server {} - {} mins left",
                setting.server_id,
                minutes_left
            );
            let rcon_state = app_handle.state::<RconState>();
            let rcon = &rcon_state.0;
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
        let midnight = match from_time
            .date_naive()
            .and_hms_opt(0, 0, 0)
        {
            Some(naive) => match naive.and_local_timezone(Local) {
                chrono::LocalResult::Single(t) => t,
                _ => from_time, // Fallback: use from_time if timezone conversion fails
            },
            None => from_time, // Fallback: use from_time if midnight construction fails
        };

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
            target += p_interval;
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

    /// Create and persist a pre-update backup for a server.
    /// Returns the created `Backup` and the server install path on success.
    fn create_preupdate_backup_for_server(
        app_handle: &AppHandle,
        server_id: i64,
    ) -> Option<(Backup, PathBuf)> {
        let state = app_handle.state::<AppState>();

        // Look up install path and choose backup root
        let (install_path, app_data_dir) = {
            let db = state.db.lock().ok()?;
            let conn = db.get_connection().ok()?;

            let install_path: String = conn
                .query_row(
                    "SELECT install_path FROM servers WHERE id = ?1",
                    [server_id],
                    |row| row.get(0),
                )
                .ok()?;

            // Keep consistent with backup commands
            let app_data_dir = PathBuf::from("C:/ASA_Backups");
            (install_path, app_data_dir)
        };

        let backup_dir = BackupService::get_backup_dir(&app_data_dir, server_id);

        let options = BackupOptions {
            include_configs: true,
            include_mods: true,
            include_saves: true,
            include_cluster: true,
            compression_level: 6,
        };

        let mut backup = match BackupService::create_backup(
            &PathBuf::from(&install_path),
            &backup_dir,
            server_id,
            BackupType::PreUpdate,
            &options,
        ) {
            Ok(b) => b,
            Err(e) => {
                log::error!(
                    "❌ Failed to create pre-update backup for server {}: {}",
                    server_id,
                    e
                );
                return None;
            }
        };

        // Save backup to database so it appears in the Backups UI
        {
            let db = state.db.lock().ok()?;
            let conn = db.get_connection().ok()?;

            if conn
                .execute(
                    "INSERT INTO backups (server_id, backup_type, file_path, size, includes_configs, includes_mods, includes_saves, includes_cluster, verified, created_at) 
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                    params![
                        backup.server_id,
                        backup.backup_type.to_string(),
                        backup.file_path.to_string_lossy().to_string(),
                        backup.size,
                        backup.includes_configs,
                        backup.includes_mods,
                        backup.includes_saves,
                        backup.includes_cluster,
                        backup.verified,
                        backup.created_at,
                    ],
                )
                .is_err()
            {
                log::error!(
                    "❌ Failed to record pre-update backup in database for server {}",
                    server_id
                );
                return None;
            }

            backup.id = conn.last_insert_rowid();
        }

        let install_path_buf = PathBuf::from(install_path);

        log::info!(
            "💾 Created pre-update backup {} for server {} at {:?}",
            backup.id,
            server_id,
            backup.file_path
        );

        Some((backup, install_path_buf))
    }

    fn is_due(cron_expr: &str, time: &DateTime<Local>) -> bool {
        // Simple Cron Parser matching the one in commands/scheduler.rs validation logic
        // Format: minute hour day month weekday
        let parts: Vec<&str> = cron_expr.split_whitespace().collect();
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
                let _ = state.process_manager.stop_server_with_reason(
                    task.server_id,
                    crate::services::process_manager::StopReason::ScheduledRestart,
                );
            }
            "Start" => {
                // Placeholder
            }
            "RconCommand" => {
                if let Some(cmd) = &task.command {
                    let rcon_state = app_handle.state::<RconState>();
                    let rcon = &rcon_state.0;
                    let _ = rcon.send_command(task.server_id, cmd).await;
                }
            }
            "BoostStart" => {
                if let Some(cmd) = &task.command {
                    let rcon_state = app_handle.state::<RconState>();
                    let rcon = &rcon_state.0;

                    if let Some(msg) = &task.message {
                        let _ = rcon
                            .send_command(task.server_id, &format!("ServerChat {}", msg))
                            .await;
                    }

                    let _ = rcon.send_command(task.server_id, cmd).await;
                    log::info!("🚀 Boost Started for server {}: {}", task.server_id, cmd);
                }
            }
            "BoostEnd" => {
                if let Some(cmd) = &task.command {
                    let rcon_state = app_handle.state::<RconState>();
                    let rcon = &rcon_state.0;

                    if let Some(msg) = &task.message {
                        let _ = rcon
                            .send_command(task.server_id, &format!("ServerChat {}", msg))
                            .await;
                    }

                    let _ = rcon.send_command(task.server_id, cmd).await;
                    log::info!("🚀 Boost Ended for server {}: {}", task.server_id, cmd);
                }
            }
            "AutoUpdateMods" => {
                let server_id = task.server_id;
                let app = app_handle.clone();
                let pre_warning_minutes = if task.pre_warning_minutes > 0 {
                    task.pre_warning_minutes
                } else {
                    15
                };

                // Spawn check and potential update + rollback sequence
                tauri::async_runtime::spawn(async move {
                    log::info!("🔎 checking for mod updates on server {}...", server_id);

                    // 1. Get Server Details & Mods
                    let state = app.state::<AppState>();
                    let (last_started, enabled_mods) = {
                        let db = state.db.lock().map_err(|e| e.to_string());
                        if let Ok(db) = db {
                            if let Ok(conn) = db.get_connection() {
                                let last_started: Option<String> = conn
                                    .query_row(
                                        "SELECT last_started FROM servers WHERE id = ?1",
                                        [server_id],
                                        |row| row.get(0),
                                    )
                                    .unwrap_or(None);

                                let stmt_result = conn.prepare(
                                    "SELECT mod_id FROM mods WHERE server_id = ?1 AND enabled = 1"
                                );

                                let mods: Vec<i32> = match stmt_result {
                                    Ok(mut stmt) => {
                                        match stmt.query_map([server_id], |row| {
                                            let s: String = row.get(0)?;
                                            Ok(s.parse::<i32>().unwrap_or(0))
                                        }) {
                                            Ok(rows) => rows
                                                .filter_map(|r| r.ok())
                                                .filter(|&id| id > 0)
                                                .collect(),
                                            Err(_) => vec![],
                                        }
                                    }
                                    Err(e) => {
                                        log::warn!("[SCHEDULER] Failed to query mods: {}", e);
                                        vec![]
                                    }
                                };

                                (last_started, mods)
                            } else {
                                (None, vec![])
                            }
                        } else {
                            (None, vec![])
                        }
                    };

                    if enabled_mods.is_empty() {
                        log::info!(
                            "  ⚠️ No mods enabled for server {}, skipping update check.",
                            server_id
                        );
                        return;
                    }

                    // 2. Check for Updates
                    match crate::services::mod_scraper::check_mod_updates(enabled_mods, None).await
                    {
                        Ok(mod_infos) => {
                            let mut update_needed = false;
                            let last_start_time = last_started
                                .and_then(|ls| DateTime::parse_from_rfc3339(&ls).ok())
                                .map(|dt| dt.with_timezone(&Local));

                            for info in mod_infos {
                                if let Some(last_updated) = info.last_updated {
                                    // Parse mod date (CurseForge format: 2023-11-20T12:00:00.000Z)
                                    // Or simplified check.
                                    if let Ok(mod_dt) = DateTime::parse_from_rfc3339(&last_updated)
                                    {
                                        let mod_dt = mod_dt.with_timezone(&Local);
                                        // If mod updated AFTER server start -> Update Needed
                                        if let Some(start_dt) = last_start_time {
                                            if mod_dt > start_dt {
                                                log::info!(
                                                    "  📦 Update found for mod {} ({})",
                                                    info.name,
                                                    info.id
                                                );
                                                update_needed = true;
                                            }
                                        } else {
                                            // Server never started? Or unknown. Assume update needed if mod exists.
                                            // Actually, if never started, install_server handles it.
                                            // But if last_started is None, maybe force update?
                                            // Let's be conservative: Only update if strictly newer than last known start.
                                            // If last_started is None, we can't compare.
                                        }
                                    }
                                }
                            }

                            if update_needed {
                                log::info!(
                                    "🚀 Updates found! Scheduling restart for server {}.",
                                    server_id
                                );

                                // 3. Broadcast Warning
                                let rcon_state = app.state::<RconState>();
                                let rcon = &rcon_state.0;
                                let msg = format!(
                                    "⚠️ SERVER UPDATING MODS IN {} MINUTES!",
                                    pre_warning_minutes
                                );
                                let _ = rcon
                                    .send_command(server_id, &format!("Broadcast {}", msg))
                                    .await;
                                let _ = rcon
                                    .send_command(server_id, &format!("ServerChat {}", msg))
                                    .await;

                                // 4. Wait for the warning window
                                sleep(Duration::from_secs(pre_warning_minutes as u64 * 60)).await;

                                // 5. Create a pre-update backup so we can roll back if needed
                                log::info!(
                                    "💾 Creating pre-update backup before restarting server {}...",
                                    server_id
                                );
                                let pre_backup =
                                    SchedulerService::create_preupdate_backup_for_server(
                                        &app, server_id,
                                    );

                                // 6. Restart (which triggers mod update/install)
                                log::info!(
                                    "🔄 Update interval reached. Restarting server {}...",
                                    server_id
                                );
                                let state = app.state::<AppState>();
                                let restart_result =
                                    crate::commands::server::restart_server(state, server_id).await;

                                // 7. If restart failed and we have a backup, attempt automatic rollback
                                if let Err(e) = restart_result {
                                    log::error!(
                                        "❌ Scheduled mod update restart failed for server {}: {}",
                                        server_id,
                                        e
                                    );

                                    if let Some((backup, install_path)) = pre_backup {
                                        log::warn!(
                                            "♻️ Attempting automatic rollback for server {} using backup {}",
                                            server_id,
                                            backup.id
                                        );

                                        // Best-effort: ensure server is stopped
                                        let state_for_stop = app.state::<AppState>();
                                        let _ = state_for_stop.process_manager.stop_server_with_reason(server_id, crate::services::process_manager::StopReason::UpdateRequired);

                                        // Restore saves + configs
                                        let restore_options = RestoreOptions {
                                            restore_configs: true,
                                            restore_saves: true,
                                            stop_server_first: false,
                                            restart_after: false,
                                        };

                                        if let Err(err) = BackupService::restore_backup(
                                            &backup.file_path,
                                            &install_path,
                                            &restore_options,
                                        ) {
                                            log::error!(
                                                "❌ Automatic rollback failed for server {}: {}",
                                                server_id,
                                                err
                                            );
                                        } else {
                                            log::info!(
                                                "✅ Automatic rollback applied for server {}. Attempting clean start...",
                                                server_id
                                            );
                                            // Try to start the server again without forcing an update
                                            let _ = crate::commands::server::start_server(
                                                app.clone(),
                                                server_id,
                                                false,
                                            )
                                            .await;
                                        }
                                    } else {
                                        log::warn!(
                                            "⚠️ No pre-update backup available to roll back server {}",
                                            server_id
                                        );
                                    }
                                }
                            } else {
                                log::info!("  ✅ All mods up to date for server {}.", server_id);
                            }
                        }
                        Err(e) => {
                            log::error!("  ❌ Failed to check mod updates: {}", e);
                        }
                    }
                });
            }
            _ => {
                log::warn!("Unknown task type: {}", task.task_type);
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
        let rcon = &rcon_state.0;
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
        Ok(_) => log::info!(
            "  ✅ Scheduled restart initiated for server {}",
            task.server_id
        ),
        Err(e) => log::error!(
            "  ❌ Scheduled restart failed for server {}: {}",
            task.server_id,
            e
        ),
    }
}
