//! Scheduled routines: named, ordered lists of steps (broadcast, countdown, stop, change INI value,
//! start, backup, ...) triggered by a cron expression, once at a specific time, or manually.
//! Used for opening hours, maintenance windows and timed events (e.g. 2x XP on weekends).

use crate::commands::rcon::RconState;
use crate::AppState;
use chrono::{DateTime, Local};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::sleep;

/// One step of a routine. Serialized as `{ "type": "countdown", "minutes": [15, 5, 1], "message": "..." }`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum RoutineStep {
    /// In-game broadcast + chat message
    Broadcast { message: String },
    /// Broadcast `message` (with `{minutes}` placeholder) at each listed minute mark, then wait until 0
    Countdown { minutes: Vec<u32>, message: String },
    Wait { minutes: u32 },
    Rcon { command: String },
    SaveWorld,
    /// Graceful stop (SaveWorld + DoExit, INI files protected from ARK's shutdown overwrite)
    Stop,
    Start,
    Restart,
    Backup,
    /// Update the server files through SteamCMD
    UpdateServer,
    /// Change a single INI value. `file` is "GameUserSettings" or "Game"
    SetConfig { file: String, section: String, key: String, value: String },
    DestroyWildDinos,
}

impl RoutineStep {
    fn label(&self) -> String {
        match self {
            RoutineStep::Broadcast { .. } => "broadcast".into(),
            RoutineStep::Countdown { .. } => "countdown".into(),
            RoutineStep::Wait { minutes } => format!("wait {}m", minutes),
            RoutineStep::Rcon { command } => format!("rcon {}", command),
            RoutineStep::SaveWorld => "saveWorld".into(),
            RoutineStep::Stop => "stop".into(),
            RoutineStep::Start => "start".into(),
            RoutineStep::Restart => "restart".into(),
            RoutineStep::Backup => "backup".into(),
            RoutineStep::UpdateServer => "updateServer".into(),
            RoutineStep::SetConfig { key, value, .. } => format!("{}={}", key, value),
            RoutineStep::DestroyWildDinos => "destroyWildDinos".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Routine {
    #[serde(default)]
    pub id: i64,
    pub server_id: i64,
    pub name: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// 5-field cron ("min hour day month weekday") or "@manual"
    pub cron_expression: String,
    /// Disable the routine after it ran once (one-off events on a specific date)
    #[serde(default)]
    pub run_once: bool,
    pub steps: Vec<RoutineStep>,
    #[serde(default)]
    pub last_run: Option<String>,
    #[serde(default)]
    pub last_status: Option<String>,
    #[serde(default)]
    pub last_error: Option<String>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningRoutine {
    pub routine_id: i64,
    pub server_id: i64,
    pub name: String,
    pub step_index: usize,
    pub step_count: usize,
    pub step_label: String,
    pub started_at: String,
    #[serde(skip)]
    cancel: Arc<AtomicBool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressEvent {
    routine_id: i64,
    server_id: i64,
    name: String,
    step_index: usize,
    step_count: usize,
    step_label: String,
    /// "running" | "success" | "failed" | "cancelled"
    status: String,
    message: Option<String>,
}

/// One running routine per server (keyed by server id)
static RUNNING: LazyLock<Mutex<HashMap<i64, RunningRoutine>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

pub const CREATE_TABLE_SQL: &str = "CREATE TABLE IF NOT EXISTS scheduled_routines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    cron_expression TEXT NOT NULL DEFAULT '@manual',
    run_once INTEGER NOT NULL DEFAULT 0,
    steps_json TEXT NOT NULL DEFAULT '[]',
    last_run TEXT,
    last_status TEXT,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)";

pub fn ensure_table(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute(CREATE_TABLE_SQL, []).map(|_| ()).map_err(|e| e.to_string())
}

pub fn row_to_routine(row: &rusqlite::Row) -> rusqlite::Result<Routine> {
    let steps_json: String = row.get(6)?;
    Ok(Routine {
        id: row.get(0)?,
        server_id: row.get(1)?,
        name: row.get(2)?,
        enabled: row.get::<_, i64>(3)? != 0,
        cron_expression: row.get(4)?,
        run_once: row.get::<_, i64>(5)? != 0,
        // A step type this version doesn't know makes the whole list unreadable; show it as empty
        // rather than failing the query (the JSON stays untouched in the DB until re-saved)
        steps: serde_json::from_str(&steps_json).unwrap_or_default(),
        last_run: row.get(7)?,
        last_status: row.get(8)?,
        last_error: row.get(9)?,
    })
}

pub const SELECT_COLUMNS: &str =
    "id, server_id, name, enabled, cron_expression, run_once, steps_json, last_run, last_status, last_error";

pub fn running_routines() -> Vec<RunningRoutine> {
    RUNNING.lock().map(|m| m.values().cloned().collect()).unwrap_or_default()
}

pub fn cancel(server_id: i64) -> bool {
    if let Ok(map) = RUNNING.lock() {
        if let Some(r) = map.get(&server_id) {
            r.cancel.store(true, Ordering::SeqCst);
            return true;
        }
    }
    false
}

/// Called every minute by the scheduler loop.
pub async fn process_due_routines(app: &AppHandle, time: DateTime<Local>) {
    let routines: Vec<Routine> = {
        let state = app.state::<AppState>();
        let Ok(db) = state.db.lock() else { return };
        let Ok(conn) = db.get_connection() else { return };
        if ensure_table(&conn).is_err() {
            return;
        }
        let sql = format!(
            "SELECT {} FROM scheduled_routines WHERE enabled = 1 AND cron_expression != '@manual'",
            SELECT_COLUMNS
        );
        let Ok(mut stmt) = conn.prepare(&sql) else { return };
        let rows = stmt.query_map([], row_to_routine);
        match rows {
            Ok(r) => r.filter_map(|r| r.ok()).collect(),
            Err(_) => return,
        }
    };

    for routine in routines {
        // Never re-trigger within the same minute
        if let Some(lr) = routine.last_run.as_deref().and_then(crate::services::scheduler::parse_db_datetime_local) {
            if (time - lr).num_seconds() < 55 {
                continue;
            }
        }
        if !crate::services::scheduler::SchedulerService::is_due(&routine.cron_expression, &time) {
            continue;
        }
        if let Err(e) = start(app.clone(), routine.clone()) {
            log::warn!("📋 [Routine] '{}' not started: {}", routine.name, e);
        }
    }
}

/// Start a routine in the background. Fails if another routine is already running on that server.
pub fn start(app: AppHandle, routine: Routine) -> Result<(), String> {
    if routine.steps.is_empty() {
        return Err("Routine has no steps".into());
    }
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut map = RUNNING.lock().map_err(|e| e.to_string())?;
        if let Some(existing) = map.get(&routine.server_id) {
            return Err(format!("Routine '{}' is already running on this server", existing.name));
        }
        map.insert(
            routine.server_id,
            RunningRoutine {
                routine_id: routine.id,
                server_id: routine.server_id,
                name: routine.name.clone(),
                step_index: 0,
                step_count: routine.steps.len(),
                step_label: routine.steps[0].label(),
                started_at: Local::now().to_rfc3339(),
                cancel: cancel.clone(),
            },
        );
    }

    // Record the start right away so the per-minute trigger can't fire it twice
    update_run_record(&app, routine.id, "running", None, false);

    tauri::async_runtime::spawn(async move {
        log::info!("📋 [Routine] Starting '{}' on server {} ({} steps)", routine.name, routine.server_id, routine.steps.len());
        let result = run_steps(&app, &routine, &cancel).await;

        if let Ok(mut map) = RUNNING.lock() {
            map.remove(&routine.server_id);
        }

        let (status, error) = match &result {
            Ok(()) => ("success", None),
            Err(e) if e == CANCELLED => ("cancelled", None),
            Err(e) => ("failed", Some(e.clone())),
        };
        log::info!("📋 [Routine] '{}' finished: {}{}", routine.name, status, error.as_deref().map(|e| format!(" ({})", e)).unwrap_or_default());
        update_run_record(&app, routine.id, status, error.as_deref(), routine.run_once && status == "success");
        emit(&app, &routine, routine.steps.len(), String::new(), status, error);
    });
    Ok(())
}

const CANCELLED: &str = "__cancelled__";

fn update_run_record(app: &AppHandle, routine_id: i64, status: &str, error: Option<&str>, disable: bool) {
    let state = app.state::<AppState>();
    let Ok(db) = state.db.lock() else { return };
    let Ok(conn) = db.get_connection() else { return };
    let _ = conn.execute(
        "UPDATE scheduled_routines SET last_run = ?1, last_status = ?2, last_error = ?3,
             enabled = CASE WHEN ?4 THEN 0 ELSE enabled END
         WHERE id = ?5",
        rusqlite::params![Local::now().to_rfc3339(), status, error, disable, routine_id],
    );
}

fn emit(app: &AppHandle, routine: &Routine, step_index: usize, step_label: String, status: &str, message: Option<String>) {
    let _ = app.emit(
        "routine-progress",
        ProgressEvent {
            routine_id: routine.id,
            server_id: routine.server_id,
            name: routine.name.clone(),
            step_index,
            step_count: routine.steps.len(),
            step_label,
            status: status.into(),
            message,
        },
    );
}

async fn run_steps(app: &AppHandle, routine: &Routine, cancel: &Arc<AtomicBool>) -> Result<(), String> {
    for (i, step) in routine.steps.iter().enumerate() {
        if cancel.load(Ordering::SeqCst) {
            return Err(CANCELLED.into());
        }
        let label = step.label();
        if let Ok(mut map) = RUNNING.lock() {
            if let Some(r) = map.get_mut(&routine.server_id) {
                r.step_index = i;
                r.step_label = label.clone();
            }
        }
        emit(app, routine, i, label.clone(), "running", None);
        log::info!("📋 [Routine] '{}' step {}/{}: {}", routine.name, i + 1, routine.steps.len(), label);

        run_step(app, routine.server_id, step, cancel)
            .await
            .map_err(|e| if e == CANCELLED { e } else { format!("Step {} ({}): {}", i + 1, label, e) })?;
    }
    Ok(())
}

/// Sleep that wakes up early when the routine is cancelled
async fn cancellable_sleep(secs: u64, cancel: &Arc<AtomicBool>) -> Result<(), String> {
    for _ in 0..secs {
        if cancel.load(Ordering::SeqCst) {
            return Err(CANCELLED.into());
        }
        sleep(Duration::from_secs(1)).await;
    }
    Ok(())
}

fn is_running(app: &AppHandle, server_id: i64) -> bool {
    app.state::<AppState>().process_manager.is_server_running(server_id)
}

async fn wait_until_stopped(app: &AppHandle, server_id: i64, cancel: &Arc<AtomicBool>) -> Result<(), String> {
    for _ in 0..180 {
        if !is_running(app, server_id) {
            return Ok(());
        }
        cancellable_sleep(1, cancel).await?;
    }
    Err("Server did not stop within 3 minutes".into())
}

/// Best effort: messages to an offline server are skipped, not errors
async fn rcon(app: &AppHandle, server_id: i64, command: &str) {
    if !is_running(app, server_id) {
        return;
    }
    if let Some(rcon_state) = app.try_state::<RconState>() {
        if let Err(e) = rcon_state.inner().0.send_command(server_id, command).await {
            log::warn!("📋 [Routine] RCON '{}' failed: {}", command, e);
        }
    }
}

async fn broadcast(app: &AppHandle, server_id: i64, message: &str) {
    // Double quotes would end the RCON argument early
    let msg = message.replace('"', "'");
    rcon(app, server_id, &format!("Broadcast \"{}\"", msg)).await;
    rcon(app, server_id, &format!("ServerChat \"{}\"", msg)).await;
}

async fn stop(app: &AppHandle, server_id: i64, cancel: &Arc<AtomicBool>) -> Result<(), String> {
    if !is_running(app, server_id) {
        return Ok(());
    }
    let state = app.state::<AppState>();
    state.process_manager.set_pending_stop_reason(server_id, crate::services::process_manager::StopReason::ScheduledRestart);
    if let Some(guardian) = app.try_state::<crate::services::guardian::GuardianState>() {
        guardian.0.lock().await.mark_as_stopping(server_id).await;
    }
    crate::commands::server::stop_server(app.state::<AppState>(), server_id).await?;
    wait_until_stopped(app, server_id, cancel).await
}

async fn start_server(app: &AppHandle, server_id: i64) -> Result<(), String> {
    if is_running(app, server_id) {
        return Ok(());
    }
    crate::commands::server::start_server(app.clone(), server_id, false).await
}

async fn run_step(app: &AppHandle, server_id: i64, step: &RoutineStep, cancel: &Arc<AtomicBool>) -> Result<(), String> {
    match step {
        RoutineStep::Broadcast { message } => {
            broadcast(app, server_id, message).await;
            Ok(())
        }
        RoutineStep::Countdown { minutes, message } => {
            let mut marks: Vec<u32> = minutes.iter().copied().filter(|m| *m > 0).collect();
            marks.sort_unstable_by(|a, b| b.cmp(a));
            marks.dedup();
            for (idx, m) in marks.iter().enumerate() {
                broadcast(app, server_id, &message.replace("{minutes}", &m.to_string())).await;
                let next = marks.get(idx + 1).copied().unwrap_or(0);
                cancellable_sleep(((m - next) as u64) * 60, cancel).await?;
            }
            Ok(())
        }
        RoutineStep::Wait { minutes } => cancellable_sleep(*minutes as u64 * 60, cancel).await,
        RoutineStep::Rcon { command } => {
            rcon(app, server_id, command).await;
            Ok(())
        }
        RoutineStep::SaveWorld => {
            rcon(app, server_id, "SaveWorld").await;
            // Give ARK time to write the save before the next step (usually a stop)
            cancellable_sleep(10, cancel).await
        }
        RoutineStep::DestroyWildDinos => {
            rcon(app, server_id, "DestroyWildDinos").await;
            Ok(())
        }
        RoutineStep::Stop => stop(app, server_id, cancel).await,
        RoutineStep::Start => start_server(app, server_id).await,
        RoutineStep::Restart => {
            stop(app, server_id, cancel).await?;
            cancellable_sleep(5, cancel).await?;
            start_server(app, server_id).await
        }
        RoutineStep::Backup => crate::commands::backup::create_backup(
            app.state::<AppState>(),
            server_id,
            "auto".to_string(),
            None,
        )
        .await
        .map(|_| ()),
        RoutineStep::UpdateServer => {
            // update_server stops the server itself and leaves it stopped
            crate::commands::server::update_server(app.clone(), app.state::<AppState>(), server_id)
                .await
                .map(|_| ())
        }
        RoutineStep::SetConfig { file, section, key, value } => {
            if file != "GameUserSettings" && file != "Game" {
                return Err(format!("Unknown config file '{}'", file));
            }
            if key.trim().is_empty() || section.trim().is_empty() {
                return Err("Section and key are required".into());
            }
            let current = crate::commands::config::read_config(app.state::<AppState>(), server_id, file.clone()).await?;
            let updated = crate::services::ini_parser::IniParser::update_key(&current, section.trim(), key.trim(), value.trim());
            // save_config merges, syncs critical values to the DB and keeps a copy to re-apply if the
            // server is running (ARK overwrites GameUserSettings.ini on shutdown)
            crate::commands::config::save_config(app.state::<AppState>(), server_id, file.clone(), updated).await
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn steps_round_trip_with_frontend_json() {
        let json = r#"[
            {"type":"countdown","minutes":[15,10,5,1],"message":"Manutenção em {minutes} min"},
            {"type":"saveWorld"},
            {"type":"stop"},
            {"type":"setConfig","file":"GameUserSettings","section":"ServerSettings","key":"XPMultiplier","value":"3"},
            {"type":"wait","minutes":2},
            {"type":"start"},
            {"type":"broadcast","message":"Evento 3x começou!"},
            {"type":"rcon","command":"DestroyWildDinos"},
            {"type":"backup"},{"type":"updateServer"},{"type":"restart"},{"type":"destroyWildDinos"}
        ]"#;
        let steps: Vec<RoutineStep> = serde_json::from_str(json).expect("frontend step JSON must parse");
        assert_eq!(steps.len(), 12);
        match &steps[3] {
            RoutineStep::SetConfig { file, section, key, value } => {
                assert_eq!((file.as_str(), section.as_str(), key.as_str(), value.as_str()), ("GameUserSettings", "ServerSettings", "XPMultiplier", "3"));
            }
            other => panic!("unexpected step {:?}", other),
        }
        let back: Vec<RoutineStep> = serde_json::from_str(&serde_json::to_string(&steps).unwrap()).unwrap();
        assert_eq!(back.len(), steps.len());
    }

    #[test]
    fn routine_accepts_minimal_payload() {
        let r: Routine = serde_json::from_str(
            r#"{"serverId":4,"name":"Abrir","cronExpression":"0 18 * * 1-5","steps":[{"type":"start"}]}"#,
        )
        .unwrap();
        assert_eq!(r.id, 0);
        assert!(r.enabled);
        assert!(!r.run_once);
    }
}
