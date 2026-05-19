use std::process::Command;
use std::env;

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
        let status = Command::new("reg")
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
        let _ = Command::new("reg")
            .args(&[
                "delete",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                "/v",
                "ASAServerManager",
                "/f",
            ])
            .status();
        Ok(())
    }
}

/// Configure Windows Task Scheduler task for elevated login startup.
/// Registers a task named "ASAServerManager" that triggers on logon with highest privileges.
pub fn set_windows_task_scheduler(enabled: bool) -> Result<(), String> {
    let current_exe = env::current_exe().map_err(|e| format!("Failed to get current executable path: {}", e))?;
    let exe_path = current_exe.to_string_lossy();
    
    let tr_value = format!("\"{}\" --minimized", exe_path);

    if enabled {
        println!("🚀 Registering elevated Task Scheduler task for {}", exe_path);
        let status = Command::new("schtasks")
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
        let _ = Command::new("schtasks")
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
