// Config Generator Service for ASA Server Configuration
// Handles INI file generation, parsing, and per-map profiles

use chrono::Local;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

/// Represents a single INI configuration value
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[allow(dead_code)]
pub struct ConfigValue {
    pub key: String,
    pub value: String,
    pub description: Option<String>,
}

/// Represents a section in an INI file
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[allow(dead_code)]
pub struct ConfigSection {
    pub name: String,
    pub values: Vec<ConfigValue>,
}

/// Complete INI file structure
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[allow(dead_code)]
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
    pub override_structure_platform_prevention: bool,
    pub global_item_stack_size_multiplier: f32, // For "Increase Slots" roughly

    // Event Items
    pub custom_resource_harvesting_multiplier: f32,
    pub pve_mode: bool,
    pub pvp_gamma: bool,
    pub friendly_fire: bool,

    // Mods
    pub active_mods: Vec<String>,

    // Advanced Gameplay
    pub allow_flyer_speed_leveling: bool,
    pub allow_speed_leveling: bool, // General speed leveling
    pub allow_tek_suit_powers_in_genesis: bool,

    // Per-Level Stat Multipliers (Indices: 0=Health... 9=Speed... 11=Crafting)
    pub per_level_stats_multiplier_player: Vec<f32>,
    pub per_level_stats_multiplier_dino_tamed: Vec<f32>,
    pub per_level_stats_multiplier_dino_wild: Vec<f32>,

    // Advanced
    pub ip_address: Option<String>,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            session_name: "My ASA Server".to_string(),
            server_password: None,
            admin_password: "".to_string(),
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
            override_structure_platform_prevention: false,
            global_item_stack_size_multiplier: 1.0,
            custom_resource_harvesting_multiplier: 1.0,
            pve_mode: false,
            pvp_gamma: false,
            friendly_fire: false,
            active_mods: vec![],
            allow_flyer_speed_leveling: false,
            allow_speed_leveling: false,
            allow_tek_suit_powers_in_genesis: true,
            per_level_stats_multiplier_player: vec![1.0; 12],
            per_level_stats_multiplier_dino_tamed: vec![1.0; 12],
            per_level_stats_multiplier_dino_wild: vec![1.0; 12],
            ip_address: None,
        }
    }
}

pub struct ConfigGenerator;

/// Format a Rust bool as ARK-compatible INI value ("True"/"False").
/// ARK's Unreal Engine INI parser requires capitalized boolean values;
/// Rust's Display trait outputs lowercase "true"/"false" which ARK ignores.
fn ark_bool(value: bool) -> &'static str {
    if value { "True" } else { "False" }
}

impl ConfigGenerator {
    /// Strip `?ServerPassword=<value>` corruption from ServerAdminPassword lines in INI content.
    ///
    /// The ARK server engine appends the server password to the admin password line at runtime.
    /// This method cleans that corruption from raw INI text.
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
                        return Some(format!("ServerAdminPassword={}", &rest[..idx]));
                    }
                }
                Some(line.to_string())
            })
            .collect::<Vec<_>>()
            .join("\r\n")
    }

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
            MapProfile {
                map_id: "TheCenter_WP".to_string(),
                map_name: "The Center".to_string(),
                difficulty_offset: 1.0,
                xp_multiplier: 1.0,
                harvest_multiplier: 1.0,
                taming_multiplier: 1.0,
                recommended_mods: vec![],
                custom_settings: HashMap::new(),
            },
            MapProfile {
                map_id: "ClubARK_WP".to_string(),
                map_name: "Club ARK".to_string(),
                difficulty_offset: 1.0,
                xp_multiplier: 1.0,
                harvest_multiplier: 1.0,
                taming_multiplier: 1.0,
                recommended_mods: vec![],
                custom_settings: HashMap::new(),
            },
            MapProfile {
                map_id: "Astraeos_WP".to_string(),
                map_name: "Astraeos".to_string(),
                difficulty_offset: 1.0,
                xp_multiplier: 1.0,
                harvest_multiplier: 1.0,
                taming_multiplier: 1.0,
                recommended_mods: vec![],
                custom_settings: HashMap::new(),
            },
            MapProfile {
                map_id: "Svartalfheim_WP".to_string(),
                map_name: "Svartalfheim".to_string(),
                difficulty_offset: 1.0,
                xp_multiplier: 1.0,
                harvest_multiplier: 1.0,
                taming_multiplier: 1.0,
                recommended_mods: vec![],
                custom_settings: HashMap::new(),
            },
            MapProfile {
                map_id: "Amissa_WP".to_string(),
                map_name: "Amissa".to_string(),
                difficulty_offset: 1.0,
                xp_multiplier: 1.0,
                harvest_multiplier: 1.0,
                taming_multiplier: 1.0,
                recommended_mods: vec![],
                custom_settings: HashMap::new(),
            },
            MapProfile {
                map_id: "Insaluna_WP".to_string(),
                map_name: "Insaluna".to_string(),
                difficulty_offset: 1.0,
                xp_multiplier: 1.0,
                harvest_multiplier: 1.0,
                taming_multiplier: 1.0,
                recommended_mods: vec![],
                custom_settings: HashMap::new(),
            },
            MapProfile {
                map_id: "TemptressLagoon_WP".to_string(),
                map_name: "Temptress Lagoon".to_string(),
                difficulty_offset: 1.0,
                xp_multiplier: 1.0,
                harvest_multiplier: 1.0,
                taming_multiplier: 1.0,
                recommended_mods: vec![],
                custom_settings: HashMap::new(),
            },
            MapProfile {
                map_id: "Reverence_WP".to_string(),
                map_name: "Reverence".to_string(),
                difficulty_offset: 1.0,
                xp_multiplier: 1.0,
                harvest_multiplier: 1.0,
                taming_multiplier: 1.0,
                recommended_mods: vec![],
                custom_settings: HashMap::new(),
            },
            MapProfile {
                map_id: "Forglar_WP".to_string(),
                map_name: "Forglar".to_string(),
                difficulty_offset: 1.0,
                xp_multiplier: 1.0,
                harvest_multiplier: 1.0,
                taming_multiplier: 1.0,
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
        let server_pwd = config.server_password.as_deref().unwrap_or("");
        content.push_str(&format!("ServerPassword={}\r\n", server_pwd));

        let clean_admin_password = config
            .admin_password
            .split("?ServerPassword=")
            .next()
            .unwrap_or(&config.admin_password);
        content.push_str(&format!("ServerAdminPassword={}\r\n", clean_admin_password));
        content.push_str(&format!("MaxPlayers={}\r\n", config.max_players));
        content.push_str(&format!("MapName={}\r\n", config.map_name));
        content.push_str(&format!("RCONEnabled={}\r\n", ark_bool(config.rcon_enabled)));
        content.push_str(&format!("RCONPort={}\r\n", config.rcon_port));
        if let Some(ref ip) = config.ip_address {
            if !ip.is_empty() {
                content.push_str(&format!("IPAddress={}\r\n", ip));
            }
        }

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
        content.push_str(&format!(
            "OverrideStructurePlatformPrevention={}\r\n",
            ark_bool(config.override_structure_platform_prevention)
        ));
        content.push_str(&format!(
            "ItemStackSizeMultiplier={:.2}\r\n",
            config.global_item_stack_size_multiplier
        ));

        // PvP/PvE
        content.push_str(&format!("ServerPVE={}\r\n", ark_bool(config.pve_mode)));
        content.push_str(&format!("EnablePvPGamma={}\r\n", ark_bool(config.pvp_gamma)));
        content.push_str(&format!(
            "DisableFriendlyFire={}\r\n",
            ark_bool(!config.friendly_fire)
        ));

        // Genesis Specific
        if config.map_name.starts_with("Genesis") {
            content.push_str(&format!("AllowTekSuitPowersInGenesis={}\r\n", ark_bool(config.allow_tek_suit_powers_in_genesis)));
        }

        // Mods
        if !config.active_mods.is_empty() {
            let valid_mods: Vec<String> = config.active_mods.iter()
                .map(|m| m.trim().to_string())
                .filter(|m| !m.is_empty() && m != "0" && m.chars().all(|c| c.is_ascii_digit()))
                .collect();
            if !valid_mods.is_empty() {
                content.push_str(&format!("ActiveMods={}\r\n", valid_mods.join(",")));
            }
        }

        content.push_str("\r\n");

        // SessionSettings section
        content.push_str("[SessionSettings]\r\n");
        content.push_str(&format!("SessionName={}\r\n", config.session_name));
        content.push_str("\r\n");

        // URL section - Port and QueryPort for network binding
        content.push_str("[URL]\r\n");
        content.push_str(&format!("Port={}\r\n", config.game_port));
        content.push_str(&format!("QueryPort={}\r\n", config.query_port));
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

        // Speed Leveling
        content.push_str(&format!(
            "bAllowFlyerSpeedLeveling={}\n",
            ark_bool(config.allow_flyer_speed_leveling)
        ));
        content.push_str(&format!(
            "bAllowSpeedLeveling={}\n",
            ark_bool(config.allow_speed_leveling)
        ));

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

        // Event Multipliers
        if config.custom_resource_harvesting_multiplier != 1.0 {
            // Example for basics
            let common_resources = vec![
                "PrimalItemResource_Stone",
                "PrimalItemResource_Flint",
                "PrimalItemResource_Thatch",
                "PrimalItemResource_Wood",
            ];
            for resource in common_resources {
                content.push_str(&format!(
                    "HarvestResourceItemAmountClassMultipliers=(ClassName=\"{}\",Multiplier={:.2})\n",
                    resource, config.custom_resource_harvesting_multiplier
                ));
            }
        }

        // Per-Level Stats Multipliers
        // Player
        for (i, val) in config.per_level_stats_multiplier_player.iter().enumerate() {
            if *val != 1.0 {
                content.push_str(&format!(
                    "PerLevelStatsMultiplier_Player[{}]={:.6}\n",
                    i, val
                ));
            }
        }

        // Dino Tamed
        for (i, val) in config
            .per_level_stats_multiplier_dino_tamed
            .iter()
            .enumerate()
        {
            if *val != 1.0 {
                content.push_str(&format!(
                    "PerLevelStatsMultiplier_DinoTamed[{}]={:.6}\n",
                    i, val
                ));
            }
        }

        // Dino Wild
        for (i, val) in config
            .per_level_stats_multiplier_dino_wild
            .iter()
            .enumerate()
        {
            if *val != 1.0 {
                content.push_str(&format!(
                    "PerLevelStatsMultiplier_DinoWild[{}]={:.6}\n",
                    i, val
                ));
            }
        }

        content.push('\n');

        content
    }

    /// Generate server startup command
    pub fn generate_startup_command(config: &ServerConfig, install_path: &PathBuf, server_type: &str) -> String {
        let exe_name = if server_type == "ASE" {
            "ShooterGameServer.exe"
        } else {
            "ArkAscendedServer.exe"
        };
        
        let exe_path = install_path
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64")
            .join(exe_name);

        let mut cmd = if server_type == "ASE" {
            let mut base = format!(
                "\"{}\" {}?listen?SessionName=\"{}\"?Port={}?QueryPort={}?RCONPort={}?MaxPlayers={}",
                exe_path.display(),
                config.map_name,
                config.session_name,
                config.game_port,
                config.query_port,
                config.rcon_port,
                config.max_players
            );
            if !config.active_mods.is_empty() {
                base.push_str(&format!("?GameModIds={}", config.active_mods.join(",")));
            }
            base
        } else {
            format!(
                "\"{}\" {}?listen?SessionName=\"{}\"?Port={}?QueryPort={}?RCONPort={}?MaxPlayers={}",
                exe_path.display(),
                config.map_name,
                config.session_name,
                config.game_port,
                config.query_port,
                config.rcon_port,
                config.max_players
            )
        };

        // Note: ServerPassword and ServerAdminPassword are intentionally NOT passed
        // on the command line. They are already written to GameUserSettings.ini.
        // Passing them here causes the ARK engine URL parser to corrupt them.

        if config.rcon_enabled {
            cmd.push_str("?RCONEnabled=True");
        }

        // Add MultiHome for IP binding
        if let Some(ref ip) = config.ip_address {
            if !ip.is_empty() {
                cmd.push_str(&format!(" -MultiHome={}", ip));
            }
        }

        // Add mods (ASA only, ASE is handled in travel/query URL)
        if server_type != "ASE" && !config.active_mods.is_empty() {
            cmd.push_str(&format!(" -mods=\"{}\"", config.active_mods.join(",")));
        }

        cmd
    }

    /// Get target configuration subdirectory dynamically based on platform or directory structure.
    pub fn get_config_subdirectory(install_path: &PathBuf, server_type: Option<&str>) -> &'static str {
        #[cfg(target_os = "linux")]
        {
            if server_type == Some("ASA") {
                return "WindowsServer";
            }
            "LinuxServer"
        }
        #[cfg(not(target_os = "linux"))]
        {
            if server_type == Some("ASA") {
                return "WindowsServer";
            }
            if install_path.join("ShooterGame").join("Binaries").join("Linux").exists()
                || install_path.join("ShooterGame").join("Saved").join("Config").join("LinuxServer").exists()
            {
                "LinuxServer"
            } else {
                "WindowsServer"
            }
        }
    }

    /// Generate Engine.ini content with default netcode optimizations
    pub fn generate_engine_ini(_config: &ServerConfig) -> String {
        let mut content = String::new();

        content.push_str("[/Script/OnlineSubsystemUtils.IpNetDriver]\r\n");
        content.push_str("MaxInternetClientRate=1048576\r\n");
        content.push_str("MaxClientRate=1048576\r\n");
        content.push_str("\r\n");

        content.push_str("[/Script/Engine.Engine]\r\n");
        content.push_str("TickRate=30\r\n");
        content.push_str("\r\n");

        content
    }

    /// Backup existing config files
    pub fn backup_configs(install_path: &PathBuf, server_type: &str) -> Result<PathBuf, String> {
        let sub_dir = Self::get_config_subdirectory(install_path, Some(server_type));
        let config_dir = install_path
            .join("ShooterGame")
            .join("Saved")
            .join("Config")
            .join(sub_dir);

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

        // Backup Engine.ini
        let engine_path = config_dir.join("Engine.ini");
        if engine_path.exists() {
            fs::copy(&engine_path, backup_dir.join("Engine.ini"))
                .map_err(|e| format!("Failed to backup Engine.ini: {}", e))?;
        }

        Ok(backup_dir)
    }

    /// Write config files to disk
    pub fn write_configs(
        install_path: &PathBuf,
        config: &ServerConfig,
        backup: bool,
        server_type: &str,
    ) -> Result<(), String> {
        let sub_dir = Self::get_config_subdirectory(install_path, Some(server_type));
        let config_dir = install_path
            .join("ShooterGame")
            .join("Saved")
            .join("Config")
            .join(sub_dir);

        // Create config directory if needed
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config dir: {}", e))?;

        // Backup existing configs
        if backup {
            let _ = Self::backup_configs(install_path, server_type);
        }

        // Write GameUserSettings.ini — use merge strategy to preserve custom keys
        // (third-party INI settings, advanced PvP rules, etc.)
        let gus_content = Self::generate_game_user_settings(config);
        let gus_path = config_dir.join("GameUserSettings.ini");
        if gus_path.exists() {
            let raw_existing = fs::read_to_string(&gus_path).unwrap_or_default();
            if !raw_existing.is_empty() {
                // BUG FIX: Strip ?ServerPassword= corruption from existing file before merge
                // ARK engine may have appended it at runtime
                let existing = Self::sanitize_ini_content(&raw_existing);
                let merged =
                    crate::services::ini_parser::IniParser::merge(&existing, &gus_content);
                println!("  📝 Merging GameUserSettings.ini (preserving custom keys, updating known values)");
                fs::write(&gus_path, merged)
                    .map_err(|e| format!("Failed to write GameUserSettings.ini: {}", e))?;
            } else {
                println!("  📝 Writing fresh GameUserSettings.ini to: {:?}", gus_path);
                fs::write(&gus_path, gus_content)
                    .map_err(|e| format!("Failed to write GameUserSettings.ini: {}", e))?;
            }
        } else {
            println!("  📝 Creating initial GameUserSettings.ini at: {:?}", gus_path);
            fs::write(&gus_path, gus_content)
                .map_err(|e| format!("Failed to write GameUserSettings.ini: {}", e))?;
        }

        // Write Game.ini — use merge strategy to preserve custom keys
        // (engrams, NPC replacements, etc.) while updating multiplier values
        let game_path = config_dir.join("Game.ini");
        let new_game_content = Self::generate_game_ini(config);
        if game_path.exists() {
            let existing = fs::read_to_string(&game_path).unwrap_or_default();
            let merged =
                crate::services::ini_parser::IniParser::merge(&existing, &new_game_content);
            println!("  📝 Merging Game.ini (preserving custom keys, updating multipliers)");
            fs::write(&game_path, merged)
                .map_err(|e| format!("Failed to write Game.ini: {}", e))?;
        } else {
            println!("  📝 Creating initial Game.ini at: {:?}", game_path);
            fs::write(&game_path, new_game_content)
                .map_err(|e| format!("Failed to write Game.ini: {}", e))?;
        }

        // Write Engine.ini — use merge strategy if exists or create new
        let engine_path = config_dir.join("Engine.ini");
        let new_engine_content = Self::generate_engine_ini(config);
        if engine_path.exists() {
            let existing = fs::read_to_string(&engine_path).unwrap_or_default();
            let merged =
                crate::services::ini_parser::IniParser::merge(&existing, &new_engine_content);
            println!("  📝 Merging Engine.ini (preserving custom optimizations, updating netcode defaults)");
            fs::write(&engine_path, merged)
                .map_err(|e| format!("Failed to write Engine.ini: {}", e))?;
        } else {
            println!("  📝 Creating initial Engine.ini at: {:?}", engine_path);
            fs::write(&engine_path, new_engine_content)
                .map_err(|e| format!("Failed to write Engine.ini: {}", e))?;
        }

        Ok(())
    }
    /// Fetch server config from database
    #[allow(dead_code)]
    pub fn get_server_config(
        app_handle: &tauri::AppHandle,
        server_id: i64,
    ) -> Result<ServerConfig, String> {
        let state = app_handle.state::<crate::AppState>();
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT session_name, server_password, admin_password, max_players, map_name, 
                 game_port, query_port, rcon_port, rcon_enabled, install_path 
                 FROM servers WHERE id = ?1",
            )
            .map_err(|e| e.to_string())?;

        let mut config = ServerConfig::default();

        stmt
            .query_row([server_id], |row| {
                config.session_name = row.get(0)?;
                config.server_password = row.get(1)?;
                config.admin_password = row.get(2)?;
                config.max_players = row.get(3)?;
                config.map_name = row.get(4)?;
                config.game_port = row.get(5)?;
                config.query_port = row.get(6)?;
                config.rcon_port = row.get(7)?;
                config.rcon_enabled = row.get(8)?;
                // Not getting install_path (9) as it's not part of ServerConfig
                Ok(())
            })
            .map_err(|e| e.to_string())?;

        // Fetch separate IP address column
        let ip_result: Result<Option<String>, _> = conn.query_row(
            "SELECT ip_address FROM servers WHERE id = ?1",
            [server_id],
            |row| row.get(0),
        );

        if let Ok(ip) = ip_result {
            config.ip_address = ip;
        }

        // Read and parse existing configs to populate our struct if file exists
        // (Simplified for now, expecting full parser integration later)

        Ok(config)
    }

    /// Regenerate config files applying event overrides
    pub fn generate_config(
        _app_handle: &tauri::AppHandle,
        db_conn: &rusqlite::Connection,
        server_id: i64,
    ) -> Result<(), String> {
        // 1. Get install path and server type from servers or ase_servers
        let (install_path_str, server_type) = match db_conn.query_row(
            "SELECT install_path, server_type FROM servers WHERE id = ?1",
            [server_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1).unwrap_or_else(|_| "ASA".to_string()))),
        ) {
            Ok(info) => info,
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                db_conn.query_row(
                    "SELECT install_path FROM ase_servers WHERE id = ?1",
                    [server_id],
                    |row| Ok((row.get::<_, String>(0)?, "ASE".to_string())),
                )
                .map_err(|e| format!("Server not found in servers or ase_servers: {}", e))?
            }
            Err(e) => return Err(e.to_string()),
        };
        let install_path = PathBuf::from(install_path_str);
        let sub_dir = Self::get_config_subdirectory(&install_path, Some(&server_type));
        let config_dir = install_path.join("ShooterGame").join("Saved").join("Config").join(sub_dir);

        // Fetch settings from DB to sync into GameUserSettings.ini
        let mut session_name = String::new();
        let mut server_password: Option<String> = None;
        let mut admin_password = String::new();
        let mut max_players = 70;
        let mut game_port = 7777;
        let mut query_port = 27015;
        let mut rcon_port = 32330;
        let mut rcon_enabled = true;
        let mut ip_address: Option<String> = None;

        if server_type == "ASE" {
            db_conn.query_row(
                "SELECT session_name, server_password, admin_password, max_players, port, query_port, rcon_port FROM ase_servers WHERE id = ?1",
                [server_id],
                |row| {
                    session_name = row.get(0)?;
                    let pwd = row.get::<_, String>(1)?;
                    server_password = if pwd.is_empty() { None } else { Some(pwd) };
                    admin_password = row.get(2)?;
                    max_players = row.get(3)?;
                    game_port = row.get(4)?;
                    query_port = row.get(5)?;
                    rcon_port = row.get(6)?;
                    rcon_enabled = rcon_port > 0;
                    Ok(())
                }
            ).map_err(|e| format!("Failed to query ase_servers: {}", e))?;
        } else {
            db_conn.query_row(
                "SELECT session_name, server_password, admin_password, max_players, game_port, query_port, rcon_port, rcon_enabled, ip_address FROM servers WHERE id = ?1",
                [server_id],
                |row| {
                    session_name = row.get(0)?;
                    server_password = row.get(1)?;
                    admin_password = row.get(2)?;
                    max_players = row.get(3)?;
                    game_port = row.get(4)?;
                    query_port = row.get(5)?;
                    rcon_port = row.get(6)?;
                    rcon_enabled = row.get(7)?;
                    ip_address = row.get(8)?;
                    Ok(())
                }
            ).map_err(|e| format!("Failed to query servers: {}", e))?;
        }

        // If user config folder is active, copy the INI files from the custom folder to the default directory before reading
        let key = if server_type == "ASE" {
            "ase_user_config_folder"
        } else {
            "user_config_folder"
        };
        let user_folder_raw: String = db_conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            [key],
            |row| row.get(0)
        ).unwrap_or_default();

        if !user_folder_raw.is_empty() {
            let user_dir = PathBuf::from(&user_folder_raw);
            if user_dir.exists() && user_dir.is_dir() {
                let _ = fs::create_dir_all(&config_dir);
                
                // Copy GameUserSettings.ini
                let user_gus = user_dir.join("GameUserSettings.ini");
                if user_gus.exists() {
                    let _ = fs::copy(&user_gus, config_dir.join("GameUserSettings.ini"));
                    println!("  🔄 [Startup Sync] Copied GameUserSettings.ini from custom folder to default config dir");
                } else {
                    let user_sub_gus = user_dir.join(format!("ShooterGame/Saved/Config/{}/GameUserSettings.ini", sub_dir));
                    if user_sub_gus.exists() {
                        let _ = fs::copy(&user_sub_gus, config_dir.join("GameUserSettings.ini"));
                        println!("  🔄 [Startup Sync] Copied GameUserSettings.ini (sub-path) from custom folder to default config dir");
                    }
                }

                // Copy Game.ini
                let user_game = user_dir.join("Game.ini");
                if user_game.exists() {
                    let _ = fs::copy(&user_game, config_dir.join("Game.ini"));
                    println!("  🔄 [Startup Sync] Copied Game.ini from custom folder to default config dir");
                } else {
                    let user_sub_game = user_dir.join(format!("ShooterGame/Saved/Config/{}/Game.ini", sub_dir));
                    if user_sub_game.exists() {
                        let _ = fs::copy(&user_sub_game, config_dir.join("Game.ini"));
                        println!("  🔄 [Startup Sync] Copied Game.ini (sub-path) from custom folder to default config dir");
                    }
                }
            }
        }

        // 2. Read existing Configs (as Base)
        let gus_path = config_dir.join("GameUserSettings.ini");
        let initial_gus_content = if gus_path.exists() {
            fs::read_to_string(&gus_path).map_err(|e| e.to_string())?
        } else {
            return Err("Cannot regenerate config: GameUserSettings.ini missing".to_string());
        };

        // 3. Get Active Profile
        let profile =
            crate::services::advanced_config::AdvancedConfigService::get_active_profile_from_conn(
                db_conn, server_id,
            )?;

        let mut final_gus = initial_gus_content.clone();

        // 4. Update identity/network settings from database
        final_gus = crate::services::ini_parser::IniParser::update_key(
            &final_gus,
            "ServerSettings",
            "SessionName",
            &session_name,
        );
        final_gus = crate::services::ini_parser::IniParser::update_key(
            &final_gus,
            "SessionSettings",
            "SessionName",
            &session_name,
        );

        let pwd = server_password.unwrap_or_default();
        final_gus = crate::services::ini_parser::IniParser::update_key(
            &final_gus,
            "ServerSettings",
            "ServerPassword",
            &pwd,
        );

        let clean_admin = admin_password
            .split("?ServerPassword=")
            .next()
            .unwrap_or(&admin_password);
        final_gus = crate::services::ini_parser::IniParser::update_key(
            &final_gus,
            "ServerSettings",
            "ServerAdminPassword",
            clean_admin,
        );

        final_gus = crate::services::ini_parser::IniParser::update_key(
            &final_gus,
            "ServerSettings",
            "MaxPlayers",
            &max_players.to_string(),
        );

        final_gus = crate::services::ini_parser::IniParser::update_key(
            &final_gus,
            "ServerSettings",
            "RCONEnabled",
            if rcon_enabled { "True" } else { "False" },
        );

        final_gus = crate::services::ini_parser::IniParser::update_key(
            &final_gus,
            "ServerSettings",
            "RCONPort",
            &rcon_port.to_string(),
        );

        if let Some(ref ip) = ip_address {
            if !ip.is_empty() {
                final_gus = crate::services::ini_parser::IniParser::update_key(
                    &final_gus,
                    "ServerSettings",
                    "IPAddress",
                    ip,
                );
                final_gus = crate::services::ini_parser::IniParser::update_key(
                    &final_gus,
                    "URL",
                    "MultiHome",
                    ip,
                );
            }
        }

        final_gus = crate::services::ini_parser::IniParser::update_key(
            &final_gus,
            "URL",
            "Port",
            &game_port.to_string(),
        );

        final_gus = crate::services::ini_parser::IniParser::update_key(
            &final_gus,
            "URL",
            "QueryPort",
            &query_port.to_string(),
        );

        // 5. Update/Override Values (Event Profile)
        if let Some(p) = profile {
            println!("📅 Applying Event Profile: {}", p.profile_name);

            // Apply Multipliers to GUS
            final_gus = crate::services::ini_parser::IniParser::update_key(
                &final_gus,
                "ServerSettings",
                "HarvestAmountMultiplier",
                &format!("{:.6}", p.harvest_multiplier),
            );
            final_gus = crate::services::ini_parser::IniParser::update_key(
                &final_gus,
                "ServerSettings",
                "StructureResistanceMultiplier",
                &format!("{:.6}", p.structure_resistance),
            );
            final_gus = crate::services::ini_parser::IniParser::update_key(
                &final_gus,
                "ServerSettings",
                "StructureDamageMultiplier",
                &format!("{:.6}", p.structure_damage),
            );

            // Apply Multipliers to Game.ini
            let game_path = config_dir.join("Game.ini");
            let mut game_content = if game_path.exists() {
                fs::read_to_string(&game_path).unwrap_or_default()
            } else {
                String::new()
            };

            game_content = crate::services::ini_parser::IniParser::update_key(
                &game_content,
                "/Script/ShooterGame.ShooterGameMode",
                "ItemStackSizeMultiplier",
                &format!("{:.6}", p.stack_size_multiplier),
            );

            // Write Game.ini immediately since Transfer Policy doesn't touch it YET
            println!("  📝 [Debug] Writing Game.ini with Event overrides...");
            fs::write(&game_path, game_content).map_err(|e| e.to_string())?;
        } else {
            println!("📅 No Event Profile Active.");
            // logic to revert to base? For now, we assume user manages base via UI or files.
        }

        // 5. Apply Transfer Policy Overrides (Always Check)
        let transfer_policy_result =
            crate::services::advanced_config::AdvancedConfigService::get_transfer_policy_from_conn(
                db_conn, server_id,
            );

        if let Ok(Some(policy)) = transfer_policy_result {
            if policy.enabled {
                println!("🔒 Enforcing Custom Transfer Policy (NoTributeDownloads=True)");
                final_gus = crate::services::ini_parser::IniParser::update_key(
                    &final_gus,
                    "ServerSettings",
                    "NoTributeDownloads",
                    "True",
                );
            }
        }

        // 5.5. For ASE, automatically sync enabled mods to ActiveMods inside [ServerSettings]
        if server_type == "ASE" {
            let mut stmt = db_conn.prepare("SELECT workshop_id FROM ase_mods WHERE server_id = ?1 AND enabled = 1 ORDER BY load_order ASC")
                .map_err(|e| e.to_string())?;
            let mut rows = stmt.query([server_id]).map_err(|e| e.to_string())?;
            let mut ids = Vec::new();
            while let Some(row) = rows.next().map_err(|e| e.to_string())? {
                let id: String = row.get(0).map_err(|e| e.to_string())?;
                ids.push(id);
            }
            let active_mods_val = ids.join(",");
            println!("  📝 [Startup Mod Sync] Syncing {} active mods to GameUserSettings.ini for server {}", ids.len(), server_id);
            final_gus = crate::services::ini_parser::IniParser::update_key(
                &final_gus,
                "ServerSettings",
                "ActiveMods",
                &active_mods_val,
            );
        }

        // 6. Write GUS
        println!("  💾 Overwriting GameUserSettings.ini with Event/Policy modifications...");
        fs::write(&gus_path, final_gus).map_err(|e| e.to_string())?;

        Ok(())
    }
}
