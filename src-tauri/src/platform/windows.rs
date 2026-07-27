use std::path::Path;
use std::process::Command;

pub struct WindowsPlatform;

impl WindowsPlatform {
    /// Configure Command with CREATE_NO_WINDOW on Windows
    pub fn configure_command_no_window(_cmd: &mut Command) {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            _cmd.creation_flags(CREATE_NO_WINDOW);
        }
    }

    /// Kill process tree using taskkill on Windows
    pub fn kill_process_tree(_pid: u32) -> Result<(), String> {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            let output = Command::new("taskkill")
                .args(["/F", "/T", "/PID", &_pid.to_string()])
                .creation_flags(CREATE_NO_WINDOW)
                .output();

            match output {
                Ok(out) => {
                    if out.status.success() {
                        Ok(())
                    } else {
                        let err = String::from_utf8_lossy(&out.stderr).to_string();
                        Err(format!("taskkill failed for PID {}: {}", _pid, err))
                    }
                }
                Err(e) => Err(format!("Failed to execute taskkill: {}", e)),
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            Err("kill_process_tree is only applicable on Windows".to_string())
        }
    }

    /// Add registry startup entry for Windows using reg.exe
    pub fn set_autostart_registry(_app_path: &Path, enable: bool) -> Result<(), String> {
        crate::utils::startup_helper::set_windows_registry_run(enable, true)
    }
}
