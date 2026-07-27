use std::path::Path;
use std::process::Command;

pub struct LinuxPlatform;

impl LinuxPlatform {
    /// Kill process using SIGTERM (graceful) or SIGKILL (forced) on Linux
    pub fn kill_process(pid: u32, force: bool) -> Result<(), String> {
        let signal = if force { "-9" } else { "-15" };
        let output = Command::new("kill")
            .args([signal, &pid.to_string()])
            .output();

        match output {
            Ok(out) => {
                if out.status.success() {
                    Ok(())
                } else {
                    let err = String::from_utf8_lossy(&out.stderr).to_string();
                    Err(format!("kill failed for PID {}: {}", pid, err))
                }
            }
            Err(e) => Err(format!("Failed to execute kill command: {}", e)),
        }
    }

    /// Add desktop autostart entry for Linux (~/.config/autostart/*.desktop)
    pub fn set_autostart_desktop(app_path: &Path, enable: bool) -> Result<(), String> {
        let config_dir = super::home_dir().map(|h| h.join(".config"));
        if let Some(config_dir) = config_dir {
            let autostart_dir = config_dir.join("autostart");
            let desktop_file = autostart_dir.join("asa-server-manager.desktop");

            if enable {
                if let Err(e) = std::fs::create_dir_all(&autostart_dir) {
                    return Err(format!("Failed to create autostart directory: {}", e));
                }

                let desktop_entry = format!(
                    "[Desktop Entry]\n\
                     Type=Application\n\
                     Name=ASA Server Manager\n\
                     Exec=\"{}\" --minimized\n\
                     Terminal=false\n\
                     Categories=Utility;\n",
                    app_path.to_string_lossy()
                );

                if let Err(e) = std::fs::write(&desktop_file, desktop_entry) {
                    return Err(format!("Failed to write autostart desktop file: {}", e));
                }
            } else if desktop_file.exists() {
                let _ = std::fs::remove_file(desktop_file);
            }

            Ok(())
        } else {
            Err("Could not determine user config directory for Linux autostart".to_string())
        }
    }

    /// Check if ufw or firewalld is active on Linux
    pub fn check_linux_firewall() -> String {
        // Check UFW first
        if let Ok(output) = Command::new("ufw").arg("status").output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if stdout.contains("Status: active") {
                return "ufw (Active)".to_string();
            } else if stdout.contains("Status: inactive") {
                return "ufw (Inactive)".to_string();
            }
        }

        // Check firewalld
        if let Ok(output) = Command::new("firewall-cmd").arg("--state").output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if stdout.contains("running") {
                return "firewalld (Active)".to_string();
            }
        }

        "Unmanaged / Default".to_string()
    }
}
