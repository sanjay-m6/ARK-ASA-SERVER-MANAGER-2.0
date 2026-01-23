// Allow dead code for placeholder features that will be implemented later
#![allow(dead_code)]
#![allow(unused_imports)]

mod commands;
mod db;
mod models;
mod services;

use commands::rcon::RconState;
use db::Database;
use services::process_manager::ProcessManager;
use services::rcon::RconService;
use services::steamcmd::SteamCmdService;
use std::sync::{Arc, Mutex};
use sysinfo::System;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<Database>,
    pub process_manager: ProcessManager,
    pub sys: Mutex<System>,
    pub app_handle: tauri::AppHandle,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Check for Admin Privileges (Windows)
            // Check for Admin Privileges (Windows) - Enforce only in Release mode
            #[cfg(all(windows, not(debug_assertions)))]
            {
                use windows_sys::Win32::UI::Shell::IsUserAnAdmin;
                let is_admin = unsafe { IsUserAnAdmin() != 0 };
                
                if !is_admin {
                    println!("❌ Application requires Administrator privileges!");
                    
                    use tauri_plugin_dialog::DialogExt;
                    app.dialog()
                        .message("This application requires Administrator privileges to manage servers correctly.\n\nPlease right-click the application and select 'Run as Administrator'.")
                        .title("Administrator Privileges Required")
                        .kind(tauri_plugin_dialog::MessageDialogKind::Error)
                        .blocking_show();
                        
                    std::process::exit(1);
                }
            }

            // Initialize database
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("failed to get app data dir");
            std::fs::create_dir_all(&app_dir).expect("failed to create app data dir");

            let db_path = app_dir.join("asa_manager.db");
            println!("📁 Database path: {:?}", db_path);
            println!("   Database exists: {}", db_path.exists());
            let db = Database::new(db_path).expect("failed to initialize database");

            let mut sys = System::new_all();
            sys.refresh_all();

            let app_handle = app.handle().clone();

            app.manage(AppState {
                db: Mutex::new(db),
                process_manager: ProcessManager::new(app_handle.clone()),
                sys: Mutex::new(sys),
                app_handle,
            });

            // Initialize RCON state
            app.manage(RconState(Arc::new(tokio::sync::Mutex::new(
                RconService::new(),
            ))));

            // Initialize Guardian state
            app.manage(services::guardian::GuardianState(Arc::new(
                tokio::sync::Mutex::new(services::guardian::GuardianService::new()),
            )));

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
            commands::system::get_setting,
            commands::system::set_setting,
            commands::system::run_diagnostics,
            commands::system::install_steamcmd, // <-- New Command
            // Server commands
            commands::server::get_all_servers,
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
            commands::server::start_log_watcher,
            commands::server::import_server,
            commands::server::show_server_console,
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
            // Config commands
            commands::config::read_config,
            commands::config::save_config,
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
            commands::cluster::get_cluster_status,
            commands::cluster::start_cluster,
            commands::cluster::stop_cluster,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
