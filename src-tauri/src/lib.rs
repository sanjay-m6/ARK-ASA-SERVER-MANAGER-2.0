pub mod commands;
mod db;
mod models;
mod utils;
mod services;

use commands::rcon::RconState;
use db::Database;
use services::discord_bridge::DiscordBridgeService;
use services::advanced_config::AdvancedConfigService;
use services::anti_cheat::AntiCheatService;
use services::file_watcher::FileWatcherService;
use services::player_intelligence::PlayerIntelligenceService;
use services::plugin_manager::PluginManagerService;
use services::process_manager::ProcessManager;
use services::rcon::RconService;
use services::steamcmd::SteamCmdService;
use services::scheduler::SchedulerService;
use services::cross_chat::CrossChatService;
use std::sync::{Arc, Mutex};
use sysinfo::System;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<Database>,
    pub process_manager: ProcessManager,
    pub sys: Mutex<System>,
    pub app_handle: tauri::AppHandle,
    pub file_watcher: FileWatcherService,
    pub discord_bridge: Arc<DiscordBridgeService>,
    pub player_intelligence: Arc<PlayerIntelligenceService>,
    pub plugin_manager: Arc<PluginManagerService>,
    pub anti_cheat: Arc<AntiCheatService>,
    pub scheduler: Arc<SchedulerService>,
    pub cross_chat: Arc<CrossChatService>,
    pub advanced_config: Arc<AdvancedConfigService>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(safe_mode: bool) -> tauri::Result<()> {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            // Check for Admin Privileges (Windows)
            #[cfg(windows)]
            {
                use windows_sys::Win32::UI::Shell::IsUserAnAdmin;
                let is_admin = unsafe { IsUserAnAdmin() != 0 };
                
                if !is_admin {
                    println!("❌ Application requires Administrator privileges! Handing off to Frontend UI.");
                    // Native dialog removed. Frontend will block execution.
                }
            }

            // Initialize database
            let app_dir = app.path().app_data_dir().expect("failed to get app data dir");
            std::fs::create_dir_all(&app_dir).expect("failed to create app data dir");
            let db_path = app_dir.join("asa_manager.db");
            let db = match Database::new(db_path.clone()) {
                Ok(db) => db,
                Err(e) => {
                    println!("❌ Database connection failed: {}", e);
                    println!("⚠️ Attempting to repair by backing up and resetting...");
                    
                    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
                    let backup_path = app_dir.join(format!("asa_manager_corrupted_{}.db", timestamp));
                    
                    if let Err(rename_err) = std::fs::rename(&db_path, &backup_path) {
                        eprintln!("Failed to rename corrupted DB: {}", rename_err);
                    } else {
                        println!("✅ Corrupted DB backed up to: {:?}", backup_path);
                    }

                    // Retry initialization with fresh DB
                    Database::new(db_path).expect("failed to initialize database after reset")
                }
            };

            // Recover orphaned servers or reset status
            // Instead of blindly setting all to 'stopped', check if server processes are still alive
            if let Ok(conn) = db.get_connection() {
                // Get all servers that were in active states
                let active_server_ids: Vec<i64> = {
                    let mut stmt = conn.prepare(
                        "SELECT id FROM servers WHERE status IN ('running', 'starting', 'online', 'restarting', 'updating', 'stopping')"
                    ).unwrap_or_else(|_| conn.prepare("SELECT 0 WHERE 0").unwrap());
                    stmt.query_map([], |row| row.get(0))
                        .map(|iter| iter.filter_map(|r| r.ok()).collect())
                        .unwrap_or_default()
                };

                if active_server_ids.is_empty() {
                    println!("[LIFECYCLE] No active servers found on startup, skipping recovery.");
                } else {
                    // Check which ArkAscendedServer.exe processes are still running
                    let mut check_sys = sysinfo::System::new();
                    check_sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

                    let ark_alive: bool = check_sys.processes().values().any(|p| {
                        let name = p.name().to_string_lossy().to_lowercase();
                        name.contains("arkascendedserver")
                    });

                    if ark_alive {
                        println!("[LIFECYCLE] Found running ArkAscendedServer processes on startup. Keeping active server status.");
                        // Don't reset — allow the manager to re-detect these processes
                    } else {
                        println!("[LIFECYCLE] No ArkAscendedServer processes found. Resetting {} servers to stopped.", active_server_ids.len());
                        let _ = conn.execute(
                            "UPDATE servers SET status = 'stopped' WHERE status IN ('running', 'starting', 'online', 'restarting', 'updating', 'stopping')",
                            [],
                        );
                    }
                }
            }

            let mut sys = System::new_all();
            sys.refresh_all();

            let app_handle = app.handle().clone();

            // Initialize all services
            let file_watcher = FileWatcherService::new(app_handle.clone());
            let player_intelligence = Arc::new(PlayerIntelligenceService::new());
            let plugin_manager = Arc::new(PluginManagerService::new(app_handle.clone()));
            let discord_bridge = Arc::new(DiscordBridgeService::new(
                app_handle.clone(),
                player_intelligence.clone(),
            ));
            let rcon_service = RconService::new();
            let scheduler = Arc::new(SchedulerService::new(app_handle.clone()));
            let anti_cheat = Arc::new(AntiCheatService::new(app_handle.clone()));
            let cross_chat = Arc::new(CrossChatService::new(rcon_service.clone()));
            let advanced_config = Arc::new(AdvancedConfigService::new(app_handle.clone()));

            // 1. Manage AppState BEFORE starting any background tasks
            app.manage(AppState {
                db: Mutex::new(db),
                process_manager: ProcessManager::new(app_handle.clone()),
                sys: Mutex::new(sys),
                app_handle: app_handle.clone(),
                file_watcher,
                discord_bridge: discord_bridge.clone(),
                player_intelligence: player_intelligence.clone(),
                plugin_manager: plugin_manager.clone(),
                anti_cheat: anti_cheat.clone(),
                scheduler: scheduler.clone(),
                cross_chat,
                advanced_config,
            });

            // 2. Initialize RCON and Guardian state
            app.manage(RconState(rcon_service.clone()));
            app.manage(services::guardian::GuardianState(Arc::new(
                tokio::sync::Mutex::new(services::guardian::GuardianService::new()),
            )));

            // 3. Start background tasks ONLY AFTER state is managed
            if !safe_mode {
                scheduler.start();
                anti_cheat.start();
                discord_bridge.start();
                rcon_service.spawn_heartbeat();
            }

            // 4. Spawn Auto-Start and Watcher Logic (after state is managed and services are started)
            let app_handle_clone = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Wait a moment for State to be ready and services to settle
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                
                let state = match app_handle_clone.try_state::<AppState>() {
                    Some(s) => s,
                    None => {
                        eprintln!("❌ AppState not found in background task!");
                        return;
                    }
                };

                if !safe_mode {
                    // Access DB to get servers with automation enabled
                    if let Ok(db_guard) = state.db.lock() {
                        if let Ok(conn) = db_guard.get_connection() {
                            // 1. Check for Auto-Start Servers
                            let mut stmt = match conn.prepare("SELECT id, install_path FROM servers WHERE auto_start = 1") {
                                Ok(s) => s,
                                Err(e) => {
                                    eprintln!("❌ Failed to prepare auto-start stmt: {}", e);
                                    return;
                                }
                            };
                            
                            let rows = stmt.query_map([], |row| {
                                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                            });

                            if let Ok(rows) = rows {
                                for row in rows {
                                    if let Ok((id, _path)) = row {
                                        println!("🚀 Auto-starting server {}", id);
                                        let h = app_handle_clone.clone();
                                        tauri::async_runtime::spawn(async move {
                                            let _ = commands::server::start_server(h, id, false).await;
                                        });
                                    }
                                }
                            }

                            // 2. Initialize File Watchers for Auto-Stop
                            let mut stmt_stop = match conn.prepare("SELECT id, install_path FROM servers WHERE auto_stop = 1") {
                                Ok(s) => s,
                                Err(e) => {
                                    eprintln!("❌ Failed to prepare auto-stop stmt: {}", e);
                                    return;
                                }
                            };
                            
                            let rows_stop = stmt_stop.query_map([], |row| {
                                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                            });

                            if let Ok(rows_stop) = rows_stop {
                                for row in rows_stop {
                                    if let Ok((id, path)) = row {
                                        let _ = state.file_watcher.start_watching(id, std::path::PathBuf::from(path));
                                    }
                                }
                            }
                        }
                    }
                } else {
                     println!("⚠️ Safe Mode Active: Skipping Auto-Start and Watchers.");
                }
            });

            // Check and install SteamCMD
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let steamcmd = SteamCmdService::new(app_handle);
                if !steamcmd.check_installation() {
                    println!("SteamCMD not found, installing...");
                    if let Err(e) = steamcmd.install().await {
                        eprintln!("Failed to install SteamCMD: {}", e);
                    }
                } else {
                    println!("SteamCMD is already installed.");
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // System commands
            commands::system::get_system_info,
            commands::system::select_folder,
            commands::system::select_file, // <-- New Command
            commands::system::select_plugin_zip,
            commands::system::get_setting,
            commands::system::set_setting,
            commands::system::run_diagnostics,
            commands::system::install_steamcmd, // <-- New Command
            // Server commands
            commands::server::get_all_servers,
            commands::server::update_server_status_in_db,
            commands::server::get_server_by_id,
            commands::server::install_server,
            commands::server::start_server,
            commands::server::start_server_no_mods,
            commands::server::stop_server,
            commands::server::restart_server,
            commands::server::delete_server,
            commands::server::update_server,
            commands::server::update_server_settings,
            commands::server::clone_server,
            commands::server::transfer_settings,
            commands::server::extract_save_data,
            commands::server::check_server_reachability,
            commands::server::get_server_logs,
            commands::server::import_server,
            commands::server::show_server_console,
            commands::server::toggle_automation,
            commands::server::debug_database_check, // <-- New Command
            commands::server::repair_steamcmd,
            commands::server::clear_steamcmd_cache,
            commands::server::get_steamcmd_health,
            commands::import::import_non_dedicated_save, // <-- New Command
            // Mod commands
            commands::mods::search_mods,
            commands::mods::get_mod_description,
            commands::mods::install_mod,
            commands::mods::uninstall_mod,
            commands::mods::get_installed_mods,
            commands::mods::update_mod_order,
            commands::mods::toggle_mod,
            commands::mods::verify_mod_integrity,
            commands::mods::validate_mod_ids,
            commands::mods::generate_mod_config,
            commands::mods::apply_mods_to_server,
            commands::mods::get_mod_install_instructions,
            commands::mods::hardcore_retry_mods,
            commands::mods::copy_mods_to_server,
            commands::mods::verify_curseforge_key,
            commands::mods::get_mod_categories,
            // Modpack commands
            commands::config::read_config,
            commands::config::save_config,
            commands::config::load_server_config,
            commands::config::backup_config,
            commands::config::restore_config,
            commands::config::list_config_backups,
            // Config generator commands
            commands::config::get_map_profiles,
            commands::config::get_map_profile,
            commands::config::preview_game_user_settings,
            commands::config::preview_game_ini,
            commands::config::generate_startup_command,
            commands::config::apply_map_profile_to_config,
            commands::config::write_server_configs,
            commands::config::backup_all_configs,
            commands::config::get_default_config,
            // Cluster commands
            commands::cluster::create_cluster,
            commands::cluster::get_clusters,
            commands::cluster::delete_cluster,
            commands::cluster::update_cluster,
            commands::cluster::add_server_to_cluster,
            commands::cluster::remove_server_from_cluster,
            commands::cluster::validate_cluster_path,
            commands::cluster::get_cluster_status,
            commands::cluster::start_cluster,
            commands::cluster::stop_cluster,
            commands::cluster::toggle_cluster_cross_chat,
            commands::cluster::get_cluster_cross_chat_status,
            commands::cluster::validate_cluster_configuration,
            // Backup commands
            commands::backup::create_backup,
            commands::backup::get_backups,
            commands::backup::restore_backup,
            commands::backup::delete_backup,
            commands::backup::verify_backup,
            commands::backup::get_backup_contents,
            commands::backup::cleanup_old_backups,
            // Scheduler commands
            commands::scheduler::get_scheduled_tasks,
            commands::scheduler::create_scheduled_task,
            commands::scheduler::toggle_scheduled_task,
            commands::scheduler::delete_scheduled_task,
            commands::scheduler::update_task_last_run,
            commands::scheduler::get_scheduler_settings,
            commands::scheduler::save_scheduler_settings,
            // RCON commands
            commands::rcon::rcon_connect,
            commands::rcon::rcon_disconnect,
            commands::rcon::rcon_send_command,
            commands::rcon::rcon_get_players,
            commands::rcon::rcon_broadcast,
            commands::rcon::rcon_kick_player,
            commands::rcon::rcon_ban_player,
            commands::rcon::rcon_unban_player,
            commands::rcon::rcon_save_world,
            commands::rcon::rcon_destroy_wild_dinos,
            commands::rcon::rcon_set_time,
            commands::rcon::rcon_message_player,
            commands::rcon::rcon_is_connected,
            // Guardian commands
            services::guardian::get_server_health,
            services::guardian::get_all_server_health,
            services::guardian::set_auto_restart,
            services::guardian::get_crash_log,
            services::guardian::register_server_pid,
            // Player Intelligence commands
            commands::player::get_player_stats,
            commands::player::get_all_players,
            commands::player::get_player_sessions,
            commands::player::update_player_notes,
            commands::player::set_player_whitelist,
            commands::player::set_player_ban,
            commands::player::record_player_session,
            commands::player::search_players,
            // Plugin commands
            commands::plugin::check_plugin_status, // <-- New Command
            commands::plugin::check_asa_api_installed,
            commands::plugin::get_plugin_directory,
            commands::plugin::import_plugin_archive,
            commands::plugin::get_installed_plugins,
            commands::plugin::uninstall_plugin,
            commands::plugin::toggle_plugin,
            // File Manager commands
            commands::file_manager::read_directory,
            commands::file_manager::read_file_content,
            commands::file_manager::write_file_content,
            commands::file_manager::get_parent_directory,
            commands::file_manager::get_disks,
            commands::file_manager::create_directory,
            commands::file_manager::rename_item,
            commands::file_manager::delete_item,
            commands::file_manager::open_in_explorer,
            // Firewall commands
            commands::firewall::get_all_servers_firewall_status,
            commands::firewall::get_firewall_status,
            commands::firewall::create_firewall_rules,
            commands::firewall::remove_firewall_rules,
            commands::firewall::create_all_firewall_rules,
            // Manual port commands
            commands::firewall::check_manual_port_status,
            commands::firewall::create_manual_firewall_rule,
            commands::firewall::remove_manual_firewall_rule,
            commands::firewall::create_manual_firewall_rules,
            // System commands
            commands::system::optimize_memory,
            commands::system::set_process_priority,
            commands::system::toggle_eco_mode,
            commands::system::request_admin_privileges, // <-- New Command
            // Anti-Cheat commands
            commands::anti_cheat::get_anti_cheat_config,
            commands::anti_cheat::save_anti_cheat_config,
            commands::anti_cheat::get_anti_cheat_logs,

            // Cross Chat Commands
             commands::cross_chat::enable_cross_chat,
             commands::cross_chat::disable_cross_chat,
             commands::cross_chat::is_cross_chat_enabled,

             // Advanced Config
             commands::advanced_config::get_event_profiles,
             commands::advanced_config::save_event_profile,
             commands::advanced_config::activate_event_profile,
             commands::advanced_config::get_transfer_policy,

             commands::advanced_config::save_transfer_policy,

             // Admin Check
             utils::admin_check::check_is_admin,

             // Discord Bridge Commands
             commands::discord::save_discord_bridge_config,
             commands::discord::get_discord_bridge_config,
             commands::discord::start_discord_bridge,
             commands::discord::stop_discord_bridge,
             commands::discord::test_discord_bridge_connection,
             commands::discord::generate_bot_invite_url,
             commands::discord::send_discord_status_update,
        ])
        .run(tauri::generate_context!())
}
