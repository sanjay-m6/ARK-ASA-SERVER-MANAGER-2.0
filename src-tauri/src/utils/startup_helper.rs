use std::process::Command;
use std::env;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Configure Windows Registry Run key for standard startup.
/// Registers "ASAServerManager" under HKCU\Software\Microsoft\Windows\CurrentVersion\Run.
pub fn set_windows_registry_run(enabled: bool, minimized: bool) -> Result<(), String> {
    let current_exe = env::current_exe().map_err(|e| format!("Failed to get current executable path: {}", e))?;
    let exe_path = current_exe.to_string_lossy();
    
    // We escape quote paths to support spaces in directory names
    let value_data = if minimized {
        format!("\"{}\" --minimized", exe_path)
    } else {
        format!("\"{}\"", exe_path)
    };

    if enabled {
        println!("🚀 Setting Registry Run entry: {} (minimized: {})", exe_path, minimized);
        
        // Clean up any legacy or alternate value names to prevent duplicate autostarts
        let legacy_names = ["ARK Server Manager", "ark-asa-server-manager", "com.ark.asaservermanager"];
        for legacy in &legacy_names {
            let mut del_cmd = Command::new("reg");
            #[cfg(target_os = "windows")]
            del_cmd.creation_flags(CREATE_NO_WINDOW);
            let _ = del_cmd
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .args(&["delete", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", legacy, "/f"])
                .status();
        }

        let mut cmd = Command::new("reg");
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let status = cmd
            .args(&[
                "add",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                "/v",
                "ASAServerManager",
                "/t",
                "REG_SZ",
                "/d",
                &value_data,
                "/f",
            ])
            .status()
            .map_err(|e| format!("Failed to execute reg.exe: {}", e))?;

        if status.success() {
            Ok(())
        } else {
            Err("reg.exe returned a non-zero exit status".to_string())
        }
    } else {
        println!("🚀 Removing Registry Run entry for ASAServerManager");
        let legacy_names = ["ASAServerManager", "ARK Server Manager", "ark-asa-server-manager", "com.ark.asaservermanager"];
        for legacy in &legacy_names {
            let mut cmd = Command::new("reg");
            #[cfg(target_os = "windows")]
            cmd.creation_flags(CREATE_NO_WINDOW);

            let _ = cmd
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .args(&[
                    "delete",
                    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                    "/v",
                    legacy,
                    "/f",
                ])
                .status();
        }
        Ok(())
    }
}

/// Refreshes the autostart entry if global auto-start is enabled or if an autostart registry key exists.
pub fn sync_windows_autostart_path_on_startup(global_auto_start_enabled: bool, start_minimized: bool) {
    #[cfg(target_os = "windows")]
    {
        let exists = is_autostart_registry_entry_present();
        if global_auto_start_enabled || exists {
            if let Err(e) = set_windows_registry_run(true, start_minimized) {
                println!("⚠️ Failed to update Windows autostart registry path: {}", e);
            } else {
                println!("✅ Synced Windows autostart registry path to current executable");
            }
        }
    }
}

pub fn is_autostart_registry_entry_present() -> bool {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("reg");
        cmd.creation_flags(CREATE_NO_WINDOW);
        let output = cmd
            .args(&[
                "query",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                "/v",
                "ASAServerManager",
            ])
            .output();

        if let Ok(out) = output {
            return out.status.success();
        }
    }
    false
}

/// Configure Windows Task Scheduler task for elevated login startup.
/// Registers a task named "ASAServerManager" that triggers on logon with highest privileges.
#[allow(dead_code)]
pub fn set_windows_task_scheduler(enabled: bool) -> Result<(), String> {
    let current_exe = env::current_exe().map_err(|e| format!("Failed to get current executable path: {}", e))?;
    let exe_path = current_exe.to_string_lossy();
    
    let tr_value = format!("\"{}\" --minimized", exe_path);

    if enabled {
        println!("🚀 Registering elevated Task Scheduler task for {}", exe_path);
        let mut cmd = Command::new("schtasks");
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let status = cmd
            .args(&[
                "/create",
                "/tn",
                "ASAServerManager",
                "/tr",
                &tr_value,
                "/sc",
                "onlogon",
                "/rl",
                "highest",
                "/f",
            ])
            .status()
            .map_err(|e| format!("Failed to execute schtasks.exe: {}", e))?;

        if status.success() {
            Ok(())
        } else {
            Err("schtasks.exe returned a non-zero exit status".to_string())
        }
    } else {
        println!("🚀 Unregistering Task Scheduler task ASAServerManager");
        let mut cmd = Command::new("schtasks");
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let _ = cmd
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .args(&[
                "/delete",
                "/tn",
                "ASAServerManager",
                "/f",
                ])
            .status();
        Ok(())
    }
}
