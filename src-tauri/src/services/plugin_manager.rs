use crate::models::{PluginInfo, PluginScanResult, PluginStatus};
use crate::AppState;
use serde::Deserialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Plugin manifest structure from PluginInfo.json
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(default)]
pub struct PluginManifest {
    #[serde(alias = "Name", alias = "name")]
    pub name: Option<String>,
    #[serde(alias = "Version", alias = "version")]
    pub version: Option<String>,
    #[serde(alias = "Description", alias = "description")]
    pub description: Option<String>,
    #[serde(alias = "Author", alias = "author")]
    pub author: Option<String>,
    #[serde(alias = "MinApiVersion", alias = "minApiVersion")]
    pub min_api_version: Option<String>,
    #[serde(alias = "Dependencies", alias = "dependencies")]
    pub dependencies: Option<Vec<String>>,
}

/// Service to manage and detect installed server plugins
pub struct PluginManagerService {
    app_handle: AppHandle,
}

impl PluginManagerService {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    /// Resolve the plugins directory for an ASA server, handling AsaApi/ArkApi naming
    pub fn resolve_plugins_dir(&self, install_path: &Path) -> Result<PathBuf, String> {
        let win64_dir = install_path
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64");

        if !win64_dir.exists() {
            return Err("Server binaries directory not found. Please install the server first.".to_string());
        }

        let asa_api_parent = win64_dir.join("AsaApi");
        let ark_api_parent = win64_dir.join("ArkApi");

        // Dynamically migrate AsaApi directory to ArkApi if it exists (since ASA API internally searches for ArkApi folder)
        if asa_api_parent.exists() && !ark_api_parent.exists() {
            println!("[MIGRATION] Renaming AsaApi to ArkApi for ASA server at {:?}", win64_dir);
            if let Err(e) = std::fs::rename(&asa_api_parent, &ark_api_parent) {
                println!("[MIGRATION] [Warning] Failed to rename AsaApi to ArkApi: {}", e);
            }
        } else if asa_api_parent.exists() && ark_api_parent.exists() {
            // Merge plugins if both folders exist
            println!("[MIGRATION] Both AsaApi and ArkApi exist. Merging Plugins folder...");
            let asa_plugins = asa_api_parent.join("Plugins");
            let ark_plugins = ark_api_parent.join("Plugins");
            
            let mut merge_success = true;
            if asa_plugins.exists() {
                if !ark_plugins.exists() {
                    let _ = std::fs::create_dir_all(&ark_plugins);
                }
                if let Ok(entries) = std::fs::read_dir(&asa_plugins) {
                    for entry in entries.flatten() {
                        let src = entry.path();
                        let dest = ark_plugins.join(entry.file_name());
                        if !dest.exists() {
                            if let Err(e) = std::fs::rename(&src, &dest) {
                                println!("[MIGRATION] [Error] Failed to move plugin folder {:?} to {:?}: {}", src, dest, e);
                                merge_success = false;
                            }
                        }
                    }
                }
            }
            if merge_success {
                let _ = std::fs::remove_dir_all(&asa_api_parent);
            } else {
                println!("[MIGRATION] [Warning] Plugin merge was incomplete. Retaining AsaApi directory to prevent data loss.");
            }
        }

        // Copy/Update AsaApi.dll and AsaApi.pdb from ArkApi/ to Win64/
        if ark_api_parent.exists() {
            let nested_dll = ark_api_parent.join("AsaApi.dll");
            let root_dll = win64_dir.join("AsaApi.dll");
            if nested_dll.exists() {
                let should_copy = if root_dll.exists() {
                    let root_meta = std::fs::metadata(&root_dll);
                    let nested_meta = std::fs::metadata(&nested_dll);
                    match (root_meta, nested_meta) {
                        (Ok(r), Ok(n)) => r.len() != n.len() || r.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH) < n.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH),
                        _ => true,
                    }
                } else {
                    true
                };

                if should_copy {
                    println!("[MIGRATION] Copying/updating AsaApi.dll to Win64 root...");
                    let _ = std::fs::copy(&nested_dll, &root_dll);
                }
            }

            let nested_pdb = ark_api_parent.join("AsaApi.pdb");
            let root_pdb = win64_dir.join("AsaApi.pdb");
            if nested_pdb.exists() {
                let should_copy = if root_pdb.exists() {
                    let root_meta = std::fs::metadata(&root_pdb);
                    let nested_meta = std::fs::metadata(&nested_pdb);
                    match (root_meta, nested_meta) {
                        (Ok(r), Ok(n)) => r.len() != n.len() || r.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH) < n.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH),
                        _ => true,
                    }
                } else {
                    true
                };

                if should_copy {
                    println!("[MIGRATION] Copying/updating AsaApi.pdb to Win64 root...");
                    let _ = std::fs::copy(&nested_pdb, &root_pdb);
                }
            }
        }

        let plugins_dir = ark_api_parent.join("Plugins");
        if !plugins_dir.exists() {
            let _ = std::fs::create_dir_all(&plugins_dir);
        }
        Ok(plugins_dir)
    }

    /// Check if ASA API loader is installed (AsaApiLoader.exe + AsaApi.dll in Win64)
    pub fn check_loader_installed(install_path: &Path) -> bool {
        let win64_dir = install_path
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64");

        let loader_exe = win64_dir.join("AsaApiLoader.exe");
        let api_dll = win64_dir.join("AsaApi.dll");
        let ark_api_dir = win64_dir.join("ArkApi");
        let asa_api_dir = win64_dir.join("AsaApi");

        loader_exe.exists() && (
            api_dll.exists() || 
            ark_api_dir.join("AsaApi.dll").exists() || 
            asa_api_dir.join("AsaApi.dll").exists()
        )
    }

    /// Read plugin manifest from a plugin folder
    fn read_manifest(plugin_dir: &Path) -> Option<PluginManifest> {
        let manifest_names = ["PluginInfo.json", "plugin.json", "manifest.json"];

        for name in manifest_names {
            let path = plugin_dir.join(name);
            if path.exists() {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Ok(manifest) = serde_json::from_str::<PluginManifest>(&content) {
                        return Some(manifest);
                    }
                }
            }
        }
        None
    }

    /// Validate that a plugin folder contains a DLL matching the folder name
    fn validate_plugin_dll(plugin_dir: &Path, folder_name: &str) -> Result<(), String> {
        let expected_dll = plugin_dir.join(format!("{}.dll", folder_name));
        if expected_dll.exists() {
            return Ok(());
        }

        // Check if any DLL exists (mismatch case)
        let has_any_dll = std::fs::read_dir(plugin_dir)
            .map(|entries| {
                entries.filter_map(|e| e.ok()).any(|e| {
                    e.path()
                        .extension()
                        .map(|ext| ext.to_string_lossy().to_lowercase() == "dll")
                        .unwrap_or(false)
                })
            })
            .unwrap_or(false);

        if has_any_dll {
            Err(format!(
                "Folder name '{}' does not match plugin DLL — this plugin will not load. \
                 Rename the folder or the DLL so they match exactly.",
                folder_name
            ))
        } else {
            Err(format!(
                "No plugin DLL found in folder '{}'. The folder may be empty or corrupted.",
                folder_name
            ))
        }
    }

    /// Get the enabled state for a plugin from the database
    fn get_plugin_enabled(&self, server_id: i64, folder_name: &str) -> Option<bool> {
        let state = self.app_handle.try_state::<AppState>()?;
        let db = state.db.lock().ok()?;
        let conn = db.get_connection().ok()?;

        conn.query_row(
            "SELECT enabled FROM server_plugins WHERE server_id = ?1 AND folder_name = ?2",
            rusqlite::params![server_id, folder_name],
            |row| row.get::<_, i32>(0),
        )
        .ok()
        .map(|v| v != 0)
    }

    /// Set the enabled state for a plugin in the database (upsert)
    fn set_plugin_enabled(&self, server_id: i64, folder_name: &str, enabled: bool) -> Result<(), String> {
        let state = self.app_handle.state::<AppState>();
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        let res = conn.execute(
            "INSERT INTO server_plugins (server_id, folder_name, enabled, updated_at)
             VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
             ON CONFLICT(server_id, folder_name)
             DO UPDATE SET enabled = ?3, updated_at = CURRENT_TIMESTAMP",
            rusqlite::params![server_id, folder_name, enabled as i32],
        );

        if let Err(ref e) = res {
            if e.to_string().contains("servers_old") {
                println!("⚠️ Foreign key error referencing servers_old in server_plugins! Repairing schema...");
                let _ = conn.execute_batch("
                    PRAGMA foreign_keys = OFF;
                    BEGIN TRANSACTION;
                    ALTER TABLE server_plugins RENAME TO server_plugins_broken_fk;
                    CREATE TABLE server_plugins (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        server_id INTEGER NOT NULL,
                        folder_name TEXT NOT NULL,
                        enabled INTEGER DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
                        UNIQUE(server_id, folder_name)
                    );
                    INSERT OR IGNORE INTO server_plugins (id, server_id, folder_name, enabled, created_at, updated_at)
                        SELECT id, server_id, folder_name, enabled, created_at, updated_at FROM server_plugins_broken_fk;
                    DROP TABLE server_plugins_broken_fk;
                    COMMIT;
                    PRAGMA foreign_keys = ON;
                ");

                // Retry the insert after repairing the table
                conn.execute(
                    "INSERT INTO server_plugins (server_id, folder_name, enabled, updated_at)
                     VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
                     ON CONFLICT(server_id, folder_name)
                     DO UPDATE SET enabled = ?3, updated_at = CURRENT_TIMESTAMP",
                    rusqlite::params![server_id, folder_name, enabled as i32],
                )
                .map_err(|e2| format!("Failed to update plugin state after schema repair: {}", e2))?;

                return Ok(());
            }
        }

        res.map_err(|e| format!("Failed to update plugin state: {}", e))?;
        Ok(())
    }

    /// Get all stored plugin states for a server (for detecting previously-tracked plugins)
    fn get_all_stored_plugins(&self, server_id: i64) -> Vec<(String, bool)> {
        let state = match self.app_handle.try_state::<AppState>() {
            Some(s) => s,
            None => return vec![],
        };
        let db = match state.db.lock() {
            Ok(d) => d,
            Err(_) => return vec![],
        };
        let conn = match db.get_connection() {
            Ok(c) => c,
            Err(_) => return vec![],
        };

        let mut stmt = match conn.prepare(
            "SELECT folder_name, enabled FROM server_plugins WHERE server_id = ?1",
        ) {
            Ok(s) => s,
            Err(_) => return vec![],
        };

        stmt.query_map(rusqlite::params![server_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?))
        })
        .map(|rows| {
            rows.filter_map(|r| r.ok())
                .map(|(name, enabled)| (name, enabled != 0))
                .collect()
        })
        .unwrap_or_default()
    }

    /// Full plugin scan for a server. Returns all discovered plugins with their states.
    pub fn scan_plugins(&self, server_id: i64) -> Result<PluginScanResult, String> {
        let (install_path, server_type) = self.get_server_install_path(server_id)
            .ok_or_else(|| format!("Server {} not found", server_id))?;

        if server_type != "ASA" {
            return Err("Plugin manager is only available for ASA servers".to_string());
        }

        let loader_installed = Self::check_loader_installed(&install_path);

        let plugins_dir = self.resolve_plugins_dir(&install_path)?;
        let plugins_dir_str = plugins_dir.to_string_lossy().to_string();

        let mut plugins: Vec<PluginInfo> = Vec::new();
        let mut discovered_folders: Vec<String> = Vec::new();

        // Scan plugin directory if it exists
        if plugins_dir.exists() {
            let entries = match std::fs::read_dir(&plugins_dir) {
                Ok(e) => e,
                Err(e) => {
                    if e.kind() == std::io::ErrorKind::PermissionDenied {
                        return Err(format!(
                            "Permission denied reading plugins directory: {}. \
                             Check folder permissions.",
                            plugins_dir_str
                        ));
                    }
                    return Err(format!("Failed to read plugins directory: {}", e));
                }
            };

            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }

                let folder_name = match path.file_name() {
                    Some(n) => n.to_string_lossy().to_string(),
                    None => continue,
                };

                // Skip hidden directories
                if folder_name.starts_with('.') {
                    continue;
                }

                discovered_folders.push(folder_name.clone());

                // Validate DLL name matches folder name
                let (status, status_message) = match Self::validate_plugin_dll(&path, &folder_name) {
                    Ok(()) => {
                        // DLL is valid — check enabled state
                        let enabled = self.get_plugin_enabled(server_id, &folder_name);
                        if enabled.is_none() {
                            // First time seeing this plugin — insert as enabled
                            let _ = self.set_plugin_enabled(server_id, &folder_name, true);
                        }
                        let is_enabled = enabled.unwrap_or(true);
                        if is_enabled {
                            (PluginStatus::Enabled, None)
                        } else {
                            (PluginStatus::Disabled, None)
                        }
                    }
                    Err(msg) => (PluginStatus::Error, Some(msg)),
                };

                // Read manifest
                let manifest = Self::read_manifest(&path);

                let enabled = matches!(status, PluginStatus::Enabled);
                let display_name = manifest
                    .as_ref()
                    .and_then(|m| m.name.clone())
                    .unwrap_or_else(|| folder_name.clone());

                plugins.push(PluginInfo {
                    id: folder_name.clone(),
                    name: display_name,
                    folder_name: folder_name.clone(),
                    version: manifest.as_ref().and_then(|m| m.version.clone()),
                    description: manifest.as_ref().and_then(|m| m.description.clone()),
                    author: manifest.as_ref().and_then(|m| m.author.clone()),
                    enabled,
                    installed_path: path.to_string_lossy().to_string(),
                    dependencies: manifest
                        .as_ref()
                        .and_then(|m| m.dependencies.clone())
                        .unwrap_or_default(),
                    last_loaded_at: None,
                    status,
                    status_message,
                });
            }
        }

        // Check for previously-tracked plugins that are now missing
        let stored = self.get_all_stored_plugins(server_id);
        for (stored_folder, stored_enabled) in stored {
            if !discovered_folders.contains(&stored_folder) {
                plugins.push(PluginInfo {
                    id: stored_folder.clone(),
                    name: stored_folder.clone(),
                    folder_name: stored_folder.clone(),
                    version: None,
                    description: None,
                    author: None,
                    enabled: stored_enabled,
                    installed_path: plugins_dir.join(&stored_folder).to_string_lossy().to_string(),
                    dependencies: vec![],
                    last_loaded_at: None,
                    status: PluginStatus::Missing,
                    status_message: Some(
                        "Plugin folder no longer found on disk. The plugin may have been deleted or moved.".to_string(),
                    ),
                });
            }
        }

        // Sort by name
        plugins.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

        // Count active plugins (enabled AND present with no errors)
        let active_plugin_count = plugins
            .iter()
            .filter(|p| p.enabled && p.status == PluginStatus::Enabled)
            .count();

        // Get API Loader toggle state from database
        let api_loader_enabled = {
            let state = self.app_handle.try_state::<AppState>();
            if let Some(state) = state {
                if let Ok(db) = state.db.lock() {
                    if let Ok(conn) = db.get_connection() {
                        conn.query_row(
                            "SELECT api_loader_enabled FROM servers WHERE id = ?1",
                            [server_id],
                            |row| row.get::<_, Option<i32>>(0),
                        )
                        .ok()
                        .flatten()
                        .map(|v| v != 0)
                        .unwrap_or(true)
                    } else { true }
                } else { true }
            } else { true }
        };

        // Determine launch executable based on user toggle override
        let launch_executable = if api_loader_enabled && loader_installed {
            "AsaApiLoader.exe".to_string()
        } else {
            "ArkAscendedServer.exe".to_string()
        };

        // Check if ArkAscendedServer.pdb is missing from the directory
        let win64_dir = install_path
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64");
        let pdb_missing = !win64_dir.join("ArkAscendedServer.pdb").exists();

        Ok(PluginScanResult {
            plugins,
            loader_installed,
            plugins_dir: plugins_dir_str,
            launch_executable,
            active_plugin_count,
            api_loader_enabled,
            pdb_missing,
        })
    }

    /// Lightweight scan for launch-time decision only. Same as scan_plugins but called internally.
    pub fn scan_plugins_for_launch(&self, server_id: i64) -> Result<PluginScanResult, String> {
        self.scan_plugins(server_id)
    }

    /// Sync the physical proxy DLLs on disk with the database toggle state
    pub fn sync_api_loader_dlls(&self, server_id: i64) -> Result<(), String> {
        let (install_path, server_type) = match self.get_server_install_path(server_id) {
            Some(res) => res,
            None => return Ok(()),
        };

        if server_type != "ASA" {
            return Ok(());
        }

        let win64_dir = install_path
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64");

        if !win64_dir.exists() {
            return Ok(());
        }

        // Get API Loader toggle state from database
        let api_loader_enabled = {
            let state = self.app_handle.try_state::<AppState>();
            if let Some(state) = state {
                if let Ok(db) = state.db.lock() {
                    if let Ok(conn) = db.get_connection() {
                        conn.query_row(
                            "SELECT api_loader_enabled FROM servers WHERE id = ?1",
                            [server_id],
                            |row| row.get::<_, Option<i32>>(0),
                        )
                        .ok()
                        .flatten()
                        .map(|v| v != 0)
                        .unwrap_or(true)
                    } else { true }
                } else { true }
            } else { true }
        };

        let proxy_dlls = ["version.dll", "winhttp.dll", "dxgi.dll", "psapi.dll"];
        
        for dll in proxy_dlls {
            let active_path = win64_dir.join(dll);
            let disabled_path = win64_dir.join(format!("{}.disabled", dll));
            
            if api_loader_enabled {
                // Enable: rename disabled path to active path if active path doesn't exist
                if disabled_path.exists() && !active_path.exists() {
                    if let Err(e) = std::fs::rename(&disabled_path, &active_path) {
                        println!("[API LOADER SYNC] [Error] Failed to enable proxy DLL {:?}: {}", dll, e);
                    } else {
                        println!("[API LOADER SYNC] Enabled proxy DLL: {:?}", dll);
                    }
                }
            } else {
                // Disable: rename active path to disabled path
                if active_path.exists() {
                    if let Err(e) = std::fs::rename(&active_path, &disabled_path) {
                        println!("[API LOADER SYNC] [Error] Failed to disable proxy DLL {:?}: {}", dll, e);
                    } else {
                        println!("[API LOADER SYNC] Disabled proxy DLL: {:?}", dll);
                    }
                }
            }
        }

        Ok(())
    }

    /// Toggle the overall API Loader enabled state for a server
    pub fn toggle_api_loader(&self, server_id: i64, enabled: bool) -> Result<(), String> {
        {
            let state = self.app_handle.state::<AppState>();
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;

            conn.execute(
                "UPDATE servers SET api_loader_enabled = ?1 WHERE id = ?2",
                rusqlite::params![enabled as i32, server_id],
            )
            .map_err(|e| format!("Failed to update API loader state: {}", e))?;
        }

        // Perform physical DLL renaming to enable/disable loading immediately
        self.sync_api_loader_dlls(server_id)?;

        Ok(())
    }

    /// Toggle a single plugin's enabled state
    pub fn toggle_plugin(&self, server_id: i64, folder_name: &str, enabled: bool) -> Result<(), String> {
        // If enabling, validate dependencies
        if enabled {
            self.validate_dependencies(server_id, folder_name)?;
        }
        self.set_plugin_enabled(server_id, folder_name, enabled)
    }

    /// Set all plugins for a server to enabled or disabled
    pub fn set_all_plugins(&self, server_id: i64, enabled: bool) -> Result<(), String> {
        let state = self.app_handle.state::<AppState>();
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;

        conn.execute(
            "UPDATE server_plugins SET enabled = ?1, updated_at = CURRENT_TIMESTAMP WHERE server_id = ?2",
            rusqlite::params![enabled as i32, server_id],
        )
        .map_err(|e| format!("Failed to update all plugins: {}", e))?;

        Ok(())
    }

    /// Safely quarantine all active proxy DLLs by renaming them to .disabled.
    /// This prevents Windows from injecting outdated/crashing DLLs into ArkAscendedServer.exe after updates.
    pub fn quarantine_proxy_dlls(&self, server_id: i64) -> Result<Vec<String>, String> {
        let (install_path, server_type) = match self.get_server_install_path(server_id) {
            Some(res) => res,
            None => return Ok(Vec::new()),
        };

        if server_type != "ASA" {
            return Ok(Vec::new());
        }

        let win64_dir = install_path
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64");

        if !win64_dir.exists() {
            return Ok(Vec::new());
        }

        let proxy_dlls = ["version.dll", "winhttp.dll", "dxgi.dll", "psapi.dll"];
        let mut quarantined = Vec::new();

        for dll in proxy_dlls {
            let active_path = win64_dir.join(dll);
            let disabled_path = win64_dir.join(format!("{}.disabled", dll));

            if active_path.exists() {
                if disabled_path.exists() {
                    let _ = std::fs::remove_file(&disabled_path);
                }
                if let Err(e) = std::fs::rename(&active_path, &disabled_path) {
                    println!("[QUARANTINE] [Error] Failed to quarantine proxy DLL {:?}: {}", dll, e);
                } else {
                    println!("[QUARANTINE] Quarantined proxy DLL {:?} -> {}.disabled", dll, dll);
                    quarantined.push(dll.to_string());
                }
            }
        }

        // Also update database toggle state to disabled
        if let Some(state) = self.app_handle.try_state::<AppState>() {
            if let Ok(db) = state.db.lock() {
                if let Ok(conn) = db.get_connection() {
                    let _ = conn.execute(
                        "UPDATE servers SET api_loader_enabled = 0 WHERE id = ?1",
                        rusqlite::params![server_id],
                    );
                }
            }
        }

        Ok(quarantined)
    }

    /// Check active and quarantined proxy DLLs on disk
    pub fn get_proxy_dlls_info(&self, server_id: i64) -> (Vec<String>, Vec<String>) {
        let (install_path, server_type) = match self.get_server_install_path(server_id) {
            Some(res) => res,
            None => return (Vec::new(), Vec::new()),
        };

        if server_type != "ASA" {
            return (Vec::new(), Vec::new());
        }

        let win64_dir = install_path
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64");

        if !win64_dir.exists() {
            return (Vec::new(), Vec::new());
        }

        let proxy_dlls = ["version.dll", "winhttp.dll", "dxgi.dll", "psapi.dll"];
        let mut active = Vec::new();
        let mut disabled = Vec::new();

        for dll in proxy_dlls {
            if win64_dir.join(dll).exists() {
                active.push(dll.to_string());
            }
            if win64_dir.join(format!("{}.disabled", dll)).exists() {
                disabled.push(dll.to_string());
            }
        }

        (active, disabled)
    }

    /// Validate that all dependencies of a plugin are present and enabled
    fn validate_dependencies(&self, server_id: i64, folder_name: &str) -> Result<(), String> {
        let (install_path, _) = self.get_server_install_path(server_id)
            .ok_or_else(|| format!("Server {} not found", server_id))?;

        let plugins_dir = self.resolve_plugins_dir(&install_path)?;
        let plugin_dir = plugins_dir.join(folder_name);

        if let Some(manifest) = Self::read_manifest(&plugin_dir) {
            if let Some(deps) = manifest.dependencies {
                for dep in deps {
                    let dep_dir = plugins_dir.join(&dep);
                    if !dep_dir.exists() {
                        return Err(format!(
                            "Required dependency '{}' is not installed. Install it before enabling '{}'.",
                            dep, folder_name
                        ));
                    }
                    let dep_enabled = self.get_plugin_enabled(server_id, &dep).unwrap_or(false);
                    if !dep_enabled {
                        return Err(format!(
                            "Required dependency '{}' is disabled. Enable it before enabling '{}'.",
                            dep, folder_name
                        ));
                    }
                }
            }
        }
        Ok(())
    }

    /// Check if a specific plugin is installed on a server (legacy compat)
    pub fn check_plugin_status(&self, server_id: i64, plugin_name: &str) -> bool {
        let (install_path, server_type) = match self.get_server_install_path(server_id) {
            Some(res) => res,
            None => return false,
        };

        let win64_dir = install_path
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64");

        let api_name = if server_type == "ASA" { "AsaApi" } else { "ArkApi" };
        let api_plugin_path = win64_dir.join(api_name).join("Plugins").join(plugin_name);

        if api_plugin_path.exists() {
            return true;
        }
        let dll_path = api_plugin_path.with_extension("dll");
        dll_path.exists()
    }

    /// Helper to fetch server install path from DB
    fn get_server_install_path(&self, server_id: i64) -> Option<(PathBuf, String)> {
        let state = self.app_handle.try_state::<AppState>()?;
        let db = state.db.lock().ok()?;
        let conn = db.get_connection().ok()?;

        if let Ok((path_str, server_type)) = conn.query_row(
            "SELECT install_path, server_type FROM servers WHERE id = ?1",
            [server_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        ) {
            return Some((PathBuf::from(path_str), server_type));
        }

        if let Ok(path_str) = conn.query_row(
            "SELECT install_path FROM ase_servers WHERE id = ?1",
            [server_id],
            |row| row.get::<_, String>(0),
        ) {
            return Some((PathBuf::from(path_str), "ASE".to_string()));
        }

        None
    }
}
