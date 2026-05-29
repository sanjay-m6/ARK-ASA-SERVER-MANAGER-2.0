use serde::{Deserialize, Serialize};

/// ASE Server representation stored in DB
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AseServer {
    pub id: i64,
    pub name: String,
    pub install_path: String,
    pub map_name: String,
    pub port: u16,
    pub query_port: u16,
    pub rcon_port: u16,
    pub rcon_password: String,
    pub max_players: u32,
    pub server_password: String,
    pub admin_password: String,
    pub session_name: String,
    pub active_mods: String,
    pub cluster_id: String,
    pub battleye: bool,
    pub extra_args: String,
    pub status: String,
    pub process_id: Option<u32>,
    pub created_at: String,
    pub updated_at: String,
    pub auto_start: bool,
    pub auto_stop: bool,
    pub intelligent_mode: bool,
    pub startup_delay: i32,
    pub startup_priority: i32,
}

/// ASE Installed Mod with full workshop metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AseInstalledMod {
    pub id: i64,
    pub server_id: i64,
    pub workshop_id: String,
    pub name: String,
    pub version: String,
    pub installed_at: String,
    pub enabled: bool,
    pub load_order: i32,
    // Enhanced metadata fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_image_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workshop_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscribers: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_updated: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_created: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mod_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub health_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dependencies: Option<Vec<String>>,
}

/// ASE Backup
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AseBackup {
    pub id: i64,
    pub server_id: i64,
    pub path: String,
    pub size_bytes: u64,
    pub created_at: String,
}

/// ASE Cluster
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AseCluster {
    pub id: i64,
    pub name: String,
    pub cluster_dir: String,
    pub server_ids: Vec<i64>,
    pub allow_transfer_survivors: bool,
    pub allow_transfer_items: bool,
    pub allow_transfer_dinos: bool,
    pub created_at: String,
}

/// Full ASE Game Config (GameUserSettings.ini + Game.ini fields)
/// Matches all classic ARK Server Manager configuration sections
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AseGameConfig {
    // ── Identity ──
    pub session_name: String,
    pub server_password: String,
    pub server_admin_password: String,
    pub max_players: u32,

    // ── Difficulty ──
    pub difficulty_offset: f64,
    pub override_official_difficulty: f64,

    // ── Core Rates ──
    pub xp_multiplier: f64,
    pub taming_speed_multiplier: f64,
    pub harvest_amount_multiplier: f64,
    pub harvest_health_multiplier: f64,
    pub resources_respawn_period_multiplier: f64,
    pub item_stack_size_multiplier: f64,

    // ── Player Stats ──
    pub player_character_food_drain_multiplier: f64,
    pub player_character_water_drain_multiplier: f64,
    pub player_character_stamina_drain_multiplier: f64,
    pub player_character_health_recovery_multiplier: f64,
    pub player_damage_multiplier: f64,
    pub player_resistance_multiplier: f64,

    // ── Dino Stats ──
    pub dino_character_food_drain_multiplier: f64,
    pub dino_character_health_recovery_multiplier: f64,
    pub dino_damage_multiplier: f64,
    pub dino_resistance_multiplier: f64,
    pub max_tamed_dinos: u32,
    pub dino_count_multiplier: f64,
    pub wild_dino_torpor_drain_multiplier: f64,
    pub tamed_dino_torpor_drain_multiplier: f64,
    pub passive_tame_interval_multiplier: f64,
    pub use_singleplayer_settings: bool,
    pub disable_dino_breeding: bool,
    pub allow_unclaim_dinos: bool,
    pub use_dino_level_up_animations: bool,
    pub max_personal_tamed_dinos: u32,
    pub personal_tamed_dinos_saddle_structure_cost: f64,

    // ── Breeding (Game.ini) ──
    pub egg_hatch_speed_multiplier: f64,
    pub baby_mature_speed_multiplier: f64,
    pub baby_cuddle_interval_multiplier: f64,
    pub baby_imprint_amount_multiplier: f64,
    pub mating_interval_multiplier: f64,
    pub baby_food_consumption_speed_multiplier: f64,
    pub baby_cuddle_grace_period_multiplier: f64,
    pub baby_cuddle_lose_imprint_quality_speed_multiplier: f64,
    pub mutagen_level_boost: u32,
    pub mutagen_level_boost_bred: u32,
    pub max_imprint_limit: f64,

    // ── Structures ──
    pub the_max_structures_in_range: u32,
    pub structure_damage_multiplier: f64,
    pub structure_resistance_multiplier: f64,
    pub per_platform_max_structures_multiplier: f64,
    pub auto_destroy_decayed_dinos: bool,
    pub disable_structure_decay_pve: bool,
    pub pve_allow_structures_at_supply_drops: bool,
    pub force_all_structure_locking: bool,
    pub auto_destroy_old_structures_multiplier: f64,
    pub structure_pickup_time_after_placement: f64,
    pub structure_pickup_hold_duration: f64,
    pub allow_integrated_spinet_attachment: bool,
    pub ignore_limit_max_structures_in_range_type_flag: bool,
    pub ignore_structures_prevention_volumes: bool,

    // ── PvP Rules ──
    pub server_pve: bool,
    pub allow_cave_building_pvp: bool,
    pub disable_railgun_pvp: bool,
    pub enable_pvp_gamma: bool,
    pub pvp_structure_decay: bool,
    pub pvp_dino_decay: bool,
    pub global_powered_battery_durability_decrease_per_second: f64,

    // ── Player Rules ──
    pub allow_third_person_player: bool,
    pub server_crosshair: bool,
    pub show_map_player_location: bool,
    pub allow_flyer_carry_pve: bool,
    pub disable_weather_fog: bool,
    pub allow_anyone_baby_imprint_cuddle: bool,
    pub allow_hit_markers: bool,
    pub enable_extra_structure_prevention_volumes: bool,
    pub show_floating_damage_text: bool,
    pub force_flyerexplosives: bool,

    // ── Tribe Settings ──
    pub prevent_tribe_alliances: bool,
    pub allow_tribe_alliance: bool,
    pub allow_tribe_warfare: bool,
    pub max_tribe_logs: u32,
    pub max_number_of_players_in_tribe: u32,

    // ── Tribute / Transfer ──
    pub max_tribute_dinos: u32,
    pub max_tribute_items: u32,
    pub no_tribute_downloads: bool,
    pub prevent_download_survivors: bool,
    pub prevent_download_items: bool,
    pub prevent_download_dinos: bool,
    pub prevent_upload_survivors: bool,
    pub prevent_upload_items: bool,
    pub prevent_upload_dinos: bool,
    pub disable_custom_folders_in_tribute_inventories: bool,
    pub crossark_allow_foreign_dino_downloads: bool,

    // ── Environment ──
    pub day_cycle_speed_scale: f64,
    pub day_time_speed_scale: f64,
    pub night_time_speed_scale: f64,
    pub spoiling_time_multiplier: f64,
    pub item_decomposition_time_multiplier: f64,
    pub corpse_decomposition_time_multiplier: f64,
    pub crop_growth_speed_multiplier: f64,
    pub crop_decay_speed_multiplier: f64,
    pub lay_egg_interval_multiplier: f64,
    pub poop_interval_multiplier: f64,
    pub hair_growth_speed_multiplier: f64,
    pub custom_recipe_effectiveness_multiplier: f64,
    pub custom_recipe_skill_multiplier: f64,
    pub fishing_loot_quality_multiplier: f64,
    pub supply_crate_loot_quality_multiplier: f64,
    pub global_spoiling_time_multiplier: f64,
    pub global_item_decomposition_time_multiplier: f64,
    pub global_corpse_decomposition_time_multiplier: f64,
    pub kill_xp_multiplier: f64,
    pub harvest_xp_multiplier: f64,
    pub craft_xp_multiplier: f64,
    pub generic_xp_multiplier: f64,
    pub special_xp_multiplier: f64,

    // ── Hexagons (Genesis) ──
    pub max_hexagons_per_character: f64,
    pub hexagon_reward_multiplier: f64,

    // ── Engrams ──
    pub auto_unlock_all_engrams: bool,
    pub only_allow_specified_engrams: bool,
    pub override_named_engram_entries: String,
    pub config_override_item_crafting_costs: String,

    // ── Network / Admin ──
    pub rcon_enabled: bool,
    pub rcon_port: u16,
    pub battle_eye_enforcer: bool,
    pub enable_creative_mode: bool,
    pub server_force_no_hud: bool,
    pub kick_idle_player_period: f64,
    pub destroy_tames_over_level_clamp: u32,

    // ── Mods ──
    pub active_mods: String,

    // ── MOTD ──
    pub motd: String,
    pub motd_duration: u32,

    // ── Auto-save ──
    pub auto_save_period_minutes: f64,

    // ── Events ──
    pub active_event: String,
    pub event_colors_chance_override: f64,

    // ── Administration ──
    pub bad_word_filter: String,
    pub admin_list: String,
    pub custom_dynamic_config_url: String,
    pub custom_live_tuning_url: String,
    pub use_secure_spawn_rules: bool,
    pub use_item_dupe_check: bool,
    pub secure_send_ark_payload: bool,
    pub culture: String,

    // ── Launcher ──
    pub launcher_args: String,
    pub use_all_available_cores: bool,
    pub use_low_memory: bool,
    pub no_battle_eye: bool,

    // ── Ragnarok-specific ──
    pub ragnarok_volcano_intensity: f64,
    pub ragnarok_volcano_interval: f64,
    pub enable_ragnarok_settings: bool,

    // ── Fjordur-specific ──
    pub use_fjordur_traversal_buff: bool,
    pub enable_fjordur_settings: bool,

    // ── Adjustable Spawner ──
    pub adjustable_mutagen_spawn_delay_multiplier: f64,

    // ── Chat & Voice ──
    pub global_voice_chat: bool,
    pub proximity_voice_chat: bool,
    pub always_notify_player_joined: bool,
    pub always_notify_player_left: bool,
    pub server_admin_command_logging: bool,

    // ── PvP & PvE Advanced ──
    pub b_disable_friendly_fire: bool,
    pub non_permanent_diseases: bool,
    pub prevent_diseases: bool,
    pub allow_cryo_cooldown_on_pve: bool,
    pub disable_cryopod_enemy_check: bool,
    pub pvp_zone_structure_damage_multiplier: f64,
    pub structure_damage_repair_cooldown: f64,

    // ── Harvesting & Core Rates ──
    pub clamp_resource_harvest_damage: bool,
    pub optimized_harvesting_health: bool,
    pub tamed_dino_harvesting_damage_multiplier: f64,
    pub dino_turret_damage_multiplier: f64,
    pub tamed_dino_character_food_drain_multiplier: f64,
    pub wild_dino_character_food_drain_multiplier: f64,

    // ── Decay & Platforms ──
    pub structure_decay_period_multiplier: f64,
    pub pve_dino_decay_period_multiplier: f64,
    pub fast_decay_unsnapped_core_structures: bool,
    pub b_allow_platform_saddle_multi_floors: bool,

    // ── Advanced Environment/Flyers ──
    pub allow_flying_stamina_recovery: bool,
    pub flyer_platform_max_structures_multiplier: f64,

    // ── Classic ASM Full Server Options Feature Integration ──
    pub bad_word_list_url: String,
    pub bad_word_white_list_url: String,
    pub b_filter_tribe_names: bool,
    pub b_filter_character_names: bool,
    pub b_filter_chat: bool,
    pub ban_list_url: String,
    pub use_ban_list_url: bool,
    pub use_dynamic_config_url: bool,
    pub use_custom_live_tuning_url: bool,
    pub kick_idle_players_period: f64,
    pub enable_idle_timeout: bool,
    pub no_playervac: bool,
    pub no_anti_speed_hack: bool,
    pub speed_hack_cpu_bias: f64,
    pub disable_movement_validation: bool,
    pub output_server_log_to_console: bool,
    pub no_hang_det: bool,
    pub no_dinos: bool,
    pub no_under_mesh_checking: bool,
    pub no_under_mesh_killing: bool,
    pub enable_vivox: bool,
    pub allow_shared_connections: bool,
    pub creature_upload_issue_protection: bool,
    pub additional_dupe_protection: bool,
    pub secure_item_dino_spawning_rules: bool,
    pub force_respawn_dinos_on_startup: bool,
    pub enable_auto_force_respawn_dinos: bool,
    pub auto_force_respawn_dinos_interval: f64,
    pub force_direct_x10: bool,
    pub force_shader_model4: bool,
    pub force_low_memory: bool,
    pub force_no_man_sky: bool,
    pub use_no_memory_bias: bool,
    pub stasis_keep_controllers: bool,
    pub server_allow_ansel: bool,
    pub structure_memory_optimizations: bool,
    pub structure_stasis_grid: bool,
    pub enable_crossplay: bool,
    pub enable_public_ip_for_epic: bool,
    pub epic_store_players_only: bool,
    pub alternate_save_directory_name: String,
    pub cluster_directory_override: String,
    pub use_cluster_directory_override: bool,
    pub harvest_resource_item_amount_class_multipliers: String,
}

impl Default for AseGameConfig {
    fn default() -> Self {
        Self {
            session_name: "My ASE Server".into(),
            server_password: String::new(),
            server_admin_password: "admin123".into(),
            max_players: 70,
            difficulty_offset: 1.0,
            override_official_difficulty: 5.0,
            xp_multiplier: 1.0,
            taming_speed_multiplier: 1.0,
            harvest_amount_multiplier: 1.0,
            harvest_health_multiplier: 1.0,
            resources_respawn_period_multiplier: 1.0,
            item_stack_size_multiplier: 1.0,
            player_character_food_drain_multiplier: 1.0,
            player_character_water_drain_multiplier: 1.0,
            player_character_stamina_drain_multiplier: 1.0,
            player_character_health_recovery_multiplier: 1.0,
            player_damage_multiplier: 1.0,
            player_resistance_multiplier: 1.0,
            dino_character_food_drain_multiplier: 1.0,
            dino_character_health_recovery_multiplier: 1.0,
            dino_damage_multiplier: 1.0,
            dino_resistance_multiplier: 1.0,
            max_tamed_dinos: 5000,
            dino_count_multiplier: 1.0,
            wild_dino_torpor_drain_multiplier: 1.0,
            tamed_dino_torpor_drain_multiplier: 1.0,
            passive_tame_interval_multiplier: 1.0,
            use_singleplayer_settings: false,
            disable_dino_breeding: false,
            allow_unclaim_dinos: false,
            use_dino_level_up_animations: true,
            max_personal_tamed_dinos: 40,
            personal_tamed_dinos_saddle_structure_cost: 0.0,
            egg_hatch_speed_multiplier: 1.0,
            baby_mature_speed_multiplier: 1.0,
            baby_cuddle_interval_multiplier: 1.0,
            baby_imprint_amount_multiplier: 1.0,
            mating_interval_multiplier: 1.0,
            baby_food_consumption_speed_multiplier: 1.0,
            baby_cuddle_grace_period_multiplier: 1.0,
            baby_cuddle_lose_imprint_quality_speed_multiplier: 1.0,
            mutagen_level_boost: 5,
            mutagen_level_boost_bred: 1,
            max_imprint_limit: 1.0,
            the_max_structures_in_range: 10500,
            structure_damage_multiplier: 1.0,
            structure_resistance_multiplier: 1.0,
            per_platform_max_structures_multiplier: 1.0,
            auto_destroy_decayed_dinos: false,
            disable_structure_decay_pve: false,
            pve_allow_structures_at_supply_drops: false,
            force_all_structure_locking: false,
            auto_destroy_old_structures_multiplier: 0.0,
            structure_pickup_time_after_placement: 30.0,
            structure_pickup_hold_duration: 0.5,
            allow_integrated_spinet_attachment: true,
            ignore_limit_max_structures_in_range_type_flag: false,
            ignore_structures_prevention_volumes: false,
            server_pve: false,
            allow_cave_building_pvp: false,
            disable_railgun_pvp: false,
            enable_pvp_gamma: false,
            pvp_structure_decay: false,
            pvp_dino_decay: false,
            global_powered_battery_durability_decrease_per_second: 4.0,
            allow_third_person_player: true,
            server_crosshair: true,
            show_map_player_location: true,
            allow_flyer_carry_pve: false,
            disable_weather_fog: false,
            allow_anyone_baby_imprint_cuddle: false,
            allow_hit_markers: true,
            enable_extra_structure_prevention_volumes: false,
            show_floating_damage_text: false,
            force_flyerexplosives: false,
            prevent_tribe_alliances: false,
            allow_tribe_alliance: true,
            allow_tribe_warfare: false,
            max_tribe_logs: 100,
            max_number_of_players_in_tribe: 0,
            max_tribute_dinos: 20,
            max_tribute_items: 50,
            no_tribute_downloads: false,
            prevent_download_survivors: false,
            prevent_download_items: false,
            prevent_download_dinos: false,
            prevent_upload_survivors: false,
            prevent_upload_items: false,
            prevent_upload_dinos: false,
            disable_custom_folders_in_tribute_inventories: false,
            crossark_allow_foreign_dino_downloads: false,
            day_cycle_speed_scale: 1.0,
            day_time_speed_scale: 1.0,
            night_time_speed_scale: 1.0,
            spoiling_time_multiplier: 1.0,
            item_decomposition_time_multiplier: 1.0,
            corpse_decomposition_time_multiplier: 1.0,
            crop_growth_speed_multiplier: 1.0,
            crop_decay_speed_multiplier: 1.0,
            lay_egg_interval_multiplier: 1.0,
            poop_interval_multiplier: 1.0,
            hair_growth_speed_multiplier: 1.0,
            custom_recipe_effectiveness_multiplier: 1.0,
            custom_recipe_skill_multiplier: 1.0,
            fishing_loot_quality_multiplier: 1.0,
            supply_crate_loot_quality_multiplier: 1.0,
            global_spoiling_time_multiplier: 1.0,
            global_item_decomposition_time_multiplier: 1.0,
            global_corpse_decomposition_time_multiplier: 1.0,
            kill_xp_multiplier: 1.0,
            harvest_xp_multiplier: 1.0,
            craft_xp_multiplier: 1.0,
            generic_xp_multiplier: 1.0,
            special_xp_multiplier: 1.0,
            max_hexagons_per_character: 2000000.0,
            hexagon_reward_multiplier: 1.0,
            auto_unlock_all_engrams: false,
            only_allow_specified_engrams: false,
            override_named_engram_entries: String::new(),
            config_override_item_crafting_costs: String::new(),
            rcon_enabled: true,
            rcon_port: 27020,
            battle_eye_enforcer: true,
            enable_creative_mode: false,
            server_force_no_hud: false,
            kick_idle_player_period: 3600.0,
            destroy_tames_over_level_clamp: 0,
            active_mods: String::new(),
            motd: String::new(),
            motd_duration: 20,
            auto_save_period_minutes: 15.0,
            active_event: String::new(),
            event_colors_chance_override: 0.0,
            bad_word_filter: String::new(),
            admin_list: String::new(),
            custom_dynamic_config_url: String::new(),
            custom_live_tuning_url: String::new(),
            use_secure_spawn_rules: false,
            use_item_dupe_check: false,
            secure_send_ark_payload: false,
            culture: String::new(),
            launcher_args: String::new(),
            use_all_available_cores: true,
            use_low_memory: false,
            no_battle_eye: false,
            ragnarok_volcano_intensity: 1.0,
            ragnarok_volcano_interval: 0.0,
            enable_ragnarok_settings: false,
            use_fjordur_traversal_buff: true,
            enable_fjordur_settings: false,
            adjustable_mutagen_spawn_delay_multiplier: 1.0,
            global_voice_chat: false,
            proximity_voice_chat: false,
            always_notify_player_joined: false,
            always_notify_player_left: false,
            server_admin_command_logging: false,
            b_disable_friendly_fire: false,
            non_permanent_diseases: false,
            prevent_diseases: false,
            allow_cryo_cooldown_on_pve: false,
            disable_cryopod_enemy_check: false,
            pvp_zone_structure_damage_multiplier: 6.0,
            structure_damage_repair_cooldown: 180.0,
            clamp_resource_harvest_damage: false,
            optimized_harvesting_health: false,
            tamed_dino_harvesting_damage_multiplier: 1.0,
            dino_turret_damage_multiplier: 1.0,
            tamed_dino_character_food_drain_multiplier: 1.0,
            wild_dino_character_food_drain_multiplier: 1.0,
            structure_decay_period_multiplier: 1.0,
            pve_dino_decay_period_multiplier: 1.0,
            fast_decay_unsnapped_core_structures: false,
            b_allow_platform_saddle_multi_floors: false,
            allow_flying_stamina_recovery: false,
            flyer_platform_max_structures_multiplier: 1.0,

            // ── Classic ASM Full Server Options Feature Integration Defaults ──
            bad_word_list_url: String::new(),
            bad_word_white_list_url: String::new(),
            b_filter_tribe_names: false,
            b_filter_character_names: false,
            b_filter_chat: false,
            ban_list_url: String::new(),
            use_ban_list_url: false,
            use_dynamic_config_url: false,
            use_custom_live_tuning_url: false,
            kick_idle_players_period: 3600.0,
            enable_idle_timeout: false,
            no_playervac: false,
            no_anti_speed_hack: false,
            speed_hack_cpu_bias: 1.0,
            disable_movement_validation: false,
            output_server_log_to_console: false,
            no_hang_det: false,
            no_dinos: false,
            no_under_mesh_checking: false,
            no_under_mesh_killing: false,
            enable_vivox: false,
            allow_shared_connections: false,
            creature_upload_issue_protection: false,
            additional_dupe_protection: false,
            secure_item_dino_spawning_rules: false,
            force_respawn_dinos_on_startup: false,
            enable_auto_force_respawn_dinos: false,
            auto_force_respawn_dinos_interval: 24.0,
            force_direct_x10: false,
            force_shader_model4: false,
            force_low_memory: false,
            force_no_man_sky: false,
            use_no_memory_bias: false,
            stasis_keep_controllers: false,
            server_allow_ansel: false,
            structure_memory_optimizations: false,
            structure_stasis_grid: false,
            enable_crossplay: false,
            enable_public_ip_for_epic: false,
            epic_store_players_only: false,
            alternate_save_directory_name: String::new(),
            cluster_directory_override: String::new(),
            use_cluster_directory_override: false,
            harvest_resource_item_amount_class_multipliers: String::new(),
        }
    }
}

/// ASE Scheduled Task
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AseScheduledTask {
    pub id: i64,
    pub server_id: i64,
    pub task_type: String,
    pub cron_expr: String,
    pub enabled: bool,
    pub last_run: Option<String>,
}

/// ASE Scheduler Settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AseSchedulerSettings {
    pub server_id: i64,
    pub mode: String,
    pub basic_interval_hours: i32,
    pub basic_warning_minutes: String,
    pub next_run_basic: Option<String>,
    pub advanced_time: Option<String>,
    pub advanced_days: Option<String>,
    pub advanced_warning_minutes: Option<String>,
    pub advanced_shutdown: bool,
    pub advanced_update: bool,
    pub advanced_restart: bool,
    pub advanced_dino_wipe: bool,
    pub watchdog_enabled: bool,
    pub backup_on_restart: bool,
    pub backup_on_update: bool,
    pub include_cluster_backup: bool,
}

/// Server creation request from frontend
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAseServerRequest {
    pub name: String,
    pub install_path: String,
    pub map_name: String,
    pub game_port: u16,
    pub query_port: u16,
    pub rcon_port: u16,
    pub admin_password: String,
    pub session_name: String,
}
