use anyhow::Result;
use std::fs;
use std::path::Path;
use std::time::SystemTime;

pub struct HealthChecker;

impl HealthChecker {
    pub fn new() -> Self {
        HealthChecker
    }

    /// Check if save file is corrupted
    pub fn check_save_file(&self, save_path: &Path) -> Result<bool> {
        if !save_path.exists() {
            return Ok(false);
        }

        let metadata = fs::metadata(save_path)?;
        let size = metadata.len();

        // ARK save files should be at least 100KB
        if size < 100_000 {
            return Ok(false);
        }

        // Check file can be read
        match fs::read(save_path) {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }

    /// Check if config file is valid
    pub fn check_config_file(&self, config_path: &Path) -> Result<bool> {
        if !config_path.exists() {
            return Ok(false);
        }

        // Try to parse as INI
        let content = fs::read_to_string(config_path)?;

        // Basic INI validation
        if content.contains("[") && content.contains("]") {
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// Detect port conflicts
    pub fn check_port_available(&self, port: u16) -> bool {
        use std::net::TcpListener;
        TcpListener::bind(("127.0.0.1", port)).is_ok()
    }

    /// Auto-repair corrupted config
    pub fn repair_config(&self, config_path: &Path, backup_path: &Path) -> Result<()> {
        if backup_path.exists() {
            fs::copy(backup_path, config_path)?;
        }
        Ok(())
    }

    /// Get suggested alternative port
    pub fn suggest_port(&self, preferred_port: u16) -> u16 {
        let mut port = preferred_port;
        while !self.check_port_available(port) && port < 65535 {
            port += 1;
        }
        port
    }

    /// Check disk space (returns available GB)
    pub fn check_disk_space(&self, path: &Path) -> Result<f64> {
        let _metadata = fs::metadata(path)?;
        // This is a simplified version - proper implementation would use platform-specific APIs
        Ok(100.0) // Placeholder
    }

    /// Detect if server recently crashed
    pub fn detect_recent_crash(&self, log_path: &Path) -> Result<bool> {
        if !log_path.exists() {
            return Ok(false);
        }

        let metadata = fs::metadata(log_path)?;
        let modified = metadata.modified()?;
        let now = SystemTime::now();

        let duration = now.duration_since(modified)?;

        // If log was modified in last 60 seconds and contains crash indicators
        if duration.as_secs() < 60 {
            let content = fs::read_to_string(log_path)?;
            if content.contains("CRASH")
                || content.contains("FATAL")
                || content.contains("EXCEPTION")
            {
                return Ok(true);
            }
        }

        Ok(false)
    }
}

impl Default for HealthChecker {
    fn default() -> Self {
        Self::new()
    }
}
