// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
#[cfg(windows)]
use std::ffi::OsStr;
use std::fs::File;
use std::io::Write;
#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;
use std::panic;
use std::path::PathBuf;

use simplelog::*;

#[cfg(windows)]
use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};

fn main() {
    // 1. Initialize Logging
    let log_path = setup_logging();
    log::info!("--------------------------------------------------------------------------------");
    log::info!("ASA Server Manager 2.0 - Application Starting...");
    log::info!("Log File: {:?}", log_path);
    log::info!("--------------------------------------------------------------------------------");

    // 2. Set Global Panic Hook
    panic::set_hook(Box::new(move |info| {
        let payload = info.payload();
        let msg = if let Some(s) = payload.downcast_ref::<&str>() {
            s
        } else if let Some(s) = payload.downcast_ref::<String>() {
            s.as_str()
        } else {
            "Unknown panic"
        };

        let location = info
            .location()
            .map(|l| l.to_string())
            .unwrap_or_else(|| "unknown".to_string());
        let error_msg = format!(
            "Application crashed!\nLocation: {}\nError: {}",
            location, msg
        );

        log::error!("{}", error_msg);
        eprintln!("{}", error_msg);

        // Show Native Error Dialog
        #[cfg(windows)]
        unsafe {
            let title = to_wide_string("Critical Error - ASA Server Manager");
            let body = to_wide_string(&error_msg);
            MessageBoxW(
                std::ptr::null_mut(),
                body.as_ptr(),
                title.as_ptr(),
                MB_OK | MB_ICONERROR,
            );
        }
    }));

    // 3. Run Application with catch_unwind
    log::info!("Initializing Tauri app...");
    let args: Vec<String> = env::args().collect();
    let safe_mode = args.contains(&"--safe-mode".to_string());

    if safe_mode {
        log::warn!("--------------------------------------------------");
        log::warn!("SAFE MODE DETECTED - Disabling Background Services");
        log::warn!("--------------------------------------------------");
    }

    let result = panic::catch_unwind(|| {
        if let Err(e) = ark_server_manager_lib::run(safe_mode) {
            log::error!("Tauri Application Error: {}", e);
            panic!("Tauri init failed: {}", e);
        }
    });

    match result {
        Ok(_) => {
            log::info!("Application exited normally.");
            cleanup_lock_file();
        }
        Err(e) => {
            log::error!("Application panicked: {:?}", e);
        }
    }
}

fn setup_logging() -> PathBuf {
    let mut path = get_app_data_dir();
    path.push("startup.log");

    if let Ok(file) = File::create(&path) {
        let _ = WriteLogger::init(LevelFilter::Info, Config::default(), file);
    } else {
        eprintln!("Failed to create startup log file");
    }

    // Check for lock file (Crash Detection)
    let lock_file = path.with_file_name("app.lock");
    if lock_file.exists() {
        log::warn!("⚠️ Lock file found! The application may have crashed previously.");
        // We could enable safe mode here automatically if desired,
        // but for now logging it is sufficient for diagnosis.
    }

    // Create lock file
    if let Ok(mut file) = File::create(&lock_file) {
        let _ = write!(file, "running");
    }

    path
}

fn cleanup_lock_file() {
    let mut path = get_app_data_dir();
    path.push("app.lock");
    if path.exists() {
        let _ = std::fs::remove_file(path);
    }
}

fn get_app_data_dir() -> PathBuf {
    if let Ok(app_data) = env::var("APPDATA") {
        let mut path = PathBuf::from(app_data);
        path.push("asa-manager");
        let _ = std::fs::create_dir_all(&path);
        path
    } else if let Ok(home) = env::var("HOME") {
        let mut path = PathBuf::from(home);
        path.push(".asa-manager");
        let _ = std::fs::create_dir_all(&path);
        path
    } else {
        PathBuf::from(".")
    }
}

#[cfg(windows)]
fn to_wide_string(s: &str) -> Vec<u16> {
    OsStr::new(s)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}
