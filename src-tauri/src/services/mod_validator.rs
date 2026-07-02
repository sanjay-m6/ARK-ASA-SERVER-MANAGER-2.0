use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;
use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct SpawnDiagnosticResult {
    pub success: bool,
    pub mod_count: usize,
    pub spawn_entries_found: usize,
    pub missing_spawn_entries: Vec<String>,
    pub diagnostics: Vec<String>,
}

#[tauri::command]
pub async fn diagnose_spawn_issues(
    server_id: i64,
    state: State<'_, AppState>,
) -> Result<SpawnDiagnosticResult, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    // Get active mods and install path
    let (active_mods_str, install_path): (String, String) = conn
        .query_row(
            "SELECT active_mods, install_path FROM ase_servers WHERE id = ?1",
            [server_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Server not found: {}", e))?;

    let active_mods: Vec<String> = active_mods_str
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    let config_path = PathBuf::from(&install_path)
        .join("ShooterGame")
        .join("Saved")
        .join("Config")
        .join("WindowsServer")
        .join("Game.ini");

    let mut diagnostics = Vec::new();
    
    if !config_path.exists() {
        diagnostics.push("Game.ini not found. Spawn configurations cannot be verified.".to_string());
        return Ok(SpawnDiagnosticResult {
            success: false,
            mod_count: active_mods.len(),
            spawn_entries_found: 0,
            missing_spawn_entries: active_mods,
            diagnostics,
        });
    }

    let config_content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read Game.ini: {}", e))?;

    let mut spawn_entries = 0;
    let lc_content = config_content.to_lowercase();
    
    if lc_content.contains("configaddnpcspawnentriescontainer") {
        let count = lc_content.matches("configaddnpcspawnentriescontainer").count();
        spawn_entries += count;
        diagnostics.push(format!("Found {} ConfigAddNPCSpawnEntriesContainer entries in Game.ini.", count));
    } else {
        diagnostics.push("WARNING: ConfigAddNPCSpawnEntriesContainer is entirely missing from Game.ini.".to_string());
    }

    if lc_content.contains("configsubtractnpcspawnentriescontainer") {
        let count = lc_content.matches("configsubtractnpcspawnentriescontainer").count();
        spawn_entries += count;
        diagnostics.push(format!("Found {} ConfigSubtractNPCSpawnEntriesContainer entries in Game.ini.", count));
    }

    if lc_content.contains("configoverridenpcspawnentriescontainer") {
        let count = lc_content.matches("configoverridenpcspawnentriescontainer").count();
        spawn_entries += count;
        diagnostics.push(format!("Found {} ConfigOverrideNPCSpawnEntriesContainer entries in Game.ini.", count));
    }

    let mut missing = Vec::new();
    if active_mods.len() > 0 && spawn_entries == 0 {
        diagnostics.push("CRITICAL: You have active mods but ZERO spawn container entries. Modded creatures will NOT spawn naturally.".to_string());
        missing = active_mods.clone();
    } else if active_mods.len() > 0 && spawn_entries > 0 {
        diagnostics.push("SUCCESS: Spawn container entries found. The server configuration can correctly inject modded creatures into the wild.".to_string());
    }

    Ok(SpawnDiagnosticResult {
        success: true,
        mod_count: active_mods.len(),
        spawn_entries_found: spawn_entries,
        missing_spawn_entries: missing,
        diagnostics,
    })
}
