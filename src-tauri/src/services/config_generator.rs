// Config Generator Service for ASA Server Configuration
// Handles INI file generation, parsing, and per-map profiles

use chrono::Local;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

/// Represents a single INI configuration value
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct ConfigValue {
    pub key: String,
    pub value: String,
    pub description: Option<String>,
}

/// Represents a section in an INI file
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct ConfigSection {
    pub name: String,
    pub values: Vec<ConfigValue>,
}

/// Complete INI file structure
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct IniConfig {
    pub sections: Vec<ConfigSection>,
}

/// Per-map profile with recommended settings
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapProfile {
    pub map_id: String,
    pub map_name: String,
    pub difficulty_offset: f32,
    pub xp_multiplier: f32,
    pub harvest_multiplier: f32,
    pub taming_multiplier: f32,
    pub recommended_mods: Vec<String>,
    pub custom_settings: HashMap<String, String>,
}

/// Server configuration builder
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerConfig {
    // Server Identity
    pub session_name: String,
    pub server_password: Option<String>,
    pub admin_password: String,
    pub max_players: i32,
    pub map_name: String,

    // Network
    pub game_port: u16,
    pub query_port: u16,
    pub rcon_port: u16,
    pub rcon_enabled: bool,

    // Gameplay - Rates
    pub xp_multiplier: f32,
    pub harvest_amount_multiplier: f32,
    pub taming_speed_multiplier: f32,
    pub difficulty_offset: f32,
    pub override_official_difficulty: f32,

    // Day/Night
    pub day_cycle_speed_scale: f32,
    pub day_time_speed_scale: f32,
    pub night_time_speed_scale: f32,

    // Player Stats
    pub player_damage_multiplier: f32,
    pub player_resistance_multiplier: f32,
    pub player_food_drain_multiplier: f32,
    pub player_water_drain_multiplier: f32,
    pub player_stamina_drain_multiplier: f32,

    // Dino Stats
    pub dino_damage_multiplier: f32,
    pub dino_resistance_multiplier: f32,
    pub dino_food_drain_multiplier: f32,
    pub wild_dino_count_multiplier: f32,

    // Breeding
    pub egg_hatch_speed_multiplier: f32,
    pub baby_mature_speed_multiplier: f32,
    pub baby_food_consumption_multiplier: f32,
    pub mating_interval_multiplier: f32,

    // Structure
    pub structure_damage_multiplier: f32,
    pub structure_resistance_multiplier: f32,
    pub structure_decay_multiplier: f32,

    // PvP/PvE
    pub pve_mode: bool,
    pub pvp_gamma: bool,
    pub friendly_fire: bool,

    // Mods
    pub active_mods: Vec<String>,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            session_name: "My ASA Server".to_string(),
            server_password: None,
            admin_password: "admin123".to_string(),
            max_players: 70,
            map_name: "TheIsland_WP".to_string(),
            game_port: 7777,
            query_port: 27015,
            rcon_port: 32330,
            rcon_enabled: true,
            xp_multiplier: 1.0,
            harvest_amount_multiplier: 1.0,
            taming_speed_multiplier: 1.0,
            difficulty_offset: 1.0,
            override_official_difficulty: 5.0,
            day_cycle_speed_scale: 1.0,
            day_time_speed_scale: 1.0,
            night_time_speed_scale: 1.0,
            player_damage_multiplier: 1.0,
            player_resistance_multiplier: 1.0,
            player_food_drain_multiplier: 1.0,
            player_water_drain_multiplier: 1.0,
            player_stamina_drain_multiplier: 1.0,
            dino_damage_multiplier: 1.0,
            dino_resistance_multiplier: 1.0,
            dino_food_drain_multiplier: 1.0,
            wild_dino_count_multiplier: 1.0,
            egg_hatch_speed_multiplier: 1.0,
            baby_mature_speed_multiplier: 1.0,
            baby_food_consumption_multiplier: 1.0,
            mating_interval_multiplier: 1.0,
            structure_damage_multiplier: 1.0,
            structure_resistance_multiplier: 1.0,
            structure_decay_multiplier: 1.0,
            pve_mode: false,
            pvp_gamma: false,
            friendly_fire: false,
            active_mods: vec![],
        }
    }
}

pub struct ConfigGenerator;

impl ConfigGenerator {
    /// Get all available map profiles
    pub fn get_map_profiles() -> Vec<MapProfile> {
        vec![
            MapProfile {
                map_id: "TheIsland_WP".to_string(),
                map_name: "The Island".to_string(),
                difficulty_offset: 1.0,
                xp_multiplier: 1.0,
                harvest_multiplier: 1.0,
                taming_multiplier: 1.0,
                recommended_mods: vec![],
                custom_settings: HashMap::new(),
            },
            MapProfile {
                map_id: "ScorchedEarth_WP".to_string(),
                map_name: "Scorched Earth".to_string(),
                difficulty_offset: 1.0,
                xp_multiplier: 1.2,
                harvest_multiplier: 1.2,
                taming_multiplier: 1.5,
                recommended_mods: vec![],
                custom_settings: HashMap::new(),
            },
            MapProfile {
                map_id: "Aberration_WP".to_string(),
                map_name: "Aberration".to_string(),
                difficulty_offset: 1.0,
                xp_multiplier: 1.2,
                harvest_multiplier: 1.0,
                taming_multiplier: 1.5,
                recommended_mods: vec![],
                custom_settings: HashMap::new(),
            },
            MapProfile {
                map_id: "Extinction_WP".to_string(),
                map_name: "Extinction".to_string(),
                difficulty_offset: 1.0,
                xp_multiplier: 1.5,
                harvest_multiplier: 1.5,
                taming_multiplier: 2.0,
                recommended_mods: vec![],
                custom_settings: HashMap::new(),
            },
            MapProfile {
                map_id: "Ragnarok_WP".to_string(),
                map_name: "Ragnarok".to_string(),
                difficulty_offset: 1.0,
                xp_multiplier: 1.0,
                harvest_multiplier: 1.0,
                taming_multiplier: 1.0,
                recommended_mods: vec![],
                custom_settings: HashMap::new(),
            },
            MapProfile {
                map_id: "Valguero_WP".to_string(),
                map_name: "Valguero".to_string(),
                difficulty_offset: 1.0,
                xp_multiplier: 1.0,
                harvest_multiplier: 1.0,
                taming_multiplier: 1.0,
                recommended_mods: vec![],
                custom_settings: HashMap::new(),
            },
            MapProfile {
                map_id: "LostColony_WP".to_string(),
                map_name: "Lost Colony".to_string(),
                difficulty_offset: 1.2,
                xp_multiplier: 1.5,
                harvest_multiplier: 1.2,
                taming_multiplier: 1.5,
                recommended_mods: vec![],
                custom_settings: HashMap::new(),
            },
            MapProfile {
                map_id: "Genesis_WP".to_string(),
                map_name: "Genesis Part 1".to_string(),
                difficulty_offset: 1.0,
                xp_multiplier: 1.5,
                harvest_multiplier: 1.2,
                taming_multiplier: 2.0,
                recommended_mods: vec![],
                custom_settings: HashMap::new(),
            },
            MapProfile {
                map_id: "Genesis2_WP".to_string(),
                map_name: "Genesis Part 2".to_string(),
                difficulty_offset: 1.0,
                xp_multiplier: 1.5,
                harvest_multiplier: 1.2,
                taming_multiplier: 2.0,
                recommended_mods: vec![],
                custom_settings: HashMap::new(),
            },
        ]
    }

    /// Get profile for a specific map
    pub fn get_profile_for_map(map_id: &str) -> Option<MapProfile> {
        Self::get_map_profiles()
            .into_iter()
            .find(|p| p.map_id == map_id)
    }

    /// Apply map profile to server config
    pub fn apply_map_profile(config: &mut ServerConfig, profile: &MapProfile) {
        config.difficulty_offset = profile.difficulty_offset;
        config.xp_multiplier = profile.xp_multiplier;
        config.harvest_amount_multiplier = profile.harvest_multiplier;
        config.taming_speed_multiplier = profile.taming_multiplier;

        // Add recommended mods if not already present
        for mod_id in &profile.recommended_mods {
            if !config.active_mods.contains(mod_id) {
                config.active_mods.push(mod_id.clone());
            }
        }
    }

    /// Generate GameUserSettings.ini content
    pub fn generate_game_user_settings(config: &ServerConfig) -> String {
        let mut content = String::new();

        // ServerSettings section
        content.push_str("[ServerSettings]\r\n");
        content.push_str(&format!("SessionName={}\r\n", config.session_name));
        if let Some(ref pwd) = config.server_password {
            content.push_str(&format!("ServerPassword={}\r\n", pwd));
        }
        content.push_str(&format!(
            "ServerAdminPassword={}\r\n",
            config.admin_password
        ));
        content.push_str(&format!("MaxPlayers={}\r\n", config.max_players));
        content.push_str(&format!("MapName={}\r\n", config.map_name));
        content.push_str(&format!("RCONEnabled={}\r\n", config.rcon_enabled));
        content.push_str(&format!("RCONPort={}\r\n", config.rcon_port));

        // Rates
        content.push_str(&format!("XPMultiplier={:.2}\r\n", config.xp_multiplier));
        content.push_str(&format!(
            "TamingSpeedMultiplier={:.2}\r\n",
            config.taming_speed_multiplier
        ));
        content.push_str(&format!(
            "HarvestAmountMultiplier={:.2}\r\n",
            config.harvest_amount_multiplier
        ));
        content.push_str(&format!(
            "DifficultyOffset={:.2}\r\n",
            config.difficulty_offset
        ));
        content.push_str(&format!(
            "OverrideOfficialDifficulty={:.2}\r\n",
            config.override_official_difficulty
        ));

        // Day/Night
        content.push_str(&format!(
            "DayCycleSpeedScale={:.2}\r\n",
            config.day_cycle_speed_scale
        ));
        content.push_str(&format!(
            "DayTimeSpeedScale={:.2}\r\n",
            config.day_time_speed_scale
        ));
        content.push_str(&format!(
            "NightTimeSpeedScale={:.2}\r\n",
            config.night_time_speed_scale
        ));

        // Player Stats
        content.push_str(&format!(
            "PlayerDamageMultiplier={:.2}\r\n",
            config.player_damage_multiplier
        ));
        content.push_str(&format!(
            "PlayerResistanceMultiplier={:.2}\r\n",
            config.player_resistance_multiplier
        ));
        content.push_str(&format!(
            "PlayerCharacterFoodDrainMultiplier={:.2}\r\n",
            config.player_food_drain_multiplier
        ));
        content.push_str(&format!(
            "PlayerCharacterWaterDrainMultiplier={:.2}\r\n",
            config.player_water_drain_multiplier
        ));
        content.push_str(&format!(
            "PlayerCharacterStaminaDrainMultiplier={:.2}\r\n",
            config.player_stamina_drain_multiplier
        ));

        // Dino Stats
        content.push_str(&format!(
            "DinoDamageMultiplier={:.2}\r\n",
            config.dino_damage_multiplier
        ));
        content.push_str(&format!(
            "DinoResistanceMultiplier={:.2}\r\n",
            config.dino_resistance_multiplier
        ));
        content.push_str(&format!(
            "DinoCharacterFoodDrainMultiplier={:.2}\r\n",
            config.dino_food_drain_multiplier
        ));
        content.push_str(&format!(
            "DinoCountMultiplier={:.2}\r\n",
            config.wild_dino_count_multiplier
        ));

        // Structure
        content.push_str(&format!(
            "StructureDamageMultiplier={:.2}\r\n",
            config.structure_damage_multiplier
        ));
        content.push_str(&format!(
            "StructureResistanceMultiplier={:.2}\r\n",
            config.structure_resistance_multiplier
        ));
        content.push_str(&format!(
            "PvEStructureDecayPeriodMultiplier={:.2}\r\n",
            config.structure_decay_multiplier
        ));

        // PvP/PvE
        content.push_str(&format!("ServerPVE={}\r\n", config.pve_mode));
        content.push_str(&format!("EnablePvPGamma={}\r\n", config.pvp_gamma));
        content.push_str(&format!(
            "DisableFriendlyFire={}\r\n",
            !config.friendly_fire
        ));

        // Mods
        if !config.active_mods.is_empty() {
            content.push_str(&format!("ActiveMods={}\r\n", config.active_mods.join(",")));
        }

        content.push_str("\r\n");

        // MessageOfTheDay section
        content.push_str("[MessageOfTheDay]\r\n");
        content.push_str("Message=Welcome to the server!\r\n");
        content.push_str("Duration=20\r\n");
        content.push_str("\r\n");

        content
    }

    /// Generate Game.ini content
    pub fn generate_game_ini(config: &ServerConfig) -> String {
        let mut content = String::new();

        content.push_str("[/Script/ShooterGame.ShooterGameMode]\n");

        // Breeding
        content.push_str(&format!(
            "EggHatchSpeedMultiplier={:.2}\n",
            config.egg_hatch_speed_multiplier
        ));
        content.push_str(&format!(
            "BabyMatureSpeedMultiplier={:.2}\n",
            config.baby_mature_speed_multiplier
        ));
        content.push_str(&format!(
            "BabyFoodConsumptionSpeedMultiplier={:.2}\n",
            config.baby_food_consumption_multiplier
        ));
        content.push_str(&format!(
            "MatingIntervalMultiplier={:.2}\n",
            config.mating_interval_multiplier
        ));

        content.push_str("\n");

        content
    }

    /// Generate server startup command
    pub fn generate_startup_command(config: &ServerConfig, install_path: &PathBuf) -> String {
        let exe_path = install_path
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64")
            .join("ArkAscendedServer.exe");

        let mut cmd = format!(
            "\"{}\" {}?listen?SessionName=\"{}\"?Port={}?QueryPort={}?RCONPort={}?MaxPlayers={}",
            exe_path.display(),
            config.map_name,
            config.session_name,
            config.game_port,
            config.query_port,
            config.rcon_port,
            config.max_players
        );

        if let Some(ref pwd) = config.server_password {
            cmd.push_str(&format!("?ServerPassword={}", pwd));
        }

        cmd.push_str(&format!("?ServerAdminPassword={}", config.admin_password));

        if config.rcon_enabled {
            cmd.push_str("?RCONEnabled=True");
        }

        // Add mods
        if !config.active_mods.is_empty() {
            cmd.push_str(&format!(" -mods=\"{}\"", config.active_mods.join(",")));
        }

        cmd
    }

    /// Backup existing config files
    pub fn backup_configs(install_path: &PathBuf) -> Result<PathBuf, String> {
        let config_dir = install_path
            .join("ShooterGame")
            .join("Saved")
            .join("Config")
            .join("WindowsServer");

        if !config_dir.exists() {
            return Err("Config directory does not exist".to_string());
        }

        let timestamp = Local::now().format("%Y-%m-%d_%H%M%S").to_string();
        let backup_dir = config_dir.join("backups").join(&timestamp);

        fs::create_dir_all(&backup_dir)
            .map_err(|e| format!("Failed to create backup dir: {}", e))?;

        // Backup GameUserSettings.ini
        let gus_path = config_dir.join("GameUserSettings.ini");
        if gus_path.exists() {
            fs::copy(&gus_path, backup_dir.join("GameUserSettings.ini"))
                .map_err(|e| format!("Failed to backup GameUserSettings.ini: {}", e))?;
        }

        // Backup Game.ini
        let game_path = config_dir.join("Game.ini");
        if game_path.exists() {
            fs::copy(&game_path, backup_dir.join("Game.ini"))
                .map_err(|e| format!("Failed to backup Game.ini: {}", e))?;
        }

        Ok(backup_dir)
    }

    /// Write config files to disk
    pub fn write_configs(
        install_path: &PathBuf,
        config: &ServerConfig,
        backup: bool,
    ) -> Result<(), String> {
        let config_dir = install_path
            .join("ShooterGame")
            .join("Saved")
            .join("Config")
            .join("WindowsServer");

        // Create config directory if needed
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config dir: {}", e))?;

        // Backup existing configs
        if backup {
            let _ = Self::backup_configs(install_path);
        }

        // Write GameUserSettings.ini
        let gus_content = Self::generate_game_user_settings(config);
        let gus_path = config_dir.join("GameUserSettings.ini");
        println!("  📝 Writing GameUserSettings.ini to: {:?}", gus_path);
        fs::write(&gus_path, gus_content)
            .map_err(|e| format!("Failed to write GameUserSettings.ini: {}", e))?;

        // Write Game.ini
        let game_content = Self::generate_game_ini(config);
        let game_path = config_dir.join("Game.ini");
        println!("  📝 Writing Game.ini to: {:?}", game_path);
        fs::write(&game_path, game_content)
            .map_err(|e| format!("Failed to write Game.ini: {}", e))?;

        Ok(())
    }
}
