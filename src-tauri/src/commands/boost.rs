use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::{State, AppHandle};
use std::fs;
use crate::services::ini_parser::IniParser;
use crate::commands::config::{get_server_info, resolve_user_config_folder, get_config_path};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoostProfile {
    pub id: Option<i64>,
    pub server_id: i64,
    pub name: String,
    pub xp_multiplier: f64,
    pub taming_multiplier: f64,
    pub harvest_multiplier: f64,
    pub mating_multiplier: f64,
    pub hatch_multiplier: f64,
    pub mature_multiplier: f64,
    pub active: bool,
}

#[tauri::command]
pub async fn get_boost_profiles(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Vec<BoostProfile>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, server_id, name, xp_multiplier, taming_multiplier, harvest_multiplier, \
             mating_multiplier, hatch_multiplier, mature_multiplier, active \
             FROM boost_profiles WHERE server_id = ?1"
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([server_id], |row| {
            Ok(BoostProfile {
                id: Some(row.get(0)?),
                server_id: row.get(1)?,
                name: row.get(2)?,
                xp_multiplier: row.get(3)?,
                taming_multiplier: row.get(4)?,
                harvest_multiplier: row.get(5)?,
                mating_multiplier: row.get(6)?,
                hatch_multiplier: row.get(7)?,
                mature_multiplier: row.get(8)?,
                active: row.get::<_, i32>(9)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut profiles = Vec::new();
    for r in rows {
        if let Ok(p) = r {
            profiles.push(p);
        }
    }
    Ok(profiles)
}

#[tauri::command]
pub async fn save_boost_profile(
    state: State<'_, AppState>,
    profile: BoostProfile,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    if let Some(id) = profile.id {
        conn.execute(
            "UPDATE boost_profiles SET name = ?1, xp_multiplier = ?2, taming_multiplier = ?3, \
             harvest_multiplier = ?4, mating_multiplier = ?5, hatch_multiplier = ?6, mature_multiplier = ?7 \
             WHERE id = ?8",
            rusqlite::params![
                profile.name,
                profile.xp_multiplier,
                profile.taming_multiplier,
                profile.harvest_multiplier,
                profile.mating_multiplier,
                profile.hatch_multiplier,
                profile.mature_multiplier,
                id
            ],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO boost_profiles (server_id, name, xp_multiplier, taming_multiplier, harvest_multiplier, \
             mating_multiplier, hatch_multiplier, mature_multiplier, active) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0)",
            rusqlite::params![
                profile.server_id,
                profile.name,
                profile.xp_multiplier,
                profile.taming_multiplier,
                profile.harvest_multiplier,
                profile.mating_multiplier,
                profile.hatch_multiplier,
                profile.mature_multiplier
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_boost_profile(
    state: State<'_, AppState>,
    id: i64,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM boost_profiles WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_active_boost_profile(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Option<BoostProfile>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, server_id, name, xp_multiplier, taming_multiplier, harvest_multiplier, \
             mating_multiplier, hatch_multiplier, mature_multiplier, active \
             FROM boost_profiles WHERE server_id = ?1 AND active = 1"
        )
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query_map([server_id], |row| {
            Ok(BoostProfile {
                id: Some(row.get(0)?),
                server_id: row.get(1)?,
                name: row.get(2)?,
                xp_multiplier: row.get(3)?,
                taming_multiplier: row.get(4)?,
                harvest_multiplier: row.get(5)?,
                mating_multiplier: row.get(6)?,
                hatch_multiplier: row.get(7)?,
                mature_multiplier: row.get(8)?,
                active: row.get::<_, i32>(9)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;

    if let Some(r) = rows.next() {
        let p = r.map_err(|e| e.to_string())?;
        Ok(Some(p))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn activate_boost_profile(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    server_id: i64,
    id: i64,
) -> Result<(), String> {
    // 1. Fetch profile details
    let profile = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT id, server_id, name, xp_multiplier, taming_multiplier, harvest_multiplier, \
             mating_multiplier, hatch_multiplier, mature_multiplier FROM boost_profiles WHERE id = ?1",
            [id],
            |row| {
                Ok(BoostProfile {
                    id: Some(row.get(0)?),
                    server_id: row.get(1)?,
                    name: row.get(2)?,
                    xp_multiplier: row.get(3)?,
                    taming_multiplier: row.get(4)?,
                    harvest_multiplier: row.get(5)?,
                    mating_multiplier: row.get(6)?,
                    hatch_multiplier: row.get(7)?,
                    mature_multiplier: row.get(8)?,
                    active: true,
                })
            }
        ).map_err(|e| format!("Failed to find profile: {}", e))?
    };

    // Deactivate any active boost first (to ensure clean backup is not overwritten)
    let _ = deactivate_boost_profile_internal(&state, server_id).await;

    // 2. Fetch server details and config paths
    let (install_path, server_type) = get_server_info(&state, server_id)?;
    let user_folder = resolve_user_config_folder(&state, &server_type);
    
    let gus_path = get_config_path(&install_path, "GameUserSettings", &server_type, user_folder.as_deref());
    let game_path = get_config_path(&install_path, "Game", &server_type, user_folder.as_deref());

    // 3. Make backups of original config files
    let gus_backup = gus_path.with_extension("ini.boostbackup");
    let game_backup = game_path.with_extension("ini.boostbackup");

    if gus_path.exists() && !gus_backup.exists() {
        fs::copy(&gus_path, &gus_backup).map_err(|e| format!("Failed to backup GameUserSettings.ini: {}", e))?;
    }
    if game_path.exists() && !game_backup.exists() {
        fs::copy(&game_path, &game_backup).map_err(|e| format!("Failed to backup Game.ini: {}", e))?;
    }

    // 4. Inject boost values in GameUserSettings.ini
    if gus_path.exists() {
        let content = fs::read_to_string(&gus_path).map_err(|e| e.to_string())?;
        let mut sections = IniParser::parse_ordered(&content);
        
        let server_settings = sections.entry("ServerSettings".to_string()).or_default();
        server_settings.insert("XPMultiplier".to_string(), format!("{:.2}", profile.xp_multiplier));
        server_settings.insert("TamingSpeedMultiplier".to_string(), format!("{:.2}", profile.taming_multiplier));
        server_settings.insert("HarvestAmountMultiplier".to_string(), format!("{:.2}", profile.harvest_multiplier));

        let new_content = IniParser::serialize_ordered(&sections);
        fs::write(&gus_path, new_content).map_err(|e| e.to_string())?;
    }

    // 5. Inject boost values in Game.ini
    if game_path.exists() {
        let content = fs::read_to_string(&game_path).map_err(|e| e.to_string())?;
        let mut sections = IniParser::parse_ordered(&content);
        
        let mode_settings = sections.entry("/Script/ShooterGame.ShooterGameMode".to_string()).or_default();
        mode_settings.insert("MatingIntervalMultiplier".to_string(), format!("{:.2}", profile.mating_multiplier));
        mode_settings.insert("EggHatchSpeedMultiplier".to_string(), format!("{:.2}", profile.hatch_multiplier));
        mode_settings.insert("BabyMatureSpeedMultiplier".to_string(), format!("{:.2}", profile.mature_multiplier));

        let new_content = IniParser::serialize_ordered(&sections);
        fs::write(&game_path, new_content).map_err(|e| e.to_string())?;
    }

    // 6. Update database active status
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.execute("UPDATE boost_profiles SET active = 0 WHERE server_id = ?1", [server_id]).map_err(|e| e.to_string())?;
        conn.execute("UPDATE boost_profiles SET active = 1 WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    }

    // 7. Restart server
    let _ = crate::commands::server::stop_server(state.clone(), server_id).await;
    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    let _ = crate::commands::server::start_server(app_handle, server_id, false).await;

    Ok(())
}

#[tauri::command]
pub async fn deactivate_boost_profile(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<(), String> {
    deactivate_boost_profile_internal(&state, server_id).await?;

    // Restart server
    let _ = crate::commands::server::stop_server(state.clone(), server_id).await;
    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    let _ = crate::commands::server::start_server(app_handle, server_id, false).await;

    Ok(())
}

pub async fn deactivate_boost_profile_internal(
    state: &State<'_, AppState>,
    server_id: i64,
) -> Result<(), String> {
    // 1. Fetch server details and config paths
    let (install_path, server_type) = get_server_info(state, server_id)?;
    let user_folder = resolve_user_config_folder(state, &server_type);
    
    let gus_path = get_config_path(&install_path, "GameUserSettings", &server_type, user_folder.as_deref());
    let game_path = get_config_path(&install_path, "Game", &server_type, user_folder.as_deref());

    let gus_backup = gus_path.with_extension("ini.boostbackup");
    let game_backup = game_path.with_extension("ini.boostbackup");

    // 2. Restore backups if they exist
    if gus_backup.exists() {
        if gus_path.exists() {
            let _ = fs::remove_file(&gus_path);
        }
        fs::copy(&gus_backup, &gus_path).map_err(|e| format!("Failed to restore GameUserSettings.ini: {}", e))?;
        let _ = fs::remove_file(&gus_backup);
    }
    if game_backup.exists() {
        if game_path.exists() {
            let _ = fs::remove_file(&game_path);
        }
        fs::copy(&game_backup, &game_path).map_err(|e| format!("Failed to restore Game.ini: {}", e))?;
        let _ = fs::remove_file(&game_backup);
    }

    // 3. Update database active status
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.execute("UPDATE boost_profiles SET active = 0 WHERE server_id = ?1", [server_id]).map_err(|e| e.to_string())?;
    }

    Ok(())
}
