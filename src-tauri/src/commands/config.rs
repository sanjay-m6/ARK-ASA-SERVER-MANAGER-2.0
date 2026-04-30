use crate::services::config_generator::{ConfigGenerator, MapProfile, ServerConfig};
use crate::services::ini_parser::IniParser;
use crate::AppState;
use chrono::Local;
use std::fs;
use std::path::PathBuf;
use tauri::State;

/// Helper to get server install path from database
fn get_server_install_path(state: &State<'_, AppState>, server_id: i64) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT install_path FROM servers WHERE id = ?1",
        [server_id],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

/// Get config file path
fn get_config_path(install_path: &str, config_type: &str) -> PathBuf {
    PathBuf::from(install_path)
        .join("ShooterGame/Saved/Config/WindowsServer")
        .join(format!("{}.ini", config_type))
}

/// Get backup directory path
fn get_backup_dir(install_path: &str) -> PathBuf {
    PathBuf::from(install_path).join("ShooterGame/Saved/Config/WindowsServer/Backups")
}

#[tauri::command]
pub async fn read_config(
    state: State<'_, AppState>,
    server_id: i64,
    config_type: String,
) -> Result<String, String> {
    let install_path = get_server_install_path(&state, server_id)?;
    let path = get_config_path(&install_path, &config_type);

    if path.exists() {
        println!("📖 Reading config from: {:?}", path);
        fs::read_to_string(path).map_err(|e| e.to_string())
    } else {
        // Return default/empty config if file doesn't exist
        Ok(String::new())
    }
}

#[tauri::command]
pub async fn save_config(
    state: State<'_, AppState>,
    server_id: i64,
    config_type: String,
    content: String,
) -> Result<(), String> {
    let install_path = get_server_install_path(&state, server_id)?;

    let dir_path = PathBuf::from(&install_path).join("ShooterGame/Saved/Config/WindowsServer");

    fs::create_dir_all(&dir_path).map_err(|e| e.to_string())?;

    let file_path = dir_path.join(format!("{}.ini", config_type));

    // Use merge strategy to preserve existing keys (like per-level stats)
    let final_content = if file_path.exists() {
        let existing_content = fs::read_to_string(&file_path).unwrap_or_default();
        if !existing_content.is_empty() {
            // Merge: existing keys are preserved, new content takes precedence on conflicts
            println!("  🔄 Merging INI config (preserving existing keys)...");
            IniParser::merge(&existing_content, &content)
        } else {
            content.clone()
        }
    } else {
        content.clone()
    };

    fs::write(&file_path, &final_content).map_err(|e| e.to_string())?;
    println!("  ✅ Saved {} to {:?}", config_type, file_path);
    if config_type == "Game" {
        println!(
            "  🔍 [Debug] Game.ini content snippet:\n{}",
            &final_content.lines().take(5).collect::<Vec<_>>().join("\n")
        );
        if final_content.contains("PerLevelStatsMultiplier_Player") {
            println!("  ✅ [Debug] Game.ini contains Player Stats Multipliers");
        } else {
            println!("  ⚠️ [Debug] Game.ini DOES NOT contain Player Stats Multipliers!");
        }
    }

    // If we're saving GameUserSettings.ini, we need to sync critical values to the database
    // because the start_server command reads from the DB, not the INI files
    if config_type == "GameUserSettings" {
        let mut session_name: Option<String> = None;
        let mut map_name: Option<String> = None;
        let mut max_players: Option<i32> = None;
        let mut server_password: Option<String> = None;
        let mut admin_password: Option<String> = None;
        let mut rcon_enabled: Option<bool> = None;
        let mut rcon_port: Option<u16> = None;
        let mut game_port: Option<u16> = None;
        let mut query_port: Option<u16> = None;
        let mut ip_address: Option<String> = None;

        let mut current_section = String::new();

        for line in content.lines() {
            let line = line.trim();

            // Section header
            if line.starts_with('[') && line.ends_with(']') {
                current_section = line[1..line.len() - 1].to_string();
                continue;
            }

            // Key=Value pair
            if let Some((key, value)) = line.split_once('=') {
                let key = key.trim();
                let raw_value = value.trim();

                // Remove surrounding quotes if present
                let value = if raw_value.starts_with('"')
                    && raw_value.ends_with('"')
                    && raw_value.len() >= 2
                {
                    &raw_value[1..raw_value.len() - 1]
                } else {
                    raw_value
                };

                if current_section == "ServerSettings"
                    || current_section == "/Script/ShooterGame.ShooterGameMode"
                {
                    match key {
                        "SessionName" | "ServerName" => session_name = Some(value.to_string()),
                        "MapName" => map_name = Some(value.to_string()),
                        "MaxPlayers" => max_players = value.parse().ok(),
                        "ServerPassword" => server_password = Some(value.to_string()),
                        "ServerAdminPassword" => {
                            let clean_pwd = value.split("?ServerPassword=").next().unwrap_or(value);
                            admin_password = Some(clean_pwd.to_string());
                        }
                        "RCONEnabled" => rcon_enabled = Some(value.to_uppercase() == "TRUE"),
                        "RCONPort" => rcon_port = value.parse().ok(),
                        "Match" => {} // Ignore Match key if present
                        "MultiHome" | "IPAddress" => ip_address = Some(value.to_string()),
                        _ => {}
                    }
                }

                if current_section == "URL" || current_section == "/Script/Engine.GameSession" {
                    match key {
                        "Port" => game_port = value.parse().ok(),
                        "QueryPort" => query_port = value.parse().ok(),
                        "MultiHome" => ip_address = Some(value.to_string()),
                        _ => {}
                    }
                }
            }
        }

        // Perform the update
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let mut query = "UPDATE servers SET ".to_string();
        let mut updates = Vec::new();
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(v) = session_name {
            updates.push("session_name = ?");
            params.push(Box::new(v));
        }
        if let Some(v) = map_name {
            updates.push("map_name = ?");
            params.push(Box::new(v));
        }
        if let Some(v) = max_players {
            updates.push("max_players = ?");
            params.push(Box::new(v));
        }
        // Handle password specially - empty string means remove it (set to null in DB context usually, but here we might wrap)
        // But for strings we usually just overwrite.
        if let Some(v) = server_password {
            updates.push("server_password = ?");
            if v.is_empty() {
                params.push(Box::new(None::<String>));
            } else {
                params.push(Box::new(Some(v)));
            }
        }
        if let Some(v) = admin_password {
            updates.push("admin_password = ?");
            params.push(Box::new(v));
        }
        if let Some(v) = rcon_enabled {
            updates.push("rcon_enabled = ?");
            params.push(Box::new(v));
        }
        if let Some(v) = rcon_port {
            updates.push("rcon_port = ?");
            params.push(Box::new(v));
        }
        if let Some(v) = game_port {
            updates.push("game_port = ?");
            params.push(Box::new(v));
        }
        if let Some(v) = query_port {
            updates.push("query_port = ?");
            params.push(Box::new(v));
        }
        if let Some(v) = ip_address {
            updates.push("ip_address = ?");
            if v.is_empty() {
                params.push(Box::new(None::<String>));
            } else {
                params.push(Box::new(Some(v)));
            }
        }

        if !updates.is_empty() {
            query.push_str(&updates.join(", "));
            query.push_str(" WHERE id = ?");
            params.push(Box::new(server_id));

            let params_refs: Vec<&dyn rusqlite::ToSql> =
                params.iter().map(|p| p.as_ref()).collect();

            conn.execute(&query, params_refs.as_slice())
                .map_err(|e| format!("Failed to update database: {}", e))?;

            println!(
                "✅ Synced settings from INI to Database for server {}",
                server_id
            );
        }
    }

    Ok(())
}

/// Load server config from existing INI files + DB
/// Returns a fully populated ServerConfig reflecting the server's current state
#[tauri::command]
pub async fn load_server_config(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<ServerConfig, String> {
    let install_path = get_server_install_path(&state, server_id)?;
    let config_dir = PathBuf::from(&install_path).join("ShooterGame/Saved/Config/WindowsServer");

    // Start with DB values for identity/network fields
    let mut config = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        let mut cfg = ServerConfig::default();

        conn
            .query_row(
                "SELECT session_name, server_password, admin_password, max_players, map_name, 
             game_port, query_port, rcon_port, rcon_enabled, ip_address 
             FROM servers WHERE id = ?1",
                [server_id],
                |row| {
                    cfg.session_name = row.get::<_, String>(0).unwrap_or_default();
                    cfg.server_password = row.get(1).ok();
                    let mut loaded_admin_pwd = row.get::<_, String>(2).unwrap_or_default();
                    
                    // Auto-repair polluted admin_password from previous bugs
                    if loaded_admin_pwd.contains("?ServerPassword=") {
                        let parts: Vec<&str> = loaded_admin_pwd.split("?ServerPassword=").collect();
                        let clean_admin = parts.first().unwrap_or(&"").to_string();
                        
                        // If the server password is empty but we found it baked into the admin password, recover it
                        if parts.len() > 1 && (cfg.server_password.is_none() || cfg.server_password.as_ref().unwrap().is_empty()) {
                            cfg.server_password = Some(parts[1].to_string());
                        }
                        loaded_admin_pwd = clean_admin;
                    }
                    cfg.admin_password = loaded_admin_pwd;
                    cfg.max_players = row.get::<_, i32>(3).unwrap_or(70);
                    cfg.map_name = row.get::<_, String>(4).unwrap_or_default();
                    cfg.game_port = row.get::<_, u16>(5).unwrap_or(7777);
                    cfg.query_port = row.get::<_, u16>(6).unwrap_or(27015);
                    cfg.rcon_port = row.get::<_, u16>(7).unwrap_or(32330);
                    cfg.rcon_enabled = row.get::<_, bool>(8).unwrap_or(true);
                    cfg.ip_address = row.get(9).ok().flatten();
                    Ok(())
                },
            )
            .map_err(|e| format!("Failed to load server from DB: {}", e))?;

        cfg
    };

    // Parse GameUserSettings.ini for gameplay multipliers
    let gus_path = config_dir.join("GameUserSettings.ini");
    if gus_path.exists() {
        let gus_content = fs::read_to_string(&gus_path).unwrap_or_default();

        // Helper to parse float values from INI
        let get_f32 = |section: &str, key: &str, default: f32| -> f32 {
            IniParser::get_value(&gus_content, section, key)
                .and_then(|v| v.parse::<f32>().ok())
                .unwrap_or(default)
        };
        let get_bool = |section: &str, key: &str, default: bool| -> bool {
            IniParser::get_value(&gus_content, section, key)
                .map(|v| v.to_uppercase() == "TRUE" || v == "1")
                .unwrap_or(default)
        };

        let ss = "ServerSettings";

        // Rates
        config.xp_multiplier = get_f32(ss, "XPMultiplier", 1.0);
        config.harvest_amount_multiplier = get_f32(ss, "HarvestAmountMultiplier", 1.0);
        config.taming_speed_multiplier = get_f32(ss, "TamingSpeedMultiplier", 1.0);
        config.difficulty_offset = get_f32(ss, "DifficultyOffset", 1.0);
        config.override_official_difficulty = get_f32(ss, "OverrideOfficialDifficulty", 5.0);

        // Day/Night
        config.day_cycle_speed_scale = get_f32(ss, "DayCycleSpeedScale", 1.0);
        config.day_time_speed_scale = get_f32(ss, "DayTimeSpeedScale", 1.0);
        config.night_time_speed_scale = get_f32(ss, "NightTimeSpeedScale", 1.0);

        // Player
        config.player_damage_multiplier = get_f32(ss, "PlayerDamageMultiplier", 1.0);
        config.player_resistance_multiplier = get_f32(ss, "PlayerResistanceMultiplier", 1.0);
        config.player_food_drain_multiplier =
            get_f32(ss, "PlayerCharacterFoodDrainMultiplier", 1.0);
        config.player_water_drain_multiplier =
            get_f32(ss, "PlayerCharacterWaterDrainMultiplier", 1.0);
        config.player_stamina_drain_multiplier =
            get_f32(ss, "PlayerCharacterStaminaDrainMultiplier", 1.0);

        // Dino
        config.dino_damage_multiplier = get_f32(ss, "DinoDamageMultiplier", 1.0);
        config.dino_resistance_multiplier = get_f32(ss, "DinoResistanceMultiplier", 1.0);
        config.dino_food_drain_multiplier = get_f32(ss, "DinoCharacterFoodDrainMultiplier", 1.0);
        config.wild_dino_count_multiplier = get_f32(ss, "DinoCountMultiplier", 1.0);

        // Structure
        config.structure_damage_multiplier = get_f32(ss, "StructureDamageMultiplier", 1.0);
        config.structure_resistance_multiplier = get_f32(ss, "StructureResistanceMultiplier", 1.0);
        config.structure_decay_multiplier = get_f32(ss, "PvEStructureDecayPeriodMultiplier", 1.0);
        config.global_item_stack_size_multiplier = get_f32(ss, "ItemStackSizeMultiplier", 1.0);

        // PvE/PvP
        config.pve_mode = get_bool(ss, "ServerPVE", false);
        config.pvp_gamma = get_bool(ss, "EnablePvPGamma", false);
        config.friendly_fire = !get_bool(ss, "DisableFriendlyFire", true);

        // Session name from INI overrides DB if present
        if let Some(name) = IniParser::get_value(&gus_content, ss, "SessionName") {
            if !name.is_empty() {
                config.session_name = name;
            }
        }
    }

    // Parse Game.ini for breeding/per-level stats
    let game_path = config_dir.join("Game.ini");
    if game_path.exists() {
        let game_content = fs::read_to_string(&game_path).unwrap_or_default();
        let sgm = "/Script/ShooterGame.ShooterGameMode";

        let get_f32_game = |key: &str, default: f32| -> f32 {
            IniParser::get_value(&game_content, sgm, key)
                .and_then(|v| v.parse::<f32>().ok())
                .unwrap_or(default)
        };
        let get_bool_game = |key: &str, default: bool| -> bool {
            IniParser::get_value(&game_content, sgm, key)
                .map(|v| v.to_uppercase() == "TRUE" || v == "1")
                .unwrap_or(default)
        };

        config.egg_hatch_speed_multiplier = get_f32_game("EggHatchSpeedMultiplier", 1.0);
        config.baby_mature_speed_multiplier = get_f32_game("BabyMatureSpeedMultiplier", 1.0);
        config.baby_food_consumption_multiplier =
            get_f32_game("BabyFoodConsumptionSpeedMultiplier", 1.0);
        config.mating_interval_multiplier = get_f32_game("MatingIntervalMultiplier", 1.0);
        config.allow_flyer_speed_leveling = get_bool_game("bAllowFlyerSpeedLeveling", false);
        config.allow_speed_leveling = get_bool_game("bAllowSpeedLeveling", false);
    }

    println!("[CONFIG] Loaded server {} config from INI files", server_id);
    Ok(config)
}

#[tauri::command]
pub async fn backup_config(
    state: State<'_, AppState>,
    server_id: i64,
    config_type: String,
) -> Result<String, String> {
    let install_path = get_server_install_path(&state, server_id)?;
    let config_path = get_config_path(&install_path, &config_type);

    if !config_path.exists() {
        return Ok("No config file to backup".to_string());
    }

    let backup_dir = get_backup_dir(&install_path);
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

    // Create timestamped backup filename
    let timestamp = Local::now().format("%Y%m%d_%H%M%S");
    let backup_filename = format!("{}_{}.ini.bak", config_type, timestamp);
    let backup_path = backup_dir.join(&backup_filename);

    fs::copy(&config_path, &backup_path).map_err(|e| e.to_string())?;

    println!("📦 Created backup: {:?}", backup_path);
    Ok(backup_filename)
}

#[tauri::command]
pub async fn restore_config(
    state: State<'_, AppState>,
    server_id: i64,
    config_type: String,
    backup_filename: String,
) -> Result<(), String> {
    let install_path = get_server_install_path(&state, server_id)?;
    let backup_dir = get_backup_dir(&install_path);
    let backup_path = backup_dir.join(&backup_filename);

    if !backup_path.exists() {
        return Err(format!("Backup file not found: {}", backup_filename));
    }

    let config_path = get_config_path(&install_path, &config_type);

    fs::copy(&backup_path, &config_path).map_err(|e| e.to_string())?;

    println!("🔄 Restored config from: {:?}", backup_path);
    Ok(())
}

#[tauri::command]
pub async fn list_config_backups(
    state: State<'_, AppState>,
    server_id: i64,
    config_type: String,
) -> Result<Vec<String>, String> {
    let install_path = get_server_install_path(&state, server_id)?;
    let backup_dir = get_backup_dir(&install_path);

    if !backup_dir.exists() {
        return Ok(vec![]);
    }

    let prefix = format!("{}_", config_type);
    let mut backups: Vec<String> = fs::read_dir(&backup_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(&prefix) && name.ends_with(".ini.bak") {
                Some(name)
            } else {
                None
            }
        })
        .collect();

    // Sort by newest first
    backups.sort();
    backups.reverse();

    Ok(backups)
}

// ===============================================
// Config Generator Commands
// ===============================================

/// Get all available map profiles with recommended settings
#[tauri::command]
pub async fn get_map_profiles() -> Result<Vec<MapProfile>, String> {
    Ok(ConfigGenerator::get_map_profiles())
}

/// Get profile for a specific map
#[tauri::command]
pub async fn get_map_profile(map_id: String) -> Result<Option<MapProfile>, String> {
    Ok(ConfigGenerator::get_profile_for_map(&map_id))
}

/// Generate GameUserSettings.ini content preview
#[tauri::command]
pub async fn preview_game_user_settings(config: ServerConfig) -> Result<String, String> {
    Ok(ConfigGenerator::generate_game_user_settings(&config))
}

/// Generate Game.ini content preview
#[tauri::command]
pub async fn preview_game_ini(config: ServerConfig) -> Result<String, String> {
    Ok(ConfigGenerator::generate_game_ini(&config))
}

/// Generate startup command for server
#[tauri::command]
pub async fn generate_startup_command(
    config: ServerConfig,
    install_path: String,
) -> Result<String, String> {
    let path = PathBuf::from(install_path);
    Ok(ConfigGenerator::generate_startup_command(&config, &path))
}

/// Apply map profile to server config and return updated config
#[tauri::command]
pub async fn apply_map_profile_to_config(
    mut config: ServerConfig,
    map_id: String,
) -> Result<ServerConfig, String> {
    if let Some(profile) = ConfigGenerator::get_profile_for_map(&map_id) {
        ConfigGenerator::apply_map_profile(&mut config, &profile);
        config.map_name = map_id;
    }
    Ok(config)
}

/// Write config files to server directory
#[tauri::command]
pub async fn write_server_configs(
    state: State<'_, AppState>,
    server_id: i64,
    install_path: String,
    config: ServerConfig,
    backup: bool,
) -> Result<(), String> {
    let path = PathBuf::from(install_path);
    ConfigGenerator::write_configs(&path, &config, backup)?;

    // Sync config values to database so UI reflects the changes
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let clean_admin_password = config
        .admin_password
        .split("?ServerPassword=")
        .next()
        .unwrap_or(&config.admin_password)
        .to_string();

    conn.execute(
        "UPDATE servers SET max_players = ?1, map_name = ?2, session_name = ?3, 
         game_port = ?4, query_port = ?5, rcon_port = ?6, admin_password = ?7,
         server_password = ?8, rcon_enabled = ?9, ip_address = ?10 WHERE id = ?11",
        rusqlite::params![
            config.max_players,
            config.map_name,
            config.session_name,
            config.game_port,
            config.query_port,
            config.rcon_port,
            clean_admin_password,
            config.server_password,
            config.rcon_enabled,
            config.ip_address,
            server_id,
        ],
    )
    .map_err(|e| e.to_string())?;

    println!(
        "✅ Config saved and synced to database for server {}",
        server_id
    );
    Ok(())
}

/// Backup all config files for a server
#[tauri::command]
pub async fn backup_all_configs(
    _state: State<'_, AppState>,
    install_path: String,
) -> Result<String, String> {
    let path = PathBuf::from(install_path);
    let backup_path = ConfigGenerator::backup_configs(&path)?;
    Ok(backup_path.to_string_lossy().to_string())
}

/// Get default server config
#[tauri::command]
pub async fn get_default_config() -> Result<ServerConfig, String> {
    Ok(ServerConfig::default())
}
