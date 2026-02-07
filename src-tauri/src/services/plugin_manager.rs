use crate::AppState;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Service to manage and detect installed server plugins
pub struct PluginManagerService {
    app_handle: AppHandle,
}

impl PluginManagerService {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    /// Check if a specific plugin is installed on a server
    ///
    /// # Arguments
    /// * `server_id` - database ID of the server
    /// * `plugin_name` - name of the plugin folder/dll (e.g. "NgcCore")
    pub fn check_plugin_status(&self, server_id: i64, plugin_name: &str) -> bool {
        // Get install path from DB
        let install_path = match self.get_server_install_path(server_id) {
            Some(p) => p,
            None => return false,
        };

        // Construct potential paths for the plugin
        // Standard ArkApi structure: ShooterGame/Binaries/Win64/ArkApi/Plugins/{PluginName}
        let api_plugin_path = install_path
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64")
            .join("ArkApi")
            .join("Plugins")
            .join(plugin_name);

        // Check if directory exists (plugins are usually folders) or if DLL exists inside
        if api_plugin_path.exists() {
            return true;
        }

        // Also check if it's a DLL directly in that folder (some plugins might be flat)
        let dll_path = api_plugin_path.with_extension("dll");
        if dll_path.exists() {
            return true;
        }

        false
    }

    /// Helper to fetch server install path from DB
    fn get_server_install_path(&self, server_id: i64) -> Option<PathBuf> {
        let state = self.app_handle.state::<AppState>();
        let db = state.db.lock().ok()?;
        let conn = db.get_connection().ok()?;

        let path_str: String = conn
            .query_row(
                "SELECT install_path FROM servers WHERE id = ?1",
                [server_id],
                |row| row.get(0),
            )
            .ok()?;

        Some(PathBuf::from(path_str))
    }
}
