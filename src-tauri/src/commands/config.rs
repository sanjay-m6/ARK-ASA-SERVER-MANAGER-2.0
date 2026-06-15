use crate::services::config_generator::{ConfigGenerator, MapProfile, ServerConfig};
use crate::services::ini_parser::IniParser;
use crate::AppState;
use chrono::Local;
use std::fs;
use std::path::PathBuf;
use tauri::State;

/// Strip ARK engine's `?ServerPassword=<value>` corruption from ServerAdminPassword lines.
///
/// The ARK server engine modifies GameUserSettings.ini at runtime and appends the server
/// password onto the admin password value (e.g. `ServerAdminPassword=Admin123?ServerPassword=Ark123`).
/// This function scans the full INI text and repairs any such lines in-place.
fn sanitize_ini_content(content: &str) -> String {
    content
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            // BUG FIX: Prevent "Ticking loop" on Club Ark/Mod Maps by stripping ActiveMapMods=0
            if trimmed == "ActiveMapMods=0" || trimmed == "ActiveModMap=0" {
                return None;
            }
            if let Some(rest) = trimmed.strip_prefix("ServerAdminPassword=") {
                if let Some(idx) = rest.find("?ServerPassword=") {
                    // Reconstruct with only the admin password portion
                    return Some(format!("ServerAdminPassword={}", &rest[..idx]));
                }
            }
            Some(line.to_string())
        })
        .collect::<Vec<_>>()
        .join("\r\n")
}

/// Helper to get server install path and type from database
fn get_server_info(state: &State<'_, AppState>, server_id: i64) -> Result<(String, String), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    
    // Try to get from servers (ASA) table first
    match conn.query_row(
        "SELECT install_path, server_type FROM servers WHERE id = ?1",
        [server_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1).unwrap_or_else(|_| "ASA".to_string()))),
    ) {
        Ok(info) => Ok(info),
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            // Try to query from ase_servers table next
            conn.query_row(
                "SELECT install_path FROM ase_servers WHERE id = ?1",
                [server_id],
                |row| Ok((row.get::<_, String>(0)?, "ASE".to_string())),
            )
            .map_err(|e| format!("Server not found in servers or ase_servers: {}", e))
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Get config file path
fn get_config_path(install_path: &str, config_type: &str, server_type: &str) -> PathBuf {
    let sub_dir = ConfigGenerator::get_config_subdirectory(&PathBuf::from(install_path), Some(server_type));
    PathBuf::from(install_path)
        .join(format!("ShooterGame/Saved/Config/{}", sub_dir))
        .join(format!("{}.ini", config_type))
}

/// Get backup directory path
fn get_backup_dir(install_path: &str, server_type: &str) -> PathBuf {
    let sub_dir = ConfigGenerator::get_config_subdirectory(&PathBuf::from(install_path), Some(server_type));
    PathBuf::from(install_path).join(format!("ShooterGame/Saved/Config/{}/Backups", sub_dir))
}

#[tauri::command]
pub async fn read_config(
    state: State<'_, AppState>,
    server_id: i64,
    config_type: String,
) -> Result<String, String> {
    let (install_path, server_type) = get_server_info(&state, server_id)?;
    let path = get_config_path(&install_path, &config_type, &server_type);

    if path.exists() {
        println!("📖 Reading config from: {:?}", path);
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;

        // BUG FIX: The ARK server engine appends ?ServerPassword=<value> to the
        // ServerAdminPassword line in GameUserSettings.ini at runtime. Strip it on
        // read so the frontend never sees (or re-saves) the corrupted value.
        if config_type == "GameUserSettings" {
            let sanitized = sanitize_ini_content(&content);
            if sanitized != content {
                println!("  🔧 Sanitized ?ServerPassword= corruption from ServerAdminPassword");
                // Also fix the on-disk file so the corruption doesn't persist
                let _ = fs::write(&path, &sanitized);
            }
            Ok(sanitized)
        } else {
            Ok(content)
        }
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
    let (install_path, server_type) = get_server_info(&state, server_id)?;
    let sub_dir = ConfigGenerator::get_config_subdirectory(&PathBuf::from(&install_path), Some(&server_type));
    let dir_path = PathBuf::from(&install_path).join(format!("ShooterGame/Saved/Config/{}", sub_dir));

    fs::create_dir_all(&dir_path).map_err(|e| e.to_string())?;

    let file_path = dir_path.join(format!("{}.ini", config_type));

    // BUG FIX: Sanitize incoming content AND existing file to strip ARK engine's
    // ?ServerPassword= corruption from ServerAdminPassword before merge/write.
    let clean_content = if config_type == "GameUserSettings" {
        sanitize_ini_content(&content)
    } else {
        content.clone()
    };

    // Use merge strategy to preserve existing keys (like per-level stats)
    let final_content = if file_path.exists() {
        let existing_raw = fs::read_to_string(&file_path).unwrap_or_default();
        if !existing_raw.is_empty() {
            // Sanitize the existing file too — ARK may have corrupted it at runtime
            let existing_content = if config_type == "GameUserSettings" {
                sanitize_ini_content(&existing_raw)
            } else {
                existing_raw
            };
            // Merge: existing keys are preserved, new content takes precedence on conflicts
            println!("  🔄 Merging INI config (preserving existing keys)...");
            IniParser::merge(&existing_content, &clean_content)
        } else {
            clean_content
        }
    } else {
        clean_content
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
        let session_name = IniParser::get_value(&content, "ServerSettings", "SessionName")
            .or_else(|| IniParser::get_value(&content, "ServerSettings", "ServerName"))
            .map(|s| s.trim_matches('"').trim_matches('\'').to_string());
        
        let map_name = IniParser::get_value(&content, "ServerSettings", "MapName")
            .map(|s| s.trim_matches('"').trim_matches('\'').to_string());

        let max_players: Option<i32> = IniParser::get_value(&content, "ServerSettings", "MaxPlayers")
            .or_else(|| IniParser::get_value(&content, "/Script/Engine.GameSession", "MaxPlayers"))
            .and_then(|v| v.trim_matches('"').trim_matches('\'').parse().ok());

        let server_password = IniParser::get_value(&content, "ServerSettings", "ServerPassword")
            .map(|s| s.trim_matches('"').trim_matches('\'').to_string());

        let admin_password = IniParser::get_value(&content, "ServerSettings", "ServerAdminPassword")
            .map(|v| {
                let v = v.trim_matches('"').trim_matches('\'');
                let clean = v.split("?ServerPassword=").next().unwrap_or(v).to_string();
                clean
            });

        let rcon_enabled = IniParser::get_value(&content, "ServerSettings", "RCONEnabled")
            .map(|v| {
                let vl = v.trim_matches('"').trim_matches('\'').to_lowercase();
                vl == "true" || vl == "1"
            });

        let rcon_port: Option<u16> = IniParser::get_value(&content, "ServerSettings", "RCONPort")
            .and_then(|v| v.trim_matches('"').trim_matches('\'').parse().ok());

        let game_port: Option<u16> = IniParser::get_value(&content, "URL", "Port")
            .and_then(|v| v.trim_matches('"').trim_matches('\'').parse().ok());

        let query_port: Option<u16> = IniParser::get_value(&content, "URL", "QueryPort")
            .and_then(|v| v.trim_matches('"').trim_matches('\'').parse().ok());

        let ip_address = IniParser::get_value(&content, "URL", "MultiHome")
            .or_else(|| IniParser::get_value(&content, "ServerSettings", "MultiHome"))
            .or_else(|| IniParser::get_value(&content, "ServerSettings", "IPAddress"))
            .map(|s| s.trim_matches('"').trim_matches('\'').to_string());

        // Perform the update
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let mut query = if server_type == "ASE" {
            "UPDATE ase_servers SET ".to_string()
        } else {
            "UPDATE servers SET ".to_string()
        };
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
            if server_type == "ASE" {
                params.push(Box::new(v));
            } else {
                if v.is_empty() {
                    params.push(Box::new(None::<String>));
                } else {
                    params.push(Box::new(Some(v)));
                }
            }
        }
        if let Some(v) = admin_password {
            updates.push("admin_password = ?");
            params.push(Box::new(v));
        }
        if server_type != "ASE" {
            if let Some(v) = rcon_enabled {
                updates.push("rcon_enabled = ?");
                params.push(Box::new(v));
            }
        }
        if let Some(v) = rcon_port {
            updates.push("rcon_port = ?");
            params.push(Box::new(v));
        }
        if let Some(v) = game_port {
            if server_type == "ASE" {
                updates.push("port = ?");
            } else {
                updates.push("game_port = ?");
            }
            params.push(Box::new(v));
        }
        if let Some(v) = query_port {
            updates.push("query_port = ?");
            params.push(Box::new(v));
        }
        if server_type != "ASE" {
            if let Some(v) = ip_address {
                updates.push("ip_address = ?");
                if v.is_empty() {
                    params.push(Box::new(None::<String>));
                } else {
                    params.push(Box::new(Some(v)));
                }
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
    let (install_path, server_type) = get_server_info(&state, server_id)?;
    let sub_dir = ConfigGenerator::get_config_subdirectory(&PathBuf::from(&install_path), Some(&server_type));
    let config_dir = PathBuf::from(&install_path).join(format!("ShooterGame/Saved/Config/{}", sub_dir));

    // Start with DB values for identity/network fields
    let mut config = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        let mut cfg = ServerConfig::default();

        if server_type == "ASE" {
            conn.query_row(
                "SELECT session_name, server_password, admin_password, max_players, map_name, 
                 port, query_port, rcon_port 
                 FROM ase_servers WHERE id = ?1",
                [server_id],
                |row| {
                    cfg.session_name = row.get::<_, String>(0).unwrap_or_default();
                    let mut server_pwd = row.get::<_, String>(1).unwrap_or_default();
                    let mut loaded_admin_pwd = row.get::<_, String>(2).unwrap_or_default();
                    
                    // Auto-repair polluted admin_password from previous bugs
                    if loaded_admin_pwd.contains("?ServerPassword=") {
                        let parts: Vec<&str> = loaded_admin_pwd.split("?ServerPassword=").collect();
                        let clean_admin = parts.first().unwrap_or(&"").to_string();
                        
                        // If the server password is empty but we found it baked into the admin password, recover it
                        if parts.len() > 1 && server_pwd.is_empty() {
                            server_pwd = parts[1].to_string();
                        }
                        loaded_admin_pwd = clean_admin;
                    }
                    cfg.server_password = if server_pwd.is_empty() { None } else { Some(server_pwd) };
                    cfg.admin_password = loaded_admin_pwd;
                    cfg.max_players = row.get::<_, i32>(3).unwrap_or(70);
                    cfg.map_name = row.get::<_, String>(4).unwrap_or_default();
                    cfg.game_port = row.get::<_, u16>(5).unwrap_or(7777);
                    cfg.query_port = row.get::<_, u16>(6).unwrap_or(27015);
                    cfg.rcon_port = row.get::<_, u16>(7).unwrap_or(32330);
                    cfg.rcon_enabled = true; // default true for ASE
                    cfg.ip_address = None;
                    Ok(())
                },
            )
            .map_err(|e| format!("Failed to load server from DB (ase_servers): {}", e))?;
        } else {
            conn.query_row(
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
        }

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
    let (install_path, server_type) = get_server_info(&state, server_id)?;
    let config_path = get_config_path(&install_path, &config_type, &server_type);

    if !config_path.exists() {
        return Ok("No config file to backup".to_string());
    }

    let backup_dir = get_backup_dir(&install_path, &server_type);
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
    let (install_path, server_type) = get_server_info(&state, server_id)?;
    let backup_dir = get_backup_dir(&install_path, &server_type);
    let backup_path = backup_dir.join(&backup_filename);

    if !backup_path.exists() {
        return Err(format!("Backup file not found: {}", backup_filename));
    }

    let config_path = get_config_path(&install_path, &config_type, &server_type);

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
    let (install_path, server_type) = get_server_info(&state, server_id)?;
    let backup_dir = get_backup_dir(&install_path, &server_type);

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
    server_type: String,
) -> Result<String, String> {
    let path = PathBuf::from(install_path);
    Ok(ConfigGenerator::generate_startup_command(&config, &path, &server_type))
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
    let (_install_path_db, server_type) = get_server_info(&state, server_id)?;
    let path = PathBuf::from(install_path); // Note: still using provided install_path, not from DB
    ConfigGenerator::write_configs(&path, &config, backup, &server_type)?;

    // Sync config values to database so UI reflects the changes
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let clean_admin_password = config
        .admin_password
        .split("?ServerPassword=")
        .next()
        .unwrap_or(&config.admin_password)
        .to_string();

    if server_type == "ASE" {
        conn.execute(
            "UPDATE ase_servers SET max_players = ?1, map_name = ?2, session_name = ?3, 
             port = ?4, query_port = ?5, rcon_port = ?6, admin_password = ?7,
             server_password = ?8 WHERE id = ?9",
            rusqlite::params![
                config.max_players,
                config.map_name,
                config.session_name,
                config.game_port,
                config.query_port,
                config.rcon_port,
                clean_admin_password,
                config.server_password.clone().unwrap_or_default(),
                server_id,
            ],
        )
        .map_err(|e| e.to_string())?;
    } else {
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
    }

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
    // Use fallback for backup_all_configs as it doesn't take server_type
    let backup_path = ConfigGenerator::backup_configs(&path, "ASA")?;
    Ok(backup_path.to_string_lossy().to_string())
}

/// Get default server config
#[tauri::command]
pub async fn get_default_config() -> Result<ServerConfig, String> {
    Ok(ServerConfig::default())
}
