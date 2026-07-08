pub mod server;
pub mod mods;
pub mod backup;
pub mod config;
pub mod cluster;
pub mod rcon;
pub mod scheduler;
pub mod discord;
pub mod profile_sync;
pub mod config_advanced;
pub mod tools;
pub mod import;
pub mod players;
pub mod boost;

/// Collect all ASE command handler names for registration in lib.rs
pub fn get_all_handlers() -> Vec<&'static str> {
    vec![
        // Server
        "get_ase_servers",
        "get_ase_server_by_id",
        "create_ase_server",
        "delete_ase_server",
        "update_ase_server",
        "clone_ase_server",
        "transfer_ase_settings",
        "extract_ase_save_data",
        "install_ase_server",
        "update_ase_server_install",
        "start_ase_server",
        "stop_ase_server",
        "get_ase_server_status",
        "get_ase_launch_arguments",
        "reset_ase_server",
        "import_ase_server",
        "import_ase_save",
        // Mods
        "search_ase_workshop",
        "get_ase_workshop_details",
        "download_ase_workshop_mod",
        "remove_ase_workshop_mod",
        "get_installed_ase_mods",
        // Config
        "read_ase_config",
        "write_ase_config",
        "validate_ase_config",
        // Backup
        "create_ase_backup",
        "list_ase_backups",
        "restore_ase_backup",
        "delete_ase_backup",
        // Cluster
        "create_ase_cluster",
        "get_ase_clusters",
        "add_server_to_ase_cluster",
        // RCON
        "connect_ase_rcon",
        "send_ase_rcon",
        // Scheduler
        "get_ase_scheduled_tasks",
        "create_ase_scheduled_task",
        "toggle_ase_scheduled_task",
        "delete_ase_scheduled_task",
        "get_ase_scheduler_settings",
        "save_ase_scheduler_settings",
        // Discord
        "save_ase_discord_config",
        "get_ase_discord_config",
        "test_ase_discord_webhook",
        "generate_ase_bot_invite_url",
        // Profile Sync
        "list_ase_profiles",
        "copy_ase_profiles",
        "sync_ase_lists",
        // Players
        "get_ase_players",
        "save_ase_players",
        // Tools
        "check_ase_api_installed",
        "get_installed_ase_plugins",
        "get_ase_tribe_logs",
        "discover_ase_upnp_gateway",
        "forward_ase_server_ports",
        "remove_ase_server_port_forwards",
        "get_local_ip",
        "generate_diagnostics_report",
    ]
}
