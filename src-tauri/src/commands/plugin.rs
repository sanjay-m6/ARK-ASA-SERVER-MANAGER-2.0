use crate::models::{PluginInfo, PluginScanResult, PluginStatus};
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::State;

/// Plugin manifest structure (from plugin.json or PluginInfo.json inside plugin folder)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    #[serde(alias = "Name")]
    pub name: Option<String>,
    #[serde(alias = "Version")]
    pub version: Option<String>,
    #[serde(alias = "Description")]
    pub description: Option<String>,
    #[serde(alias = "Author")]
    pub author: Option<String>,
    #[serde(alias = "MinApiVersion")]
    pub min_api_version: Option<String>,
}

/// Helper function to get server install path and type from database
pub(crate) fn get_server_install_path(state: &State<'_, AppState>, server_id: i64) -> Result<(PathBuf, String), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    // Try servers table first (primarily ASA or servers configured in main dashboard)
    if let Ok((path, server_type)) = conn.query_row(
        "SELECT install_path, server_type FROM servers WHERE id = ?1",
        [server_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    ) {
        return Ok((PathBuf::from(path), server_type));
    }

    // Try ase_servers table next (ASE module)
    if let Ok(path) = conn.query_row(
        "SELECT install_path FROM ase_servers WHERE id = ?1",
        [server_id],
        |row| row.get::<_, String>(0),
    ) {
        return Ok((PathBuf::from(path), "ASE".to_string()));
    }

    Err(format!("Server {} not found in servers or ase_servers table", server_id))
}

pub(crate) fn get_api_plugins_dir(
    state: &State<'_, AppState>,
    install_path: &std::path::Path,
    server_type: &str,
) -> Result<PathBuf, String> {
    if server_type == "ASA" {
        state.plugin_manager.resolve_plugins_dir(install_path)
    } else {
        let win64_dir = install_path
            .join("ShooterGame")
            .join("Binaries")
            .join("Win64");
        Ok(win64_dir.join("ArkApi").join("Plugins"))
    }
}

/// Scan all plugins for a server — returns full scan result with loader state and launch info
#[tauri::command]
pub async fn scan_plugins(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<PluginScanResult, String> {
    state.plugin_manager.scan_plugins(server_id)
}

/// Check if a specific plugin is installed
#[tauri::command]
pub async fn check_plugin_status(
    state: State<'_, AppState>,
    server_id: i64,
    plugin_name: String,
) -> Result<bool, String> {
    Ok(state
        .plugin_manager
        .check_plugin_status(server_id, &plugin_name))
}

/// Check if ASA Server API is installed for a server
#[tauri::command]
pub async fn check_asa_api_installed(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<bool, String> {
    let (install_path, server_type) = get_server_install_path(&state, server_id)?;

    let win64_dir = install_path
        .join("ShooterGame")
        .join("Binaries")
        .join("Win64");

    if server_type == "ASA" {
        let api_loader = win64_dir.join("AsaApiLoader.exe");
        let asaapi_path = win64_dir.join("AsaApi");
        Ok(api_loader.exists() && asaapi_path.exists())
    } else {
        let api_loader = win64_dir.join("ServerApiLoader.exe");
        let arkapi_path = win64_dir.join("ArkApi");
        Ok(api_loader.exists() && arkapi_path.exists())
    }
}

/// Get the plugin directory for a specific server
#[tauri::command]
pub async fn get_plugin_directory(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<String, String> {
    let (install_path, server_type) = get_server_install_path(&state, server_id)?;
    let plugins_dir = get_api_plugins_dir(&state, &install_path, &server_type)?;

    if !plugins_dir.exists() {
        fs::create_dir_all(&plugins_dir)
            .map_err(|e| format!("Failed to create plugins directory: {}", e))?;
    }

    Ok(plugins_dir.to_string_lossy().to_string())
}

/// Import a plugin from an archive file (ZIP, 7z, RAR)
#[tauri::command]
pub async fn import_plugin_archive(
    state: State<'_, AppState>,
    server_id: i64,
    archive_path: String,
) -> Result<PluginInfo, String> {
    let archive_path_buf = PathBuf::from(&archive_path);

    if !archive_path_buf.exists() {
        return Err("Archive file not found".to_string());
    }

    let (install_path, server_type) = get_server_install_path(&state, server_id)?;
    let plugins_dir = get_api_plugins_dir(&state, &install_path, &server_type)?;

    if !plugins_dir.exists() {
        fs::create_dir_all(&plugins_dir)
            .map_err(|e| format!("Failed to create plugins directory: {}", e))?;
    }

    let plugin_name = archive_path_buf
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown Plugin".to_string());

    let plugin_id = plugin_name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .collect::<String>();

    let temp_dir = plugins_dir.join(format!(".{}_temp", plugin_id));
    if temp_dir.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
    }
    fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create temp directory: {}", e))?;

    let extension = archive_path_buf
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let extract_result = match extension.as_str() {
        "zip" => extract_zip(&archive_path_buf, &temp_dir),
        "7z" => extract_7z(&archive_path_buf, &temp_dir),
        "rar" => extract_rar(&archive_path_buf, &temp_dir),
        _ => Err(format!("Unsupported archive format: .{}", extension)),
    };

    if let Err(e) = extract_result {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(e);
    }

    let dll_info = find_plugin_dll_and_dir(&temp_dir);

    let (source_dir, dll_name) = match dll_info {
        Some((dir, name)) => (dir, Some(name)),
        None => {
            let entries: Vec<_> = fs::read_dir(&temp_dir)
                .map_err(|e| e.to_string())?
                .filter_map(|e| e.ok())
                .collect();
            let dir = if entries.len() == 1 && entries[0].path().is_dir() {
                entries[0].path()
            } else {
                temp_dir.clone()
            };
            (dir, None)
        }
    };

    let final_plugin_name = dll_name.clone().unwrap_or(plugin_id.clone());
    let final_plugin_dir = plugins_dir.join(&final_plugin_name);

    if final_plugin_dir.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(format!("Plugin '{}' already exists", final_plugin_name));
    }

    if source_dir != temp_dir {
        fs::rename(&source_dir, &final_plugin_dir)
            .map_err(|e| format!("Failed to move plugin: {}", e))?;
        let _ = fs::remove_dir_all(&temp_dir);
    } else {
        fs::rename(&temp_dir, &final_plugin_dir)
            .map_err(|e| format!("Failed to move plugin: {}", e))?;
    }

    let manifest = read_plugin_manifest(&final_plugin_dir);

    // Auto-enable the newly imported plugin in the database
    let _ = state.plugin_manager.toggle_plugin(server_id, &final_plugin_name, true);

    println!(
        "✅ Plugin '{}' installed to {:?}",
        final_plugin_name, final_plugin_dir
    );

    Ok(PluginInfo {
        id: final_plugin_name.clone(),
        name: manifest
            .as_ref()
            .and_then(|m| m.name.clone())
            .unwrap_or_else(|| final_plugin_name.clone()),
        folder_name: final_plugin_name,
        version: manifest.as_ref().and_then(|m| m.version.clone()),
        description: manifest.as_ref().and_then(|m| m.description.clone()),
        author: manifest.as_ref().and_then(|m| m.author.clone()),
        enabled: true,
        installed_path: final_plugin_dir.to_string_lossy().to_string(),
        dependencies: vec![],
        last_loaded_at: None,
        status: PluginStatus::Enabled,
        status_message: None,
    })
}

/// Extract ZIP archive
fn extract_zip(archive_path: &PathBuf, dest: &PathBuf) -> Result<(), String> {
    let file = fs::File::open(archive_path).map_err(|e| format!("Failed to open ZIP: {}", e))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Invalid ZIP archive: {}", e))?;

    archive
        .extract(dest)
        .map_err(|e| format!("Failed to extract ZIP: {}", e))?;

    Ok(())
}

/// Extract 7z archive
fn extract_7z(archive_path: &PathBuf, dest: &PathBuf) -> Result<(), String> {
    sevenz_rust::decompress_file(archive_path, dest)
        .map_err(|e| format!("Failed to extract 7z: {}", e))?;
    Ok(())
}

/// Extract RAR archive (not supported - suggest alternatives)
fn extract_rar(_archive_path: &PathBuf, _dest: &PathBuf) -> Result<(), String> {
    Err("RAR format is not currently supported. Please extract the .rar file manually and re-archive as .zip or .7z".to_string())
}

/// Read plugin manifest from plugin folder
fn read_plugin_manifest(plugin_dir: &PathBuf) -> Option<PluginManifest> {
    let manifest_names = ["PluginInfo.json", "plugin.json", "manifest.json"];

    for name in manifest_names {
        let path = plugin_dir.join(name);
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(manifest) = serde_json::from_str::<PluginManifest>(&content) {
                    return Some(manifest);
                }
            }
        }
    }

    None
}

/// Uninstall a plugin from a server
#[tauri::command]
pub async fn uninstall_plugin(
    state: State<'_, AppState>,
    server_id: i64,
    plugin_id: String,
) -> Result<(), String> {
    let (install_path, server_type) = get_server_install_path(&state, server_id)?;
    let plugins_dir = get_api_plugins_dir(&state, &install_path, &server_type)?;
    let plugin_path = plugins_dir.join(&plugin_id);

    if !plugin_path.exists() {
        return Err(format!("Plugin '{}' not found", plugin_id));
    }

    fs::remove_dir_all(&plugin_path).map_err(|e| format!("Failed to remove plugin: {}", e))?;

    // Remove from database
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        let _ = conn.execute(
            "DELETE FROM server_plugins WHERE server_id = ?1 AND folder_name = ?2",
            rusqlite::params![server_id, plugin_id],
        );
    }

    println!(
        "🗑️ Plugin '{}' uninstalled from server {}",
        plugin_id, server_id
    );

    Ok(())
}

/// Toggle plugin enabled/disabled state (DB-backed, no file modifications)
#[tauri::command]
pub async fn toggle_plugin(
    state: State<'_, AppState>,
    server_id: i64,
    folder_name: String,
    enabled: bool,
) -> Result<(), String> {
    state.plugin_manager.toggle_plugin(server_id, &folder_name, enabled)?;

    println!(
        "{} Plugin '{}' {} on server {}",
        if enabled { "✅" } else { "⏸️" },
        folder_name,
        if enabled { "enabled" } else { "disabled" },
        server_id
    );

    Ok(())
}

/// Set all plugins to enabled or disabled for a server
#[tauri::command]
pub async fn set_all_plugins_enabled(
    state: State<'_, AppState>,
    server_id: i64,
    enabled: bool,
) -> Result<(), String> {
    state.plugin_manager.set_all_plugins(server_id, enabled)?;

    println!(
        "🔄 All plugins {} on server {}",
        if enabled { "enabled" } else { "disabled" },
        server_id
    );

    Ok(())
}

/// Open the plugin folder in the system file explorer
#[tauri::command]
pub async fn open_plugin_folder(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<(), String> {
    let (install_path, server_type) = get_server_install_path(&state, server_id)?;
    let plugins_dir = get_api_plugins_dir(&state, &install_path, &server_type)?;

    if !plugins_dir.exists() {
        fs::create_dir_all(&plugins_dir)
            .map_err(|e| format!("Failed to create plugins directory: {}", e))?;
    }

    crate::commands::file_manager::open_in_explorer(plugins_dir.to_string_lossy().to_string())?;

    Ok(())
}

/// Install or update ASA Server API by downloading it from the official GitHub repository releases page.
#[tauri::command]
pub async fn install_asa_api(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<String, String> {
    let (install_path, _) = get_server_install_path(&state, server_id)?;
    let win64_dir = install_path
        .join("ShooterGame")
        .join("Binaries")
        .join("Win64");

    if !win64_dir.exists() {
        fs::create_dir_all(&win64_dir)
            .map_err(|e| format!("Failed to create server binaries directory: {}", e))?;
    }

    println!("[ASA-API] Fetching latest AsaApi release from GitHub...");
    
    let client = reqwest::Client::builder()
        .user_agent("asa-server-manager")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let release_url = "https://api.github.com/repos/ArkServerApi/AsaApi/releases/latest";
    
    let response = client.get(release_url)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to GitHub releases API: {}", e))?;

    let download_url = if response.status().is_success() {
        let release_data: serde_json::Value = response.json()
            .await
            .map_err(|e| format!("Failed to parse GitHub release JSON: {}", e))?;

        let assets = release_data.get("assets")
            .and_then(|a| a.as_array())
            .ok_or_else(|| "No assets found in the latest release".to_string())?;

        let mut found_url = None;
        for asset in assets {
            if let Some(name) = asset.get("name").and_then(|n| n.as_str()) {
                if name.to_lowercase().ends_with(".zip") {
                    if let Some(url) = asset.get("browser_download_url").and_then(|u| u.as_str()) {
                        found_url = Some(url.to_string());
                        break;
                    }
                }
            }
        }
        
        found_url.ok_or_else(|| "Could not find a .zip asset in the latest release".to_string())?
    } else {
        println!("[ASA-API] GitHub API failed (status: {}). Falling back to direct latest download URL...", response.status());
        "https://github.com/ArkServerApi/AsaApi/releases/latest/download/AsaApi.zip".to_string()
    };

    println!("[ASA-API] Downloading from: {}", download_url);

    let download_resp = client.get(&download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download AsaApi zip: {}", e))?;

    if !download_resp.status().is_success() {
        return Err(format!("Failed to download AsaApi zip, status code: {}", download_resp.status()));
    }

    let bytes = download_resp.bytes()
        .await
        .map_err(|e| format!("Failed to get zip bytes: {}", e))?;

    println!("[ASA-API] Extracting zip to Win64 directory (with root folder flattening): {:?}", win64_dir);
    
    let target_dir = win64_dir.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes))
            .map_err(|e| format!("Failed to read zip archive: {}", e))?;
        
        // Find if there is a common root directory in the ZIP
        let mut common_root = None;
        let mut entries = Vec::new();
        for i in 0..archive.len() {
            if let Ok(file) = archive.by_index(i) {
                entries.push(file.name().to_string());
            }
        }

        if !entries.is_empty() {
            let first_path = &entries[0];
            let first_segment = first_path.split('/').next().unwrap_or("");
            if !first_segment.is_empty() && entries.iter().all(|path| {
                path.starts_with(first_segment) && 
                (path.len() == first_segment.len() || path.chars().nth(first_segment.len()) == Some('/'))
            }) {
                common_root = Some(format!("{}/", first_segment));
                println!("[ASA-API] Detected common root folder in zip: '{}'. Flattening extraction...", first_segment);
            }
        }

        for i in 0..archive.len() {
            let mut file = archive.by_index(i)
                .map_err(|e| format!("Failed to read zip entry: {}", e))?;
            
            let file_name = file.name();
            let relative_path = if let Some(ref root) = common_root {
                if file_name == *root || file_name == &root[..root.len() - 1] {
                    continue; // Skip the root directory itself
                }
                file_name.strip_prefix(root).unwrap_or(file_name)
            } else {
                file_name
            };

            let outpath = target_dir.join(relative_path);

            if file.name().ends_with('/') {
                std::fs::create_dir_all(&outpath)
                    .map_err(|e| format!("Failed to create directory: {}", e))?;
            } else {
                if let Some(p) = outpath.parent() {
                    if !p.exists() {
                        std::fs::create_dir_all(p)
                            .map_err(|e| format!("Failed to create parent directory: {}", e))?;
                    }
                }
                let mut outfile = std::fs::File::create(&outpath)
                    .map_err(|e| format!("Failed to create output file: {}", e))?;
                std::io::copy(&mut file, &mut outfile)
                    .map_err(|e| format!("Failed to copy file contents: {}", e))?;
            }
        }
        
        Ok(())
    }).await
    .map_err(|e| format!("Join error during extraction: {}", e))??;

    // Trigger migration/file placements (like copying AsaApi.dll and AsaApi.pdb to root)
    let _ = state.plugin_manager.resolve_plugins_dir(&install_path);
    let _ = state.plugin_manager.sync_api_loader_dlls(server_id);

    println!("[ASA-API] ASA Server API installed successfully!");
    Ok("ASA Server API installed successfully!".to_string())
}

/// Helper function to recursively search for the main plugin DLL and its containing directory.
fn find_plugin_dll_and_dir(dir: &std::path::Path) -> Option<(std::path::PathBuf, String)> {
    if !dir.is_dir() {
        return None;
    }

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext.to_string_lossy().to_lowercase() == "dll" {
                        if let Some(dll_name) = path.file_stem().map(|s| s.to_string_lossy().to_string()) {
                            return Some((dir.to_path_buf(), dll_name));
                        }
                    }
                }
            }
        }
    }

    if let Ok(entries) = fs::read_dir(dir) {
        let mut subdirs: Vec<_> = entries
            .flatten()
            .filter(|e| e.path().is_dir())
            .collect();
            
        subdirs.sort_by_key(|e| e.path());

        for entry in subdirs {
            let path = entry.path();
            if path.file_name().map(|n| n.to_string_lossy().starts_with(".")).unwrap_or(false) {
                continue;
            }
            if let Some(res) = find_plugin_dll_and_dir(&path) {
                return Some(res);
            }
        }
    }

    None
}

/// Create a default plugin template inside the server's Plugins directory
#[tauri::command]
pub async fn create_default_plugin(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<PluginInfo, String> {
    let (install_path, server_type) = get_server_install_path(&state, server_id)?;
    let plugins_dir = get_api_plugins_dir(&state, &install_path, &server_type)?;

    if !plugins_dir.exists() {
        fs::create_dir_all(&plugins_dir)
            .map_err(|e| format!("Failed to create plugins directory: {}", e))?;
    }

    let plugin_name = "AsaCrossChat".to_string();
    let plugin_dir = plugins_dir.join(&plugin_name);

    if plugin_dir.exists() {
        return Err("AsaCrossChat plugin already exists on this server".to_string());
    }

    fs::create_dir_all(&plugin_dir)
        .map_err(|e| format!("Failed to create plugin directory: {}", e))?;

    // Try to find the source directory of AsaCrossChat in the workspace
    let mut source_dir = None;
    let paths_to_try = [
        std::env::current_dir().ok().map(|d| d.join("asa-plugins").join("AsaCrossChat")),
        std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.join("asa-plugins").join("AsaCrossChat"))),
        std::env::current_exe().ok().and_then(|e| e.parent().and_then(|p| p.parent()).and_then(|p| p.parent()).map(|p| p.join("asa-plugins").join("AsaCrossChat"))),
    ];

    for path_opt in paths_to_try {
        if let Some(path) = path_opt {
            if path.exists() && path.is_dir() {
                source_dir = Some(path);
                break;
            }
        }
    }

    if let Some(src) = source_dir {
        // Copy all files from source directory recursively
        fn copy_dir_all(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
            fs::create_dir_all(dst)?;
            for entry in fs::read_dir(src)? {
                let entry = entry?;
                let ty = entry.file_type()?;
                if ty.is_dir() {
                    copy_dir_all(&entry.path(), &dst.join(entry.file_name()))?;
                } else {
                    fs::copy(entry.path(), &dst.join(entry.file_name()))?;
                }
            }
            Ok(())
        }
        copy_dir_all(&src, &plugin_dir)
            .map_err(|e| format!("Failed to copy AsaCrossChat source files: {}", e))?;
    } else {
        // Fallback: Write default files inline if source dir not found
        let manifest_path = plugin_dir.join("PluginInfo.json");
        let manifest_content = r#"{
  "FullName": "AsaCrossChat",
  "Description": "Asynchronous cross-server chat plugin for Ark Survival Ascended maps using a shared MySQL/MariaDB database.",
  "Version": "1.0.0",
  "MinApiVersion": "1.0",
  "UpdateUrl": ""
}"#;
        fs::write(&manifest_path, manifest_content)
            .map_err(|e| format!("Failed to write plugin manifest: {}", e))?;

        let config_path = plugin_dir.join("config.json");
        let config_content = r#"{
  "MySQL": {
    "Host": "localhost",
    "User": "root",
    "Password": "",
    "Database": "ark_chat",
    "Port": 3306
  },
  "General": {
    "FetchChatInterval": 5
  },
  "ServerKey": "Server1"
}"#;
        fs::write(&config_path, config_content)
            .map_err(|e| format!("Failed to write config template: {}", e))?;
    }

    // Always create a placeholder DLL if it wasn't copied, so the manager recognizes it
    let dll_path = plugin_dir.join(format!("{}.dll", plugin_name));
    if !dll_path.exists() {
        fs::write(&dll_path, vec![0; 64])
            .map_err(|e| format!("Failed to create placeholder DLL: {}", e))?;
    }

    // Auto-enable in database
    let _ = state.plugin_manager.toggle_plugin(server_id, &plugin_name, true);

    Ok(PluginInfo {
        id: plugin_name.clone(),
        name: plugin_name.clone(),
        folder_name: plugin_name,
        version: Some("1.0.0".to_string()),
        description: Some("Asynchronous cross-server chat plugin for Ark Survival Ascended maps using a shared MySQL/MariaDB database.".to_string()),
        author: Some("ServerManager".to_string()),
        enabled: true,
        installed_path: plugin_dir.to_string_lossy().to_string(),
        dependencies: vec![],
        last_loaded_at: None,
        status: PluginStatus::Enabled,
        status_message: None,
    })
}

/// Toggle the overall API Loader state for a server (AsaApiLoader.exe vs ArkAscendedServer.exe)
#[tauri::command]
pub async fn toggle_api_loader(
    state: State<'_, AppState>,
    server_id: i64,
    enabled: bool,
) -> Result<(), String> {
    state.plugin_manager.toggle_api_loader(server_id, enabled)
}
