use crate::commands::rcon::RconState;
use crate::commands::scheduler::ScheduledTask;
use crate::models::{Backup, BackupOptions, BackupType, RestoreOptions};
use crate::services::backup_service::BackupService;
use crate::AppState;
use chrono::{DateTime, Datelike, Local, Timelike, Utc};
use rusqlite::params;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tokio::time::sleep;
use crate::platform::CommandNoWindowExt;

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
            // Guard: Never re-run a task if it executed within the last 55 seconds
            if let Some(ref lr) = task.last_run {
                if let Some(lr_dt) = parse_db_datetime_local(lr) {
                    if (time - lr_dt).num_seconds() < 55 {
                        continue;
                    }
                }
            }

            if Self::is_due(&task.cron_expression, &time) {
                log::info!(
                    "🚀 Scheduler: Executing Advanced Task {} ({})",
                    task.id,
                    task.task_type
                );
                Self::execute_task(app_handle, &task).await;

                let now_str = Local::now().to_rfc3339();
                if let Ok(db) = state.db.lock() {
                    if let Ok(conn) = db.get_connection() {
                        let _ = conn.execute(
                            "UPDATE scheduled_tasks SET last_run = ?1 WHERE id = ?2",
                            rusqlite::params![now_str, task.id],
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

        // 2. Process ASA Scheduler Settings
        Self::process_asa_scheduler_settings(app_handle, time).await;

        // 3. Process ASE Tasks
        Self::process_ase_tasks(app_handle, time).await;

        // 4. Process ASE Scheduler Settings
        Self::process_ase_scheduler_settings(app_handle, time).await;

        // 5. Process Backup Policies (Only run auto-backups when server is ONLINE)
        Self::process_backup_policies(app_handle, time).await;

        // 6. Process Steam Auto-Updates (Only when auto_update setting is enabled)
        Self::process_auto_updates(app_handle, time).await;
    }

    async fn process_ase_tasks(app_handle: &AppHandle, time: DateTime<Local>) {
        let state = app_handle.state::<AppState>();
        
        let ase_tasks = {
            let db = match state.db.lock() {
                Ok(guard) => guard,
                Err(_) => return,
            };
            let conn = match db.get_connection() {
                Ok(conn) => conn,
                Err(_) => return,
            };

            let mut stmt = match conn.prepare(
                "SELECT id, server_id, task_type, cron_expr, command, message, pre_warning_minutes, enabled, last_run \
                 FROM ase_scheduled_tasks WHERE enabled = 1"
            ) {
                Ok(s) => s,
                Err(_) => return,
            };

            let iter = stmt.query_map([], |row| {
                Ok(crate::ase::models::AseScheduledTask {
                    id: row.get(0)?,
                    server_id: row.get(1)?,
                    task_type: row.get(2)?,
                    cron_expr: row.get(3)?,
                    command: row.get(4)?,
                    message: row.get(5)?,
                    pre_warning_minutes: row.get(6)?,
                    enabled: row.get::<_, i32>(7)? != 0,
                    last_run: row.get(8)?,
                })
            });

            match iter {
                Ok(rows) => rows.filter_map(|r| r.ok()).collect::<Vec<_>>(),
                Err(_) => Vec::new(),
            }
        };

        for task in ase_tasks {
            if let Some(ref lr) = task.last_run {
                if let Some(lr_dt) = parse_db_datetime_local(lr) {
                    if (time - lr_dt).num_seconds() < 55 {
                        continue;
                    }
                }
            }

            if Self::is_due(&task.cron_expr, &time) {
                log::info!("🚀 ASE Scheduler: Executing Task {} ({})", task.id, task.task_type);
                
                match task.task_type.as_str() {
                    "restart" => {
                        let pre_warning_minutes = task.pre_warning_minutes;
                        if pre_warning_minutes > 0 {
                            for min_left in (1..=pre_warning_minutes).rev() {
                                let msg = format!("⚠️ SERVER RESTARTING IN {} MINUTE(S)!", min_left);
                                let _ = crate::ase::commands::rcon::send_ase_rcon(task.server_id, format!("Broadcast {}", msg), state.clone()).await;
                                let _ = crate::ase::commands::rcon::send_ase_rcon(task.server_id, format!("ServerChat {}", msg), state.clone()).await;
                                sleep(Duration::from_secs(60)).await;
                            }
                        }

                        let _ = crate::ase::commands::rcon::send_ase_rcon(task.server_id, "SaveWorld".into(), state.clone()).await;
                        let _ = crate::ase::commands::rcon::send_ase_rcon(task.server_id, "Broadcast ⚠️ RESTARTING SERVER NOW!".into(), state.clone()).await;
                        sleep(Duration::from_secs(3)).await;

                        let _ = crate::ase::commands::server::stop_ase_server(task.server_id, state.clone()).await;
                        sleep(Duration::from_secs(5)).await;
                        let _ = crate::ase::commands::server::start_ase_server((*app_handle).clone(), task.server_id, state.clone()).await;
                    }
                    "wipe_dinos" => {
                        let _ = crate::ase::commands::rcon::send_ase_rcon(task.server_id, "DestroyWildDinos".into(), state.clone()).await;
                    }
                    "backup" => {
                        let _ = crate::ase::commands::backup::create_ase_backup(task.server_id, state.clone()).await;
                    }
                    "update" => {
                        // 1. Stop server first
                        let _ = crate::ase::commands::server::stop_ase_server(task.server_id, state.clone()).await;
                        sleep(Duration::from_secs(5)).await;

                        // 2. Set status to updating
                        if let Ok(db) = state.db.lock() {
                            if let Ok(conn) = db.get_connection() {
                                let now = chrono::Utc::now().to_rfc3339();
                                let _ = conn.execute(
                                    "UPDATE ase_servers SET status = 'updating', updated_at = ?1 WHERE id = ?2",
                                    rusqlite::params![now, task.server_id],
                                );
                            }
                        }

                        // 3. Run SteamCMD
                        let app = (*app_handle).clone();
                        let server_id = task.server_id;
                        tauri::async_runtime::spawn(async move {
                            let state = app.state::<AppState>();
                            if let Ok(app_dir) = app.path().app_data_dir() {
                                let steamcmd_exe = app_dir.join("steamcmd").join("steamcmd.exe");
                                if steamcmd_exe.exists() {
                                    // Get install path
                                    let install_path: Option<String> = if let Ok(db) = state.db.lock() {
                                        if let Ok(conn) = db.get_connection() {
                                            conn.query_row(
                                                "SELECT install_path FROM ase_servers WHERE id = ?1",
                                                [server_id],
                                                |row| row.get(0),
                                            ).ok()
                                        } else { None }
                                    } else { None };

                                    if let Some(path) = install_path {
                                        let _ = tokio::process::Command::new(&steamcmd_exe)
                                            .args([
                                                "+force_install_dir", &path,
                                                "+login", "anonymous",
                                                "+app_update", "376030", "validate",
                                                "+quit",
                                            ])
                                            .no_window()
                                            .output()
                                            .await;
                                    }
                                }
                            }

                            // 4. Set back to stopped
                            if let Ok(db) = state.db.lock() {
                                if let Ok(conn) = db.get_connection() {
                                    let now = chrono::Utc::now().to_rfc3339();
                                    let _ = conn.execute(
                                        "UPDATE ase_servers SET status = 'stopped', updated_at = ?1 WHERE id = ?2",
                                        rusqlite::params![now, server_id],
                                    );
                                }
                            };
                        });
                    }
                    _ => {
                        log::warn!("Unsupported ASE task type: {}", task.task_type);
                    }
                }

                let now_str = Local::now().to_rfc3339();
                if let Ok(db) = state.db.lock() {
                    if let Ok(conn) = db.get_connection() {
                        let _ = conn.execute(
                            "UPDATE ase_scheduled_tasks SET last_run = ?1 WHERE id = ?2",
                            rusqlite::params![now_str, task.id],
                        );
                    }
                }
            }
        }
    }

    async fn process_ase_scheduler_settings(app_handle: &AppHandle, time: DateTime<Local>) {
        let state = app_handle.state::<AppState>();
        
        let settings_list = {
            let db = match state.db.lock() {
                Ok(guard) => guard,
                Err(_) => return,
            };
            let conn = match db.get_connection() {
                Ok(conn) => conn,
                Err(_) => return,
            };

            let mut stmt = match conn.prepare(
                "SELECT server_id, mode, basic_interval_hours, basic_warning_minutes, next_run_basic, \
                 advanced_time, advanced_days, advanced_warning_minutes, advanced_shutdown, advanced_backup, advanced_update, \
                 advanced_restart, advanced_dino_wipe \
                 FROM ase_scheduler_settings WHERE mode != 'disabled'"
            ) {
                Ok(s) => s,
                Err(_) => return,
            };

            let iter = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i32>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, i32>(8)? != 0,
                    row.get::<_, i32>(9)? != 0,
                    row.get::<_, i32>(10)? != 0,
                    row.get::<_, i32>(11)? != 0,
                    row.get::<_, i32>(12)? != 0,
                ))
            });

            match iter {
                Ok(rows) => rows.filter_map(|r| r.ok()).collect::<Vec<_>>(),
                Err(_) => Vec::new(),
            }
        };

        for s in settings_list {
            let server_id = s.0;
            let mode = s.1;
            if mode == "basic" {
                let interval = s.2;
                let warnings = s.3;
                let next_run = s.4;
                Self::process_ase_basic_mode(app_handle, server_id, interval, &warnings, next_run).await;
            } else if mode == "advanced" {
                if let (Some(time_str), Some(days_str)) = (s.5, s.6) {
                    let warnings_opt = s.7;
                    let shutdown = s.8;
                    let backup = s.9;
                    let update = s.10;
                    let restart = s.11;
                    let dino_wipe = s.12;
                    Self::process_ase_advanced_mode(
                        app_handle,
                        server_id,
                        &time_str,
                        &days_str,
                        warnings_opt,
                        shutdown,
                        backup,
                        update,
                        restart,
                        dino_wipe,
                        time,
                    ).await;
                }
            }
        }
    }

    async fn process_asa_scheduler_settings(app_handle: &AppHandle, time: DateTime<Local>) {
        let state = app_handle.state::<AppState>();
        
        let settings_list = {
            let db = match state.db.lock() {
                Ok(guard) => guard,
                Err(_) => return,
            };
            let conn = match db.get_connection() {
                Ok(conn) => conn,
                Err(_) => return,
            };

            let mut stmt = match conn.prepare(
                "SELECT server_id, mode, basic_interval_hours, basic_warning_minutes, next_run_basic, \
                 advanced_time, advanced_days, advanced_warning_minutes, advanced_shutdown, advanced_backup, advanced_update, \
                 advanced_restart, advanced_dino_wipe \
                 FROM scheduler_settings WHERE mode != 'disabled'"
            ) {
                Ok(s) => s,
                Err(_) => return,
            };

            let iter = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i32>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, i32>(8)? != 0,
                    row.get::<_, i32>(9)? != 0,
                    row.get::<_, i32>(10)? != 0,
                    row.get::<_, i32>(11)? != 0,
                    row.get::<_, i32>(12)? != 0,
                ))
            });

            match iter {
                Ok(rows) => rows.filter_map(|r| r.ok()).collect::<Vec<_>>(),
                Err(_) => Vec::new(),
            }
        };

        for s in settings_list {
            let server_id = s.0;
            let mode = s.1;
            if mode == "basic" {
                let interval = s.2;
                let warnings = s.3;
                let next_run = s.4;
                Self::process_basic_mode(app_handle, BasicSetting {
                    server_id,
                    interval,
                    warnings,
                    next_run,
                }).await;
            } else if mode == "advanced" {
                if let (Some(time_str), Some(days_str)) = (s.5, s.6) {
                    let warnings_opt = s.7;
                    let shutdown = s.8;
                    let backup = s.9;
                    let update = s.10;
                    let restart = s.11;
                    let dino_wipe = s.12;
                    Self::process_asa_advanced_mode(
                        app_handle,
                        server_id,
                        &time_str,
                        &days_str,
                        warnings_opt,
                        shutdown,
                        backup,
                        update,
                        restart,
                        dino_wipe,
                        time,
                    ).await;
                }
            }
        }
    }

    async fn process_asa_advanced_mode(
        app_handle: &AppHandle,
        server_id: i64,
        time_str: &str,
        days_str: &str,
        warning_str: Option<String>,
        shutdown: bool,
        backup: bool,
        update: bool,
        restart: bool,
        dino_wipe: bool,
        time: DateTime<Local>,
    ) {
        let [hour, minute] = match parse_time_str(time_str) {
            Some(hm) => hm,
            None => return,
        };

        let enabled_days: Vec<u32> = days_str.split(',').filter_map(|s| s.trim().parse::<u32>().ok()).collect();
        let current_day = time.weekday().num_days_from_sunday();

        if !enabled_days.is_empty() && !enabled_days.contains(&current_day) {
            return;
        }

        // Parse pre-warning minutes (e.g. "15,10,5,1")
        if let Some(w_str) = &warning_str {
            let warning_mins: Vec<i32> = w_str
                .split(',')
                .filter_map(|s| s.trim().parse::<i32>().ok())
                .collect();

            let target_mins = (hour * 60 + minute) as i32;
            let current_mins = (time.hour() * 60 + time.minute()) as i32;
            let mut diff = target_mins - current_mins;
            if diff < 0 {
                diff += 1440;
            }

            if diff > 0 && warning_mins.contains(&diff) && time.second() < 10 {
                log::warn!("⚠️ Advanced ASA Scheduler: Warning Server {} - {} mins left before maintenance", server_id, diff);
                if let Some(rcon_state) = app_handle.try_state::<RconState>() {
                    let rcon = &rcon_state.inner().0;
                    let msg = format!("⚠️ SERVER RESTART & MAINTENANCE IN {} MINUTE(S)!", diff);
                    let _ = rcon.send_command(server_id, &format!("ServerChat \"{}\"", msg)).await;
                    let _ = rcon.send_command(server_id, &format!("Broadcast \"{}\"", msg)).await;
                }

                let app_handle_clone = app_handle.clone();
                let name = get_server_name(app_handle, server_id);
                tauri::async_runtime::spawn(async move {
                    crate::services::discord::send_discord_webhook(
                        &app_handle_clone,
                        "scheduledRestarts",
                        crate::services::discord::DiscordEmbed::scheduled_task(
                            &name,
                            "Maintenance Warning",
                            &format!("Scheduled maintenance warning: restarting in **{} minutes**.", diff),
                        ),
                    ).await;
                });
            }
        }

        if time.hour() == hour && time.minute() == minute {
            log::info!("🚀 Advanced ASA Scheduler: Running execution chain for server {}", server_id);

            let state = app_handle.state::<AppState>();
            
            // Step 0: SaveWorld & Final RCON Notice
            if let Some(rcon_state) = app_handle.try_state::<RconState>() {
                let rcon = &rcon_state.inner().0;
                log::info!("  [Advanced ASA] Step 0: Executing RCON SaveWorld & Final Warning");
                let _ = rcon.send_command(server_id, "SaveWorld").await;
                let _ = rcon.send_command(server_id, "Broadcast ⚠️ SERVER RESTARTING FOR MAINTENANCE NOW!").await;
                let _ = rcon.send_command(server_id, "ServerChat ⚠️ SERVER RESTARTING FOR MAINTENANCE NOW!").await;
                sleep(Duration::from_secs(3)).await;
            }

            if shutdown {
                log::info!("  [Advanced ASA] Step 1/5: Graceful Shutdown");
                let _ = crate::commands::server::stop_server(state.clone(), server_id).await;
            }

            if backup {
                log::info!("  [Advanced ASA] Step 2/5: Creating automated backup");
                let _ = Self::create_preupdate_backup_for_server(app_handle, server_id);
            }

            if update {
                log::info!("  [Advanced ASA] Step 3/5: Updating server");
                let app = (*app_handle).clone();
                let _ = crate::commands::server::update_server(app, state.clone(), server_id).await;
            }

            if restart {
                log::info!("  [Advanced ASA] Step 4/5: Restarting server");
                let app = (*app_handle).clone();
                let _ = crate::commands::server::start_server(app, server_id, false).await;
                
                if dino_wipe {
                    log::info!("  [Advanced ASA] Step 5/5: Queuing DestroyWildDinos command");
                    let app = (*app_handle).clone();
                    tauri::async_runtime::spawn(async move {
                        sleep(Duration::from_secs(180)).await;
                        if let Some(rcon_state) = app.try_state::<RconState>() {
                            let rcon = &rcon_state.inner().0;
                            let _ = rcon.send_command(server_id, "DestroyWildDinos").await;
                        }
                    });
                }
            }
        }
    }

    async fn process_ase_basic_mode(app_handle: &AppHandle, server_id: i64, interval: i32, warnings: &str, next_run: Option<String>) {
        let now = Local::now();

        let next_run_dt = if let Some(nr_str) = next_run {
            match DateTime::parse_from_rfc3339(&nr_str) {
                Ok(dt) => dt.with_timezone(&Local),
                Err(_) => {
                    Self::update_ase_next_run(app_handle, server_id, interval, now).await
                }
            }
        } else {
            Self::update_ase_next_run(app_handle, server_id, interval, now).await
        };

        let diff = next_run_dt.signed_duration_since(now);
        let seconds_left = diff.num_seconds();

        if seconds_left <= 5 {
            log::info!("🚀 Basic ASE Scheduler: Restarting ASE Server {}", server_id);

            let state = app_handle.state::<AppState>();
            let _ = crate::ase::commands::rcon::send_ase_rcon(server_id, "SaveWorld".into(), state.clone()).await;
            let _ = crate::ase::commands::rcon::send_ase_rcon(server_id, "Broadcast ⚠️ RESTARTING SERVER NOW!".into(), state.clone()).await;
            sleep(Duration::from_secs(3)).await;

            let _ = crate::ase::commands::server::stop_ase_server(server_id, state.clone()).await;
            sleep(Duration::from_secs(5)).await;
            let _ = crate::ase::commands::server::start_ase_server((*app_handle).clone(), server_id, state.clone()).await;

            Self::update_ase_next_run(app_handle, server_id, interval, next_run_dt).await;
            return;
        }

        let warning_minutes: Vec<i64> = warnings
            .split(',')
            .filter_map(|s| s.trim().parse::<i64>().ok())
            .collect();

        let minutes_left = diff.num_minutes();

        if warning_minutes.contains(&minutes_left) {
            log::warn!("⚠️ Basic ASE Scheduler: Warning Server {} - {} mins left", server_id, minutes_left);
            let state = app_handle.state::<AppState>();
            let msg = format!("SERVER RESTARTING IN {} MINUTES", minutes_left);
            let _ = crate::ase::commands::rcon::send_ase_rcon(server_id, format!("ServerChat \"{}\"", msg), state.clone()).await;
            let _ = crate::ase::commands::rcon::send_ase_rcon(server_id, format!("Broadcast \"{}\"", msg), state.clone()).await;
        }
    }

    async fn update_ase_next_run(
        app_handle: &AppHandle,
        server_id: i64,
        interval: i32,
        from_time: DateTime<Local>,
    ) -> DateTime<Local> {
        let midnight = match from_time.date_naive().and_hms_opt(0, 0, 0) {
            Some(naive) => match naive.and_local_timezone(Local) {
                chrono::LocalResult::Single(t) => t,
                _ => from_time,
            },
            None => from_time,
        };

        let mut target = midnight;
        let p_interval = chrono::Duration::hours(interval as i64);
        let p_interval = if interval <= 0 { chrono::Duration::hours(24) } else { p_interval };

        let future_threshold = from_time + chrono::Duration::minutes(1);
        while target <= future_threshold {
            target += p_interval;
        }

        let state = app_handle.state::<AppState>();
        if let Ok(db) = state.db.lock() {
            if let Ok(conn) = db.get_connection() {
                let _ = conn.execute(
                    "UPDATE ase_scheduler_settings SET next_run_basic = ?1 WHERE server_id = ?2",
                    [target.to_rfc3339(), server_id.to_string()],
                );
            }
        }
        target
    }

    async fn process_ase_advanced_mode(
        app_handle: &AppHandle,
        server_id: i64,
        time_str: &str,
        days_str: &str,
        warning_str: Option<String>,
        shutdown: bool,
        backup: bool,
        update: bool,
        restart: bool,
        dino_wipe: bool,
        time: DateTime<Local>,
    ) {
        let [hour, minute] = match parse_time_str(time_str) {
            Some(hm) => hm,
            None => return,
        };

        let enabled_days: Vec<u32> = days_str.split(',').filter_map(|s| s.trim().parse::<u32>().ok()).collect();
        let current_day = time.weekday().num_days_from_sunday();

        if !enabled_days.is_empty() && !enabled_days.contains(&current_day) {
            return;
        }

        // Parse pre-warning minutes (e.g. "15,10,5,1")
        if let Some(w_str) = &warning_str {
            let warning_mins: Vec<i32> = w_str
                .split(',')
                .filter_map(|s| s.trim().parse::<i32>().ok())
                .collect();

            let target_mins = (hour * 60 + minute) as i32;
            let current_mins = (time.hour() * 60 + time.minute()) as i32;
            let mut diff = target_mins - current_mins;
            if diff < 0 {
                diff += 1440;
            }

            if diff > 0 && warning_mins.contains(&diff) && time.second() < 10 {
                log::warn!("⚠️ Advanced ASE Scheduler: Warning Server {} - {} mins left before maintenance", server_id, diff);
                let state = app_handle.state::<AppState>();
                let msg = format!("⚠️ SERVER RESTART & MAINTENANCE IN {} MINUTE(S)!", diff);
                let _ = crate::ase::commands::rcon::send_ase_rcon(server_id, format!("ServerChat \"{}\"", msg), state.clone()).await;
                let _ = crate::ase::commands::rcon::send_ase_rcon(server_id, format!("Broadcast \"{}\"", msg), state.clone()).await;
            }
        }

        if time.hour() == hour && time.minute() == minute {
            log::info!("🚀 Advanced ASE Scheduler: Running execution chain for server {}", server_id);

            let state = app_handle.state::<AppState>();

            // Step 0: SaveWorld & Final RCON Notice
            log::info!("  [Advanced ASE] Step 0: Executing RCON SaveWorld & Final Warning");
            let _ = crate::ase::commands::rcon::send_ase_rcon(server_id, "SaveWorld".into(), state.clone()).await;
            let _ = crate::ase::commands::rcon::send_ase_rcon(server_id, "Broadcast ⚠️ SERVER RESTARTING FOR MAINTENANCE NOW!".into(), state.clone()).await;
            let _ = crate::ase::commands::rcon::send_ase_rcon(server_id, "ServerChat ⚠️ SERVER RESTARTING FOR MAINTENANCE NOW!".into(), state.clone()).await;
            sleep(Duration::from_secs(3)).await;

            if shutdown {
                log::info!("  [Advanced ASE] Step 1/5: Graceful Shutdown");
                let _ = crate::ase::commands::server::stop_ase_server(server_id, state.clone()).await;
                sleep(Duration::from_secs(5)).await;
            }

            if backup {
                log::info!("  [Advanced ASE] Step 2/5: Creating automated backup");
                let _ = crate::ase::commands::backup::create_ase_backup(server_id, state.clone()).await;
            }

            if update {
                log::info!("  [Advanced ASE] Step 3/5: SteamCMD mod/server update");
                let install_path: Option<String> = if let Ok(db) = state.db.lock() {
                    if let Ok(conn) = db.get_connection() {
                        conn.query_row(
                            "SELECT install_path FROM ase_servers WHERE id = ?1",
                            [server_id],
                            |row| row.get(0),
                        ).ok()
                    } else { None }
                } else { None };

                if let Some(path) = install_path {

                    if let Ok(app_dir) = app_handle.path().app_data_dir() {
                        let steamcmd_exe = app_dir.join("steamcmd").join(crate::platform::Platform::steamcmd_executable_name());
                        if steamcmd_exe.exists() {
                            let _ = tokio::process::Command::new(&steamcmd_exe)
                                .args([
                                    "+force_install_dir", &path,
                                    "+login", "anonymous",
                                    "+app_update", "376030", "validate",
                                    "+quit",
                                ])
                                .no_window()
                                .output()
                                .await;
                        }
                    }
                }
            }

            if restart {
                log::info!("  [Advanced ASE] Step 4/5: Starting server up");
                let _ = crate::ase::commands::server::start_ase_server((*app_handle).clone(), server_id, state.clone()).await;
                
                if dino_wipe {
                    log::info!("  [Advanced ASE] Step 5/5: Queuing DestroyWildDinos command");
                    let app = (*app_handle).clone();
                    tauri::async_runtime::spawn(async move {
                        sleep(Duration::from_secs(180)).await;
                        if let Some(state) = app.try_state::<AppState>() {
                            let _ = crate::ase::commands::rcon::send_ase_rcon(server_id, "DestroyWildDinos".into(), state.clone()).await;
                        }
                    });
                }
            }
        }
    }

    async fn process_basic_mode(app_handle: &AppHandle, setting: BasicSetting) {
        let now = Local::now();

        // 1. Determine Target Time
        let next_run = if let Some(nr_str) = &setting.next_run {
            match parse_db_datetime_local(nr_str) {
                Some(dt) => dt,
                None => {
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

            if let Some(rcon_state) = app_handle.try_state::<RconState>() {
                let rcon = &rcon_state.inner().0;
                let _ = rcon.send_command(setting.server_id, "SaveWorld").await;
                let _ = rcon.send_command(setting.server_id, "Broadcast ⚠️ RESTARTING SERVER NOW!").await;
                sleep(Duration::from_secs(3)).await;
            }

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
            let rcon = &rcon_state.inner().0;
            let msg = format!("SERVER RESTARTING IN {} MINUTES", minutes_left);
            let _ = rcon
                .send_command(setting.server_id, &format!("ServerChat \"{}\"", msg))
                .await;
            let _ = rcon
                .send_command(setting.server_id, &format!("Broadcast \"{}\"", msg))
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
            let app_data_dir = crate::platform::Platform::default_backup_dir();
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

        // Pre-warning broadcast countdown for tasks other than restart/AutoUpdateMods (which handle their own countdowns)
        if task.task_type != "restart" && task.task_type != "Restart" && task.task_type != "AutoUpdateMods" && task.task_type != "auto-update-mods" {
            run_task_pre_warnings(app_handle, task).await;
        }

        match task.task_type.as_str() {
            "restart" | "Restart" => {
                let _ = commands_restart(app_handle, task).await;
            }
            "stop" | "Stop" => {
                let _ = state.process_manager.stop_server_with_reason(
                    task.server_id,
                    crate::services::process_manager::StopReason::ScheduledRestart,
                );
            }
            "start" | "Start" => {
                let _ = crate::commands::server::start_server(
                    app_handle.clone(),
                    task.server_id,
                    false,
                ).await;
            }
            "rcon-command" | "RconCommand" => {
                if let Some(cmd) = &task.command {
                    let rcon_state = app_handle.state::<RconState>();
                    let rcon = &rcon_state.inner().0;
                    let _ = rcon.send_command(task.server_id, cmd).await;
                }
            }
            "announcement" | "Announcement" => {
                if let Some(msg) = &task.message {
                    let rcon_state = app_handle.state::<RconState>();
                    let rcon = &rcon_state.inner().0;
                    let _ = rcon.send_command(task.server_id, &format!("ServerChat \"{}\"", msg)).await;
                    let _ = rcon.send_command(task.server_id, &format!("Broadcast \"{}\"", msg)).await;
                }
            }
            "save-world" | "SaveWorld" => {
                let rcon_state = app_handle.state::<RconState>();
                let rcon = &rcon_state.inner().0;
                let _ = rcon.send_command(task.server_id, "SaveWorld").await;
            }
            "destroy-wild-dinos" | "DestroyWildDinos" => {
                let rcon_state = app_handle.state::<RconState>();
                let rcon = &rcon_state.inner().0;
                let _ = rcon.send_command(task.server_id, "SaveWorld").await;
                let _ = rcon.send_command(task.server_id, "DestroyWildDinos").await;
            }
            "backup" | "Backup" => {
                execute_backup(app_handle, task).await;
            }
            "AutoUpdateMods" | "auto-update-mods" => {
                let server_id = task.server_id;
                let app = (*app_handle).clone();
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
                                let rcon = &rcon_state.inner().0;
                                let msg = format!(
                                    "⚠️ SERVER UPDATING MODS IN {} MINUTES!",
                                    pre_warning_minutes
                                );
                                let _ = rcon
                                    .send_command(server_id, &format!("Broadcast \"{}\"", msg))
                                    .await;
                                let _ = rcon
                                    .send_command(server_id, &format!("ServerChat \"{}\"", msg))
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
                                    crate::commands::server::restart_server(state, server_id, None).await;

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

    pub async fn run_online_tasks(app_handle: &AppHandle, server_id: i64) {
        log::info!("📅 Scheduler: Running tasks on server online for server {}", server_id);
        let state = app_handle.state::<AppState>();
        let tasks = {
            let db = match state.db.lock() {
                Ok(guard) => guard,
                Err(_) => return,
            };
            let conn = match db.get_connection() {
                Ok(conn) => conn,
                Err(_) => return,
            };

            let mut stmt = match conn.prepare(
                "SELECT t.id, t.server_id, t.task_type, t.cron_expression, t.command, t.message, t.pre_warning_minutes, t.last_run, t.task_name 
                 FROM scheduled_tasks t 
                 WHERE t.server_id = ?1 AND t.enabled = 1 AND t.cron_expression = '@online'"
            ) {
                Ok(s) => s,
                Err(_) => return,
            };

            let iter = stmt.query_map([server_id], |row| {
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

        for task in tasks {
            log::info!("🚀 Executing On-Online Task {} ({})", task.id, task.task_type);
            Self::execute_task(app_handle, &task).await;

            if let Ok(db) = state.db.lock() {
                if let Ok(conn) = db.get_connection() {
                    let _ = conn.execute(
                        "UPDATE scheduled_tasks SET last_run = CURRENT_TIMESTAMP WHERE id = ?1",
                        [task.id],
                    );
                }
            }
        }
    }
}

fn get_server_name(app_handle: &AppHandle, server_id: i64) -> String {
    if let Some(state) = app_handle.try_state::<AppState>() {
        if let Ok(db) = state.db.lock() {
            if let Ok(conn) = db.get_connection() {
                if let Ok(name) = conn.query_row(
                    "SELECT name FROM servers WHERE id = ?1",
                    [server_id],
                    |row| row.get::<_, String>(0),
                ) {
                    return name;
                }
            }
        }
    }
    format!("Server #{}", server_id)
}

fn format_warning_message(custom_template: Option<&str>, task_type: &str, min_left: i32, server_name: &str) -> String {
    if let Some(tpl) = custom_template {
        if !tpl.trim().is_empty() {
            let mut formatted = tpl.to_string();
            formatted = formatted.replace("{mins}", &min_left.to_string());
            formatted = formatted.replace("{minutes}", &min_left.to_string());
            formatted = formatted.replace("{secs}", &(min_left * 60).to_string());
            formatted = formatted.replace("{seconds}", &(min_left * 60).to_string());
            formatted = formatted.replace("{server}", server_name);
            formatted = formatted.replace("{task}", task_type);
            return formatted;
        }
    }

    match task_type {
        "restart" | "Restart" => format!("⚠️ SERVER RESTARTING IN {} MINUTE(S)!", min_left),
        "destroy-wild-dinos" | "DestroyWildDinos" => format!("⚠️ DESTROYING WILD DINOS IN {} MINUTE(S)!", min_left),
        "backup" | "Backup" => format!("⚠️ SERVER BACKUP EXECUTING IN {} MINUTE(S)!", min_left),
        "save-world" | "SaveWorld" => format!("⚠️ SAVING WORLD IN {} MINUTE(S)!", min_left),
        _ => format!("⚠️ TASK ({}) EXECUTING IN {} MINUTE(S)!", task_type, min_left),
    }
}

async fn run_task_pre_warnings(app_handle: &AppHandle, task: &ScheduledTask) {
    if task.pre_warning_minutes <= 0 {
        return;
    }
    let app_handle_clone = app_handle.clone();
    let task_clone = task.clone();

    tauri::async_runtime::spawn(async move {
        let server_name = get_server_name(&app_handle_clone, task_clone.server_id);
        let mins = task_clone.pre_warning_minutes;

        for min_left in (1..=mins).rev() {
            let msg = format_warning_message(task_clone.message.as_deref(), &task_clone.task_type, min_left, &server_name);
            if let Some(rcon_state) = app_handle_clone.try_state::<RconState>() {
                let rcon = &rcon_state.inner().0;
                let _ = rcon.send_command(task_clone.server_id, &format!("Broadcast \"{}\"", msg)).await;
                let _ = rcon.send_command(task_clone.server_id, &format!("ServerChat \"{}\"", msg)).await;
            }

            let app_clone = app_handle_clone.clone();
            let name_clone = server_name.clone();
            let task_type_clone = task_clone.task_type.clone();
            let msg_clone = msg.clone();

            tauri::async_runtime::spawn(async move {
                crate::services::discord::send_discord_webhook(
                    &app_clone,
                    "scheduledTasks",
                    crate::services::discord::DiscordEmbed::scheduled_task(
                        &name_clone,
                        &format!("Task Warning: {}", task_type_clone),
                        &msg_clone,
                    ),
                ).await;
            });

            sleep(Duration::from_secs(60)).await;
        }
    });
}

// Logic helpers
async fn commands_restart(app_handle: &AppHandle, task: &ScheduledTask) {
    let state = app_handle.state::<AppState>();
    let server_id = task.server_id;
    let name = get_server_name(app_handle, server_id);

    // Warn players & countdown if pre_warning_minutes > 0
    if task.pre_warning_minutes > 0 {
        run_task_pre_warnings(app_handle, task).await;
    }

    // Determine if server is ASE or ASA
    let server_type: String = {
        if let Ok(db) = state.db.lock() {
            if let Ok(conn) = db.get_connection() {
                conn.query_row(
                    "SELECT server_type FROM servers WHERE id = ?1",
                    [server_id],
                    |row| row.get(0),
                ).unwrap_or_else(|_| "ASA".to_string())
            } else { "ASA".to_string() }
        } else { "ASA".to_string() }
    };

    if server_type.to_uppercase() == "ASE" {
        log::info!("🚀 [Scheduled Restart] Restarting ASE Server {}", server_id);
        let _ = crate::ase::commands::rcon::send_ase_rcon(server_id, "SaveWorld".into(), state.clone()).await;
        let _ = crate::ase::commands::rcon::send_ase_rcon(server_id, "Broadcast ⚠️ RESTARTING SERVER NOW!".into(), state.clone()).await;
        sleep(Duration::from_secs(3)).await;
        let _ = crate::ase::commands::server::stop_ase_server(server_id, state.clone()).await;
        sleep(Duration::from_secs(5)).await;
        let _ = crate::ase::commands::server::start_ase_server((*app_handle).clone(), server_id, state.clone()).await;
    } else {
        log::info!("🚀 [Scheduled Restart] Restarting ASA Server {}", server_id);
        if let Some(rcon_state) = app_handle.try_state::<RconState>() {
            let rcon = &rcon_state.inner().0;
            let _ = rcon.send_command(server_id, "SaveWorld").await;
            let _ = rcon.send_command(server_id, "Broadcast \"⚠️ RESTARTING SERVER NOW!\"").await;
            sleep(Duration::from_secs(3)).await;
        }

        match crate::commands::server::restart_server(state, server_id, None).await {
            Ok(_) => {
                log::info!("  ✅ Scheduled restart initiated for server {}", server_id);
            }
            Err(e) => {
                log::error!("  ⚠️ Scheduled restart failed for server {}: {}", server_id, e);
                let app_handle_clone = app_handle.clone();
                let name_clone = name.clone();
                let err_msg = e.to_string();
                tauri::async_runtime::spawn(async move {
                    crate::services::discord::send_discord_webhook(
                        &app_handle_clone,
                        "scheduledRestarts",
                        crate::services::discord::DiscordEmbed::scheduled_task(
                            &name_clone,
                            "Server Restart Failed",
                            &format!("❌ Scheduled server restart failed: **{}**", err_msg),
                        ),
                    ).await;
                });
            }
        }
    }
}

async fn execute_backup(app_handle: &AppHandle, task: &ScheduledTask) {
    let app_handle_clone = app_handle.clone();
    let server_id = task.server_id;
    
    tauri::async_runtime::spawn(async move {
        let state = app_handle_clone.state::<AppState>();

        // STRICT CHECK: Skip scheduled backup if server is offline
        let is_running = state.process_manager.is_running(server_id);
        let db_status = {
            if let Ok(db) = state.db.lock() {
                if let Ok(conn) = db.get_connection() {
                    conn.query_row(
                        "SELECT status FROM servers WHERE id = ?1",
                        [server_id],
                        |row| row.get::<_, String>(0),
                    ).ok()
                } else { None }
            } else { None }
        };
        let is_online = is_running || matches!(db_status.as_deref().map(|s| s.to_lowercase()).as_deref(), Some("running" | "online" | "starting"));
        if !is_online {
            log::info!("⏭️ Scheduled auto backup skipped for server {}: Server is offline", server_id);
            return;
        }

        log::info!("💾 Executing scheduled backup for server {}...", server_id);
        
        let paths_opt = {
            if let Ok(db) = state.db.lock() {
                if let Ok(conn) = db.get_connection() {
                    if let Ok(install_path) = conn.query_row(
                        "SELECT install_path FROM servers WHERE id = ?1",
                        [server_id],
                        |row| row.get::<_, String>(0),
                    ) {
                        Some((install_path, PathBuf::from("C:/ASA_Backups")))
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            }
        };

        let (install_path, app_data_dir) = match paths_opt {
            Some(val) => val,
            None => {
                log::error!("❌ Failed to retrieve server install path for backup");
                return;
            }
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
            BackupType::Auto,
            &options,
        ) {
            Ok(b) => b,
            Err(e) => {
                log::error!(
                    "❌ Failed to create scheduled backup for server {}: {}",
                    server_id,
                    e
                );
                return;
            }
        };

        if let Ok(db) = state.db.lock() {
            if let Ok(conn) = db.get_connection() {
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
                    .is_ok()
                {
                    backup.id = conn.last_insert_rowid();
                    log::info!(
                        "✅ Scheduled backup {} completed for server {} at {:?}",
                        backup.id,
                        server_id,
                        backup.file_path
                    );
                }
            }
        };
    });
}

impl SchedulerService {
    async fn process_backup_policies(app_handle: &AppHandle, _time: DateTime<Local>) {
        let state = app_handle.state::<AppState>();
        
        let policies = {
            let db = match state.db.lock() {
                Ok(guard) => guard,
                Err(_) => return,
            };
            let conn = match db.get_connection() {
                Ok(conn) => conn,
                Err(_) => return,
            };

            let mut stmt = match conn.prepare(
                "SELECT server_id, interval_hours FROM backup_policies WHERE enabled = 1"
            ) {
                Ok(s) => s,
                Err(_) => return,
            };

            let iter = stmt.query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, i32>(1)?))
            });

            match iter {
                Ok(rows) => rows.filter_map(|r| r.ok()).collect::<Vec<_>>(),
                Err(_) => Vec::new(),
            }
        };

        for (server_id, interval_hours) in policies {
            // STRICT CHECK: Skip auto-backup if server is offline
            let is_running = state.process_manager.is_running(server_id);
            let db_status = {
                if let Ok(db) = state.db.lock() {
                    if let Ok(conn) = db.get_connection() {
                        conn.query_row(
                            "SELECT status FROM servers WHERE id = ?1",
                            [server_id],
                            |row| row.get::<_, String>(0),
                        ).ok()
                    } else { None }
                } else { None }
            };
            let is_online = is_running || matches!(db_status.as_deref().map(|s| s.to_lowercase()).as_deref(), Some("running" | "online" | "starting"));

            if !is_online {
                // Server is offline, skip periodic auto backup
                continue;
            }

            let effective_interval_mins = (interval_hours.max(1) as i64) * 60;

            // Check when the last backup of any type was created for this server
            let last_backup_time: Option<DateTime<Utc>> = {
                if let Ok(db) = state.db.lock() {
                    if let Ok(conn) = db.get_connection() {
                        conn.query_row(
                            "SELECT created_at FROM backups WHERE server_id = ?1 ORDER BY id DESC LIMIT 1",
                            [server_id],
                            |row| row.get::<_, String>(0),
                        ).ok().and_then(|s| parse_db_datetime(&s))
                    } else { None }
                } else { None }
            };

            let now_utc = Utc::now();
            let should_backup = match last_backup_time {
                Some(last_time) => {
                    let elapsed_mins = (now_utc - last_time).num_minutes();
                    // Extra safety guard: never run auto backup if less than 50 minutes have passed
                    elapsed_mins >= effective_interval_mins && elapsed_mins >= 50
                }
                None => true,
            };

            if should_backup {
                log::info!("💾 BackupPolicy: Triggering interval auto-backup ({}h) for online server {}", interval_hours, server_id);
                let app_handle_clone = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    let options = BackupOptions {
                        include_configs: true,
                        include_saves: true,
                        include_mods: false,
                        include_cluster: false,
                        compression_level: 6,
                    };
                    let state_clone = app_handle_clone.state::<AppState>();
                    let _ = crate::commands::backup::create_backup(
                        state_clone,
                        server_id,
                        "auto".to_string(),
                        Some(options),
                    ).await;
                });
            }
        }
    }

    async fn process_auto_updates(app_handle: &AppHandle, _time: DateTime<Local>) {
        let state = app_handle.state::<AppState>();

        // Query all servers where auto_update = 1
        let auto_update_servers: Vec<(i64, String, String, String)> = {
            let db = match state.db.lock() {
                Ok(guard) => guard,
                Err(_) => return,
            };
            let conn = match db.get_connection() {
                Ok(conn) => conn,
                Err(_) => return,
            };

            let mut stmt = match conn.prepare(
                "SELECT id, name, install_path, COALESCE(server_type, 'ASA') FROM servers WHERE auto_update = 1"
            ) {
                Ok(s) => s,
                Err(_) => return,
            };

            let iter = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            });

            match iter {
                Ok(rows) => rows.filter_map(|r| r.ok()).collect::<Vec<_>>(),
                Err(_) => Vec::new(),
            }
        };

        if auto_update_servers.is_empty() {
            return;
        }

        for (server_id, name, install_path_str, server_type) in auto_update_servers {
            let app_id = if server_type == "ASE" { "237090" } else { "2430930" };
            let install_path = PathBuf::from(&install_path_str);

            let local_build = match crate::services::server_installer::get_local_build_id(&install_path, app_id) {
                Some(b) => b,
                None => continue,
            };

            let remote_build = match crate::services::server_installer::get_remote_build_id(app_id).await {
                Some(b) => b,
                None => continue,
            };

            if local_build != remote_build {
                log::warn!("🚀 [AutoUpdate] New Steam build detected for server {} ({})! Local {} vs Remote {}", server_id, name, local_build, remote_build);

                let is_running = state.process_manager.is_running(server_id);
                let db_status = {
                    if let Ok(db) = state.db.lock() {
                        if let Ok(conn) = db.get_connection() {
                            conn.query_row("SELECT status FROM servers WHERE id = ?1", [server_id], |row| row.get::<_, String>(0)).ok()
                        } else { None }
                    } else { None }
                };

                let is_online = is_running || matches!(db_status.as_deref().map(|s| s.to_lowercase()).as_deref(), Some("running" | "online" | "starting"));

                if is_online {
                    log::info!("📢 [AutoUpdate] Server {} is online. Broadcasting maintenance & update notice...", server_id);

                    // Step 1: 3-Minute Warning Broadcast
                    if let Some(rcon_state) = app_handle.try_state::<RconState>() {
                        let rcon = &rcon_state.inner().0;
                        let msg = "⚠️ NEW GAME UPDATE DETECTED! Server will perform a graceful save, update & restart in 3 minutes.";
                        let _ = rcon.send_command(server_id, &format!("ServerChat {}", msg)).await;
                        let _ = rcon.send_command(server_id, &format!("Broadcast {}", msg)).await;
                    }

                    let app_clone = app_handle.clone();
                    let server_name = name.clone();
                    tauri::async_runtime::spawn(async move {
                        crate::services::discord::send_discord_webhook(
                            &app_clone,
                            "autoUpdate",
                            crate::services::discord::DiscordEmbed::scheduled_task(
                                &server_name,
                                "Steam Auto-Update",
                                "New Steam update detected! Server updating & restarting in **3 minutes**.",
                            ),
                        ).await;
                    });

                    sleep(Duration::from_secs(120)).await;

                    // Step 2: 1-Minute Warning Broadcast & Save World
                    if let Some(rcon_state) = app_handle.try_state::<RconState>() {
                        let rcon = &rcon_state.inner().0;
                        let msg = "⚠️ SERVER UPDATE IN 1 MINUTE! Saving world data...";
                        let _ = rcon.send_command(server_id, "SaveWorld").await;
                        let _ = rcon.send_command(server_id, &format!("ServerChat {}", msg)).await;
                        let _ = rcon.send_command(server_id, &format!("Broadcast {}", msg)).await;
                    }

                    sleep(Duration::from_secs(60)).await;

                    // Step 3: Shutdown, Backup, Update, Restart
                    if let Some(rcon_state) = app_handle.try_state::<RconState>() {
                        let rcon = &rcon_state.inner().0;
                        let _ = rcon.send_command(server_id, "Broadcast ⚠️ RESTARTING FOR GAME UPDATE NOW!").await;
                        sleep(Duration::from_secs(3)).await;
                    }

                    log::info!("  [AutoUpdate] Stopping server {}", server_id);
                    let _ = crate::commands::server::stop_server(state.clone(), server_id).await;

                    log::info!("  [AutoUpdate] Creating pre-update backup for server {}", server_id);
                    let _ = Self::create_preupdate_backup_for_server(app_handle, server_id);

                    log::info!("  [AutoUpdate] Executing update for server {}", server_id);
                    let app = (*app_handle).clone();
                    let _ = crate::commands::server::update_server(app, state.clone(), server_id).await;

                    log::info!("  [AutoUpdate] Restarting server {}", server_id);
                    let app = (*app_handle).clone();
                    let _ = crate::commands::server::start_server(app, server_id, false).await;
                } else {
                    log::info!("  [AutoUpdate] Server {} is offline. Updating server files...", server_id);
                    let app = (*app_handle).clone();
                    let _ = crate::commands::server::update_server(app, state.clone(), server_id).await;
                }
            }
        }
    }
}

pub fn parse_time_str(time_str: &str) -> Option<[u32; 2]> {
    let s = time_str.trim().to_uppercase();
    let is_pm = s.contains("PM");
    let is_am = s.contains("AM");
    
    let clean_str = s.replace("AM", "").replace("PM", "").trim().to_string();
    let parts: Vec<&str> = clean_str.split(':').collect();
    if parts.len() < 2 {
        return None;
    }

    let mut hour: u32 = parts[0].trim().parse().ok()?;
    let minute: u32 = parts[1].trim().parse().ok()?;

    if is_pm && hour < 12 {
        hour += 12;
    } else if is_am && hour == 12 {
        hour = 0;
    }

    if hour <= 23 && minute <= 59 {
        Some([hour, minute])
    } else {
        None
    }
}

pub fn parse_db_datetime(s: &str) -> Option<DateTime<Utc>> {
    let s = s.trim();
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Some(dt.with_timezone(&Utc));
    }
    if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
        return Some(DateTime::from_naive_utc_and_offset(naive, Utc));
    }
    if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S%.f") {
        return Some(DateTime::from_naive_utc_and_offset(naive, Utc));
    }
    if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S") {
        return Some(DateTime::from_naive_utc_and_offset(naive, Utc));
    }
    None
}

pub fn parse_db_datetime_local(s: &str) -> Option<DateTime<Local>> {
    let s = s.trim();
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Some(dt.with_timezone(&Local));
    }
    if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
        return naive.and_local_timezone(Local).single();
    }
    if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S%.f") {
        return naive.and_local_timezone(Local).single();
    }
    if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S") {
        return naive.and_local_timezone(Local).single();
    }
    None
}

