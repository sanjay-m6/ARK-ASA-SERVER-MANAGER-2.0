pub mod commands;
mod db;
mod models;
mod utils;
mod services;
pub mod ase;

use commands::rcon::RconState;
use db::Database;
use services::discord_bridge::DiscordBridgeService;
use services::ase_discord_bridge::AseDiscordBridgeService;
use services::advanced_config::AdvancedConfigService;
use services::anti_cheat::AntiCheatService;
use services::file_watcher::FileWatcherService;
use services::log_watcher::LogWatcherService;
use services::player_intelligence::PlayerIntelligenceService;
use services::plugin_manager::PluginManagerService;
use services::process_manager::ProcessManager;
use services::rcon::RconService;
use services::steamcmd::SteamCmdService;
use services::scheduler::SchedulerService;
use services::cross_chat::CrossChatService;
use services::cloud_backup_service::CloudBackupService;
use services::mod_watchdog::ModWatchdogService;
use std::sync::{Arc, Mutex};
use sysinfo::System;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<Database>,
    pub process_manager: ProcessManager,
    pub sys: Mutex<System>,
    pub app_handle: tauri::AppHandle,
    pub file_watcher: FileWatcherService,
    pub log_watcher: LogWatcherService,
    pub discord_bridge: Arc<DiscordBridgeService>,
    pub ase_discord_bridge: Arc<AseDiscordBridgeService>,
    pub player_intelligence: Arc<PlayerIntelligenceService>,
    pub plugin_manager: Arc<PluginManagerService>,
    pub anti_cheat: Arc<AntiCheatService>,
    pub scheduler: Arc<SchedulerService>,
    pub cross_chat: Arc<CrossChatService>,
    pub advanced_config: Arc<AdvancedConfigService>,
    pub cloud_backup: Arc<CloudBackupService>,
    pub mod_watchdog: Arc<ModWatchdogService>,
    pub combat_metrics: Arc<services::combat_metrics_server::CombatMetricsServerService>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(safe_mode: bool) -> tauri::Result<()> {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(crate::commands::server_organization::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app_handle = window.app_handle().clone();
                let state = match app_handle.try_state::<AppState>() {
                    Some(s) => s,
                    None => return,
                };
                
                let minimize_to_tray = {
                    if let Ok(db_guard) = state.db.lock() {
                        if let Ok(conn) = db_guard.get_connection() {
                            conn.query_row(
                                "SELECT value FROM settings WHERE key = 'start_minimized_to_tray'",
                                [],
                                |row| row.get::<_, String>(0)
                            ).map(|v| v == "true").unwrap_or(false)
                        } else { false }
                    } else { false }
                };

                if minimize_to_tray {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
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
            let app_dir = app.path().app_data_dir().map_err(|e| format!("failed to get app data dir: {}", e))?;
            std::fs::create_dir_all(&app_dir).map_err(|e| format!("failed to create app data dir: {}", e))?;
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
                    Database::new(db_path).map_err(|e| format!("failed to initialize database after reset: {}", e))?
                }
            };

            // Build the Native System Tray icon
            use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};
            use tauri::menu::{Menu, MenuItem};

            let app_handle = app.handle().clone();
            
            let show_i = MenuItem::with_id(&app_handle, "show", "Show Manager", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(&app_handle, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(&app_handle, &[&show_i, &quit_i])?;

            let icon = app.default_window_icon().cloned().expect("Default window icon is required for tray");

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .on_menu_event(|app: &tauri::AppHandle, event| {
                    match event.id.as_ref() {
                        "quit" => {
                            app.exit(0);
                        }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray: &tauri::tray::TrayIcon, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Check if we should start minimized
            let args: Vec<String> = std::env::args().collect();
            let start_minimized = args.iter().any(|arg| arg == "--minimized" || arg == "-m") 
                || {
                    if let Ok(conn) = db.get_connection() {
                        conn.query_row(
                            "SELECT value FROM settings WHERE key = 'start_minimized_to_tray'",
                            [],
                            |row| row.get::<_, String>(0)
                        ).map(|v| v == "true").unwrap_or(false)
                    } else { false }
                };

            if start_minimized {
                println!("🚀 Launching minimized to tray as requested.");
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            // Recover orphaned servers or reset status
            // Instead of blindly setting all to 'stopped', check if server processes are still alive
            if let Ok(conn) = db.get_connection() {
                // Get all servers that were in active states
                let active_server_ids: Vec<i64> = {
                    let stmt_result = conn.prepare(
                        "SELECT id FROM servers WHERE status IN ('running', 'starting', 'online', 'restarting', 'updating', 'stopping')"
                    );
                    if let Ok(mut stmt) = stmt_result {
                        stmt.query_map([], |row| row.get(0))
                            .map(|iter| iter.filter_map(|r| r.ok()).collect())
                            .unwrap_or_default()
                    } else {
                        Vec::new()
                    }
                };

                let active_ase_server_ids: Vec<i64> = {
                    let stmt_result = conn.prepare(
                        "SELECT id FROM ase_servers WHERE status IN ('running', 'starting', 'online', 'restarting', 'updating', 'stopping')"
                    );
                    if let Ok(mut stmt) = stmt_result {
                        stmt.query_map([], |row| row.get(0))
                            .map(|iter| iter.filter_map(|r| r.ok()).collect())
                            .unwrap_or_default()
                    } else {
                        Vec::new()
                    }
                };

                if !active_server_ids.is_empty() || !active_ase_server_ids.is_empty() {
                    let mut check_sys = sysinfo::System::new();
                    check_sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

                    if !active_server_ids.is_empty() {
                        let ark_alive: bool = check_sys.processes().values().any(|p| {
                            let name = p.name().to_string_lossy().to_lowercase();
                            name.contains("arkascendedserver")
                        });

                        if ark_alive {
                            println!("[LIFECYCLE] Found running ArkAscendedServer processes on startup. Keeping active server status.");
                        } else {
                            println!("[LIFECYCLE] No ArkAscendedServer processes found. Resetting {} servers to stopped.", active_server_ids.len());
                            let _ = conn.execute(
                                "UPDATE servers SET status = 'stopped' WHERE status IN ('running', 'starting', 'online', 'restarting', 'updating', 'stopping')",
                                [],
                            );
                        }
                    }

                    if !active_ase_server_ids.is_empty() {
                        let ase_alive: bool = check_sys.processes().values().any(|p| {
                            let name = p.name().to_string_lossy().to_lowercase();
                            name.contains("shootergameserver")
                        });

                        if ase_alive {
                            println!("[LIFECYCLE] Found running ShooterGameServer processes on startup. Keeping active ASE server status.");
                        } else {
                            println!("[LIFECYCLE] No ShooterGameServer processes found. Resetting {} ASE servers to stopped.", active_ase_server_ids.len());
                            let _ = conn.execute(
                                "UPDATE ase_servers SET status = 'stopped' WHERE status IN ('running', 'starting', 'online', 'restarting', 'updating', 'stopping')",
                                [],
                            );
                        }
                    }
                } else {
                    println!("[LIFECYCLE] No active servers found on startup, skipping recovery.");
                }
            }

            let mut sys = System::new_all();
            sys.refresh_all();

            let app_handle = app.handle().clone();

            // Initialize all services
            let file_watcher = FileWatcherService::new(app_handle.clone());
            let log_watcher = LogWatcherService::new(app_handle.clone());
            let player_intelligence = Arc::new(PlayerIntelligenceService::new());
            let plugin_manager = Arc::new(PluginManagerService::new(app_handle.clone()));
            let discord_bridge = Arc::new(DiscordBridgeService::new(
                app_handle.clone(),
                player_intelligence.clone(),
            ));
            let ase_discord_bridge = Arc::new(AseDiscordBridgeService::new(
                app_handle.clone(),
                player_intelligence.clone(),
            ));
            let rcon_service = RconService::new();
            let scheduler = Arc::new(SchedulerService::new(app_handle.clone()));
            let anti_cheat = Arc::new(AntiCheatService::new(app_handle.clone()));
            let cross_chat = Arc::new(CrossChatService::new(rcon_service.clone()));
            let advanced_config = Arc::new(AdvancedConfigService::new(app_handle.clone()));
            let cloud_backup = Arc::new(CloudBackupService::new());
            let mod_watchdog = Arc::new(ModWatchdogService::new(app_handle.clone()));
            let combat_metrics = Arc::new(services::combat_metrics_server::CombatMetricsServerService::new(app_handle.clone()));

            // 1. Manage AppState BEFORE starting any background tasks
            app.manage(AppState {
                db: Mutex::new(db),
                process_manager: ProcessManager::new(app_handle.clone()),
                sys: Mutex::new(sys),
                app_handle: app_handle.clone(),
                file_watcher,
                log_watcher,
                discord_bridge: discord_bridge.clone(),
                ase_discord_bridge: ase_discord_bridge.clone(),
                player_intelligence: player_intelligence.clone(),
                plugin_manager: plugin_manager.clone(),
                anti_cheat: anti_cheat.clone(),
                scheduler: scheduler.clone(),
                cross_chat,
                advanced_config,
                cloud_backup: cloud_backup.clone(),
                mod_watchdog: mod_watchdog.clone(),
                combat_metrics: combat_metrics.clone(),
            });

            // 2. Initialize RCON and Guardian state
            app.manage(RconState(rcon_service.clone()));
            let guardian_service = Arc::new(tokio::sync::Mutex::new(services::guardian::GuardianService::new()));
            app.manage(services::guardian::GuardianState(guardian_service.clone()));
            app.manage(cloud_backup.clone());
            app.manage(player_intelligence.clone());

            // 3. Start background tasks ONLY AFTER state is managed
            if !safe_mode {
                scheduler.start();
                anti_cheat.start();
                discord_bridge.start();
                ase_discord_bridge.start();
                rcon_service.spawn_heartbeat(app_handle.clone());
                mod_watchdog.start_worker();
                combat_metrics.start();

                // Start Guardian Watchdog!
                let app_handle_for_guardian = app_handle.clone();
                let guardian_clone = guardian_service.clone();
                tauri::async_runtime::spawn(async move {
                    let guard = guardian_clone.lock().await;
                    guard.start_watchdog(app_handle_for_guardian);
                });
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

                // Sync all ASE servers with their INI files on startup
                if !safe_mode {
                    let mut ase_server_ids = Vec::new();
                    if let Ok(db_guard) = state.db.lock() {
                        if let Ok(conn) = db_guard.get_connection() {
                            if let Ok(mut stmt) = conn.prepare("SELECT id FROM ase_servers") {
                                if let Ok(rows) = stmt.query_map([], |row| row.get::<_, i64>(0)) {
                                    for id in rows.flatten() {
                                        ase_server_ids.push(id);
                                    }
                                }
                            }
                        }
                    }

                    println!("⚙️ [ASE Startup Sync] Found {} ASE servers to sync on boot.", ase_server_ids.len());
                    for id in ase_server_ids {
                        let h = app_handle_clone.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Some(state) = h.try_state::<crate::AppState>() {
                                println!("⚙️ [ASE Startup Sync] Syncing server {} from INI files...", id);
                                let _ = crate::ase::commands::config::sync_ase_server_from_ini(id, state).await;
                            }
                        });
                    }
                }

                if !safe_mode {
                    // Check if Global Auto-Start is enabled
                    let global_auto_start = {
                        if let Ok(db_guard) = state.db.lock() {
                            if let Ok(conn) = db_guard.get_connection() {
                                conn.query_row(
                                    "SELECT value FROM settings WHERE key = 'global_auto_start_enabled'",
                                    [],
                                    |row| row.get::<_, String>(0)
                                ).map(|v| v == "true").unwrap_or(false)
                            } else { false }
                        } else { false }
                    };

                    if global_auto_start {
                        println!("🚀 Global Auto-Start is ENABLED. Starting boot sequence...");

                        // Get global boot delay
                        let global_delay = {
                            if let Ok(db_guard) = state.db.lock() {
                                if let Ok(conn) = db_guard.get_connection() {
                                    conn.query_row(
                                        "SELECT value FROM settings WHERE key = 'global_boot_delay'",
                                        [],
                                        |row| row.get::<_, String>(0)
                                    ).ok().and_then(|v| v.parse::<u64>().ok()).unwrap_or(0)
                                } else { 0 }
                            } else { 0 }
                        };

                        if global_delay > 0 {
                            println!("🚀 Global boot delay active: sleeping for {} seconds...", global_delay);
                            tokio::time::sleep(std::time::Duration::from_secs(global_delay)).await;
                        }

                        // Query all servers with auto_start = 1, ordered by startup_priority ASC
                        let mut servers_to_start = Vec::new();
                        if let Ok(db_guard) = state.db.lock() {
                            if let Ok(conn) = db_guard.get_connection() {
                                let mut stmt = match conn.prepare(
                                    "SELECT id, 'ASA' as server_type, startup_delay, startup_priority, name FROM servers WHERE auto_start = 1 AND id NOT IN (SELECT server_id FROM server_archive) \
                                     UNION ALL \
                                     SELECT id, 'ASE' as server_type, startup_delay, startup_priority, name FROM ase_servers WHERE auto_start = 1 \
                                     ORDER BY startup_priority ASC"
                                ) {
                                    Ok(s) => s,
                                    Err(e) => {
                                        eprintln!("❌ Failed to prepare sequential auto-start query: {}", e);
                                        return;
                                    }
                                };
                                let rows_result = stmt.query_map([], |row| {
                                    Ok((
                                        row.get::<_, i64>(0)?,
                                        row.get::<_, String>(1)?,
                                        row.get::<_, i64>(2)?,
                                        row.get::<_, String>(4)?
                                    ))
                                });
                                if let Ok(rows) = rows_result {
                                    for row in rows.flatten() {
                                        servers_to_start.push(row);
                                    }
                                }
                            }
                        }

                        println!("🚀 Found {} servers configured for sequential auto-start.", servers_to_start.len());

                        for (id, server_type, delay, name) in servers_to_start {
                            if delay > 0 {
                                println!("🚀 Delaying startup of '{}' ({}) by {} seconds...", name, server_type, delay);
                                tokio::time::sleep(std::time::Duration::from_secs(delay as u64)).await;
                            }

                            println!("🚀 Launching server '{}' ({})...", name, server_type);
                            let h = app_handle_clone.clone();
                            if server_type == "ASE" {
                                tauri::async_runtime::spawn(async move {
                                    if let Some(state) = h.try_state::<crate::AppState>() {
                                        println!("🚀 Auto-starting ASE server '{}' (ID: {})...", name, id);
                                        let _ = crate::ase::commands::server::start_ase_server(h.clone(), id, state).await;
                                    }
                                });
                            } else {
                                tauri::async_runtime::spawn(async move {
                                    let _ = commands::server::start_server(h, id, false).await;
                                });
                            }
                        }
                    }
                } else {
                    println!("🚀 Safe Mode is ENABLED. Skipping sequential boot sequence.");
                }

                // 2. Initialize File Watchers for Auto-Stop
                if !safe_mode {
                    if let Ok(db_guard) = state.db.lock() {
                        if let Ok(conn) = db_guard.get_connection() {
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
                                for (id, path) in rows_stop.flatten() {
                                    let _ = state.file_watcher.start_watching(id, std::path::PathBuf::from(path));
                                }
                            }
                        }
                    }
                } else {
                     println!("⚠️ Safe Mode Active: Skipping Auto-Start and Watchers.");
                }
            });

            // Check and install SteamCMD (supports custom path override)
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Resolve custom SteamCMD path from DB if configured
                let steamcmd = if let Some(state) = app_handle.try_state::<AppState>() {
                    match services::resolve_steamcmd_dir_from_state(&state, &app_handle) {
                        Ok(dir) => SteamCmdService::with_custom_dir(app_handle.clone(), dir),
                        Err(_) => SteamCmdService::new(app_handle.clone()),
                    }
                } else {
                    SteamCmdService::new(app_handle.clone())
                };

                if !steamcmd.check_installation() {
                    println!("SteamCMD not found, installing... ");
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
             commands::system::install_steamcmd,
             commands::system::set_startup_shortcut,
             commands::system::set_startup_task_scheduler,
             commands::system::get_auto_start_config,
             commands::system::set_auto_start_config,
             commands::system::set_server_startup_config,
            commands::system::get_player_counts,
             commands::system::get_app_logs_dir,
            commands::system::rollback_to_version,
            commands::system::uninstall_application,
            commands::system::validate_steamcmd_path,
            commands::system::get_steamcmd_dir,
            // Server commands
            commands::server::get_all_servers,
            commands::server::update_server_status_in_db,
            commands::server::get_server_by_id,
            commands::server::get_server_version,
            commands::server::get_latest_server_version,
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
            commands::server::preview_import_settings,
            commands::server::show_server_console,
            commands::server::toggle_automation,
            commands::server::debug_database_check, // <-- New Command
            commands::server::repair_steamcmd,
            commands::server::clear_steamcmd_cache,
            commands::server::get_steamcmd_health,
            commands::server::check_port_conflicts,
            commands::server::get_server_visibility_status,
            commands::server::move_server, // <-- New Command
            commands::server::clear_mod_cache,
            commands::server::diagnose_mod_loading,
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
            // Modpack & Conflict Scanner commands
            commands::mods::check_mod_conflicts,
            commands::mods::export_modpack,
            commands::mods::import_modpack,
            commands::mods::sync_banlist,
            // Config commands
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
            commands::cluster::update_cluster,
            commands::cluster::get_clusters,
            commands::cluster::delete_cluster,
            commands::cluster::add_server_to_cluster,
            commands::cluster::remove_server_from_cluster,
            commands::cluster::validate_cluster_path,
            commands::cluster::get_cluster_status,
            commands::cluster::start_cluster,
            commands::cluster::stop_cluster,
            commands::cluster::toggle_cluster_cross_chat,
            commands::cluster::get_cluster_cross_chat_status,
            commands::cluster::get_cluster_cross_chat_config,
            commands::cluster::save_cluster_cross_chat_config,
            commands::cluster::validate_cluster_configuration,
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
            commands::rcon::start_log_stream,
            commands::rcon::stop_log_stream,
            commands::rcon::rcon_execute_cluster_command,
            commands::rcon::rcon_validate_save,
            commands::rcon::rcon_resolve_player_ids,
            // Discord panel commands
            commands::discord_panel::get_cluster_servers_health,
            commands::discord_panel::get_active_players,
            commands::discord_panel::get_discord_bridge_status,
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
             commands::plugin::check_plugin_status,
             commands::plugin::check_asa_api_installed,
             commands::plugin::install_asa_api,
             commands::plugin::get_plugin_directory,
             commands::plugin::import_plugin_archive,
             commands::plugin::scan_plugins,
             commands::plugin::uninstall_plugin,
             commands::plugin::toggle_plugin,
             commands::plugin::set_all_plugins_enabled,
             commands::plugin::open_plugin_folder,
             commands::plugin::create_default_plugin,
             commands::plugin::toggle_api_loader,
                 // Chat Translator Commands
              commands::chat_translator::get_translator_config,
              commands::chat_translator::save_translator_config,
              commands::chat_translator::get_translator_player_prefs,
              commands::chat_translator::save_translator_player_pref,
              commands::chat_translator::delete_translator_player_pref,
              commands::chat_translator::get_translator_stats,
              commands::chat_translator::reset_translator_stats,
              commands::chat_translator::install_translator_plugin,
              commands::chat_translator::uninstall_translator_plugin,
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
            commands::firewall::get_all_ase_servers_firewall_status,
            commands::firewall::get_ase_firewall_status,
            commands::firewall::create_ase_firewall_rules,
            commands::firewall::remove_ase_firewall_rules,
            commands::firewall::create_all_ase_firewall_rules,
            commands::firewall::configure_ase_firewall,
            commands::firewall::configure_firewall,
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
            
            // Hardware commands
            commands::hardware::get_cpu_topology,
            commands::hardware::get_hardware_allocation,
            commands::hardware::save_hardware_allocation,
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

             utils::admin_check::check_is_admin,

             // Discord Bridge Commands
             commands::discord::save_discord_bridge_config,
             commands::discord::get_discord_bridge_config,
             commands::discord::start_discord_bridge,
             commands::discord::stop_discord_bridge,
             commands::discord::test_discord_bridge_connection,
             commands::discord::generate_bot_invite_url,
             commands::discord::send_discord_status_update,

             // AI Agent Commands
             commands::ai::ai_chat,
             commands::ai::ai_chat_stream,

             // Tribe Log Commands
              commands::tribe_log::get_tribe_logs,

              // UPnP Commands
              commands::upnp::discover_upnp_gateway,
              commands::upnp::forward_server_ports,
              commands::upnp::remove_server_port_forwards,

              // Community Commands
              commands::community::get_support_tickets,
              commands::community::update_ticket_status,
              commands::community::get_discord_users,
              commands::community::add_player_points,

              // Local Backup Commands
              commands::backup::create_backup,
              commands::backup::get_backups,
              commands::backup::restore_backup,
              commands::backup::delete_backup,
              commands::backup::verify_backup,
              commands::backup::get_backup_contents,
              commands::backup::cleanup_old_backups,
              commands::backup::get_backup_policy,
              commands::backup::save_backup_policy,
              commands::backup::update_backup_label,
              commands::backup::update_backup_notes,
              commands::backup::toggle_backup_protection,

              // Cloud Backup Commands
              commands::cloud_backup::get_cloud_backup_settings,
              commands::cloud_backup::save_cloud_backup_settings,
              commands::cloud_backup::test_cloud_provider_connection,
              commands::cloud_backup::list_cloud_backups,
              commands::cloud_backup::trigger_manual_cloud_backup,
              commands::cloud_backup::restore_cloud_backup,

              // Mod Watchdog Commands
             commands::watchdog::get_watchdog_config,
             commands::watchdog::set_watchdog_config,
             
             // AutoSave Commands
             commands::autosave::register_auto_save,
             commands::autosave::get_auto_save,
             commands::autosave::list_saves_for_server,
             commands::autosave::search_saves,
             commands::autosave::update_save_label,
             commands::autosave::update_save_notes,
             commands::autosave::toggle_save_protection,
             commands::autosave::toggle_favorite,
             commands::autosave::move_save_to_folder,
             commands::autosave::delete_save,
             commands::autosave::validate_save_file,
             commands::autosave::get_validation_logs,
             commands::autosave::get_restore_history,
             commands::autosave::create_restore_point,
             commands::autosave::get_restore_points,
             commands::autosave::get_save_statistics,
             commands::autosave::get_save_health_status,
             commands::autosave::get_preferences,
             commands::autosave::get_timeline_events,
             commands::autosave::create_timeline_event,
             commands::autosave::load_server_data,
             commands::autosave::delete_old_saves,
             commands::autosave::create_save_folder,
             commands::autosave::get_save_folders,
             commands::autosave::update_save_folder,
             commands::autosave::delete_save_folder,
             commands::autosave::validate_all_saves,
             commands::autosave::restore_save,
             commands::autosave::get_restore_progress,
             commands::autosave::get_restore_backups,
             commands::autosave::delete_restore_point,
             commands::autosave::update_preferences,
             commands::autosave::bulk_delete_saves,
             commands::autosave::bulk_protect_saves,
             commands::autosave::bulk_move_saves,
             commands::autosave::bulk_compress_saves,
             commands::autosave::get_available_maps,
             commands::autosave::get_unique_server_versions,
             commands::autosave::sync_save_to_cloud,
             commands::autosave::restore_from_cloud,
             commands::autosave::export_saves,
             commands::autosave::import_saves,

             // ASA Scheduler Commands
             commands::scheduler::get_scheduled_tasks,
             commands::scheduler::create_scheduled_task,
             commands::scheduler::toggle_scheduled_task,
             commands::scheduler::delete_scheduled_task,
             commands::scheduler::update_task_last_run,
             commands::scheduler::get_scheduler_settings,
             commands::scheduler::save_scheduler_settings,

             // ASA Boost Commands
             commands::boost::get_boost_profiles,
             commands::boost::save_boost_profile,
             commands::boost::delete_boost_profile,
             commands::boost::activate_boost_profile,
             commands::boost::deactivate_boost_profile,
             commands::boost::get_active_boost_profile,

             // ═══ ASE Module Commands ═══
             // ASE Server commands
             ase::commands::server::get_ase_servers,
             ase::commands::server::get_ase_server_by_id,
             ase::commands::server::create_ase_server,
             ase::commands::server::delete_ase_server,
             ase::commands::server::update_ase_server,
             ase::commands::server::install_ase_server,
             ase::commands::server::update_ase_server_install,
             ase::commands::server::start_ase_server,
             ase::commands::server::stop_ase_server,
             ase::commands::server::get_ase_server_status,
             ase::commands::server::get_ase_launch_arguments,
             ase::commands::server::reset_ase_server,
             ase::commands::server::restart_ase_server,
             ase::commands::server::import_ase_server,
             ase::commands::server::clone_ase_server,
             ase::commands::server::transfer_ase_settings,
              ase::commands::server::extract_ase_save_data,
              ase::commands::server::validate_ase_install_path,
              ase::commands::server::run_ase_preflight_check,
              ase::commands::server::diagnose_ase_server_visibility,
              ase::commands::server::join_ase_server,
              ase::commands::server::get_ase_server_version,
              ase::commands::import::import_ase_save,
              // ASE Mod commands
              ase::commands::mods::search_ase_workshop,
              ase::commands::mods::get_ase_workshop_details,
              ase::commands::mods::download_ase_workshop_mod,
              ase::commands::mods::remove_ase_workshop_mod,
              ase::commands::mods::get_installed_ase_mods,
              ase::commands::mods::update_ase_mod_order,
              ase::commands::mods::toggle_ase_mod,
              ase::commands::mods::force_download_ase_mod,
              ase::commands::mods::force_reinstall_ase_mod,
              ase::commands::mods::validate_ase_mod,
              ase::commands::mods::repair_ase_mod,
              ase::commands::mods::clear_ase_workshop_cache,
              ase::commands::mods::get_ase_workshop_details_batch,
              ase::commands::mods::batch_download_ase_mods,
              // ASE Config commands
               ase::commands::config::read_ase_config,
               ase::commands::config::write_ase_config,
               ase::commands::config::validate_ase_config,
               ase::commands::config::sync_ase_server_from_ini,
              ase::commands::config::get_ase_config_diagnostics,
              crate::services::mod_validator::diagnose_spawn_issues,
             ase::commands::config_advanced::read_ase_ini,
             ase::commands::config_advanced::write_ase_ini,
             ase::commands::config_advanced::read_ase_ini_raw,
             ase::commands::config_advanced::write_ase_ini_raw,
             ase::commands::config_advanced::create_ase_config_backup,
             ase::commands::config_advanced::list_ase_config_backups,
             ase::commands::config_advanced::restore_ase_config_backup,
             // ASE Backup commands
             ase::commands::backup::create_ase_backup,
             ase::commands::backup::list_ase_backups,
             ase::commands::backup::restore_ase_backup,
             ase::commands::backup::delete_ase_backup,
             // ASE Cluster commands
             ase::commands::cluster::create_ase_cluster,
             ase::commands::cluster::get_ase_clusters,
             ase::commands::cluster::update_ase_cluster,
             ase::commands::cluster::delete_ase_cluster,
             ase::commands::cluster::add_ase_server_to_cluster,
             ase::commands::cluster::remove_ase_server_from_cluster,
             ase::commands::cluster::get_ase_cluster_status,
             ase::commands::cluster::start_ase_cluster,
             ase::commands::cluster::stop_ase_cluster,
             ase::commands::cluster::toggle_ase_cluster_cross_chat,
             ase::commands::cluster::get_ase_cluster_cross_chat_status,
             ase::commands::cluster::validate_ase_cluster_configuration,
             // ASE RCON commands
             ase::commands::rcon::connect_ase_rcon,
             ase::commands::rcon::send_ase_rcon,
              // ASE Scheduler commands
              ase::commands::scheduler::get_ase_scheduled_tasks,
              ase::commands::scheduler::create_ase_scheduled_task,
              ase::commands::scheduler::toggle_ase_scheduled_task,
              ase::commands::scheduler::delete_ase_scheduled_task,
              ase::commands::scheduler::get_ase_scheduler_settings,
              ase::commands::scheduler::save_ase_scheduler_settings,

              // ASE Boost Commands
              ase::commands::boost::get_ase_boost_profiles,
              ase::commands::boost::save_ase_boost_profile,
              ase::commands::boost::delete_ase_boost_profile,
              ase::commands::boost::activate_ase_boost_profile,
              ase::commands::boost::deactivate_ase_boost_profile,
              ase::commands::boost::get_active_ase_boost_profile,

              // ASE Discord commands
              ase::commands::discord::save_ase_discord_config,
              ase::commands::discord::get_ase_discord_config,
              ase::commands::discord::test_ase_discord_webhook,
             ase::commands::discord::save_ase_discord_bridge_config,
             ase::commands::discord::get_ase_discord_bridge_config,
             ase::commands::discord::start_ase_discord_bridge,
             ase::commands::discord::stop_ase_discord_bridge,
             ase::commands::discord::test_ase_discord_bridge_connection,
             ase::commands::discord::send_ase_discord_status_update,
             ase::commands::discord::get_ase_discord_rate_limit_config,
             ase::commands::discord::set_ase_discord_rate_limit_config,
              ase::commands::discord::generate_ase_bot_invite_url,
              // ASE Profile Sync commands
              ase::commands::profile_sync::list_ase_profiles,
              ase::commands::profile_sync::copy_ase_profiles,
              ase::commands::profile_sync::sync_ase_lists,
              // ASE Players commands
              ase::commands::players::get_ase_players,
              ase::commands::players::save_ase_players,
              // ASE Tools commands
              ase::commands::tools::check_ase_api_installed,
              ase::commands::tools::get_installed_ase_plugins,
              ase::commands::tools::get_ase_tribe_logs,
              ase::commands::tools::discover_ase_upnp_gateway,
              ase::commands::tools::forward_ase_server_ports,
              ase::commands::tools::remove_ase_server_port_forwards,
              ase::commands::tools::get_local_ip,
              ase::commands::tools::generate_diagnostics_report,
        ])
        .run(tauri::generate_context!())
}
