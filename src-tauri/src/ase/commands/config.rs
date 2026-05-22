use crate::ase::ini_parser::{IniData, IniEntry};
use crate::ase::models::AseGameConfig;
use crate::AppState;
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::State;

/// Parse a UE4-style INI file into section → (key → value) map
fn parse_ini(content: &str) -> HashMap<String, HashMap<String, String>> {
    let mut sections: HashMap<String, HashMap<String, String>> = HashMap::new();
    let mut current_section = String::from("__root__");

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with(';') || trimmed.starts_with('#') {
            continue;
        }

        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            current_section = trimmed[1..trimmed.len() - 1].to_string();
            sections.entry(current_section.clone()).or_default();
        } else if let Some(eq_pos) = trimmed.find('=') {
            let key = trimmed[..eq_pos].trim().to_string();
            let value = trimmed[eq_pos + 1..].trim().to_string();
            let section_map = sections.entry(current_section.clone()).or_default();
            if let Some(existing) = section_map.get_mut(&key) {
                existing.push('\n');
                existing.push_str(&value);
            } else {
                section_map.insert(key, value);
            }
        }
    }

    sections
}

/// Get a value from parsed INI sections
fn ini_get<'a>(
    sections: &'a HashMap<String, HashMap<String, String>>,
    section: &str,
    key: &str,
) -> Option<&'a String> {
    sections.get(section).and_then(|s| s.get(key))
}

fn ini_get_f64(
    sections: &HashMap<String, HashMap<String, String>>,
    section: &str,
    key: &str,
    default: f64,
) -> f64 {
    ini_get(sections, section, key)
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(default)
}

fn ini_get_u32(
    sections: &HashMap<String, HashMap<String, String>>,
    section: &str,
    key: &str,
    default: u32,
) -> u32 {
    ini_get(sections, section, key)
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(default)
}

fn ini_get_u16(
    sections: &HashMap<String, HashMap<String, String>>,
    section: &str,
    key: &str,
    default: u16,
) -> u16 {
    ini_get(sections, section, key)
        .and_then(|v| v.parse::<u16>().ok())
        .unwrap_or(default)
}

fn ini_get_bool(
    sections: &HashMap<String, HashMap<String, String>>,
    section: &str,
    key: &str,
    default: bool,
) -> bool {
    ini_get(sections, section, key)
        .map(|v| {
            let lower = v.to_lowercase();
            lower == "true" || lower == "1"
        })
        .unwrap_or(default)
}

fn ini_get_str(
    sections: &HashMap<String, HashMap<String, String>>,
    section: &str,
    key: &str,
    default: &str,
) -> String {
    ini_get(sections, section, key)
        .cloned()
        .unwrap_or_else(|| default.to_string())
}

/// Build the GameUserSettings.ini and Game.ini content from AseGameConfig
fn build_game_user_settings(config: &AseGameConfig) -> String {
    let mut out = String::with_capacity(4096);

    out.push_str("[ServerSettings]\n");
    // Identity
    out.push_str(&format!("SessionName={}\n", config.session_name));
    out.push_str(&format!("ServerPassword={}\n", config.server_password));
    out.push_str(&format!(
        "ServerAdminPassword={}\n",
        config.server_admin_password
    ));
    out.push_str(&format!("MaxPlayers={}\n", config.max_players));

    // Difficulty
    out.push_str(&format!(
        "DifficultyOffset={:.6}\n",
        config.difficulty_offset
    ));
    out.push_str(&format!(
        "OverrideOfficialDifficulty={:.6}\n",
        config.override_official_difficulty
    ));

    // Core Rates
    out.push_str(&format!("XPMultiplier={:.6}\n", config.xp_multiplier));
    out.push_str(&format!(
        "TamingSpeedMultiplier={:.6}\n",
        config.taming_speed_multiplier
    ));
    out.push_str(&format!(
        "HarvestAmountMultiplier={:.6}\n",
        config.harvest_amount_multiplier
    ));
    out.push_str(&format!(
        "HarvestHealthMultiplier={:.6}\n",
        config.harvest_health_multiplier
    ));
    out.push_str(&format!(
        "ResourcesRespawnPeriodMultiplier={:.6}\n",
        config.resources_respawn_period_multiplier
    ));
    out.push_str(&format!(
        "ItemStackSizeMultiplier={:.6}\n",
        config.item_stack_size_multiplier
    ));

    // Player Stats
    out.push_str(&format!(
        "PlayerCharacterFoodDrainMultiplier={:.6}\n",
        config.player_character_food_drain_multiplier
    ));
    out.push_str(&format!(
        "PlayerCharacterWaterDrainMultiplier={:.6}\n",
        config.player_character_water_drain_multiplier
    ));
    out.push_str(&format!(
        "PlayerCharacterStaminaDrainMultiplier={:.6}\n",
        config.player_character_stamina_drain_multiplier
    ));
    out.push_str(&format!(
        "PlayerCharacterHealthRecoveryMultiplier={:.6}\n",
        config.player_character_health_recovery_multiplier
    ));
    out.push_str(&format!(
        "PlayerDamageMultiplier={:.6}\n",
        config.player_damage_multiplier
    ));
    out.push_str(&format!(
        "PlayerResistanceMultiplier={:.6}\n",
        config.player_resistance_multiplier
    ));

    // Dino Stats
    out.push_str(&format!(
        "DinoCharacterFoodDrainMultiplier={:.6}\n",
        config.dino_character_food_drain_multiplier
    ));
    out.push_str(&format!(
        "DinoCharacterHealthRecoveryMultiplier={:.6}\n",
        config.dino_character_health_recovery_multiplier
    ));
    out.push_str(&format!(
        "DinoDamageMultiplier={:.6}\n",
        config.dino_damage_multiplier
    ));
    out.push_str(&format!(
        "DinoResistanceMultiplier={:.6}\n",
        config.dino_resistance_multiplier
    ));
    out.push_str(&format!("MaxTamedDinos={}\n", config.max_tamed_dinos));
    out.push_str(&format!(
        "DinoCountMultiplier={:.6}\n",
        config.dino_count_multiplier
    ));
    out.push_str(&format!(
        "WildDinoTorporDrainMultiplier={:.6}\n",
        config.wild_dino_torpor_drain_multiplier
    ));
    out.push_str(&format!(
        "TamedDinoTorporDrainMultiplier={:.6}\n",
        config.tamed_dino_torpor_drain_multiplier
    ));
    out.push_str(&format!(
        "PassiveTameIntervalMultiplier={:.6}\n",
        config.passive_tame_interval_multiplier
    ));
    out.push_str(&format!(
        "UseSingleplayerSettings={}\n",
        config.use_singleplayer_settings
    ));
    out.push_str(&format!(
        "DisableDinoBreeding={}\n",
        config.disable_dino_breeding
    ));
    out.push_str(&format!(
        "AllowUnclaimDinos={}\n",
        config.allow_unclaim_dinos
    ));
    out.push_str(&format!(
        "UseDinoLevelUpAnimations={}\n",
        config.use_dino_level_up_animations
    ));
    out.push_str(&format!(
        "MaxPersonalTamedDinos={}\n",
        config.max_personal_tamed_dinos
    ));
    out.push_str(&format!(
        "PersonalTamedDinosSaddleStructureCost={:.6}\n",
        config.personal_tamed_dinos_saddle_structure_cost
    ));

    // Structures
    out.push_str(&format!(
        "TheMaxStructuresInRange={}\n",
        config.the_max_structures_in_range
    ));
    out.push_str(&format!(
        "StructureDamageMultiplier={:.6}\n",
        config.structure_damage_multiplier
    ));
    out.push_str(&format!(
        "StructureResistanceMultiplier={:.6}\n",
        config.structure_resistance_multiplier
    ));
    out.push_str(&format!(
        "PerPlatformMaxStructuresMultiplier={:.6}\n",
        config.per_platform_max_structures_multiplier
    ));
    out.push_str(&format!(
        "AutoDestroyDecayedDinos={}\n",
        config.auto_destroy_decayed_dinos
    ));
    out.push_str(&format!(
        "DisableStructureDecayPvE={}\n",
        config.disable_structure_decay_pve
    ));
    out.push_str(&format!(
        "PvEAllowStructuresAtSupplyDrops={}\n",
        config.pve_allow_structures_at_supply_drops
    ));
    out.push_str(&format!(
        "ForceAllStructureLocking={}\n",
        config.force_all_structure_locking
    ));
    out.push_str(&format!(
        "AutoDestroyOldStructuresMultiplier={:.6}\n",
        config.auto_destroy_old_structures_multiplier
    ));
    out.push_str(&format!(
        "StructurePickupTimeAfterPlacement={:.6}\n",
        config.structure_pickup_time_after_placement
    ));
    out.push_str(&format!(
        "StructurePickupHoldDuration={:.6}\n",
        config.structure_pickup_hold_duration
    ));
    out.push_str(&format!(
        "AllowIntegratedSPlusStructures={}\n",
        config.allow_integrated_spinet_attachment
    ));
    out.push_str(&format!(
        "IgnoreLimitMaxStructuresInRangeTypeFlag={}\n",
        config.ignore_limit_max_structures_in_range_type_flag
    ));
    out.push_str(&format!(
        "IgnoreStructuresPreventionVolumes={}\n",
        config.ignore_structures_prevention_volumes
    ));

    // PvP Rules
    out.push_str(&format!("ServerPVE={}\n", config.server_pve));
    out.push_str(&format!(
        "AllowCaveBuildingPvP={}\n",
        config.allow_cave_building_pvp
    ));
    out.push_str(&format!(
        "DisableRailgunPVP={}\n",
        config.disable_railgun_pvp
    ));
    out.push_str(&format!("EnablePvPGamma={}\n", config.enable_pvp_gamma));
    out.push_str(&format!(
        "PvPStructureDecay={}\n",
        config.pvp_structure_decay
    ));
    out.push_str(&format!("PvPDinoDecay={}\n", config.pvp_dino_decay));
    out.push_str(&format!(
        "GlobalPoweredBatteryDurabilityDecreasePerSecond={:.6}\n",
        config.global_powered_battery_durability_decrease_per_second
    ));

    // Player Rules
    out.push_str(&format!(
        "AllowThirdPersonPlayer={}\n",
        config.allow_third_person_player
    ));
    out.push_str(&format!("ServerCrosshair={}\n", config.server_crosshair));
    out.push_str(&format!(
        "ShowMapPlayerLocation={}\n",
        config.show_map_player_location
    ));
    out.push_str(&format!(
        "AllowFlyerCarryPvE={}\n",
        config.allow_flyer_carry_pve
    ));
    out.push_str(&format!(
        "DisableWeatherFog={}\n",
        config.disable_weather_fog
    ));
    out.push_str(&format!(
        "AllowAnyoneBabyImprintCuddle={}\n",
        config.allow_anyone_baby_imprint_cuddle
    ));
    out.push_str(&format!("AllowHitMarkers={}\n", config.allow_hit_markers));
    out.push_str(&format!(
        "EnableExtraStructurePreventionVolumes={}\n",
        config.enable_extra_structure_prevention_volumes
    ));
    out.push_str(&format!(
        "ShowFloatingDamageText={}\n",
        config.show_floating_damage_text
    ));
    out.push_str(&format!(
        "ForceFlyerExplosives={}\n",
        config.force_flyerexplosives
    ));

    // Tribe Settings
    out.push_str(&format!(
        "PreventTribeAlliances={}\n",
        config.prevent_tribe_alliances
    ));
    out.push_str(&format!(
        "AllowTribeAlliance={}\n",
        config.allow_tribe_alliance
    ));
    out.push_str(&format!(
        "AllowTribeWarfare={}\n",
        config.allow_tribe_warfare
    ));
    out.push_str(&format!("MaxTribeLogs={}\n", config.max_tribe_logs));
    out.push_str(&format!(
        "MaxNumberOfPlayersInTribe={}\n",
        config.max_number_of_players_in_tribe
    ));

    // Tribute / Transfer
    out.push_str(&format!("MaxTributeDinos={}\n", config.max_tribute_dinos));
    out.push_str(&format!("MaxTributeItems={}\n", config.max_tribute_items));
    out.push_str(&format!(
        "NoTributeDownloads={}\n",
        config.no_tribute_downloads
    ));
    out.push_str(&format!(
        "PreventDownloadSurvivors={}\n",
        config.prevent_download_survivors
    ));
    out.push_str(&format!(
        "PreventDownloadItems={}\n",
        config.prevent_download_items
    ));
    out.push_str(&format!(
        "PreventDownloadDinos={}\n",
        config.prevent_download_dinos
    ));
    out.push_str(&format!(
        "PreventUploadSurvivors={}\n",
        config.prevent_upload_survivors
    ));
    out.push_str(&format!(
        "PreventUploadItems={}\n",
        config.prevent_upload_items
    ));
    out.push_str(&format!(
        "PreventUploadDinos={}\n",
        config.prevent_upload_dinos
    ));
    out.push_str(&format!(
        "DisableCustomFoldersInTributeInventories={}\n",
        config.disable_custom_folders_in_tribute_inventories
    ));
    out.push_str(&format!(
        "CrossARKAllowForeignDinoDownloads={}\n",
        config.crossark_allow_foreign_dino_downloads
    ));

    // Environment
    out.push_str(&format!(
        "DayCycleSpeedScale={:.6}\n",
        config.day_cycle_speed_scale
    ));
    out.push_str(&format!(
        "DayTimeSpeedScale={:.6}\n",
        config.day_time_speed_scale
    ));
    out.push_str(&format!(
        "NightTimeSpeedScale={:.6}\n",
        config.night_time_speed_scale
    ));
    out.push_str(&format!(
        "SpoilingTimeMultiplier={:.6}\n",
        config.spoiling_time_multiplier
    ));
    out.push_str(&format!(
        "ItemDecompositionTimeMultiplier={:.6}\n",
        config.item_decomposition_time_multiplier
    ));
    out.push_str(&format!(
        "CorpseDecompositionTimeMultiplier={:.6}\n",
        config.corpse_decomposition_time_multiplier
    ));
    out.push_str(&format!(
        "CropGrowthSpeedMultiplier={:.6}\n",
        config.crop_growth_speed_multiplier
    ));
    out.push_str(&format!(
        "CropDecaySpeedMultiplier={:.6}\n",
        config.crop_decay_speed_multiplier
    ));
    out.push_str(&format!(
        "LayEggIntervalMultiplier={:.6}\n",
        config.lay_egg_interval_multiplier
    ));
    out.push_str(&format!(
        "PoopIntervalMultiplier={:.6}\n",
        config.poop_interval_multiplier
    ));
    out.push_str(&format!(
        "HairGrowthSpeedMultiplier={:.6}\n",
        config.hair_growth_speed_multiplier
    ));
    out.push_str(&format!(
        "CustomRecipeEffectivenessMultiplier={:.6}\n",
        config.custom_recipe_effectiveness_multiplier
    ));
    out.push_str(&format!(
        "CustomRecipeSkillMultiplier={:.6}\n",
        config.custom_recipe_skill_multiplier
    ));
    out.push_str(&format!(
        "FishingLootQualityMultiplier={:.6}\n",
        config.fishing_loot_quality_multiplier
    ));
    out.push_str(&format!(
        "SupplyCrateLootQualityMultiplier={:.6}\n",
        config.supply_crate_loot_quality_multiplier
    ));
    out.push_str(&format!(
        "GlobalSpoilingTimeMultiplier={:.6}\n",
        config.global_spoiling_time_multiplier
    ));
    out.push_str(&format!(
        "GlobalItemDecompositionTimeMultiplier={:.6}\n",
        config.global_item_decomposition_time_multiplier
    ));
    out.push_str(&format!(
        "GlobalCorpseDecompositionTimeMultiplier={:.6}\n",
        config.global_corpse_decomposition_time_multiplier
    ));
    out.push_str(&format!(
        "KillXPMultiplier={:.6}\n",
        config.kill_xp_multiplier
    ));
    out.push_str(&format!(
        "HarvestXPMultiplier={:.6}\n",
        config.harvest_xp_multiplier
    ));
    out.push_str(&format!(
        "CraftXPMultiplier={:.6}\n",
        config.craft_xp_multiplier
    ));
    out.push_str(&format!(
        "GenericXPMultiplier={:.6}\n",
        config.generic_xp_multiplier
    ));
    out.push_str(&format!(
        "SpecialXPMultiplier={:.6}\n",
        config.special_xp_multiplier
    ));

    // Hexagons
    out.push_str(&format!(
        "MaxHexagonsPerCharacter={:.6}\n",
        config.max_hexagons_per_character
    ));
    out.push_str(&format!(
        "HexagonRewardMultiplier={:.6}\n",
        config.hexagon_reward_multiplier
    ));

    // Engrams
    out.push_str(&format!(
        "AutoUnlockAllEngrams={}\n",
        config.auto_unlock_all_engrams
    ));
    out.push_str(&format!(
        "OnlyAllowSpecifiedEngrams={}\n",
        config.only_allow_specified_engrams
    ));

    // Network / Admin
    out.push_str(&format!("RCONEnabled={}\n", config.rcon_enabled));
    out.push_str(&format!("RCONPort={}\n", config.rcon_port));
    out.push_str(&format!(
        "BattlEyeEnforcer={}\n",
        config.battle_eye_enforcer
    ));
    out.push_str(&format!(
        "EnableCreativeMode={}\n",
        config.enable_creative_mode
    ));
    out.push_str(&format!(
        "ServerForceNoHUD={}\n",
        config.server_force_no_hud
    ));
    out.push_str(&format!(
        "KickIdlePlayerPeriod={:.6}\n",
        config.kick_idle_player_period
    ));
    out.push_str(&format!(
        "DestroyTamesOverLevelClamp={}\n",
        config.destroy_tames_over_level_clamp
    ));

    // Mods
    if !config.active_mods.is_empty() {
        out.push_str(&format!("ActiveMods={}\n", config.active_mods));
    }

    // Auto-save
    out.push_str(&format!(
        "AutoSavePeriodMinutes={:.6}\n",
        config.auto_save_period_minutes
    ));

    // Events
    if !config.active_event.is_empty() {
        out.push_str(&format!("ActiveEvent={}\n", config.active_event));
    }
    out.push_str(&format!(
        "EventColorsChanceOverride={:.6}\n",
        config.event_colors_chance_override
    ));

    // Administration
    if !config.bad_word_filter.is_empty() {
        out.push_str(&format!("BadWordFilter={}\n", config.bad_word_filter));
    }
    if !config.admin_list.is_empty() {
        out.push_str(&format!("AdminList={}\n", config.admin_list));
    }
    if !config.custom_dynamic_config_url.is_empty() {
        out.push_str(&format!(
            "CustomDynamicConfigUrl={}\n",
            config.custom_dynamic_config_url
        ));
    }
    if !config.custom_live_tuning_url.is_empty() {
        out.push_str(&format!(
            "CustomLiveTuningUrl={}\n",
            config.custom_live_tuning_url
        ));
    }
    out.push_str(&format!(
        "UseSecureSpawnRules={}\n",
        config.use_secure_spawn_rules
    ));
    out.push_str(&format!(
        "UseItemDupeCheck={}\n",
        config.use_item_dupe_check
    ));
    out.push_str(&format!(
        "SecureSendARKPayload={}\n",
        config.secure_send_ark_payload
    ));
    if !config.culture.is_empty() {
        out.push_str(&format!("Culture={}\n", config.culture));
    }

    // Ragnarok
    out.push_str(&format!(
        "RagnarokVolcanoIntensity={:.6}\n",
        config.ragnarok_volcano_intensity
    ));
    out.push_str(&format!(
        "RagnarokVolcanoInterval={:.6}\n",
        config.ragnarok_volcano_interval
    ));
    out.push_str(&format!(
        "EnableRagnarokSettings={}\n",
        config.enable_ragnarok_settings
    ));

    // Fjordur
    out.push_str(&format!(
        "UseFjordurTraversalBuff={}\n",
        config.use_fjordur_traversal_buff
    ));
    out.push_str(&format!(
        "EnableFjordurSettings={}\n",
        config.enable_fjordur_settings
    ));

    // Adjustable Spawner
    out.push_str(&format!(
        "AdjustableMutagenSpawnDelayMultiplier={:.6}\n",
        config.adjustable_mutagen_spawn_delay_multiplier
    ));

    // Session settings
    out.push_str("\n[SessionSettings]\nSessionName=");
    out.push_str(&config.session_name);
    out.push('\n');

    // Game session (max players)
    out.push_str("\n[/Script/Engine.GameSession]\n");
    out.push_str(&format!("MaxPlayers={}\n", config.max_players));

    // MOTD
    if !config.motd.is_empty() {
        out.push_str("\n[MessageOfTheDay]\n");
        out.push_str(&format!("Message={}\n", config.motd));
        out.push_str(&format!("Duration={}\n", config.motd_duration));
    }

    // Custom section for launcher args
    out.push_str("\n[ASM2]\n");
    if !config.launcher_args.is_empty() {
        out.push_str(&format!("LauncherArgs={}\n", config.launcher_args));
    }
    out.push_str(&format!(
        "UseAllAvailableCores={}\n",
        config.use_all_available_cores
    ));
    out.push_str(&format!("UseLowMemory={}\n", config.use_low_memory));
    out.push_str(&format!("NoBattlEye={}\n", config.no_battle_eye));

    out
}

fn build_game_ini(config: &AseGameConfig) -> String {
    let mut out = String::with_capacity(1024);

    out.push_str("[/Script/ShooterGame.ShooterGameMode]\n");
    // Breeding
    out.push_str(&format!(
        "EggHatchSpeedMultiplier={:.6}\n",
        config.egg_hatch_speed_multiplier
    ));
    out.push_str(&format!(
        "BabyMatureSpeedMultiplier={:.6}\n",
        config.baby_mature_speed_multiplier
    ));
    out.push_str(&format!(
        "BabyCuddleIntervalMultiplier={:.6}\n",
        config.baby_cuddle_interval_multiplier
    ));
    out.push_str(&format!(
        "BabyImprintAmountMultiplier={:.6}\n",
        config.baby_imprint_amount_multiplier
    ));
    out.push_str(&format!(
        "MatingIntervalMultiplier={:.6}\n",
        config.mating_interval_multiplier
    ));
    out.push_str(&format!(
        "BabyFoodConsumptionSpeedMultiplier={:.6}\n",
        config.baby_food_consumption_speed_multiplier
    ));
    out.push_str(&format!(
        "BabyCuddleGracePeriodMultiplier={:.6}\n",
        config.baby_cuddle_grace_period_multiplier
    ));
    out.push_str(&format!(
        "BabyCuddleLoseImprintQualitySpeedMultiplier={:.6}\n",
        config.baby_cuddle_lose_imprint_quality_speed_multiplier
    ));

    // Engram Overrides
    for line in config.override_named_engram_entries.split('\n') {
        let l = line.trim();
        if !l.is_empty() {
            out.push_str(&format!("OverrideNamedEngramEntries={}\n", l));
        }
    }

    for line in config.config_override_item_crafting_costs.split('\n') {
        let l = line.trim();
        if !l.is_empty() {
            out.push_str(&format!("ConfigOverrideItemCraftingCosts={}\n", l));
        }
    }

    out.push_str(&format!(
        "MutagenLevelBoost={}\n",
        config.mutagen_level_boost
    ));
    out.push_str(&format!(
        "MutagenLevelBoostBred={}\n",
        config.mutagen_level_boost_bred
    ));
    out.push_str(&format!(
        "MaxImprintLimit={:.6}\n",
        config.max_imprint_limit
    ));

    out
}

fn get_config_path(install_path: &str) -> PathBuf {
    PathBuf::from(install_path)
        .join("ShooterGame")
        .join("Saved")
        .join("Config")
        .join("WindowsServer")
}

#[tauri::command]
pub async fn read_ase_config(
    server_id: i64,
    state: State<'_, AppState>,
) -> Result<AseGameConfig, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let install_path: String = conn
        .query_row(
            "SELECT install_path FROM ase_servers WHERE id = ?1",
            [server_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Server not found: {}", e))?;

    let config_dir = get_config_path(&install_path);
    let gus_path = config_dir.join("GameUserSettings.ini");
    let game_ini_path = config_dir.join("Game.ini");

    let mut config = AseGameConfig::default();

    // Parse GameUserSettings.ini
    if gus_path.exists() {
        let content = std::fs::read_to_string(&gus_path)
            .map_err(|e| format!("Failed to read GameUserSettings.ini: {}", e))?;
        let sections = parse_ini(&content);
        let ss = "ServerSettings";

        config.session_name = ini_get_str(&sections, ss, "SessionName", "My ASE Server");
        config.server_password = ini_get_str(&sections, ss, "ServerPassword", "");
        config.server_admin_password =
            ini_get_str(&sections, ss, "ServerAdminPassword", "admin123");
        config.max_players = ini_get_u32(&sections, ss, "MaxPlayers", 70);

        config.difficulty_offset = ini_get_f64(&sections, ss, "DifficultyOffset", 1.0);
        config.override_official_difficulty =
            ini_get_f64(&sections, ss, "OverrideOfficialDifficulty", 5.0);

        config.xp_multiplier = ini_get_f64(&sections, ss, "XPMultiplier", 1.0);
        config.taming_speed_multiplier = ini_get_f64(&sections, ss, "TamingSpeedMultiplier", 1.0);
        config.harvest_amount_multiplier =
            ini_get_f64(&sections, ss, "HarvestAmountMultiplier", 1.0);
        config.harvest_health_multiplier =
            ini_get_f64(&sections, ss, "HarvestHealthMultiplier", 1.0);
        config.resources_respawn_period_multiplier =
            ini_get_f64(&sections, ss, "ResourcesRespawnPeriodMultiplier", 1.0);
        config.item_stack_size_multiplier =
            ini_get_f64(&sections, ss, "ItemStackSizeMultiplier", 1.0);

        config.player_character_food_drain_multiplier =
            ini_get_f64(&sections, ss, "PlayerCharacterFoodDrainMultiplier", 1.0);
        config.player_character_water_drain_multiplier =
            ini_get_f64(&sections, ss, "PlayerCharacterWaterDrainMultiplier", 1.0);
        config.player_character_stamina_drain_multiplier =
            ini_get_f64(&sections, ss, "PlayerCharacterStaminaDrainMultiplier", 1.0);
        config.player_character_health_recovery_multiplier = ini_get_f64(
            &sections,
            ss,
            "PlayerCharacterHealthRecoveryMultiplier",
            1.0,
        );
        config.player_damage_multiplier = ini_get_f64(&sections, ss, "PlayerDamageMultiplier", 1.0);
        config.player_resistance_multiplier =
            ini_get_f64(&sections, ss, "PlayerResistanceMultiplier", 1.0);

        config.dino_character_food_drain_multiplier =
            ini_get_f64(&sections, ss, "DinoCharacterFoodDrainMultiplier", 1.0);
        config.dino_character_health_recovery_multiplier =
            ini_get_f64(&sections, ss, "DinoCharacterHealthRecoveryMultiplier", 1.0);
        config.dino_damage_multiplier = ini_get_f64(&sections, ss, "DinoDamageMultiplier", 1.0);
        config.dino_resistance_multiplier =
            ini_get_f64(&sections, ss, "DinoResistanceMultiplier", 1.0);
        config.max_tamed_dinos = ini_get_u32(&sections, ss, "MaxTamedDinos", 5000);
        config.dino_count_multiplier = ini_get_f64(&sections, ss, "DinoCountMultiplier", 1.0);
        config.wild_dino_torpor_drain_multiplier =
            ini_get_f64(&sections, ss, "WildDinoTorporDrainMultiplier", 1.0);
        config.tamed_dino_torpor_drain_multiplier =
            ini_get_f64(&sections, ss, "TamedDinoTorporDrainMultiplier", 1.0);
        config.passive_tame_interval_multiplier =
            ini_get_f64(&sections, ss, "PassiveTameIntervalMultiplier", 1.0);
        config.use_singleplayer_settings =
            ini_get_bool(&sections, ss, "UseSingleplayerSettings", false);
        config.disable_dino_breeding = ini_get_bool(&sections, ss, "DisableDinoBreeding", false);
        config.allow_unclaim_dinos = ini_get_bool(&sections, ss, "AllowUnclaimDinos", false);
        config.use_dino_level_up_animations =
            ini_get_bool(&sections, ss, "UseDinoLevelUpAnimations", true);
        config.max_personal_tamed_dinos = ini_get_u32(&sections, ss, "MaxPersonalTamedDinos", 40);
        config.personal_tamed_dinos_saddle_structure_cost =
            ini_get_f64(&sections, ss, "PersonalTamedDinosSaddleStructureCost", 0.0);

        config.the_max_structures_in_range =
            ini_get_u32(&sections, ss, "TheMaxStructuresInRange", 10500);
        config.structure_damage_multiplier =
            ini_get_f64(&sections, ss, "StructureDamageMultiplier", 1.0);
        config.structure_resistance_multiplier =
            ini_get_f64(&sections, ss, "StructureResistanceMultiplier", 1.0);
        config.per_platform_max_structures_multiplier =
            ini_get_f64(&sections, ss, "PerPlatformMaxStructuresMultiplier", 1.0);
        config.auto_destroy_decayed_dinos =
            ini_get_bool(&sections, ss, "AutoDestroyDecayedDinos", false);
        config.disable_structure_decay_pve =
            ini_get_bool(&sections, ss, "DisableStructureDecayPvE", false);
        config.pve_allow_structures_at_supply_drops =
            ini_get_bool(&sections, ss, "PvEAllowStructuresAtSupplyDrops", false);
        config.force_all_structure_locking =
            ini_get_bool(&sections, ss, "ForceAllStructureLocking", false);
        config.auto_destroy_old_structures_multiplier =
            ini_get_f64(&sections, ss, "AutoDestroyOldStructuresMultiplier", 0.0);
        config.structure_pickup_time_after_placement =
            ini_get_f64(&sections, ss, "StructurePickupTimeAfterPlacement", 30.0);
        config.structure_pickup_hold_duration =
            ini_get_f64(&sections, ss, "StructurePickupHoldDuration", 0.5);
        config.allow_integrated_spinet_attachment =
            ini_get_bool(&sections, ss, "AllowIntegratedSPlusStructures", true);
        config.ignore_limit_max_structures_in_range_type_flag = ini_get_bool(
            &sections,
            ss,
            "IgnoreLimitMaxStructuresInRangeTypeFlag",
            false,
        );
        config.ignore_structures_prevention_volumes =
            ini_get_bool(&sections, ss, "IgnoreStructuresPreventionVolumes", false);

        config.server_pve = ini_get_bool(&sections, ss, "ServerPVE", false);
        config.allow_cave_building_pvp = ini_get_bool(&sections, ss, "AllowCaveBuildingPvP", false);
        config.disable_railgun_pvp = ini_get_bool(&sections, ss, "DisableRailgunPVP", false);
        config.enable_pvp_gamma = ini_get_bool(&sections, ss, "EnablePvPGamma", false);
        config.pvp_structure_decay = ini_get_bool(&sections, ss, "PvPStructureDecay", false);
        config.pvp_dino_decay = ini_get_bool(&sections, ss, "PvPDinoDecay", false);
        config.global_powered_battery_durability_decrease_per_second = ini_get_f64(
            &sections,
            ss,
            "GlobalPoweredBatteryDurabilityDecreasePerSecond",
            4.0,
        );

        config.allow_third_person_player =
            ini_get_bool(&sections, ss, "AllowThirdPersonPlayer", true);
        config.server_crosshair = ini_get_bool(&sections, ss, "ServerCrosshair", true);
        config.show_map_player_location =
            ini_get_bool(&sections, ss, "ShowMapPlayerLocation", true);
        config.allow_flyer_carry_pve = ini_get_bool(&sections, ss, "AllowFlyerCarryPvE", false);
        config.disable_weather_fog = ini_get_bool(&sections, ss, "DisableWeatherFog", false);
        config.allow_anyone_baby_imprint_cuddle =
            ini_get_bool(&sections, ss, "AllowAnyoneBabyImprintCuddle", false);
        config.allow_hit_markers = ini_get_bool(&sections, ss, "AllowHitMarkers", true);
        config.enable_extra_structure_prevention_volumes = ini_get_bool(
            &sections,
            ss,
            "EnableExtraStructurePreventionVolumes",
            false,
        );
        config.show_floating_damage_text =
            ini_get_bool(&sections, ss, "ShowFloatingDamageText", false);
        config.force_flyerexplosives = ini_get_bool(&sections, ss, "ForceFlyerExplosives", false);

        config.prevent_tribe_alliances =
            ini_get_bool(&sections, ss, "PreventTribeAlliances", false);
        config.allow_tribe_alliance = ini_get_bool(&sections, ss, "AllowTribeAlliance", true);
        config.allow_tribe_warfare = ini_get_bool(&sections, ss, "AllowTribeWarfare", false);
        config.max_tribe_logs = ini_get_u32(&sections, ss, "MaxTribeLogs", 100);
        config.max_number_of_players_in_tribe =
            ini_get_u32(&sections, ss, "MaxNumberOfPlayersInTribe", 0);

        config.max_tribute_dinos = ini_get_u32(&sections, ss, "MaxTributeDinos", 20);
        config.max_tribute_items = ini_get_u32(&sections, ss, "MaxTributeItems", 50);
        config.no_tribute_downloads = ini_get_bool(&sections, ss, "NoTributeDownloads", false);
        config.prevent_download_survivors =
            ini_get_bool(&sections, ss, "PreventDownloadSurvivors", false);
        config.prevent_download_items = ini_get_bool(&sections, ss, "PreventDownloadItems", false);
        config.prevent_download_dinos = ini_get_bool(&sections, ss, "PreventDownloadDinos", false);
        config.prevent_upload_survivors =
            ini_get_bool(&sections, ss, "PreventUploadSurvivors", false);
        config.prevent_upload_items = ini_get_bool(&sections, ss, "PreventUploadItems", false);
        config.prevent_upload_dinos = ini_get_bool(&sections, ss, "PreventUploadDinos", false);
        config.disable_custom_folders_in_tribute_inventories = ini_get_bool(
            &sections,
            ss,
            "DisableCustomFoldersInTributeInventories",
            false,
        );
        config.crossark_allow_foreign_dino_downloads =
            ini_get_bool(&sections, ss, "CrossARKAllowForeignDinoDownloads", false);

        config.day_cycle_speed_scale = ini_get_f64(&sections, ss, "DayCycleSpeedScale", 1.0);
        config.day_time_speed_scale = ini_get_f64(&sections, ss, "DayTimeSpeedScale", 1.0);
        config.night_time_speed_scale = ini_get_f64(&sections, ss, "NightTimeSpeedScale", 1.0);
        config.spoiling_time_multiplier = ini_get_f64(&sections, ss, "SpoilingTimeMultiplier", 1.0);
        config.item_decomposition_time_multiplier =
            ini_get_f64(&sections, ss, "ItemDecompositionTimeMultiplier", 1.0);
        config.corpse_decomposition_time_multiplier =
            ini_get_f64(&sections, ss, "CorpseDecompositionTimeMultiplier", 1.0);
        config.crop_growth_speed_multiplier =
            ini_get_f64(&sections, ss, "CropGrowthSpeedMultiplier", 1.0);
        config.crop_decay_speed_multiplier =
            ini_get_f64(&sections, ss, "CropDecaySpeedMultiplier", 1.0);
        config.lay_egg_interval_multiplier =
            ini_get_f64(&sections, ss, "LayEggIntervalMultiplier", 1.0);
        config.poop_interval_multiplier = ini_get_f64(&sections, ss, "PoopIntervalMultiplier", 1.0);
        config.hair_growth_speed_multiplier =
            ini_get_f64(&sections, ss, "HairGrowthSpeedMultiplier", 1.0);
        config.custom_recipe_effectiveness_multiplier =
            ini_get_f64(&sections, ss, "CustomRecipeEffectivenessMultiplier", 1.0);
        config.custom_recipe_skill_multiplier =
            ini_get_f64(&sections, ss, "CustomRecipeSkillMultiplier", 1.0);
        config.fishing_loot_quality_multiplier =
            ini_get_f64(&sections, ss, "FishingLootQualityMultiplier", 1.0);
        config.supply_crate_loot_quality_multiplier =
            ini_get_f64(&sections, ss, "SupplyCrateLootQualityMultiplier", 1.0);
        config.global_spoiling_time_multiplier =
            ini_get_f64(&sections, ss, "GlobalSpoilingTimeMultiplier", 1.0);
        config.global_item_decomposition_time_multiplier =
            ini_get_f64(&sections, ss, "GlobalItemDecompositionTimeMultiplier", 1.0);
        config.global_corpse_decomposition_time_multiplier = ini_get_f64(
            &sections,
            ss,
            "GlobalCorpseDecompositionTimeMultiplier",
            1.0,
        );
        config.kill_xp_multiplier = ini_get_f64(&sections, ss, "KillXPMultiplier", 1.0);
        config.harvest_xp_multiplier = ini_get_f64(&sections, ss, "HarvestXPMultiplier", 1.0);
        config.craft_xp_multiplier = ini_get_f64(&sections, ss, "CraftXPMultiplier", 1.0);
        config.generic_xp_multiplier = ini_get_f64(&sections, ss, "GenericXPMultiplier", 1.0);
        config.special_xp_multiplier = ini_get_f64(&sections, ss, "SpecialXPMultiplier", 1.0);

        config.max_hexagons_per_character =
            ini_get_f64(&sections, ss, "MaxHexagonsPerCharacter", 2000000.0);
        config.hexagon_reward_multiplier =
            ini_get_f64(&sections, ss, "HexagonRewardMultiplier", 1.0);

        config.auto_unlock_all_engrams = ini_get_bool(&sections, ss, "AutoUnlockAllEngrams", false);
        config.only_allow_specified_engrams =
            ini_get_bool(&sections, ss, "OnlyAllowSpecifiedEngrams", false);

        config.rcon_enabled = ini_get_bool(&sections, ss, "RCONEnabled", true);
        config.rcon_port = ini_get_u16(&sections, ss, "RCONPort", 27020);
        config.battle_eye_enforcer = ini_get_bool(&sections, ss, "BattlEyeEnforcer", true);
        config.enable_creative_mode = ini_get_bool(&sections, ss, "EnableCreativeMode", false);
        config.server_force_no_hud = ini_get_bool(&sections, ss, "ServerForceNoHUD", false);
        config.kick_idle_player_period = ini_get_f64(&sections, ss, "KickIdlePlayerPeriod", 3600.0);
        config.destroy_tames_over_level_clamp =
            ini_get_u32(&sections, ss, "DestroyTamesOverLevelClamp", 0);

        config.active_mods = ini_get_str(&sections, ss, "ActiveMods", "");

        config.auto_save_period_minutes = ini_get_f64(&sections, ss, "AutoSavePeriodMinutes", 15.0);

        config.active_event = ini_get_str(&sections, ss, "ActiveEvent", "");
        config.event_colors_chance_override =
            ini_get_f64(&sections, ss, "EventColorsChanceOverride", 0.0);

        config.bad_word_filter = ini_get_str(&sections, ss, "BadWordFilter", "");
        config.admin_list = ini_get_str(&sections, ss, "AdminList", "");
        config.custom_dynamic_config_url = ini_get_str(&sections, ss, "CustomDynamicConfigUrl", "");
        config.custom_live_tuning_url = ini_get_str(&sections, ss, "CustomLiveTuningUrl", "");
        config.use_secure_spawn_rules = ini_get_bool(&sections, ss, "UseSecureSpawnRules", false);
        config.use_item_dupe_check = ini_get_bool(&sections, ss, "UseItemDupeCheck", false);
        config.secure_send_ark_payload = ini_get_bool(&sections, ss, "SecureSendARKPayload", false);
        config.culture = ini_get_str(&sections, ss, "Culture", "");

        config.ragnarok_volcano_intensity =
            ini_get_f64(&sections, ss, "RagnarokVolcanoIntensity", 1.0);
        config.ragnarok_volcano_interval =
            ini_get_f64(&sections, ss, "RagnarokVolcanoInterval", 0.0);
        config.enable_ragnarok_settings =
            ini_get_bool(&sections, ss, "EnableRagnarokSettings", false);

        config.use_fjordur_traversal_buff =
            ini_get_bool(&sections, ss, "UseFjordurTraversalBuff", true);
        config.enable_fjordur_settings =
            ini_get_bool(&sections, ss, "EnableFjordurSettings", false);

        config.adjustable_mutagen_spawn_delay_multiplier =
            ini_get_f64(&sections, ss, "AdjustableMutagenSpawnDelayMultiplier", 1.0);

        // ── Advanced configuration parameters ──
        config.global_voice_chat = ini_get_bool(&sections, ss, "GlobalVoiceChat", false);
        config.proximity_voice_chat = ini_get_bool(&sections, ss, "ProximityVoiceChat", false);
        config.always_notify_player_joined =
            ini_get_bool(&sections, ss, "AlwaysNotifyPlayerJoined", false);
        config.always_notify_player_left =
            ini_get_bool(&sections, ss, "AlwaysNotifyPlayerLeft", false);
        config.server_admin_command_logging =
            ini_get_bool(&sections, ss, "ServerAdminCommandLogging", false);

        config.non_permanent_diseases = ini_get_bool(&sections, ss, "NonPermanentDiseases", false);
        config.prevent_diseases = ini_get_bool(&sections, ss, "PreventDiseases", false);
        config.allow_cryo_cooldown_on_pve =
            ini_get_bool(&sections, ss, "AllowCryoCooldownOnPvE", false);
        config.disable_cryopod_enemy_check =
            ini_get_bool(&sections, ss, "DisableCryopodEnemyCheck", false);
        config.pvp_zone_structure_damage_multiplier =
            ini_get_f64(&sections, ss, "PVPZoneStructureDamageMultiplier", 6.0);
        config.structure_damage_repair_cooldown =
            ini_get_f64(&sections, ss, "StructureDamageRepairCooldown", 180.0);

        config.clamp_resource_harvest_damage =
            ini_get_bool(&sections, ss, "ClampResourceHarvestDamage", false);
        config.optimized_harvesting_health =
            ini_get_bool(&sections, ss, "OptimizedHarvestingHealth", false);
        config.tamed_dino_harvesting_damage_multiplier =
            ini_get_f64(&sections, ss, "TamedDinoHarvestingDamageMultiplier", 1.0);
        config.dino_turret_damage_multiplier =
            ini_get_f64(&sections, ss, "DinoTurretDamageMultiplier", 1.0);
        config.tamed_dino_character_food_drain_multiplier =
            ini_get_f64(&sections, ss, "TamedDinoCharacterFoodDrainMultiplier", 1.0);
        config.wild_dino_character_food_drain_multiplier =
            ini_get_f64(&sections, ss, "WildDinoCharacterFoodDrainMultiplier", 1.0);

        config.structure_decay_period_multiplier =
            ini_get_f64(&sections, ss, "StructureDecayPeriodMultiplier", 1.0);
        config.pve_dino_decay_period_multiplier =
            ini_get_f64(&sections, ss, "PvEDinoDecayPeriodMultiplier", 1.0);
        config.fast_decay_unsnapped_core_structures =
            ini_get_bool(&sections, ss, "FastDecayUnsnappedCoreStructures", false);
        config.b_allow_platform_saddle_multi_floors =
            ini_get_bool(&sections, ss, "bAllowPlatformSaddleMultiFloors", false);

        config.allow_flying_stamina_recovery =
            ini_get_bool(&sections, ss, "AllowFlyingStaminaRecovery", false);
        config.flyer_platform_max_structures_multiplier =
            ini_get_f64(&sections, ss, "FlyerPlatformMaxStructuresMultiplier", 1.0);

        // ASM2 custom section
        config.launcher_args = ini_get_str(&sections, "ASM2", "LauncherArgs", "");
        config.use_all_available_cores =
            ini_get_bool(&sections, "ASM2", "UseAllAvailableCores", true);
        config.use_low_memory = ini_get_bool(&sections, "ASM2", "UseLowMemory", false);
        config.no_battle_eye = ini_get_bool(&sections, "ASM2", "NoBattlEye", false);

        // MOTD
        config.motd = ini_get_str(&sections, "MessageOfTheDay", "Message", "");
        config.motd_duration = ini_get_u32(&sections, "MessageOfTheDay", "Duration", 20);

        // MaxPlayers also in GameSession
        if let Some(mp) = ini_get(&sections, "/Script/Engine.GameSession", "MaxPlayers") {
            if let Ok(v) = mp.parse::<u32>() {
                config.max_players = v;
            }
        }
    }

    // Parse Game.ini for breeding settings
    if game_ini_path.exists() {
        let content = std::fs::read_to_string(&game_ini_path)
            .map_err(|e| format!("Failed to read Game.ini: {}", e))?;
        let sections = parse_ini(&content);
        let sgm = "/Script/ShooterGame.ShooterGameMode";

        config.egg_hatch_speed_multiplier =
            ini_get_f64(&sections, sgm, "EggHatchSpeedMultiplier", 1.0);
        config.baby_mature_speed_multiplier =
            ini_get_f64(&sections, sgm, "BabyMatureSpeedMultiplier", 1.0);
        config.baby_cuddle_interval_multiplier =
            ini_get_f64(&sections, sgm, "BabyCuddleIntervalMultiplier", 1.0);
        config.baby_imprint_amount_multiplier =
            ini_get_f64(&sections, sgm, "BabyImprintAmountMultiplier", 1.0);
        config.mating_interval_multiplier =
            ini_get_f64(&sections, sgm, "MatingIntervalMultiplier", 1.0);
        config.baby_food_consumption_speed_multiplier =
            ini_get_f64(&sections, sgm, "BabyFoodConsumptionSpeedMultiplier", 1.0);
        config.baby_cuddle_grace_period_multiplier =
            ini_get_f64(&sections, sgm, "BabyCuddleGracePeriodMultiplier", 1.0);
        config.baby_cuddle_lose_imprint_quality_speed_multiplier = ini_get_f64(
            &sections,
            sgm,
            "BabyCuddleLoseImprintQualitySpeedMultiplier",
            1.0,
        );

        config.override_named_engram_entries =
            ini_get_str(&sections, sgm, "OverrideNamedEngramEntries", "");
        config.config_override_item_crafting_costs =
            ini_get_str(&sections, sgm, "ConfigOverrideItemCraftingCosts", "");

        config.mutagen_level_boost = ini_get_u32(&sections, sgm, "MutagenLevelBoost", 5);
        config.mutagen_level_boost_bred = ini_get_u32(&sections, sgm, "MutagenLevelBoostBred", 1);
        config.max_imprint_limit = ini_get_f64(&sections, sgm, "MaxImprintLimit", 1.0);
        config.b_disable_friendly_fire =
            ini_get_bool(&sections, sgm, "bDisableFriendlyFire", false);
    }

    Ok(config)
}

#[tauri::command]
pub async fn write_ase_config(
    server_id: i64,
    config: AseGameConfig,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let install_path: String = conn
        .query_row(
            "SELECT install_path FROM ase_servers WHERE id = ?1",
            [server_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Server not found: {}", e))?;

    let config_dir = get_config_path(&install_path);

    // Create config directory if it doesn't exist
    if !config_dir.exists() {
        std::fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    let gus_path = config_dir.join("GameUserSettings.ini");
    let gus_data = if gus_path.exists() {
        let content = std::fs::read_to_string(&gus_path)
            .map_err(|e| format!("Failed to read GameUserSettings.ini: {}", e))?;
        IniData::parse(&content)
    } else {
        IniData::new()
    };

    let ss = "ServerSettings";
    let gus_cell = std::cell::RefCell::new(gus_data);

    // Helper to set values
    let ini_set = |sec: &str, key: &str, val: String| {
        let mut gus = gus_cell.borrow_mut();
        let section = gus.ensure_section(sec);
        if let Some(entry) = section.entries.iter_mut().find(|e| e.key == key) {
            entry.value = val;
        } else {
            section.entries.push(IniEntry {
                key: key.to_string(),
                value: val,
                comment: None,
            });
        }
    };

    let ini_set_opt = |sec: &str, key: &str, val: String| {
        let mut gus = gus_cell.borrow_mut();
        if val.is_empty() {
            let section = gus.ensure_section(sec);
            if let Some(pos) = section.entries.iter().position(|e| e.key == key) {
                section.entries.remove(pos);
            }
        } else {
            let section = gus.ensure_section(sec);
            if let Some(entry) = section.entries.iter_mut().find(|e| e.key == key) {
                entry.value = val;
            } else {
                section.entries.push(IniEntry {
                    key: key.to_string(),
                    value: val,
                    comment: None,
                });
            }
        }
    };

    // Identity
    ini_set(ss, "SessionName", config.session_name.clone());
    ini_set(ss, "ServerPassword", config.server_password.clone());
    ini_set(
        ss,
        "ServerAdminPassword",
        config.server_admin_password.clone(),
    );
    ini_set(ss, "MaxPlayers", config.max_players.to_string());

    // Difficulty
    ini_set(
        ss,
        "DifficultyOffset",
        format!("{:.6}", config.difficulty_offset),
    );
    ini_set(
        ss,
        "OverrideOfficialDifficulty",
        format!("{:.6}", config.override_official_difficulty),
    );

    // Core Rates
    ini_set(ss, "XPMultiplier", format!("{:.6}", config.xp_multiplier));
    ini_set(
        ss,
        "TamingSpeedMultiplier",
        format!("{:.6}", config.taming_speed_multiplier),
    );
    ini_set(
        ss,
        "HarvestAmountMultiplier",
        format!("{:.6}", config.harvest_amount_multiplier),
    );
    ini_set(
        ss,
        "HarvestHealthMultiplier",
        format!("{:.6}", config.harvest_health_multiplier),
    );
    ini_set(
        ss,
        "ResourcesRespawnPeriodMultiplier",
        format!("{:.6}", config.resources_respawn_period_multiplier),
    );
    ini_set(
        ss,
        "ItemStackSizeMultiplier",
        format!("{:.6}", config.item_stack_size_multiplier),
    );

    // Player Stats
    ini_set(
        ss,
        "PlayerCharacterFoodDrainMultiplier",
        format!("{:.6}", config.player_character_food_drain_multiplier),
    );
    ini_set(
        ss,
        "PlayerCharacterWaterDrainMultiplier",
        format!("{:.6}", config.player_character_water_drain_multiplier),
    );
    ini_set(
        ss,
        "PlayerCharacterStaminaDrainMultiplier",
        format!("{:.6}", config.player_character_stamina_drain_multiplier),
    );
    ini_set(
        ss,
        "PlayerCharacterHealthRecoveryMultiplier",
        format!("{:.6}", config.player_character_health_recovery_multiplier),
    );
    ini_set(
        ss,
        "PlayerDamageMultiplier",
        format!("{:.6}", config.player_damage_multiplier),
    );
    ini_set(
        ss,
        "PlayerResistanceMultiplier",
        format!("{:.6}", config.player_resistance_multiplier),
    );

    // Dino Stats
    ini_set(
        ss,
        "DinoCharacterFoodDrainMultiplier",
        format!("{:.6}", config.dino_character_food_drain_multiplier),
    );
    ini_set(
        ss,
        "DinoCharacterHealthRecoveryMultiplier",
        format!("{:.6}", config.dino_character_health_recovery_multiplier),
    );
    ini_set(
        ss,
        "DinoDamageMultiplier",
        format!("{:.6}", config.dino_damage_multiplier),
    );
    ini_set(
        ss,
        "DinoResistanceMultiplier",
        format!("{:.6}", config.dino_resistance_multiplier),
    );
    ini_set(ss, "MaxTamedDinos", config.max_tamed_dinos.to_string());
    ini_set(
        ss,
        "DinoCountMultiplier",
        format!("{:.6}", config.dino_count_multiplier),
    );
    ini_set(
        ss,
        "WildDinoTorporDrainMultiplier",
        format!("{:.6}", config.wild_dino_torpor_drain_multiplier),
    );
    ini_set(
        ss,
        "TamedDinoTorporDrainMultiplier",
        format!("{:.6}", config.tamed_dino_torpor_drain_multiplier),
    );
    ini_set(
        ss,
        "PassiveTameIntervalMultiplier",
        format!("{:.6}", config.passive_tame_interval_multiplier),
    );
    ini_set(
        ss,
        "UseSingleplayerSettings",
        config.use_singleplayer_settings.to_string(),
    );
    ini_set(
        ss,
        "DisableDinoBreeding",
        config.disable_dino_breeding.to_string(),
    );
    ini_set(
        ss,
        "AllowUnclaimDinos",
        config.allow_unclaim_dinos.to_string(),
    );
    ini_set(
        ss,
        "UseDinoLevelUpAnimations",
        config.use_dino_level_up_animations.to_string(),
    );
    ini_set(
        ss,
        "MaxPersonalTamedDinos",
        config.max_personal_tamed_dinos.to_string(),
    );
    ini_set(
        ss,
        "PersonalTamedDinosSaddleStructureCost",
        format!("{:.6}", config.personal_tamed_dinos_saddle_structure_cost),
    );

    // Structures
    ini_set(
        ss,
        "TheMaxStructuresInRange",
        config.the_max_structures_in_range.to_string(),
    );
    ini_set(
        ss,
        "StructureDamageMultiplier",
        format!("{:.6}", config.structure_damage_multiplier),
    );
    ini_set(
        ss,
        "StructureResistanceMultiplier",
        format!("{:.6}", config.structure_resistance_multiplier),
    );
    ini_set(
        ss,
        "PerPlatformMaxStructuresMultiplier",
        format!("{:.6}", config.per_platform_max_structures_multiplier),
    );
    ini_set(
        ss,
        "AutoDestroyDecayedDinos",
        config.auto_destroy_decayed_dinos.to_string(),
    );
    ini_set(
        ss,
        "DisableStructureDecayPvE",
        config.disable_structure_decay_pve.to_string(),
    );
    ini_set(
        ss,
        "PvEAllowStructuresAtSupplyDrops",
        config.pve_allow_structures_at_supply_drops.to_string(),
    );
    ini_set(
        ss,
        "ForceAllStructureLocking",
        config.force_all_structure_locking.to_string(),
    );
    ini_set(
        ss,
        "AutoDestroyOldStructuresMultiplier",
        format!("{:.6}", config.auto_destroy_old_structures_multiplier),
    );
    ini_set(
        ss,
        "StructurePickupTimeAfterPlacement",
        format!("{:.6}", config.structure_pickup_time_after_placement),
    );
    ini_set(
        ss,
        "StructurePickupHoldDuration",
        format!("{:.6}", config.structure_pickup_hold_duration),
    );
    ini_set(
        ss,
        "AllowIntegratedSPlusStructures",
        config.allow_integrated_spinet_attachment.to_string(),
    );
    ini_set(
        ss,
        "IgnoreLimitMaxStructuresInRangeTypeFlag",
        config
            .ignore_limit_max_structures_in_range_type_flag
            .to_string(),
    );
    ini_set(
        ss,
        "IgnoreStructuresPreventionVolumes",
        config.ignore_structures_prevention_volumes.to_string(),
    );

    // PvP Rules
    ini_set(ss, "ServerPVE", config.server_pve.to_string());
    ini_set(
        ss,
        "AllowCaveBuildingPvP",
        config.allow_cave_building_pvp.to_string(),
    );
    ini_set(
        ss,
        "DisableRailgunPVP",
        config.disable_railgun_pvp.to_string(),
    );
    ini_set(ss, "EnablePvPGamma", config.enable_pvp_gamma.to_string());
    ini_set(
        ss,
        "PvPStructureDecay",
        config.pvp_structure_decay.to_string(),
    );
    ini_set(ss, "PvPDinoDecay", config.pvp_dino_decay.to_string());
    ini_set(
        ss,
        "GlobalPoweredBatteryDurabilityDecreasePerSecond",
        format!(
            "{:.6}",
            config.global_powered_battery_durability_decrease_per_second
        ),
    );

    // Player Rules
    ini_set(
        ss,
        "AllowThirdPersonPlayer",
        config.allow_third_person_player.to_string(),
    );
    ini_set(ss, "ServerCrosshair", config.server_crosshair.to_string());
    ini_set(
        ss,
        "ShowMapPlayerLocation",
        config.show_map_player_location.to_string(),
    );
    ini_set(
        ss,
        "AllowFlyerCarryPvE",
        config.allow_flyer_carry_pve.to_string(),
    );
    ini_set(
        ss,
        "DisableWeatherFog",
        config.disable_weather_fog.to_string(),
    );
    ini_set(
        ss,
        "AllowAnyoneBabyImprintCuddle",
        config.allow_anyone_baby_imprint_cuddle.to_string(),
    );
    ini_set(ss, "AllowHitMarkers", config.allow_hit_markers.to_string());
    ini_set(
        ss,
        "EnableExtraStructurePreventionVolumes",
        config.enable_extra_structure_prevention_volumes.to_string(),
    );
    ini_set(
        ss,
        "ShowFloatingDamageText",
        config.show_floating_damage_text.to_string(),
    );
    ini_set(
        ss,
        "ForceFlyerExplosives",
        config.force_flyerexplosives.to_string(),
    );

    // Tribe Settings
    ini_set(
        ss,
        "PreventTribeAlliances",
        config.prevent_tribe_alliances.to_string(),
    );
    ini_set(
        ss,
        "AllowTribeAlliance",
        config.allow_tribe_alliance.to_string(),
    );
    ini_set(
        ss,
        "AllowTribeWarfare",
        config.allow_tribe_warfare.to_string(),
    );
    ini_set(ss, "MaxTribeLogs", config.max_tribe_logs.to_string());
    ini_set(
        ss,
        "MaxNumberOfPlayersInTribe",
        config.max_number_of_players_in_tribe.to_string(),
    );

    // Tribute / Transfer
    ini_set(ss, "MaxTributeDinos", config.max_tribute_dinos.to_string());
    ini_set(ss, "MaxTributeItems", config.max_tribute_items.to_string());
    ini_set(
        ss,
        "NoTributeDownloads",
        config.no_tribute_downloads.to_string(),
    );
    ini_set(
        ss,
        "PreventDownloadSurvivors",
        config.prevent_download_survivors.to_string(),
    );
    ini_set(
        ss,
        "PreventDownloadItems",
        config.prevent_download_items.to_string(),
    );
    ini_set(
        ss,
        "PreventDownloadDinos",
        config.prevent_download_dinos.to_string(),
    );
    ini_set(
        ss,
        "PreventUploadSurvivors",
        config.prevent_upload_survivors.to_string(),
    );
    ini_set(
        ss,
        "PreventUploadItems",
        config.prevent_upload_items.to_string(),
    );
    ini_set(
        ss,
        "PreventUploadDinos",
        config.prevent_upload_dinos.to_string(),
    );
    ini_set(
        ss,
        "DisableCustomFoldersInTributeInventories",
        config
            .disable_custom_folders_in_tribute_inventories
            .to_string(),
    );
    ini_set(
        ss,
        "CrossARKAllowForeignDinoDownloads",
        config.crossark_allow_foreign_dino_downloads.to_string(),
    );

    // Environment
    ini_set(
        ss,
        "DayCycleSpeedScale",
        format!("{:.6}", config.day_cycle_speed_scale),
    );
    ini_set(
        ss,
        "DayTimeSpeedScale",
        format!("{:.6}", config.day_time_speed_scale),
    );
    ini_set(
        ss,
        "NightTimeSpeedScale",
        format!("{:.6}", config.night_time_speed_scale),
    );
    ini_set(
        ss,
        "SpoilingTimeMultiplier",
        format!("{:.6}", config.spoiling_time_multiplier),
    );
    ini_set(
        ss,
        "ItemDecompositionTimeMultiplier",
        format!("{:.6}", config.item_decomposition_time_multiplier),
    );
    ini_set(
        ss,
        "CorpseDecompositionTimeMultiplier",
        format!("{:.6}", config.corpse_decomposition_time_multiplier),
    );
    ini_set(
        ss,
        "CropGrowthSpeedMultiplier",
        format!("{:.6}", config.crop_growth_speed_multiplier),
    );
    ini_set(
        ss,
        "CropDecaySpeedMultiplier",
        format!("{:.6}", config.crop_decay_speed_multiplier),
    );
    ini_set(
        ss,
        "LayEggIntervalMultiplier",
        format!("{:.6}", config.lay_egg_interval_multiplier),
    );
    ini_set(
        ss,
        "PoopIntervalMultiplier",
        format!("{:.6}", config.poop_interval_multiplier),
    );
    ini_set(
        ss,
        "HairGrowthSpeedMultiplier",
        format!("{:.6}", config.hair_growth_speed_multiplier),
    );
    ini_set(
        ss,
        "CustomRecipeEffectivenessMultiplier",
        format!("{:.6}", config.custom_recipe_effectiveness_multiplier),
    );
    ini_set(
        ss,
        "CustomRecipeSkillMultiplier",
        format!("{:.6}", config.custom_recipe_skill_multiplier),
    );
    ini_set(
        ss,
        "FishingLootQualityMultiplier",
        format!("{:.6}", config.fishing_loot_quality_multiplier),
    );
    ini_set(
        ss,
        "SupplyCrateLootQualityMultiplier",
        format!("{:.6}", config.supply_crate_loot_quality_multiplier),
    );
    ini_set(
        ss,
        "GlobalSpoilingTimeMultiplier",
        format!("{:.6}", config.global_spoiling_time_multiplier),
    );
    ini_set(
        ss,
        "GlobalItemDecompositionTimeMultiplier",
        format!("{:.6}", config.global_item_decomposition_time_multiplier),
    );
    ini_set(
        ss,
        "GlobalCorpseDecompositionTimeMultiplier",
        format!("{:.6}", config.global_corpse_decomposition_time_multiplier),
    );
    ini_set(
        ss,
        "KillXPMultiplier",
        format!("{:.6}", config.kill_xp_multiplier),
    );
    ini_set(
        ss,
        "HarvestXPMultiplier",
        format!("{:.6}", config.harvest_xp_multiplier),
    );
    ini_set(
        ss,
        "CraftXPMultiplier",
        format!("{:.6}", config.craft_xp_multiplier),
    );
    ini_set(
        ss,
        "GenericXPMultiplier",
        format!("{:.6}", config.generic_xp_multiplier),
    );
    ini_set(
        ss,
        "SpecialXPMultiplier",
        format!("{:.6}", config.special_xp_multiplier),
    );

    // Hexagons
    ini_set(
        ss,
        "MaxHexagonsPerCharacter",
        format!("{:.6}", config.max_hexagons_per_character),
    );
    ini_set(
        ss,
        "HexagonRewardMultiplier",
        format!("{:.6}", config.hexagon_reward_multiplier),
    );

    // Engrams
    ini_set(
        ss,
        "AutoUnlockAllEngrams",
        config.auto_unlock_all_engrams.to_string(),
    );
    ini_set(
        ss,
        "OnlyAllowSpecifiedEngrams",
        config.only_allow_specified_engrams.to_string(),
    );

    // Network / Admin
    ini_set(ss, "RCONEnabled", config.rcon_enabled.to_string());
    ini_set(ss, "RCONPort", config.rcon_port.to_string());
    ini_set(
        ss,
        "BattlEyeEnforcer",
        config.battle_eye_enforcer.to_string(),
    );
    ini_set(
        ss,
        "EnableCreativeMode",
        config.enable_creative_mode.to_string(),
    );
    ini_set(
        ss,
        "ServerForceNoHUD",
        config.server_force_no_hud.to_string(),
    );
    ini_set(
        ss,
        "KickIdlePlayerPeriod",
        format!("{:.6}", config.kick_idle_player_period),
    );
    ini_set(
        ss,
        "DestroyTamesOverLevelClamp",
        config.destroy_tames_over_level_clamp.to_string(),
    );

    // Mods
    ini_set_opt(ss, "ActiveMods", config.active_mods.clone());

    // Auto-save
    ini_set(
        ss,
        "AutoSavePeriodMinutes",
        format!("{:.6}", config.auto_save_period_minutes),
    );

    // Events
    ini_set_opt(ss, "ActiveEvent", config.active_event.clone());
    ini_set(
        ss,
        "EventColorsChanceOverride",
        format!("{:.6}", config.event_colors_chance_override),
    );

    // Administration
    ini_set_opt(ss, "BadWordFilter", config.bad_word_filter.clone());
    ini_set_opt(ss, "AdminList", config.admin_list.clone());
    ini_set_opt(
        ss,
        "CustomDynamicConfigUrl",
        config.custom_dynamic_config_url.clone(),
    );
    ini_set_opt(
        ss,
        "CustomLiveTuningUrl",
        config.custom_live_tuning_url.clone(),
    );
    ini_set(
        ss,
        "UseSecureSpawnRules",
        config.use_secure_spawn_rules.to_string(),
    );
    ini_set(
        ss,
        "UseItemDupeCheck",
        config.use_item_dupe_check.to_string(),
    );
    ini_set(
        ss,
        "SecureSendARKPayload",
        config.secure_send_ark_payload.to_string(),
    );
    ini_set_opt(ss, "Culture", config.culture.clone());

    // Ragnarok
    ini_set(
        ss,
        "RagnarokVolcanoIntensity",
        format!("{:.6}", config.ragnarok_volcano_intensity),
    );
    ini_set(
        ss,
        "RagnarokVolcanoInterval",
        format!("{:.6}", config.ragnarok_volcano_interval),
    );
    ini_set(
        ss,
        "EnableRagnarokSettings",
        config.enable_ragnarok_settings.to_string(),
    );

    // Fjordur
    ini_set(
        ss,
        "UseFjordurTraversalBuff",
        config.use_fjordur_traversal_buff.to_string(),
    );
    ini_set(
        ss,
        "EnableFjordurSettings",
        config.enable_fjordur_settings.to_string(),
    );

    // Adjustable Spawner
    ini_set(
        ss,
        "AdjustableMutagenSpawnDelayMultiplier",
        format!("{:.6}", config.adjustable_mutagen_spawn_delay_multiplier),
    );

    // ── 23 Advanced GUS settings keys ──
    ini_set(ss, "GlobalVoiceChat", config.global_voice_chat.to_string());
    ini_set(
        ss,
        "ProximityVoiceChat",
        config.proximity_voice_chat.to_string(),
    );
    ini_set(
        ss,
        "AlwaysNotifyPlayerJoined",
        config.always_notify_player_joined.to_string(),
    );
    ini_set(
        ss,
        "AlwaysNotifyPlayerLeft",
        config.always_notify_player_left.to_string(),
    );
    ini_set(
        ss,
        "ServerAdminCommandLogging",
        config.server_admin_command_logging.to_string(),
    );

    ini_set(
        ss,
        "NonPermanentDiseases",
        config.non_permanent_diseases.to_string(),
    );
    ini_set(ss, "PreventDiseases", config.prevent_diseases.to_string());
    ini_set(
        ss,
        "AllowCryoCooldownOnPvE",
        config.allow_cryo_cooldown_on_pve.to_string(),
    );
    ini_set(
        ss,
        "DisableCryopodEnemyCheck",
        config.disable_cryopod_enemy_check.to_string(),
    );
    ini_set(
        ss,
        "PVPZoneStructureDamageMultiplier",
        format!("{:.6}", config.pvp_zone_structure_damage_multiplier),
    );
    ini_set(
        ss,
        "StructureDamageRepairCooldown",
        format!("{:.6}", config.structure_damage_repair_cooldown),
    );

    ini_set(
        ss,
        "ClampResourceHarvestDamage",
        config.clamp_resource_harvest_damage.to_string(),
    );
    ini_set(
        ss,
        "OptimizedHarvestingHealth",
        config.optimized_harvesting_health.to_string(),
    );
    ini_set(
        ss,
        "TamedDinoHarvestingDamageMultiplier",
        format!("{:.6}", config.tamed_dino_harvesting_damage_multiplier),
    );
    ini_set(
        ss,
        "DinoTurretDamageMultiplier",
        format!("{:.6}", config.dino_turret_damage_multiplier),
    );
    ini_set(
        ss,
        "TamedDinoCharacterFoodDrainMultiplier",
        format!("{:.6}", config.tamed_dino_character_food_drain_multiplier),
    );
    ini_set(
        ss,
        "WildDinoCharacterFoodDrainMultiplier",
        format!("{:.6}", config.wild_dino_character_food_drain_multiplier),
    );

    ini_set(
        ss,
        "StructureDecayPeriodMultiplier",
        format!("{:.6}", config.structure_decay_period_multiplier),
    );
    ini_set(
        ss,
        "PvEDinoDecayPeriodMultiplier",
        format!("{:.6}", config.pve_dino_decay_period_multiplier),
    );
    ini_set(
        ss,
        "FastDecayUnsnappedCoreStructures",
        config.fast_decay_unsnapped_core_structures.to_string(),
    );
    ini_set(
        ss,
        "bAllowPlatformSaddleMultiFloors",
        config.b_allow_platform_saddle_multi_floors.to_string(),
    );

    ini_set(
        ss,
        "AllowFlyingStaminaRecovery",
        config.allow_flying_stamina_recovery.to_string(),
    );
    ini_set(
        ss,
        "FlyerPlatformMaxStructuresMultiplier",
        format!("{:.6}", config.flyer_platform_max_structures_multiplier),
    );

    // Session settings
    ini_set(
        "SessionSettings",
        "SessionName",
        config.session_name.clone(),
    );

    // Game session (max players)
    ini_set(
        "/Script/Engine.GameSession",
        "MaxPlayers",
        config.max_players.to_string(),
    );

    // MOTD
    if !config.motd.is_empty() {
        ini_set("MessageOfTheDay", "Message", config.motd.clone());
        ini_set(
            "MessageOfTheDay",
            "Duration",
            config.motd_duration.to_string(),
        );
    } else {
        // Clear MOTD section entries if empty
        let mut gus = gus_cell.borrow_mut();
        let section = gus.ensure_section("MessageOfTheDay");
        section.entries.clear();
    }

    // Custom section for launcher args
    ini_set_opt("ASM2", "LauncherArgs", config.launcher_args.clone());
    ini_set(
        "ASM2",
        "UseAllAvailableCores",
        config.use_all_available_cores.to_string(),
    );
    ini_set("ASM2", "UseLowMemory", config.use_low_memory.to_string());
    ini_set("ASM2", "NoBattlEye", config.no_battle_eye.to_string());

    // Save GameUserSettings.ini
    let gus_content = gus_cell.into_inner().serialize();
    std::fs::write(config_dir.join("GameUserSettings.ini"), gus_content)
        .map_err(|e| format!("Failed to write GameUserSettings.ini: {}", e))?;

    // Now write Game.ini
    let game_ini_path = config_dir.join("Game.ini");
    let mut game_data = if game_ini_path.exists() {
        let content = std::fs::read_to_string(&game_ini_path)
            .map_err(|e| format!("Failed to read Game.ini: {}", e))?;
        IniData::parse(&content)
    } else {
        IniData::new()
    };

    let gm = "/Script/ShooterGame.ShooterGameMode";

    let mut game_set = |key: &str, val: String| {
        let section = game_data.ensure_section(gm);
        if let Some(entry) = section.entries.iter_mut().find(|e| e.key == key) {
            entry.value = val;
        } else {
            section.entries.push(IniEntry {
                key: key.to_string(),
                value: val,
                comment: None,
            });
        }
    };

    // Breeding
    game_set(
        "EggHatchSpeedMultiplier",
        format!("{:.6}", config.egg_hatch_speed_multiplier),
    );
    game_set(
        "BabyMatureSpeedMultiplier",
        format!("{:.6}", config.baby_mature_speed_multiplier),
    );
    game_set(
        "BabyCuddleIntervalMultiplier",
        format!("{:.6}", config.baby_cuddle_interval_multiplier),
    );
    game_set(
        "BabyImprintAmountMultiplier",
        format!("{:.6}", config.baby_imprint_amount_multiplier),
    );
    game_set(
        "MatingIntervalMultiplier",
        format!("{:.6}", config.mating_interval_multiplier),
    );
    game_set(
        "BabyFoodConsumptionSpeedMultiplier",
        format!("{:.6}", config.baby_food_consumption_speed_multiplier),
    );
    game_set(
        "BabyCuddleGracePeriodMultiplier",
        format!("{:.6}", config.baby_cuddle_grace_period_multiplier),
    );
    game_set(
        "BabyCuddleLoseImprintQualitySpeedMultiplier",
        format!(
            "{:.6}",
            config.baby_cuddle_lose_imprint_quality_speed_multiplier
        ),
    );
    game_set("MutagenLevelBoost", config.mutagen_level_boost.to_string());
    game_set(
        "MutagenLevelBoostBred",
        config.mutagen_level_boost_bred.to_string(),
    );
    game_set(
        "MaxImprintLimit",
        format!("{:.6}", config.max_imprint_limit),
    );

    // Friendly fire PvP rule (New key in Game.ini)
    game_set(
        "bDisableFriendlyFire",
        config.b_disable_friendly_fire.to_string(),
    );

    // Save Game.ini
    let game_content = game_data.serialize();
    std::fs::write(&game_ini_path, game_content)
        .map_err(|e| format!("Failed to write Game.ini: {}", e))?;

    // Sync values back to database to maintain integrity
    conn.execute(
        "UPDATE ase_servers SET 
            session_name = ?1,
            max_players = ?2,
            server_password = ?3,
            admin_password = ?4,
            rcon_port = ?5,
            active_mods = ?6,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?7",
        rusqlite::params![
            config.session_name,
            config.max_players,
            config.server_password,
            config.server_admin_password,
            config.rcon_port,
            config.active_mods,
            server_id
        ],
    )
    .map_err(|e| format!("Failed to sync config to database: {}", e))?;

    Ok(())
}
