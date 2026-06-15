use tauri::{AppHandle, State, Manager};
use crate::AppState;
use crate::ase::models::AseInstalledMod;
use std::path::PathBuf;
use crate::ase::ini_parser::IniDocument;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Result of searching Steam libraries for an ASE mod's .mod file and assets folder.
struct SteamModSource {
    mod_file: PathBuf,
    assets_dir: PathBuf,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModValidationReport {
    pub is_valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub issues: Vec<String>,
}

pub struct AseModManager;

// Helper to copy directory contents recursively
fn copy_dir_all(src: impl AsRef<std::path::Path>, dst: impl AsRef<std::path::Path>) -> std::io::Result<()> {
    std::fs::create_dir_all(&dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(entry.path(), dst.as_ref().join(entry.file_name()))?;
        } else {
            std::fs::copy(entry.path(), dst.as_ref().join(entry.file_name()))?;
        }
    }
    Ok(())
}

// Helper to check case-insensitive value in parsed INI document
fn ini_get_str(doc: &IniDocument, section: &str, key: &str, default: &str) -> String {
    doc.get_value(section, key).unwrap_or_else(|| default.to_string())
}

/// Discover all Steam library folders on this machine.
///
/// 1. Reads HKCU\Software\Valve\Steam -> SteamPath from the Windows Registry.
/// 2. Parses `<SteamPath>/steamapps/libraryfolders.vdf` for additional library paths.
/// 3. Falls back to common default locations if the registry key is missing.
fn find_steam_library_paths() -> Vec<PathBuf> {
    let mut libs: Vec<PathBuf> = Vec::new();

    // Step 1: Read Steam install path from the Windows Registry via `reg query`.
    let primary_steam = std::process::Command::new("reg")
        .args([
            "query",
            r"HKCU\Software\Valve\Steam",
            "/v",
            "SteamPath",
        ])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output()
        .ok()
        .and_then(|out| {
            let stdout = String::from_utf8_lossy(&out.stdout);
            // Output line format: "    SteamPath    REG_SZ    C:/Program Files (x86)/Steam"
            for line in stdout.lines() {
                if let Some(idx) = line.find("REG_SZ") {
                    let val = line[idx + "REG_SZ".len()..].trim();
                    if !val.is_empty() {
                        return Some(PathBuf::from(val.replace('/', "\\")));
                    }
                }
            }
            None
        });

    if let Some(ref steam_dir) = primary_steam {
        if steam_dir.exists() {
            libs.push(steam_dir.clone());
        }
    }

    // Step 2: Parse libraryfolders.vdf for additional Steam library folders.
    let vdf_candidates: Vec<PathBuf> = {
        let mut c = Vec::new();
        if let Some(ref steam_dir) = primary_steam {
            c.push(steam_dir.join("steamapps").join("libraryfolders.vdf"));
            c.push(steam_dir.join("config").join("libraryfolders.vdf"));
        }
        c
    };

    for vdf_path in &vdf_candidates {
        if let Ok(content) = std::fs::read_to_string(vdf_path) {
            // libraryfolders.vdf uses Valve's KeyValue format. We parse "path" values.
            // Format example:
            //   "0"  { "path"  "C:\\Program Files (x86)\\Steam" ... }
            //   "1"  { "path"  "D:\\SteamLibrary" ... }
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with('"') {
                    let lower = trimmed.to_lowercase();
                    if lower.contains("\"path\"") {
                        // Extract the value after the second quoted string
                        let parts: Vec<&str> = trimmed.split('"').collect();
                        // parts: ["", "path", "\t\t", "D:\\SteamLibrary", ""]
                        if parts.len() >= 4 {
                            let path_str = parts[3].replace("\\\\", "\\");
                            let lib_path = PathBuf::from(&path_str);
                            if lib_path.exists() && !libs.iter().any(|p| p == &lib_path) {
                                libs.push(lib_path);
                            }
                        }
                    }
                }
            }
            break; // Only need to parse one successful VDF
        }
    }

    // Step 3: Fallback — scan common default locations.
    let fallback_paths = [
        r"C:\Program Files (x86)\Steam",
        r"C:\Program Files\Steam",
    ];
    for path in &fallback_paths {
        let p = PathBuf::from(path);
        if p.exists() && !libs.iter().any(|l| l == &p) {
            libs.push(p);
        }
    }

    // Also check drive roots for SteamLibrary folders (D:\, E:\, etc.)
    for letter in b'D'..=b'Z' {
        let drive_lib = PathBuf::from(format!("{}:\\SteamLibrary", letter as char));
        if drive_lib.exists() && !libs.iter().any(|l| l == &drive_lib) {
            libs.push(drive_lib);
        }
    }

    println!("[INFO] [ASE Mod Manager] Discovered {} Steam library path(s)", libs.len());
    for lib in &libs {
        println!("[INFO] [ASE Mod Manager]   - {:?}", lib);
    }

    libs
}

/// Search all Steam library paths for the given mod's .mod file and assets folder
/// inside `steamapps/common/ARK/ShooterGame/Content/Mods/`.
fn find_ase_mod_in_steam_libraries(workshop_id: &str) -> Option<SteamModSource> {
    let libs = find_steam_library_paths();

    for lib_path in &libs {
        let mods_dir = lib_path
            .join("steamapps")
            .join("common")
            .join("ARK")
            .join("ShooterGame")
            .join("Content")
            .join("Mods");

        let mod_file = mods_dir.join(format!("{}.mod", workshop_id));
        let assets_dir = mods_dir.join(workshop_id);

        if mod_file.exists() {
            println!(
                "[INFO] [ASE Mod Manager] Found .mod file at {:?}",
                mod_file
            );
            // Assets folder is optional — some mods only have the .mod descriptor
            return Some(SteamModSource {
                mod_file,
                assets_dir,
            });
        }
    }

    println!(
        "[WARN] [ASE Mod Manager] No .mod file found for workshop id {} in any Steam library",
        workshop_id
    );
    None
}

impl AseModManager {
    pub async fn download_mod_with_retry(
        _app_handle: &AppHandle,
        server_id: i64,
        workshop_id: &str,
        mod_name: &str,
        _state: &State<'_, AppState>,
        _retries: u32,
    ) -> Result<AseInstalledMod, String> {
        let app_dir = _app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
        let steamcmd_exe = app_dir.join("steamcmd").join("steamcmd.exe");
        if !steamcmd_exe.exists() {
            return Err("steamcmd.exe not found. Please install SteamCMD in settings.".to_string());
        }

        let install_path: String = {
            let db = _state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            conn.query_row(
                "SELECT install_path FROM ase_servers WHERE id = ?1",
                [server_id],
                |row| row.get(0)
            ).map_err(|e| format!("Failed to find server install path: {}", e))?
        };

        let download_dir = app_dir.join("steamcmd")
            .join("steamapps")
            .join("workshop")
            .join("content")
            .join("346110")
            .join(workshop_id);

        let mut success = false;
        let mut last_err = String::new();

        for attempt in 1..=(_retries.max(1)) {
            println!("[INFO] [ASE Mod Manager] Downloading mod {} (attempt {}/{})", workshop_id, attempt, _retries);
            
            let output = tokio::process::Command::new(&steamcmd_exe)
                .args(&[
                    "+login", "anonymous",
                    "+workshop_download_item", "346110", workshop_id, "validate",
                    "+quit"
                ])
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .output()
                .await;

            // Check if download directory exists and has any content (SteamCMD never puts .mod files here)
            if download_dir.exists() {
                let has_content = std::fs::read_dir(&download_dir)
                    .map(|rd| rd.flatten().next().is_some())
                    .unwrap_or(false);
                
                if has_content {
                    println!("[INFO] [ASE Mod Manager] Found downloaded mod content for workshop id {}", workshop_id);
                    success = true;
                    break;
                }
            }

            match output {
                Ok(out) => {
                    if out.status.success() {
                        let stdout_str = String::from_utf8_lossy(&out.stdout);
                        if stdout_str.contains("Success. Downloaded item") || stdout_str.contains("Finished Downloading Item") {
                            println!("[INFO] [ASE Mod Manager] SteamCMD reported success for mod {}", workshop_id);
                            if download_dir.exists() {
                                success = true;
                                break;
                            }
                        }
                        last_err = format!("SteamCMD reported success but files were not found: {}", stdout_str);
                    } else {
                        last_err = format!("SteamCMD exited with status {}", out.status);
                    }
                }
                Err(e) => {
                    last_err = format!("Failed to execute SteamCMD: {}", e);
                }
            }
            
            // Wait 2 seconds before retrying
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        }

        if !success {
            return Err(format!("Failed to download mod {} after {} retries: {}", workshop_id, _retries, last_err));
        }

        // Ensure target directory exists
        let mods_parent_dir = PathBuf::from(&install_path).join("ShooterGame").join("Content").join("Mods");
        if !mods_parent_dir.exists() {
            std::fs::create_dir_all(&mods_parent_dir).map_err(|e| format!("Failed to create mods parent dir: {}", e))?;
        }

        // --- Source .mod file and assets from the Steam game client installation ---
        // SteamCMD only downloads raw workshop content. The .mod descriptor file is
        // generated exclusively by the Steam game client (ARK: Survival Evolved) and
        // lives in: <SteamLibrary>/steamapps/common/ARK/ShooterGame/Content/Mods/
        let steam_source = find_ase_mod_in_steam_libraries(workshop_id);

        if let Some(ref source) = steam_source {
            // Copy .mod file from the Steam client path
            let target_mod_file = mods_parent_dir.join(format!("{}.mod", workshop_id));
            std::fs::copy(&source.mod_file, &target_mod_file)
                .map_err(|e| format!("Failed to copy .mod file to server: {}", e))?;
            println!("[INFO] [ASE Mod Manager] Copied .mod file from Steam client: {:?} -> {:?}", source.mod_file, target_mod_file);

            // Copy assets folder from the Steam client path if it exists
            let target_assets_dir = mods_parent_dir.join(workshop_id);
            if target_assets_dir.exists() {
                let _ = std::fs::remove_dir_all(&target_assets_dir);
            }

            if source.assets_dir.exists() && source.assets_dir.is_dir() {
                std::fs::create_dir_all(&target_assets_dir)
                    .map_err(|e| format!("Failed to create target assets dir: {}", e))?;
                copy_dir_all(&source.assets_dir, &target_assets_dir)
                    .map_err(|e| format!("Failed to copy mod assets from Steam client: {}", e))?;
                println!("[INFO] [ASE Mod Manager] Copied mod assets from Steam client: {:?}", source.assets_dir);
            } else {
                // Steam client has the .mod file but no separate assets folder;
                // fall back to copying from the SteamCMD workshop download.
                std::fs::create_dir_all(&target_assets_dir)
                    .map_err(|e| format!("Failed to create target assets dir: {}", e))?;
                Self::copy_workshop_assets(&download_dir, &target_assets_dir, workshop_id)?;
            }
        } else {
            // No .mod file found in any Steam library.
            // Still copy workshop assets so the user only needs to provide the .mod file later.
            let target_assets_dir = mods_parent_dir.join(workshop_id);
            if target_assets_dir.exists() {
                let _ = std::fs::remove_dir_all(&target_assets_dir);
            }
            std::fs::create_dir_all(&target_assets_dir)
                .map_err(|e| format!("Failed to create target assets dir: {}", e))?;
            Self::copy_workshop_assets(&download_dir, &target_assets_dir, workshop_id)?;

            return Err(format!(
                "Mod workshop content downloaded successfully, but no .mod descriptor file was found.\n\
                 \n\
                 This file is generated by the ARK game client, not by SteamCMD.\n\
                 \n\
                 To fix this:\n\
                 1. Open Steam and subscribe to this mod (Workshop ID: {})\n\
                 2. Launch ARK: Survival Evolved on this PC at least once (Host/Local)\n\
                 3. Wait for the mod to finish downloading in the Steam client\n\
                 4. Retry the mod installation in this manager\n\
                 \n\
                 The .mod file should appear in your Steam library at:\n\
                 <SteamLibrary>\\steamapps\\common\\ARK\\ShooterGame\\Content\\Mods\\{}.mod",
                workshop_id, workshop_id
            ));
        }

        // Insert/update in database
        let now = chrono::Utc::now().to_rfc3339();
        let next_load_order;
        
        {
            let db = _state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            
            let max_load_order: i32 = conn.query_row(
                "SELECT COALESCE(MAX(load_order), -1) FROM ase_mods WHERE server_id = ?1",
                [server_id],
                |row| row.get(0)
            ).unwrap_or(-1);
            
            next_load_order = max_load_order + 1;

            let exists: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM ase_mods WHERE server_id = ?1 AND workshop_id = ?2)",
                rusqlite::params![server_id, workshop_id],
                |row| row.get(0),
            ).unwrap_or(false);

            if exists {
                conn.execute(
                    "UPDATE ase_mods SET name = ?1, installed_at = ?2, enabled = 1 WHERE server_id = ?3 AND workshop_id = ?4",
                    rusqlite::params![mod_name, now, server_id, workshop_id]
                ).map_err(|e| format!("Failed to update existing mod record: {}", e))?;
            } else {
                conn.execute(
                    "INSERT INTO ase_mods (server_id, workshop_id, name, version, installed_at, enabled, load_order)
                     VALUES (?1, ?2, ?3, '1.0', ?4, 1, ?5)",
                    rusqlite::params![server_id, workshop_id, mod_name, now, next_load_order]
                ).map_err(|e| format!("Failed to insert mod record: {}", e))?;
            }
        }

        Ok(AseInstalledMod {
            id: 0,
            server_id,
            workshop_id: workshop_id.to_string(),
            name: mod_name.to_string(),
            version: "1.0".to_string(),
            installed_at: now,
            enabled: true,
            load_order: next_load_order,
            description: None,
            author: None,
            preview_url: None,
            cached_image_url: None,
            workshop_url: Some(format!("https://steamcommunity.com/sharedfiles/filedetails/?id={}", workshop_id)),
            subscribers: None,
            file_size: None,
            time_updated: None,
            time_created: None,
            tags: None,
            mod_status: Some("installed".to_string()),
            download_status: Some("completed".to_string()),
            health_status: Some("healthy".to_string()),
            dependencies: None,
        })
    }

    /// Copy mod assets from the SteamCMD workshop download folder to the target directory.
    /// Handles WindowsNoEditor layout and flat/mixed folder structures.
    fn copy_workshop_assets(download_dir: &PathBuf, target_assets_dir: &PathBuf, workshop_id: &str) -> Result<(), String> {
        let windows_no_editor_dir = download_dir.join("WindowsNoEditor");
        if windows_no_editor_dir.exists() && windows_no_editor_dir.is_dir() {
            // Correct ASE layout: The contents of WindowsNoEditor go directly into the mod ID folder.
            copy_dir_all(&windows_no_editor_dir, target_assets_dir)
                .map_err(|e| format!("Failed to copy mod assets from WindowsNoEditor: {}", e))?;
        } else {
            // Fallback for differently structured mods
            if let Ok(entries) = std::fs::read_dir(download_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().map(|ext| ext == "mod").unwrap_or(false) {
                        continue;
                    }
                    let file_name = entry.file_name();
                    // If there's a folder named exactly like the workshop ID, copy its contents
                    if path.is_dir() && file_name.to_string_lossy() == workshop_id {
                        copy_dir_all(&path, target_assets_dir)
                            .map_err(|e| format!("Failed to copy mod subdirectory assets: {}", e))?;
                        continue;
                    }

                    let dest = target_assets_dir.join(&file_name);
                    if path.is_dir() {
                        copy_dir_all(&path, &dest)
                            .map_err(|e| format!("Failed to copy mod assets folder {:?}: {}", file_name, e))?;
                    } else {
                        std::fs::copy(&path, &dest)
                            .map_err(|e| format!("Failed to copy mod asset file {:?}: {}", file_name, e))?;
                    }
                }
            }
        }
        println!("[INFO] [ASE Mod Manager] Copied workshop assets to {:?}", target_assets_dir);
        Ok(())
    }

    pub fn update_active_mods(install_path: &str, workshop_id: &str, enable: bool) -> Result<(), String> {
        let config_dir = PathBuf::from(install_path)
            .join("ShooterGame")
            .join("Saved")
            .join("Config")
            .join("WindowsServer");
        let gus_path = config_dir.join("GameUserSettings.ini");
        if !gus_path.exists() {
            return Ok(());
        }

        let content = std::fs::read_to_string(&gus_path)
            .map_err(|e| format!("Failed to read GameUserSettings.ini: {}", e))?;
        let mut gus_doc = IniDocument::parse(&content);

        let existing_active_mods = ini_get_str(&gus_doc, "ServerSettings", "ActiveMods", "");
        let mut mod_ids: Vec<String> = existing_active_mods
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        if enable {
            if !mod_ids.contains(&workshop_id.to_string()) {
                mod_ids.push(workshop_id.to_string());
            }
        } else {
            mod_ids.retain(|id| id != workshop_id);
        }

        let new_active_mods = mod_ids.join(",");
        gus_doc.set_value("ServerSettings", "ActiveMods", &new_active_mods);

        let gus_content = gus_doc.serialize();
        let tmp_path = config_dir.join("GameUserSettings.ini.tmp");
        if let Err(e) = std::fs::write(&tmp_path, &gus_content) {
            println!("[WARNING] Failed to write temporary GameUserSettings.ini during update_active_mods: {}. Falling back to direct write.", e);
            std::fs::write(&gus_path, gus_content)
                .map_err(|err| format!("Failed to write GameUserSettings.ini: {}", err))?;
        } else {
            if let Err(e) = std::fs::rename(&tmp_path, &gus_path) {
                println!("[WARNING] Failed to rename GameUserSettings.ini.tmp during update_active_mods: {}. Falling back to direct write.", e);
                std::fs::write(&gus_path, gus_content)
                    .map_err(|err| format!("Failed to write GameUserSettings.ini: {}", err))?;
            }
        }

        Ok(())
    }

    pub fn sync_ase_mods_to_ini(install_path: &str, enabled_workshop_ids: &[String]) -> Result<(), String> {
        let config_dir = PathBuf::from(install_path)
            .join("ShooterGame")
            .join("Saved")
            .join("Config")
            .join("WindowsServer");
        if !config_dir.exists() {
            std::fs::create_dir_all(&config_dir)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }

        let gus_path = config_dir.join("GameUserSettings.ini");
        let mut gus_doc = if gus_path.exists() {
            let content = std::fs::read_to_string(&gus_path)
                .map_err(|e| format!("Failed to read GameUserSettings.ini: {}", e))?;
            IniDocument::parse(&content)
        } else {
            IniDocument::new()
        };

        let active_mods_val = enabled_workshop_ids.join(",");
        gus_doc.set_value("ServerSettings", "ActiveMods", &active_mods_val);

        let gus_content = gus_doc.serialize();
        let tmp_path = config_dir.join("GameUserSettings.ini.tmp");
        
        if let Err(e) = std::fs::write(&tmp_path, &gus_content) {
            println!("[WARNING] Failed to write temporary GameUserSettings.ini during mod sync: {}. Falling back to direct write.", e);
            std::fs::write(&gus_path, gus_content)
                .map_err(|err| format!("Failed to write GameUserSettings.ini during mod sync: {}", err))?;
        } else {
            if let Err(e) = std::fs::rename(&tmp_path, &gus_path) {
                println!("[WARNING] Failed to rename GameUserSettings.ini.tmp during mod sync: {}. Falling back to direct write.", e);
                std::fs::write(&gus_path, gus_content)
                    .map_err(|err| format!("Failed to write GameUserSettings.ini during mod sync: {}", err))?;
            }
        }
        
        println!("[INFO] [ASE Mod Manager] Synced active mods ({}) to GameUserSettings.ini", active_mods_val);
        Ok(())
    }

    pub async fn clean_failed_download(_app_handle: &AppHandle, workshop_id: &str, _server_id: i64, _state: &State<'_, AppState>) -> Result<(), String> {
        let app_dir = _app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
        let steamcmd_workshop = app_dir.join("steamcmd").join("steamapps").join("workshop");
        
        let content_dir = steamcmd_workshop.join("content").join("346110").join(workshop_id);
        if content_dir.exists() {
            let _ = std::fs::remove_dir_all(&content_dir);
        }

        let download_dir = steamcmd_workshop.join("downloads").join("346110").join(workshop_id);
        if download_dir.exists() {
            let _ = std::fs::remove_dir_all(&download_dir);
        }

        Ok(())
    }

    pub async fn validate_mod(server_id: i64, workshop_id: String, state: &State<'_, AppState>) -> Result<ModValidationReport, String> {
        let install_path: String = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            conn.query_row(
                "SELECT install_path FROM ase_servers WHERE id = ?1",
                [server_id],
                |row| row.get(0)
            ).map_err(|e| format!("Server not found: {}", e))?
        };

        let mods_dir = PathBuf::from(&install_path).join("ShooterGame").join("Content").join("Mods");
        let mod_file = mods_dir.join(format!("{}.mod", workshop_id));
        let mod_folder = mods_dir.join(&workshop_id);

        let mut errors = Vec::new();
        let warnings = Vec::new();
        let mut issues = Vec::new();

        if !mod_file.exists() {
            errors.push(format!("Missing mod descriptor file: {}.mod", workshop_id));
        } else {
            if let Ok(meta) = std::fs::metadata(&mod_file) {
                if meta.len() == 0 {
                    errors.push(format!("Mod descriptor file {}.mod is empty (0 bytes)", workshop_id));
                }
            }
        }

        if !mod_folder.exists() {
            errors.push(format!("Missing mod assets folder: {}", workshop_id));
        } else if !mod_folder.is_dir() {
            errors.push(format!("Mod assets path exists but is not a directory: {}", workshop_id));
        } else {
            if let Ok(entries) = std::fs::read_dir(&mod_folder) {
                if entries.count() == 0 {
                    errors.push(format!("Mod assets folder is empty: {}", workshop_id));
                }
            } else {
                errors.push(format!("Cannot read mod assets folder: {}", workshop_id));
            }
        }

        let is_valid = errors.is_empty();
        if !is_valid {
            issues.extend(errors.clone());
        }

        Ok(ModValidationReport {
            is_valid,
            errors,
            warnings,
            issues,
        })
    }

    pub async fn repair_mod(app_handle: AppHandle, server_id: i64, workshop_id: String, state: &State<'_, AppState>) -> Result<ModValidationReport, String> {
        println!("[INFO] [ASE Mod Manager] Repairing mod {} for server {}", workshop_id, server_id);
        
        let report = Self::validate_mod(server_id, workshop_id.clone(), state).await?;
        if report.is_valid {
            println!("[INFO] [ASE Mod Manager] Mod {} is already healthy", workshop_id);
            return Ok(report);
        }

        let install_path: String = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let conn = db.get_connection().map_err(|e| e.to_string())?;
            conn.query_row(
                "SELECT install_path FROM ase_servers WHERE id = ?1",
                [server_id],
                |row| row.get(0)
            ).map_err(|e| format!("Server not found: {}", e))?
        };

        let mods_dir = PathBuf::from(&install_path).join("ShooterGame").join("Content").join("Mods");
        let mod_file = mods_dir.join(format!("{}.mod", workshop_id));
        let mod_folder = mods_dir.join(&workshop_id);

        if mod_file.exists() {
            let _ = std::fs::remove_file(&mod_file);
        }
        if mod_folder.exists() {
            let _ = std::fs::remove_dir_all(&mod_folder);
        }

        let _ = Self::clean_failed_download(&app_handle, &workshop_id, server_id, state).await;

        let mod_name = format!("Workshop Mod {}", workshop_id);
        let _ = Self::download_mod_with_retry(&app_handle, server_id, &workshop_id, &mod_name, state, 5).await?;

        Self::validate_mod(server_id, workshop_id, state).await
    }
}