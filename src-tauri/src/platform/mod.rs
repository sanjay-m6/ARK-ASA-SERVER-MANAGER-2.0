pub mod windows;
pub mod linux;
#[cfg(test)]
pub mod tests;

use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OperatingSystem {
    Windows,
    Linux,
    MacOS,
    Unknown,
}

impl OperatingSystem {
    pub fn current() -> Self {
        if cfg!(target_os = "windows") {
            OperatingSystem::Windows
        } else if cfg!(target_os = "linux") {
            OperatingSystem::Linux
        } else if cfg!(target_os = "macos") {
            OperatingSystem::MacOS
        } else {
            OperatingSystem::Unknown
        }
    }

    pub fn is_windows(&self) -> bool {
        matches!(self, OperatingSystem::Windows)
    }

    pub fn is_linux(&self) -> bool {
        matches!(self, OperatingSystem::Linux)
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            OperatingSystem::Windows => "windows",
            OperatingSystem::Linux => "linux",
            OperatingSystem::MacOS => "macos",
            OperatingSystem::Unknown => "unknown",
        }
    }
}

/// Cross-platform helper functions for path formatting, executables, and process creation
pub struct Platform;

impl Platform {
    /// Get the current operating system
    pub fn os() -> OperatingSystem {
        OperatingSystem::current()
    }

    /// Resolve an executable name with the proper OS extension (.exe on Windows)
    pub fn executable_name(base: &str) -> String {
        if cfg!(target_os = "windows") {
            if base.to_lowercase().ends_with(".exe") || base.to_lowercase().ends_with(".bat") || base.to_lowercase().ends_with(".cmd") {
                base.to_string()
            } else {
                format!("{}.exe", base)
            }
        } else {
            // Linux / Unix
            base.trim_end_matches(".exe").trim_end_matches(".EXE").to_string()
        }
    }

    /// Returns the SteamCMD executable name for the current OS
    pub fn steamcmd_executable_name() -> &'static str {
        if cfg!(target_os = "windows") {
            "steamcmd.exe"
        } else {
            "steamcmd.sh"
        }
    }

    /// Returns the default root backup directory for the current OS
    pub fn default_backup_dir() -> PathBuf {
        if cfg!(target_os = "windows") {
            PathBuf::from("C:/ASA_Backups")
        } else {
            if let Some(home) = self::home_dir() {
                home.join("ASA_Backups")
            } else {
                PathBuf::from("/var/backups/asa_server_manager")
            }
        }
    }

    /// Returns the default root cluster directory for the current OS
    pub fn default_cluster_dir() -> PathBuf {
        if cfg!(target_os = "windows") {
            PathBuf::from("C:/ASA_Clusters")
        } else {
            if let Some(home) = self::home_dir() {
                home.join("ASA_Clusters")
            } else {
                PathBuf::from("/var/clusters/asa_server_manager")
            }
        }
    }

    /// Return Windows CREATE_NO_WINDOW creation flag (0x08000000 on Windows, 0 on non-Windows)
    pub fn creation_flags() -> u32 {
        if cfg!(target_os = "windows") {
            0x08000000
        } else {
            0
        }
    }

    /// Ensure proper executable permissions on Linux (chmod +x)
    pub fn ensure_executable_permissions(path: &Path) -> Result<(), String> {
        if !path.exists() {
            return Err(format!("File does not exist: {:?}", path));
        }

        #[cfg(target_family = "unix")]
        {
            use std::os::unix::fs::PermissionsExt;
            match std::fs::metadata(path) {
                Ok(metadata) => {
                    let mut perms = metadata.permissions();
                    let current_mode = perms.mode();
                    // Add executable bits (0o755)
                    perms.set_mode(current_mode | 0o111);
                    if let Err(e) = std::fs::set_permissions(path, perms) {
                        return Err(format!("Failed to set executable permissions on {:?}: {}", path, e));
                    }
                }
                Err(e) => return Err(format!("Failed to read metadata for {:?}: {}", path, e)),
            }
        }

        Ok(())
    }
}

pub fn home_dir() -> Option<PathBuf> {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok()
        .map(PathBuf::from)
}

pub trait CommandNoWindowExt {
    fn no_window(&mut self) -> &mut Self;
}

impl CommandNoWindowExt for std::process::Command {
    fn no_window(&mut self) -> &mut Self {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            self.creation_flags(0x08000000);
        }
        self
    }
}

impl CommandNoWindowExt for tokio::process::Command {
    fn no_window(&mut self) -> &mut Self {
        #[cfg(target_os = "windows")]
        {
            self.creation_flags(0x08000000);
        }
        self
    }
}
