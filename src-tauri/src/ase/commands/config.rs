use crate::ase::ini_parser::{IniDocument, IniLine};
use crate::ase::models::AseGameConfig;
use crate::AppState;
use std::path::PathBuf;
use tauri::State;

fn is_array_key(key: &str) -> bool {
    let kl = key.to_lowercase();
    kl == "levelexperiencerampoverrides"
        || kl == "harvestresourceitemamountclassmultipliers"
        || kl == "dinospawnweightmultipliers"
        || kl == "dinoclassdamagemultipliers"
        || kl == "dinoclassresistancemultipliers"
        || kl == "tameddinoclassdamagemultipliers"
        || kl == "tameddinoclassresistancemultipliers"
        || kl == "npcreplacements"
        || kl == "preventdinotameclassnames"
        || kl == "excludedinoclasses"
        || kl == "overridenamedengramentries"
        || kl == "configoverrideitemcraftingcosts"
        || kl == "configaddnpcspawnentriescontainer"
        || kl == "configsubtractnpcspawnentriescontainer"
        || kl == "configoverridenpcspawnentriescontainer"
        || kl == "configoverridesupplycrateitems"
}

/// Get a value from parsed INI document (case-insensitive and resilient to /Script/ prefixing)
fn ini_get(doc: &IniDocument, section: &str, key: &str) -> Option<String> {
    let section_lower = section.to_lowercase();
    let key_lower = key.to_lowercase();

    let clean_sec = |s: &str| -> String {
        s.to_lowercase()
            .trim_start_matches('/')
            .split('.')
            .last()
            .unwrap_or("")
            .to_string()
    };

    let target_clean = clean_sec(&section_lower);

    let mut in_target_section = false;
    let mut matches = Vec::new();
    let mut i = 0;

    while i < doc.lines.len() {
        match &doc.lines[i] {
            IniLine::SectionHeader { name, .. } => {
                let current_section_clean = clean_sec(name);
                in_target_section = name.to_lowercase() == section_lower || current_section_clean == target_clean;
            }
            IniLine::Entry { key: k, value: v, .. } if in_target_section => {
                if k.to_lowercase() == key_lower {
                    // Collect continuation lines
                    let mut full_value = v.clone();
                    let mut j = i + 1;
                    while j < doc.lines.len() {
                        if let IniLine::Continuation(cont) = &doc.lines[j] {
                            full_value.push('\n');
                            full_value.push_str(cont);
                            j += 1;
                        } else {
                            break;
                        }
                    }
                    matches.push(full_value);
                }
            }
            _ => {}
        }
        i += 1;
    }

    if matches.is_empty() {
        None
    } else {
        if is_array_key(key) {
            Some(matches.join("\n"))
        } else {
            matches.pop()
        }
    }
}

fn ini_get_f64(
    doc: &IniDocument,
    section: &str,
    key: &str,
    default: f64,
) -> f64 {
    ini_get(doc, section, key)
        .and_then(|v| {
            let last_line = v.lines().last().unwrap_or("");
            last_line.parse::<f64>().ok()
        })
        .unwrap_or(default)
}

fn ini_get_u32(
    doc: &IniDocument,
    section: &str,
    key: &str,
    default: u32,
) -> u32 {
    ini_get(doc, section, key)
        .and_then(|v| {
            let last_line = v.lines().last().unwrap_or("");
            last_line.parse::<u32>().ok()
        })
        .unwrap_or(default)
}

fn ini_get_u16(
    doc: &IniDocument,
    section: &str,
    key: &str,
    default: u16,
) -> u16 {
    ini_get(doc, section, key)
        .and_then(|v| {
            let last_line = v.lines().last().unwrap_or("");
            last_line.parse::<u16>().ok()
        })
        .unwrap_or(default)
}

fn ini_get_bool(
    doc: &IniDocument,
    section: &str,
    key: &str,
    default: bool,
) -> bool {
    ini_get(doc, section, key)
        .map(|v| {
            let last_line = v.lines().last().unwrap_or("");
            let lower = last_line.to_lowercase();
            lower == "true" || lower == "1"
        })
        .unwrap_or(default)
}

fn ini_get_str(
    doc: &IniDocument,
    section: &str,
    key: &str,
    default: &str,
) -> String {
    ini_get(doc, section, key)
        .map(|v| {
            if is_array_key(key) {
                v
            } else {
                v.lines().last().unwrap_or("").to_string()
            }
        })
        .unwrap_or_else(|| default.to_string())
}


/// Get ASE config directory path, optionally using a user-specified override folder.
fn get_config_path(install_path: &str, user_config_folder: Option<&str>) -> PathBuf {
    if let Some(folder) = user_config_folder {
        let user_dir = PathBuf::from(folder);
        // Check if INI files exist directly in the user folder
        if user_dir.join("GameUserSettings.ini").exists() || user_dir.join("Game.ini").exists() {
            return user_dir;
        }
        // Also check mirrored sub-directory structure
        let sub_path = user_dir
            .join("ShooterGame")
            .join("Saved")
            .join("Config")
            .join("WindowsServer");
        if sub_path.exists() {
            return sub_path;
        }
        println!("  ℹ️ ASE config files not found in user folder '{}', using server install path", folder);
    }
    PathBuf::from(install_path)
        .join("ShooterGame")
        .join("Saved")
        .join("Config")
        .join("WindowsServer")
}

pub async fn read_ase_config_internal(
    server_id: i64,
    state: &AppState,
) -> Result<AseGameConfig, String> {
    let (install_path, user_folder) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let install_path: String = conn
            .query_row(
                "SELECT install_path FROM ase_servers WHERE id = ?1",
                [server_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Server not found: {}", e))?;

        // Read user config folder override directly from connection to avoid deadlocking db.conn
        let user_folder_raw: String = conn.query_row(
            "SELECT value FROM settings WHERE key = 'ase_user_config_folder'",
            [],
            |row| row.get(0)
        ).unwrap_or_default();
        let user_folder = if !user_folder_raw.is_empty() {
            let p = PathBuf::from(&user_folder_raw);
            if p.exists() && p.is_dir() { Some(user_folder_raw) } else { None }
        } else { None };

        (install_path, user_folder)
    };

    let config_dir = get_config_path(&install_path, user_folder.as_deref());
    let gus_path = config_dir.join("GameUserSettings.ini");
    let game_ini_path = config_dir.join("Game.ini");

    let mut config = AseGameConfig::default();

    // Parse GameUserSettings.ini
    if gus_path.exists() {
        let content = std::fs::read_to_string(&gus_path)
            .map_err(|e| format!("Failed to read GameUserSettings.ini: {}", e))?;
        let sections = IniDocument::parse(&content);
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
        config.player_harvesting_damage_multiplier =
            ini_get_f64(&sections, ss, "PlayerHarvestingDamageMultiplier", 1.0);
        config.crafting_skill_bonus_multiplier =
            ini_get_f64(&sections, ss, "CraftingSkillBonusMultiplier", 1.0);

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
        config.rcon_server_log_buffer = ini_get_u32(&sections, ss, "RCONServerLogBuffer", 600);
        config.max_difficulty = ini_get_bool(&sections, ss, "MaxDifficulty", false);
        config.prevent_offline_pvp = ini_get_bool(&sections, ss, "PreventOfflinePvP", false);
        config.prevent_offline_pvp_interval = ini_get_u32(&sections, ss, "PreventOfflinePvPInterval", 900);
        config.b_disable_structure_placement_collision = ini_get_bool(&sections, ss, "bDisableStructurePlacementCollision", false);
        config.b_use_corpse_locator = ini_get_bool(&sections, ss, "bUseCorpseLocator", true);
        config.b_show_status_types = ini_get_bool(&sections, ss, "bShowStatusTypes", true);
        config.b_allow_unlimited_respecs = ini_get_bool(&sections, ss, "bAllowUnlimitedRespecs", false);
        config.spectator_password = ini_get_str(&sections, ss, "SpectatorPassword", "");

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
        config.prevent_spawn_animations = ini_get_bool(&sections, ss, "PreventSpawnAnimations", false);
        config.allow_cryo_cooldown_on_pve =
            ini_get_bool(&sections, ss, "AllowCryoCooldownOnPvE", false);
        config.disable_cryopod_enemy_check =
            ini_get_bool(&sections, ss, "DisableCryopodEnemyCheck", false);
        config.enable_cryo_sickness_pvp =
            ini_get_bool(&sections, ss, "EnableCryoSicknessPVP", true);
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
        config.dino_character_stamina_drain_multiplier = ini_get_f64(&sections, ss, "DinoCharacterStaminaDrainMultiplier", 1.0);
        config.tamed_dino_damage_multiplier = ini_get_f64(&sections, ss, "TamedDinoDamageMultiplier", 1.0);
        config.tamed_dino_resistance_multiplier = ini_get_f64(&sections, ss, "TamedDinoResistanceMultiplier", 1.0);
        config.b_use_tame_limit_for_structures_only = ini_get_bool(&sections, ss, "bUseTameLimitForStructuresOnly", false);
        config.b_allow_raid_dino_feeding = ini_get_bool(&sections, ss, "bAllowRaidDinoFeeding", false);
        config.raid_dino_character_food_drain_multiplier = ini_get_f64(&sections, ss, "RaidDinoCharacterFoodDrainMultiplier", 1.0);
        config.force_allow_cave_flyers = ini_get_bool(&sections, ss, "ForceAllowCaveFlyers", false);
        config.disable_dino_decay_pve = ini_get_bool(&sections, ss, "DisableDinoDecayPvE", false);
        config.allow_dino_level_up_animation = ini_get_bool(&sections, ss, "AllowDinoLevelUpAnimation", true);
        config.b_allow_flying_stamina_recovery = ini_get_bool(&sections, ss, "bAllowFlyingStaminaRecovery", false);
        config.b_allow_multiple_attached_c4 = ini_get_bool(&sections, ss, "bAllowMultipleAttachedC4", false);
        config.disable_dino_decay_pvp = ini_get_bool(&sections, ss, "DisableDinoDecayPvP", false);
        config.b_allow_unclaim_dinos = ini_get_bool(&sections, ss, "bAllowUnclaimDinos", true);

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
        config.enable_automanaged_mods = ini_get_bool(&sections, "ASM2", "EnableAutomanagedMods", false);
        config.backup_quantity = ini_get_u32(&sections, "ASM2", "BackupQuantity", 20);
        config.new_save_game_format = ini_get_bool(&sections, "ASM2", "NewSaveGameFormat", false);
        config.use_store = ini_get_bool(&sections, "ASM2", "UseStore", false);
        config.backup_transfer_player_datas = ini_get_bool(&sections, "ASM2", "BackupTransferPlayerDatas", false);
        config.motd_interval_enabled = ini_get_bool(&sections, "ASM2", "MotdIntervalEnabled", false);
        config.motd_interval = ini_get_u32(&sections, "ASM2", "MotdInterval", 60);
        config.enable_extinction_event = ini_get_bool(&sections, "ASM2", "EnableExtinctionEvent", false);
        config.extinction_event_time_interval = ini_get_u32(&sections, "ASM2", "ExtinctionEventTimeInterval", 30);

        // MOTD
        config.motd = ini_get_str(&sections, "MessageOfTheDay", "Message", "");
        config.motd_duration = ini_get_u32(&sections, "MessageOfTheDay", "Duration", 20);

        // MaxPlayers also in GameSession
        if let Some(mp) = ini_get(&sections, "/Script/Engine.GameSession", "MaxPlayers") {
            if let Ok(v) = mp.parse::<u32>() {
                config.max_players = v;
            }
        }

        // ── Classic ASM Full Server Options Feature Integration ──
        config.bad_word_list_url = ini_get_str(&sections, ss, "BadWordListURL", "");
        config.bad_word_white_list_url = ini_get_str(&sections, ss, "BadWordWhiteListURL", "");
        config.b_filter_tribe_names = ini_get_bool(&sections, ss, "bFilterTribeNames", false);
        config.b_filter_character_names = ini_get_bool(&sections, ss, "bFilterCharacterNames", false);
        config.b_filter_chat = ini_get_bool(&sections, ss, "bFilterChat", false);
        config.ban_list_url = ini_get_str(&sections, ss, "BanListURL", "");
        config.use_ban_list_url = ini_get_bool(&sections, ss, "UseBanListURL", false) || !config.ban_list_url.is_empty();
        config.allow_shared_connections = ini_get_bool(&sections, ss, "AllowSharedConnections", false);
        config.creature_upload_issue_protection = ini_get_bool(&sections, ss, "SecureSendARKPayload", false);
        config.enable_auto_force_respawn_dinos = ini_get_bool(&sections, ss, "AutoForceRespawnDinos", false);
        config.auto_force_respawn_dinos_interval = ini_get_f64(&sections, ss, "AutoForceRespawnDinosInterval", 24.0);
        
        let kick_period = ini_get_f64(&sections, ss, "KickIdlePlayersPeriod", -1.0);
        if kick_period >= 0.0 {
            config.kick_idle_players_period = kick_period;
        } else {
            config.kick_idle_players_period = ini_get_f64(&sections, ss, "KickIdlePlayerPeriod", 3600.0);
        }
        config.enable_idle_timeout = ini_get_bool(&sections, "ASM2", "EnableIdleTimeout", false) || config.kick_idle_players_period > 0.0;
        config.secure_item_dino_spawning_rules = ini_get_bool(&sections, ss, "UseSecureSpawnRules", false);
        config.additional_dupe_protection = ini_get_bool(&sections, ss, "UseItemDupeCheck", false);

        config.use_dynamic_config_url = ini_get_bool(&sections, "ASM2", "UseDynamicConfigUrl", false) || !config.custom_dynamic_config_url.is_empty();
        config.use_custom_live_tuning_url = ini_get_bool(&sections, "ASM2", "UseCustomLiveTuningUrl", false) || !config.custom_live_tuning_url.is_empty();
        config.no_playervac = ini_get_bool(&sections, "ASM2", "NoPlayerVAC", false);
        config.enable_exclusive_join = ini_get_bool(&sections, "ASM2", "EnableExclusiveJoin", false);
        config.no_anti_speed_hack = ini_get_bool(&sections, "ASM2", "NoAntiSpeedHack", false);
        config.speed_hack_cpu_bias = ini_get_f64(&sections, "ASM2", "SpeedHackCpuBias", 1.0);
        config.disable_movement_validation = ini_get_bool(&sections, "ASM2", "DisableMovementValidation", false);
        config.output_server_log_to_console = ini_get_bool(&sections, ss, "OutputServerLogToConsole", false) || ini_get_bool(&sections, "ASM2", "OutputServerLogToConsole", false);
        config.no_hang_det = ini_get_bool(&sections, "ASM2", "NoHangDet", false);
        config.no_dinos = ini_get_bool(&sections, "ASM2", "NoDinos", false);
        config.no_under_mesh_checking = ini_get_bool(&sections, "ASM2", "NoUnderMeshChecking", false);
        config.no_under_mesh_killing = ini_get_bool(&sections, "ASM2", "NoUnderMeshKilling", false);
        config.enable_vivox = ini_get_bool(&sections, "ASM2", "EnableVivox", false);
        config.force_respawn_dinos_on_startup = ini_get_bool(&sections, "ASM2", "ForceRespawnDinosOnStartup", false);
        config.force_direct_x10 = ini_get_bool(&sections, "ASM2", "ForceDirectX10", false);
        config.force_shader_model4 = ini_get_bool(&sections, "ASM2", "ForceShaderModel4", false);
        config.force_low_memory = ini_get_bool(&sections, "ASM2", "ForceLowMemory", false);
        config.force_no_man_sky = ini_get_bool(&sections, "ASM2", "ForceNoManSky", false);
        config.use_no_memory_bias = ini_get_bool(&sections, "ASM2", "UseNoMemoryBias", false);
        config.stasis_keep_controllers = ini_get_bool(&sections, "ASM2", "StasisKeepControllers", false);
        config.server_allow_ansel = ini_get_bool(&sections, "ASM2", "ServerAllowAnsel", false);
        config.structure_memory_optimizations = ini_get_bool(&sections, "ASM2", "StructureMemoryOptimizations", false);
        config.structure_stasis_grid = ini_get_bool(&sections, "ASM2", "StructureStasisGrid", false);
        config.enable_crossplay = ini_get_bool(&sections, "ASM2", "EnableCrossplay", false);
        config.enable_public_ip_for_epic = ini_get_bool(&sections, "ASM2", "EnablePublicIpForEpic", false);
        config.epic_store_players_only = ini_get_bool(&sections, "ASM2", "EpicStorePlayersOnly", false);
        config.alternate_save_directory_name = ini_get_str(&sections, "ASM2", "AlternateSaveDirectoryName", "");
        config.cluster_directory_override = ini_get_str(&sections, "ASM2", "ClusterDirectoryOverride", "");
        config.use_cluster_directory_override = ini_get_bool(&sections, "ASM2", "UseClusterDirectoryOverride", false);
        config.server_language = ini_get_str(&sections, "ASM2", "ServerLanguage", "");
    }

    // Parse Game.ini for breeding settings
    if game_ini_path.exists() {
        let content = std::fs::read_to_string(&game_ini_path)
            .map_err(|e| format!("Failed to read Game.ini: {}", e))?;
        let sections = IniDocument::parse(&content);
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
        config.mutagen_level_boost_bred = ini_get(&sections, sgm, "MutagenLevelBoost_Bred")
            .or_else(|| ini_get(&sections, sgm, "MutagenLevelBoostBred"))
            .and_then(|v| v.parse::<u32>().ok())
            .unwrap_or(1);
        config.max_imprint_limit = ini_get_f64(&sections, sgm, "MaxImprintLimit", 1.0);
        config.b_disable_friendly_fire =
            ini_get_bool(&sections, sgm, "bDisableFriendlyFire", false);

        let raw_ramp = ini_get_str(&sections, sgm, "LevelExperienceRampOverrides", "");
        if !raw_ramp.is_empty() {
            config.level_experience_ramp_overrides = raw_ramp
                .split('\n')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect::<Vec<&str>>()
                .join("\n");
        }
        config.override_max_experience_points_player = ini_get_str(&sections, sgm, "OverrideMaxExperiencePointsPlayer", "");
        config.override_max_experience_points_dino = ini_get_str(&sections, sgm, "OverrideMaxExperiencePointsDino", "");

        // HarvestResourceItemAmountClassMultipliers — parse_ini joins duplicate keys with '\n'
        let raw_multipliers = ini_get_str(&sections, sgm, "HarvestResourceItemAmountClassMultipliers", "");
        if !raw_multipliers.is_empty() {
            config.harvest_resource_item_amount_class_multipliers = raw_multipliers
                .split('\n')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect::<Vec<&str>>()
                .join(";");
        }

        config.prevent_dino_mate_boost = ini_get_bool(&sections, sgm, "PreventDinoMateBoost", false);
        config.b_allow_flyer_speed_leveling = ini_get_bool(&sections, sgm, "bAllowFlyerSpeedLeveling", false);
        config.b_disable_dino_riding = ini_get_bool(&sections, sgm, "bDisableDinoRiding", false);
        config.b_disable_dino_taming = ini_get_bool(&sections, sgm, "bDisableDinoTaming", false);
        config.b_disable_dino_breeding = ini_get_bool(&sections, sgm, "bDisableDinoBreeding", false);

        let parse_array = |key: &str| -> Vec<String> {
            let raw = ini_get_str(&sections, sgm, key, "");
            if raw.is_empty() {
                Vec::new()
            } else {
                raw.split('\n')
                   .map(|s| s.trim().to_string())
                   .filter(|s| !s.is_empty())
                   .collect()
            }
        };
        config.dino_spawn_weight_multipliers = parse_array("DinoSpawnWeightMultipliers");
        config.dino_class_damage_multipliers = parse_array("DinoClassDamageMultipliers");
        config.dino_class_resistance_multipliers = parse_array("DinoClassResistanceMultipliers");
        config.tamed_dino_class_damage_multipliers = parse_array("TamedDinoClassDamageMultipliers");
        config.tamed_dino_class_resistance_multipliers = parse_array("TamedDinoClassResistanceMultipliers");
        config.npc_replacements = parse_array("NPCReplacements");
        config.prevent_dino_tame_class_names = parse_array("PreventDinoTameClassNames");
        config.exclude_dino_classes = parse_array("ExcludeDinoClasses");
        config.config_add_npc_spawn_entries_container = parse_array("ConfigAddNPCSpawnEntriesContainer");
        config.config_subtract_npc_spawn_entries_container = parse_array("ConfigSubtractNPCSpawnEntriesContainer");
        config.config_override_npc_spawn_entries_container = parse_array("ConfigOverrideNPCSpawnEntriesContainer");
        config.config_override_supply_crate_items = parse_array("ConfigOverrideSupplyCrateItems");

        config.max_fall_speed_multiplier = ini_get_f64(&sections, sgm, "MaxFallSpeedMultiplier", 1.0);

        let mut player_base = vec![1.0; 12];
        for i in 0..12 {
            let key = format!("PlayerBaseStatMultipliers[{}]", i);
            player_base[i] = ini_get_f64(&sections, sgm, &key, 1.0);
        }
        config.player_base_stat_multipliers = player_base;

        let mut per_level_player = vec![1.0; 12];
        for i in 0..12 {
            let key = format!("PerLevelStatsMultiplier_Player[{}]", i);
            per_level_player[i] = ini_get_f64(&sections, sgm, &key, 1.0);
        }
        config.per_level_stats_multiplier_player = per_level_player;

        let mut per_level_dino_wild = vec![1.0; 12];
        for i in 0..12 {
            let key = format!("PerLevelStatsMultiplier_DinoWild[{}]", i);
            per_level_dino_wild[i] = ini_get_f64(&sections, sgm, &key, 1.0);
        }
        config.per_level_stats_multiplier_dino_wild = per_level_dino_wild;

        let mut per_level_dino_tamed = vec![1.0; 12];
        for i in 0..12 {
            let key = format!("PerLevelStatsMultiplier_DinoTamed[{}]", i);
            let def = if i == 0 { 0.2 } else if i == 8 { 0.17 } else { 1.0 };
            per_level_dino_tamed[i] = ini_get_f64(&sections, sgm, &key, def);
        }
        config.per_level_stats_multiplier_dino_tamed = per_level_dino_tamed;

        let mut per_level_dino_tamed_add = vec![1.0; 12];
        for i in 0..12 {
            let key = format!("PerLevelStatsMultiplier_DinoTamed_Add[{}]", i);
            let def = if i == 0 || i == 8 { 0.14 } else { 1.0 };
            per_level_dino_tamed_add[i] = ini_get_f64(&sections, sgm, &key, def);
        }
        config.per_level_stats_multiplier_dino_tamed_add = per_level_dino_tamed_add;

        let mut per_level_dino_tamed_affinity = vec![1.0; 12];
        for i in 0..12 {
            let key = format!("PerLevelStatsMultiplier_DinoTamed_Affinity[{}]", i);
            let def = if i == 0 || i == 8 { 0.44 } else { 1.0 };
            per_level_dino_tamed_affinity[i] = ini_get_f64(&sections, sgm, &key, def);
        }
        config.per_level_stats_multiplier_dino_tamed_affinity = per_level_dino_tamed_affinity;

        let mut mutagen_wild = vec![0; 12];
        for i in 0..12 {
            let key = format!("MutagenLevelBoost[{}]", i);
            let def = if i == 0 || i == 1 || i == 7 || i == 8 { 5 } else { 0 };
            mutagen_wild[i] = ini_get_u32(&sections, sgm, &key, def);
        }
        config.mutagen_level_boost_array = mutagen_wild;

        let mut mutagen_bred = vec![0; 12];
        for i in 0..12 {
            let key = format!("MutagenLevelBoost_Bred[{}]", i);
            let def = if i == 0 || i == 1 || i == 7 || i == 8 { 1 } else { 0 };
            mutagen_bred[i] = ini_get_u32(&sections, sgm, &key, def);
        }
        config.mutagen_level_boost_bred_array = mutagen_bred;
    }

    Ok(config)
}

#[tauri::command]
pub async fn read_ase_config(
    server_id: i64,
    state: State<'_, AppState>,
) -> Result<AseGameConfig, String> {
    read_ase_config_internal(server_id, &state).await
}

#[tauri::command]
pub async fn write_ase_config(
    server_id: i64,
    config: AseGameConfig,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (install_path, db_values, user_folder) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let install_path: String = conn
            .query_row(
                "SELECT install_path FROM ase_servers WHERE id = ?1",
                [server_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Server not found: {}", e))?;

        let db_values: Option<(String, String, String, String)> = conn
            .query_row(
                "SELECT session_name, active_mods, server_password, admin_password FROM ase_servers WHERE id = ?1",
                [server_id],
                |row| Ok((
                    row.get::<_, String>(0).unwrap_or_default(),
                    row.get::<_, String>(1).unwrap_or_default(),
                    row.get::<_, String>(2).unwrap_or_default(),
                    row.get::<_, String>(3).unwrap_or_default(),
                ))
            )
            .ok();

        // Read user config folder override directly from connection to avoid deadlocking db.conn
        let user_folder_raw: String = conn.query_row(
            "SELECT value FROM settings WHERE key = 'ase_user_config_folder'",
            [],
            |row| row.get(0)
        ).unwrap_or_default();
        let user_folder = if !user_folder_raw.is_empty() {
            let p = PathBuf::from(&user_folder_raw);
            if p.exists() && p.is_dir() { Some(user_folder_raw) } else { None }
        } else { None };

        (install_path, db_values, user_folder)
    };

    let config_dir = get_config_path(&install_path, user_folder.as_deref());

    // Create config directory if it doesn't exist
    if !config_dir.exists() {
        std::fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    let gus_path = config_dir.join("GameUserSettings.ini");
    let mut gus_doc = if gus_path.exists() {
        let content = std::fs::read_to_string(&gus_path)
            .map_err(|e| format!("Failed to read GameUserSettings.ini: {}", e))?;
        IniDocument::parse(&content)
    } else {
        IniDocument::new()
    };

    let ss = "ServerSettings";

    let gus_doc_ptr = &mut gus_doc as *mut IniDocument as usize;

    // Helper closures to set values on gus_doc (non-destructive, case-insensitive, deduplicated)
    let ini_set = |sec: &str, key: &str, val: String| {
        let doc = unsafe { &mut *(gus_doc_ptr as *mut IniDocument) };
        doc.set_value(sec, key, &val);
    };

    let ini_set_opt = |sec: &str, key: &str, val: String| {
        let doc = unsafe { &mut *(gus_doc_ptr as *mut IniDocument) };
        doc.set_value_opt(sec, key, &val);
    };

    // Preprocess and validate
    let mut final_session_name = config.session_name.trim().to_string();
    if final_session_name.is_empty() {
        let existing = ini_get_str(&gus_doc, "ServerSettings", "SessionName", "");
        if !existing.trim().is_empty() {
            final_session_name = existing;
        } else if let Some(ref db_val) = db_values {
            if !db_val.0.trim().is_empty() {
                final_session_name = db_val.0.clone();
            }
        }
    }
    if final_session_name.is_empty() {
        final_session_name = "My ASE Server".to_string();
    }
    final_session_name = final_session_name.replace('"', "").replace('\\', "");

    let mut final_server_password = config.server_password.trim().to_string();
    if final_server_password.is_empty() {
        let existing = ini_get_str(&gus_doc, "ServerSettings", "ServerPassword", "");
        if !existing.trim().is_empty() {
            final_server_password = existing;
        } else if let Some(ref db_val) = db_values {
            final_server_password = db_val.2.clone();
        }
    }
    final_server_password = final_server_password.replace('"', "").replace('\\', "");

    let mut final_server_admin_password = config.server_admin_password.trim().to_string();
    if final_server_admin_password.is_empty() {
        let existing = ini_get_str(&gus_doc, "ServerSettings", "ServerAdminPassword", "");
        if !existing.trim().is_empty() {
            final_server_admin_password = existing;
        } else if let Some(ref db_val) = db_values {
            final_server_admin_password = db_val.3.clone();
        }
    }
    if final_server_admin_password.is_empty() {
        final_server_admin_password = "admin123".to_string();
    }
    final_server_admin_password = final_server_admin_password.replace('"', "").replace('\\', "");

    let mut final_active_mods = config.active_mods.trim().to_string();
    if final_active_mods.is_empty() {
        let existing = ini_get_str(&gus_doc, "ServerSettings", "ActiveMods", "");
        if !existing.trim().is_empty() {
            final_active_mods = existing;
        } else if let Some(ref db_val) = db_values {
            final_active_mods = db_val.1.clone();
        }
    }
    final_active_mods = final_active_mods
        .split(',')
        .map(|s| s.trim())
        .filter(|s| s.chars().all(|c| c.is_ascii_digit()))
        .collect::<Vec<_>>()
        .join(",");

    // Identity
    ini_set("ServerSettings", "SessionName", final_session_name.clone());
    ini_set("SessionSettings", "SessionName", final_session_name.clone());
    ini_set("ServerSettings", "ServerPassword", final_server_password.clone());
    ini_set("ServerSettings", "ServerAdminPassword", final_server_admin_password.clone());
    ini_set("ServerSettings", "MaxPlayers", config.max_players.to_string());

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
    ini_set(
        ss,
        "PlayerHarvestingDamageMultiplier",
        format!("{:.6}", config.player_harvesting_damage_multiplier),
    );
    ini_set(
        ss,
        "CraftingSkillBonusMultiplier",
        format!("{:.6}", config.crafting_skill_bonus_multiplier),
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
    ini_set(ss, "RCONServerLogBuffer", config.rcon_server_log_buffer.to_string());
    ini_set(ss, "MaxDifficulty", config.max_difficulty.to_string());
    ini_set(ss, "PreventOfflinePvP", config.prevent_offline_pvp.to_string());
    ini_set(ss, "PreventOfflinePvPInterval", config.prevent_offline_pvp_interval.to_string());
    ini_set(ss, "bDisableStructurePlacementCollision", config.b_disable_structure_placement_collision.to_string());
    ini_set(ss, "bUseCorpseLocator", config.b_use_corpse_locator.to_string());
    ini_set(ss, "bShowStatusTypes", config.b_show_status_types.to_string());
    ini_set(ss, "bAllowUnlimitedRespecs", config.b_allow_unlimited_respecs.to_string());
    ini_set(ss, "SpectatorPassword", config.spectator_password.clone());

    // Mods
    ini_set_opt(ss, "ActiveMods", final_active_mods.clone());

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
        "PreventSpawnAnimations",
        config.prevent_spawn_animations.to_string(),
    );
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
        "EnableCryoSicknessPVP",
        config.enable_cryo_sickness_pvp.to_string(),
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

    // ── Classic ASM Full Server Options Feature Integration - GUS ServerSettings ──
    ini_set_opt(ss, "BadWordListURL", config.bad_word_list_url.clone());
    ini_set_opt(ss, "BadWordWhiteListURL", config.bad_word_white_list_url.clone());
    ini_set(ss, "bFilterTribeNames", config.b_filter_tribe_names.to_string());
    ini_set(ss, "bFilterCharacterNames", config.b_filter_character_names.to_string());
    ini_set(ss, "bFilterChat", config.b_filter_chat.to_string());
    ini_set_opt(ss, "BanListURL", config.ban_list_url.clone());
    ini_set(ss, "UseBanListURL", config.use_ban_list_url.to_string());
    ini_set(ss, "AllowSharedConnections", config.allow_shared_connections.to_string());
    ini_set(ss, "SecureSendARKPayload", config.creature_upload_issue_protection.to_string());
    ini_set(ss, "AutoForceRespawnDinos", config.enable_auto_force_respawn_dinos.to_string());
    ini_set(ss, "AutoForceRespawnDinosInterval", format!("{:.6}", config.auto_force_respawn_dinos_interval));
    
    if config.enable_idle_timeout {
        ini_set(ss, "KickIdlePlayersPeriod", format!("{:.6}", config.kick_idle_players_period));
        ini_set(ss, "KickIdlePlayerPeriod", format!("{:.6}", config.kick_idle_players_period));
    } else {
        ini_set(ss, "KickIdlePlayersPeriod", "0.000000".to_string());
        ini_set(ss, "KickIdlePlayerPeriod", "0.000000".to_string());
    }
    
    ini_set(ss, "UseSecureSpawnRules", config.secure_item_dino_spawning_rules.to_string());
    ini_set(ss, "UseItemDupeCheck", config.additional_dupe_protection.to_string());
    ini_set(ss, "OutputServerLogToConsole", config.output_server_log_to_console.to_string());

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
        gus_doc.remove_key("MessageOfTheDay", "Message");
        gus_doc.remove_key("MessageOfTheDay", "Duration");
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
    ini_set("ASM2", "EnableAutomanagedMods", config.enable_automanaged_mods.to_string());
    ini_set("ASM2", "BackupQuantity", config.backup_quantity.to_string());
    ini_set("ASM2", "NewSaveGameFormat", config.new_save_game_format.to_string());
    ini_set("ASM2", "UseStore", config.use_store.to_string());
    ini_set("ASM2", "BackupTransferPlayerDatas", config.backup_transfer_player_datas.to_string());
    ini_set("ASM2", "MotdIntervalEnabled", config.motd_interval_enabled.to_string());
    ini_set("ASM2", "MotdInterval", config.motd_interval.to_string());
    ini_set("ASM2", "EnableExtinctionEvent", config.enable_extinction_event.to_string());
    ini_set("ASM2", "ExtinctionEventTimeInterval", config.extinction_event_time_interval.to_string());

    // ── Classic ASM Full Server Options Feature Integration - GUS ASM2 ──
    ini_set("ASM2", "UseDynamicConfigUrl", config.use_dynamic_config_url.to_string());
    ini_set("ASM2", "UseCustomLiveTuningUrl", config.use_custom_live_tuning_url.to_string());
    ini_set("ASM2", "EnableIdleTimeout", config.enable_idle_timeout.to_string());
    ini_set("ASM2", "NoPlayerVAC", config.no_playervac.to_string());
    ini_set("ASM2", "EnableExclusiveJoin", config.enable_exclusive_join.to_string());
    ini_set("ASM2", "NoAntiSpeedHack", config.no_anti_speed_hack.to_string());
    ini_set("ASM2", "SpeedHackCpuBias", format!("{:.6}", config.speed_hack_cpu_bias));
    ini_set("ASM2", "DisableMovementValidation", config.disable_movement_validation.to_string());
    ini_set("ASM2", "NoHangDet", config.no_hang_det.to_string());
    ini_set("ASM2", "NoDinos", config.no_dinos.to_string());
    ini_set("ASM2", "NoUnderMeshChecking", config.no_under_mesh_checking.to_string());
    ini_set("ASM2", "NoUnderMeshKilling", config.no_under_mesh_killing.to_string());
    ini_set("ASM2", "EnableVivox", config.enable_vivox.to_string());
    ini_set("ASM2", "ForceRespawnDinosOnStartup", config.force_respawn_dinos_on_startup.to_string());
    ini_set("ASM2", "ForceDirectX10", config.force_direct_x10.to_string());
    ini_set("ASM2", "ForceShaderModel4", config.force_shader_model4.to_string());
    ini_set("ASM2", "ForceLowMemory", config.force_low_memory.to_string());
    ini_set("ASM2", "ForceNoManSky", config.force_no_man_sky.to_string());
    ini_set("ASM2", "UseNoMemoryBias", config.use_no_memory_bias.to_string());
    ini_set("ASM2", "StasisKeepControllers", config.stasis_keep_controllers.to_string());
    ini_set("ASM2", "ServerAllowAnsel", config.server_allow_ansel.to_string());
    ini_set("ASM2", "StructureMemoryOptimizations", config.structure_memory_optimizations.to_string());
    ini_set("ASM2", "StructureStasisGrid", config.structure_stasis_grid.to_string());
    ini_set("ASM2", "EnableCrossplay", config.enable_crossplay.to_string());
    ini_set("ASM2", "EnablePublicIpForEpic", config.enable_public_ip_for_epic.to_string());
    ini_set("ASM2", "EpicStorePlayersOnly", config.epic_store_players_only.to_string());
    ini_set_opt("ASM2", "AlternateSaveDirectoryName", config.alternate_save_directory_name.clone());
    ini_set_opt("ASM2", "ClusterDirectoryOverride", config.cluster_directory_override.clone());
    ini_set("ASM2", "UseClusterDirectoryOverride", config.use_cluster_directory_override.to_string());
    ini_set_opt("ASM2", "ServerLanguage", config.server_language.clone());

    // Save GameUserSettings.ini atomically
    let gus_content = gus_doc.serialize();
    let gus_tmp_path = config_dir.join("GameUserSettings.ini.tmp");
    if let Err(e) = std::fs::write(&gus_tmp_path, &gus_content) {
        println!("[WARNING] [ASE Config] Failed to write temporary GameUserSettings.ini: {}. Falling back to direct write.", e);
        std::fs::write(config_dir.join("GameUserSettings.ini"), &gus_content)
            .map_err(|err| format!("Failed to write GameUserSettings.ini: {}", err))?;
    } else {
        if let Err(e) = std::fs::rename(&gus_tmp_path, config_dir.join("GameUserSettings.ini")) {
            println!("[WARNING] [ASE Config] Failed to rename GameUserSettings.ini.tmp: {}. Falling back to direct write.", e);
            std::fs::write(config_dir.join("GameUserSettings.ini"), &gus_content)
                .map_err(|err| format!("Failed to write GameUserSettings.ini: {}", err))?;
        }
    }

    // Now write Game.ini
    let game_ini_path = config_dir.join("Game.ini");
    let mut game_doc = if game_ini_path.exists() {
        let content = std::fs::read_to_string(&game_ini_path)
            .map_err(|e| format!("Failed to read Game.ini: {}", e))?;
        IniDocument::parse(&content)
    } else {
        IniDocument::new()
    };

    let gm = "/Script/ShooterGame.ShooterGameMode";

    macro_rules! game_set {
        ($key:expr, $value:expr $(,)?) => {
            game_doc.set_value(gm, &$key.to_string(), &$value.to_string());
        };
    }

    // Breeding
    game_set!(
        "EggHatchSpeedMultiplier",
        format!("{:.6}", config.egg_hatch_speed_multiplier),
    );
    game_set!(
        "BabyMatureSpeedMultiplier",
        format!("{:.6}", config.baby_mature_speed_multiplier),
    );
    game_set!(
        "BabyCuddleIntervalMultiplier",
        format!("{:.6}", config.baby_cuddle_interval_multiplier),
    );
    game_set!(
        "BabyImprintAmountMultiplier",
        format!("{:.6}", config.baby_imprint_amount_multiplier),
    );
    game_set!(
        "MatingIntervalMultiplier",
        format!("{:.6}", config.mating_interval_multiplier),
    );
    game_set!(
        "BabyFoodConsumptionSpeedMultiplier",
        format!("{:.6}", config.baby_food_consumption_speed_multiplier),
    );
    game_set!(
        "BabyCuddleGracePeriodMultiplier",
        format!("{:.6}", config.baby_cuddle_grace_period_multiplier),
    );
    game_set!(
        "BabyCuddleLoseImprintQualitySpeedMultiplier",
        format!(
            "{:.6}",
            config.baby_cuddle_lose_imprint_quality_speed_multiplier
        ),
    );
    game_set!("MutagenLevelBoost", config.mutagen_level_boost.to_string());
    game_set!(
        "MutagenLevelBoost_Bred",
        config.mutagen_level_boost_bred.to_string(),
    );
    game_set!(
        "MaxImprintLimit",
        format!("{:.6}", config.max_imprint_limit),
    );

    // Friendly fire PvP rule (New key in Game.ini)
    game_set!(
        "bDisableFriendlyFire",
        config.b_disable_friendly_fire.to_string(),
    );

    // Fall Speed Multiplier
    game_set!(
        "MaxFallSpeedMultiplier",
        format!("{:.6}", config.max_fall_speed_multiplier),
    );

    // Write array-based multipliers
    for i in 0..12 {
        if i < config.player_base_stat_multipliers.len() {
            game_set!(
                &format!("PlayerBaseStatMultipliers[{}]", i),
                format!("{:.6}", config.player_base_stat_multipliers[i]),
            );
        }
        if i < config.per_level_stats_multiplier_player.len() {
            game_set!(
                &format!("PerLevelStatsMultiplier_Player[{}]", i),
                format!("{:.6}", config.per_level_stats_multiplier_player[i]),
            );
        }
        if i < config.per_level_stats_multiplier_dino_wild.len() {
            game_set!(
                &format!("PerLevelStatsMultiplier_DinoWild[{}]", i),
                format!("{:.6}", config.per_level_stats_multiplier_dino_wild[i]),
            );
        }
        if i < config.per_level_stats_multiplier_dino_tamed.len() {
            game_set!(
                &format!("PerLevelStatsMultiplier_DinoTamed[{}]", i),
                format!("{:.6}", config.per_level_stats_multiplier_dino_tamed[i]),
            );
        }
        if i < config.per_level_stats_multiplier_dino_tamed_add.len() {
            game_set!(
                &format!("PerLevelStatsMultiplier_DinoTamed_Add[{}]", i),
                format!("{:.6}", config.per_level_stats_multiplier_dino_tamed_add[i]),
            );
        }
        if i < config.per_level_stats_multiplier_dino_tamed_affinity.len() {
            game_set!(
                &format!("PerLevelStatsMultiplier_DinoTamed_Affinity[{}]", i),
                format!("{:.6}", config.per_level_stats_multiplier_dino_tamed_affinity[i]),
            );
        }
        if i < config.mutagen_level_boost_array.len() {
            game_set!(
                &format!("MutagenLevelBoost[{}]", i),
                config.mutagen_level_boost_array[i].to_string(),
            );
        }
        if i < config.mutagen_level_boost_bred_array.len() {
            game_set!(
                &format!("MutagenLevelBoost_Bred[{}]", i),
                config.mutagen_level_boost_bred_array[i].to_string(),
            );
        }
    }

    // Write new multipliers
    let harvest_multipliers: Vec<String> = config.harvest_resource_item_amount_class_multipliers
        .split(';')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    game_doc.set_array_values(gm, "HarvestResourceItemAmountClassMultipliers", &harvest_multipliers);

    // Write new level overrides
    let level_overrides: Vec<String> = config.level_experience_ramp_overrides
        .split('\n')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    game_doc.set_array_values(gm, "LevelExperienceRampOverrides", &level_overrides);

    // Write Engram and Crafting overrides
    let engram_entries: Vec<String> = config.override_named_engram_entries
        .split('\n')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    game_doc.set_array_values(gm, "OverrideNamedEngramEntries", &engram_entries);

    let crafting_costs: Vec<String> = config.config_override_item_crafting_costs
        .split('\n')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    game_doc.set_array_values(gm, "ConfigOverrideItemCraftingCosts", &crafting_costs);

    // Write advanced array fields
    game_doc.set_array_values(gm, "DinoSpawnWeightMultipliers", &config.dino_spawn_weight_multipliers);
    game_doc.set_array_values(gm, "DinoClassDamageMultipliers", &config.dino_class_damage_multipliers);
    game_doc.set_array_values(gm, "DinoClassResistanceMultipliers", &config.dino_class_resistance_multipliers);
    game_doc.set_array_values(gm, "TamedDinoClassDamageMultipliers", &config.tamed_dino_class_damage_multipliers);
    game_doc.set_array_values(gm, "TamedDinoClassResistanceMultipliers", &config.tamed_dino_class_resistance_multipliers);
    game_doc.set_array_values(gm, "NPCReplacements", &config.npc_replacements);
    game_doc.set_array_values(gm, "PreventDinoTameClassNames", &config.prevent_dino_tame_class_names);
    game_doc.set_array_values(gm, "ExcludeDinoClasses", &config.exclude_dino_classes);
    game_doc.set_array_values(gm, "ConfigAddNPCSpawnEntriesContainer", &config.config_add_npc_spawn_entries_container);
    game_doc.set_array_values(gm, "ConfigSubtractNPCSpawnEntriesContainer", &config.config_subtract_npc_spawn_entries_container);
    game_doc.set_array_values(gm, "ConfigOverrideNPCSpawnEntriesContainer", &config.config_override_npc_spawn_entries_container);
    game_doc.set_array_values(gm, "ConfigOverrideSupplyCrateItems", &config.config_override_supply_crate_items);
    if !config.override_max_experience_points_player.is_empty() {
        game_set!("OverrideMaxExperiencePointsPlayer", config.override_max_experience_points_player.clone());
    }
    if !config.override_max_experience_points_dino.is_empty() {
        game_set!("OverrideMaxExperiencePointsDino", config.override_max_experience_points_dino.clone());
    }

    // Save Game.ini atomically
    let game_content = game_doc.serialize();
    let game_tmp_path = config_dir.join("Game.ini.tmp");
    if let Err(e) = std::fs::write(&game_tmp_path, &game_content) {
        println!("[WARNING] [ASE Config] Failed to write temporary Game.ini: {}. Falling back to direct write.", e);
        std::fs::write(&game_ini_path, &game_content)
            .map_err(|err| format!("Failed to write Game.ini: {}", err))?;
    } else {
        if let Err(e) = std::fs::rename(&game_tmp_path, &game_ini_path) {
            println!("[WARNING] [ASE Config] Failed to rename Game.ini.tmp: {}. Falling back to direct write.", e);
            std::fs::write(&game_ini_path, &game_content)
                .map_err(|err| format!("Failed to write Game.ini: {}", err))?;
        }
    }

    // If custom config folder is active, also sync/dual-write GameUserSettings.ini and Game.ini to the default server config directory
    if user_folder.is_some() {
        let default_config_dir = get_config_path(&install_path, None);
        if let Err(e) = std::fs::create_dir_all(&default_config_dir) {
            println!("  ⚠️ [WARNING] [ASE] Failed to create default config directory: {}", e);
        } else {
            let default_gus_path = default_config_dir.join("GameUserSettings.ini");
            let default_game_path = default_config_dir.join("Game.ini");
            
            if let Err(e) = std::fs::write(&default_gus_path, &gus_content) {
                println!("  ⚠️ [WARNING] [ASE] Failed to dual-write GameUserSettings.ini to default path: {}", e);
            } else {
                println!("  🔄 [Sync] [ASE] Dual-wrote GameUserSettings.ini to default path {:?}", default_gus_path);
            }
            
            if let Err(e) = std::fs::write(&default_game_path, &game_content) {
                println!("  ⚠️ [WARNING] [ASE] Failed to dual-write Game.ini to default path: {}", e);
            } else {
                println!("  🔄 [Sync] [ASE] Dual-wrote Game.ini to default path {:?}", default_game_path);
            }
        }
    }

    // Sync values back to database to maintain integrity
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE ase_servers SET 
                session_name = ?1,
                name = ?1,
                max_players = ?2,
                server_password = ?3,
                admin_password = ?4,
                rcon_port = ?5,
                active_mods = ?6,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = ?7",
            rusqlite::params![
                final_session_name,
                config.max_players,
                final_server_password,
                final_server_admin_password,
                config.rcon_port,
                final_active_mods,
                server_id
            ],
        )
        .map_err(|e| format!("Failed to sync config to database: {}", e))?;
    }

    Ok(())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AseDiagnostics {
    pub gus_exists: bool,
    pub gus_size: u64,
    pub gus_modified: String,
    pub game_ini_exists: bool,
    pub game_ini_size: u64,
    pub game_ini_modified: String,
    pub last_parsed: String,
    pub cache_status: String,
    pub config_hash: String,
    pub active_launch_args: Vec<String>,
}

#[tauri::command]
pub async fn sync_ase_server_from_ini(
    server_id: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Read live config from files
    let config = read_ase_config(server_id, state.clone()).await?;

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    // Update main database record
    conn.execute(
        "UPDATE ase_servers SET 
            session_name = ?1,
            name = ?1,
            max_players = ?2,
            server_password = ?3,
            admin_password = ?4,
            rcon_port = ?5,
            active_mods = ?6,
            battleye = ?7,
            updated_at = ?8
         WHERE id = ?9",
        rusqlite::params![
            config.session_name,
            config.max_players,
            config.server_password,
            config.server_admin_password,
            config.rcon_port as i32,
            config.active_mods,
            if config.no_battle_eye { 0 } else { 1 },
            now,
            server_id
        ],
    ).map_err(|e| format!("Failed to sync ase_servers: {}", e))?;

    // Synchronize ase_mods table
    let mod_ids: Vec<String> = config.active_mods.split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    if !mod_ids.is_empty() {
        // Disable mods that aren't in this list
        let placeholders = mod_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "UPDATE ase_mods SET enabled = 0 WHERE server_id = ?1 AND workshop_id NOT IN ({})",
            placeholders
        );
        let mut params: Vec<rusqlite::types::Value> = vec![rusqlite::types::Value::Integer(server_id)];
        for id in &mod_ids {
            params.push(rusqlite::types::Value::Text(id.clone()));
        }
        let _ = conn.execute(&sql, rusqlite::params_from_iter(params));

        // Ensure active ones are present and enabled
        for (idx, id) in mod_ids.iter().enumerate() {
            let exists: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM ase_mods WHERE server_id = ?1 AND workshop_id = ?2)",
                rusqlite::params![server_id, id],
                |row| row.get(0)
            ).unwrap_or(false);

            if exists {
                let _ = conn.execute(
                    "UPDATE ase_mods SET enabled = 1, load_order = ?1 WHERE server_id = ?2 AND workshop_id = ?3",
                    rusqlite::params![idx as i32, server_id, id],
                );
            } else {
                let _ = conn.execute(
                    "INSERT INTO ase_mods (server_id, workshop_id, name, version, installed_at, enabled, load_order) \
                     VALUES (?1, ?2, ?3, '1.0', ?4, 1, ?5)",
                    rusqlite::params![server_id, id, format!("Workshop Mod {}", id), now, idx as i32],
                );
            }
        }
    } else {
        let _ = conn.execute(
            "UPDATE ase_mods SET enabled = 0 WHERE server_id = ?1",
            [server_id],
        );
    }

    Ok(())
}

#[tauri::command]
pub async fn get_ase_config_diagnostics(
    server_id: i64,
    state: State<'_, AppState>,
) -> Result<AseDiagnostics, String> {
    let (install_path, db_updated_at_str, user_folder) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        let row: Result<(String, String), _> = conn.query_row(
            "SELECT install_path, updated_at FROM ase_servers WHERE id = ?1",
            [server_id],
            |r| Ok((r.get(0)?, r.get(1)?))
        );
        let user_folder_raw: String = conn.query_row(
            "SELECT value FROM settings WHERE key = 'ase_user_config_folder'",
            [],
            |row| row.get(0)
        ).unwrap_or_default();
        let user_folder = if !user_folder_raw.is_empty() {
            let p = PathBuf::from(&user_folder_raw);
            if p.exists() && p.is_dir() { Some(user_folder_raw) } else { None }
        } else { None };
        let (install_path, updated_at) = row.map_err(|e| format!("Server not found in DB: {}", e))?;
        (install_path, updated_at, user_folder)
    };

    let config_dir = get_config_path(&install_path, user_folder.as_deref());
    let gus_path = config_dir.join("GameUserSettings.ini");
    let game_ini_path = config_dir.join("Game.ini");

    let get_file_info = |path: &PathBuf| -> (bool, u64, String, Option<std::time::SystemTime>) {
        if !path.exists() {
            return (false, 0, "Not Found".to_string(), None);
        }
        if let Ok(meta) = std::fs::metadata(path) {
            let size = meta.len();
            let modified = meta.modified().ok();
            let time_str = modified.map(|system_time| {
                let datetime: chrono::DateTime<chrono::Local> = system_time.into();
                datetime.format("%Y-%m-%d %H:%M:%S").to_string()
            }).unwrap_or_else(|| "Unknown".to_string());
            (true, size, time_str, modified)
        } else {
            (false, 0, "Error reading metadata".to_string(), None)
        }
    };

    let (gus_exists, gus_size, gus_modified, gus_time) = get_file_info(&gus_path);
    let (game_ini_exists, game_ini_size, game_ini_modified, game_time) = get_file_info(&game_ini_path);

    let db_time = chrono::DateTime::parse_from_rfc3339(&db_updated_at_str)
        .map(|dt| dt.with_timezone(&chrono::Utc))
        .ok();

    let mut cache_status = "Fresh".to_string();
    if let Some(db_t) = db_time {
        if let Some(gus_t) = gus_time {
            let gus_chrono: chrono::DateTime<chrono::Utc> = gus_t.into();
            if gus_chrono > db_t + chrono::Duration::seconds(5) {
                cache_status = "Stale (External edits detected)".to_string();
            }
        }
        if let Some(game_t) = game_time {
            let game_chrono: chrono::DateTime<chrono::Utc> = game_t.into();
            if game_chrono > db_t + chrono::Duration::seconds(5) {
                cache_status = "Stale (External edits detected)".to_string();
            }
        }
    } else {
        cache_status = "Unknown".to_string();
    }

    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    let mut hashed = false;
    if gus_exists {
        if let Ok(content) = std::fs::read_to_string(&gus_path) {
            hasher.update(content.as_bytes());
            hashed = true;
        }
    }
    if game_ini_exists {
        if let Ok(content) = std::fs::read_to_string(&game_ini_path) {
            hasher.update(content.as_bytes());
            hashed = true;
        }
    }

    let config_hash = if hashed {
        hex::encode(hasher.finalize())
    } else {
        "N/A".to_string()
    };

    let active_launch_args = crate::ase::commands::server::get_ase_launch_arguments(server_id, state.clone())
        .await
        .unwrap_or_default();

    let last_parsed = if let Some(db_t) = db_time {
        let local_t: chrono::DateTime<chrono::Local> = db_t.into();
        local_t.format("%Y-%m-%d %H:%M:%S").to_string()
    } else {
        "Never".to_string()
    };

    Ok(AseDiagnostics {
        gus_exists,
        gus_size,
        gus_modified,
        game_ini_exists,
        game_ini_size,
        game_ini_modified,
        last_parsed,
        cache_status,
        config_hash,
        active_launch_args,
    })
}

pub use crate::ase::ini_validator::{
    validate_ase_config,
    __cmd__validate_ase_config,
    __tauri_command_name_validate_ase_config,
};

