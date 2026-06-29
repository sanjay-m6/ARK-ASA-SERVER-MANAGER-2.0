use crate::models::PluginInfo;
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

/// Helper function to dynamically locate the plugins directory (supporting AsaApi or ArkApi)
pub(crate) fn get_api_plugins_dir(install_path: &std::path::Path, server_type: &str) -> Result<PathBuf, String> {
    let win64_dir = install_path
        .join("ShooterGame")
        .join("Binaries")
        .join("Win64");

    if !win64_dir.exists() {
        return Err("Server binaries directory not found. Please install the server first.".to_string());
    }

    // Try AsaApi folder first, then ArkApi folder
    let api_name = if win64_dir.join("AsaApi").exists() {
        "AsaApi"
    } else if win64_dir.join("ArkApi").exists() {
        "ArkApi"
    } else {
        // Fallback default based on server type
        if server_type == "ASA" {
            "AsaApi"
        } else {
            "ArkApi"
        }
    };

    Ok(win64_dir.join(api_name).join("Plugins"))
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
    let (install_path, _server_type) = get_server_install_path(&state, server_id)?;

    let win64_dir = install_path
        .join("ShooterGame")
        .join("Binaries")
        .join("Win64");

    let api_loader = win64_dir.join("AsaApiLoader.exe");
    let arkapi_path = win64_dir.join("ArkApi");
    let asaapi_path = win64_dir.join("AsaApi");

    // Consider installed if both the loader executable AND either directory exist
    Ok(api_loader.exists() && (arkapi_path.exists() || asaapi_path.exists()))
}

/// Get the plugin directory for a specific server
#[tauri::command]
pub async fn get_plugin_directory(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<String, String> {
    let (install_path, server_type) = get_server_install_path(&state, server_id)?;
    let plugins_dir = get_api_plugins_dir(&install_path, &server_type)?;

    // Create if doesn't exist
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

    // Get server install path and type
    let (install_path, server_type) = get_server_install_path(&state, server_id)?;
    let plugins_dir = get_api_plugins_dir(&install_path, &server_type)?;

    // Create plugins directory if it doesn't exist
    if !plugins_dir.exists() {
        fs::create_dir_all(&plugins_dir)
            .map_err(|e| format!("Failed to create plugins directory: {}", e))?;
    }

    // Determine plugin name from archive filename
    let plugin_name = archive_path_buf
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown Plugin".to_string());

    let plugin_id = plugin_name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .collect::<String>();

    // Create temporary extraction directory
    let temp_dir = plugins_dir.join(format!(".{}_temp", plugin_id));
    if temp_dir.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
    }
    fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create temp directory: {}", e))?;

    // Extract based on file extension
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

    // Find the DLL recursively inside extraction directory to locate the actual plugin root.
    // This allows robust importing of plugins with varying zip nesting structures (e.g. ArkShopUI).
    let dll_info = find_plugin_dll_and_dir(&temp_dir);

    let (source_dir, dll_name) = match dll_info {
        Some((dir, name)) => (dir, Some(name)),
        None => {
            // Fallback to checking entries at extraction root if no DLL is found
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

    // Plugin folder name MUST match DLL name (ASA Server API requirement)
    let final_plugin_name = dll_name.clone().unwrap_or(plugin_id.clone());
    let final_plugin_dir = plugins_dir.join(&final_plugin_name);

    // Move extracted content to final location
    if final_plugin_dir.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(format!("Plugin '{}' already exists", final_plugin_name));
    }

    // If source is different from temp, we need to rename
    if source_dir != temp_dir {
        fs::rename(&source_dir, &final_plugin_dir)
            .map_err(|e| format!("Failed to move plugin: {}", e))?;
        let _ = fs::remove_dir_all(&temp_dir);
    } else {
        fs::rename(&temp_dir, &final_plugin_dir)
            .map_err(|e| format!("Failed to move plugin: {}", e))?;
    }

    // Try to read manifest
    let manifest = read_plugin_manifest(&final_plugin_dir);

    println!(
        "✅ Plugin '{}' installed to {:?}",
        final_plugin_name, final_plugin_dir
    );

    Ok(PluginInfo {
        id: final_plugin_name.clone(),
        name: manifest
            .as_ref()
            .and_then(|m| m.name.clone())
            .unwrap_or(final_plugin_name),
        version: manifest.as_ref().and_then(|m| m.version.clone()),
        description: manifest.as_ref().and_then(|m| m.description.clone()),
        author: manifest.as_ref().and_then(|m| m.author.clone()),
        asa_version_compatible: manifest.as_ref().and_then(|m| m.min_api_version.clone()),
        enabled: true,
        install_path: final_plugin_dir,
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
    // RAR support requires native library which is complex to set up
    // Most ASA plugins are distributed as .zip or .7z
    Err("RAR format is not currently supported. Please extract the .rar file manually and re-archive as .zip or .7z".to_string())
}

/// Read plugin manifest from plugin folder
fn read_plugin_manifest(plugin_dir: &PathBuf) -> Option<PluginManifest> {
    // Try common manifest names
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

/// List all installed plugins for a server
#[tauri::command]
pub async fn get_installed_plugins(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<Vec<PluginInfo>, String> {
    let (install_path, server_type) = get_server_install_path(&state, server_id)?;
    let plugin_dir = get_api_plugins_dir(&install_path, &server_type)?;

    if !plugin_dir.exists() {
        return Ok(vec![]);
    }

    let mut plugins = Vec::new();

    let entries =
        fs::read_dir(&plugin_dir).map_err(|e| format!("Failed to read plugin directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir()
            || path
                .file_name()
                .map(|n| n.to_string_lossy().starts_with("."))
                .unwrap_or(false)
        {
            continue;
        }

        let plugin_id = path
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();

        // Check if DLL exists (valid plugin check)
        let dll_path = path.join(format!("{}.dll", plugin_id));
        if !dll_path.exists() {
            // Try to find any DLL
            let has_dll = fs::read_dir(&path)
                .map(|entries| {
                    entries.filter_map(|e| e.ok()).any(|e| {
                        e.path()
                            .extension()
                            .map(|ext| ext.to_string_lossy().to_lowercase() == "dll")
                            .unwrap_or(false)
                    })
                })
                .unwrap_or(false);

            if !has_dll {
                continue; // Not a valid plugin
            }
        }

        // Try to read manifest
        let manifest = read_plugin_manifest(&path);

        // Check if disabled (presence of .disabled file)
        let disabled_marker = path.join(".disabled");
        let enabled = !disabled_marker.exists();

        plugins.push(PluginInfo {
            id: plugin_id.clone(),
            name: manifest
                .as_ref()
                .and_then(|m| m.name.clone())
                .unwrap_or(plugin_id),
            version: manifest.as_ref().and_then(|m| m.version.clone()),
            description: manifest.as_ref().and_then(|m| m.description.clone()),
            author: manifest.as_ref().and_then(|m| m.author.clone()),
            asa_version_compatible: manifest.as_ref().and_then(|m| m.min_api_version.clone()),
            enabled,
            install_path: path,
        });
    }

    // Sort by name
    plugins.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(plugins)
}

/// Uninstall a plugin from a server
#[tauri::command]
pub async fn uninstall_plugin(
    state: State<'_, AppState>,
    server_id: i64,
    plugin_id: String,
) -> Result<(), String> {
    let (install_path, server_type) = get_server_install_path(&state, server_id)?;
    let plugins_dir = get_api_plugins_dir(&install_path, &server_type)?;
    let plugin_path = plugins_dir.join(&plugin_id);

    if !plugin_path.exists() {
        return Err(format!("Plugin '{}' not found", plugin_id));
    }

    fs::remove_dir_all(&plugin_path).map_err(|e| format!("Failed to remove plugin: {}", e))?;

    println!(
        "🗑️ Plugin '{}' uninstalled from server {}",
        plugin_id, server_id
    );

    Ok(())
}

/// Toggle plugin enabled/disabled state
#[tauri::command]
pub async fn toggle_plugin(
    state: State<'_, AppState>,
    server_id: i64,
    plugin_id: String,
    enabled: bool,
) -> Result<(), String> {
    let (install_path, server_type) = get_server_install_path(&state, server_id)?;
    let plugins_dir = get_api_plugins_dir(&install_path, &server_type)?;
    let plugin_path = plugins_dir.join(&plugin_id);

    if !plugin_path.exists() {
        return Err(format!("Plugin '{}' not found", plugin_id));
    }

    let disabled_marker = plugin_path.join(".disabled");

    if enabled {
        // Remove disabled marker if it exists
        if disabled_marker.exists() {
            fs::remove_file(&disabled_marker)
                .map_err(|e| format!("Failed to enable plugin: {}", e))?;
        }
        println!("✅ Plugin '{}' enabled on server {}", plugin_id, server_id);
    } else {
        // Create disabled marker
        fs::write(&disabled_marker, "").map_err(|e| format!("Failed to disable plugin: {}", e))?;
        println!("⏸️ Plugin '{}' disabled on server {}", plugin_id, server_id);
    }

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
        return Err("Server binaries directory not found. Please install the server first.".to_string());
    }

    println!("[ASA-API] Fetching latest AsaApi release from GitHub...");
    
    // Build HTTP client with custom User-Agent
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

        // Find the zip asset URL
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
        // Fallback to standard direct download url if GitHub API rate-limited
        "https://github.com/ArkServerApi/AsaApi/releases/latest/download/AsaApi.zip".to_string()
    };

    println!("[ASA-API] Downloading from: {}", download_url);

    // Download zip package
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

    println!("[ASA-API] Extracting zip directly to Win64 directory: {:?}", win64_dir);
    
    // Extract zip contents
    let target_dir = win64_dir.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes))
            .map_err(|e| format!("Failed to read zip archive: {}", e))?;
        
        archive.extract(&target_dir)
            .map_err(|e| format!("Failed to extract zip archive: {}", e))?;
        
        Ok(())
    }).await
    .map_err(|e| format!("Join error during extraction: {}", e))??;

    println!("[ASA-API] ASA Server API installed successfully!");
    Ok("ASA Server API installed successfully!".to_string())
}

/// Helper function to recursively search for the main plugin DLL and its containing directory.
fn find_plugin_dll_and_dir(dir: &std::path::Path) -> Option<(std::path::PathBuf, String)> {
    if !dir.is_dir() {
        return None;
    }

    // 1. Search for a .dll file in the current directory
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

    // 2. If not found, recursively search subdirectories
    if let Ok(entries) = fs::read_dir(dir) {
        let mut subdirs: Vec<_> = entries
            .flatten()
            .filter(|e| e.path().is_dir())
            .collect();
            
        // Sort subdirectories to ensure deterministic behavior
        subdirs.sort_by_key(|e| e.path());

        for entry in subdirs {
            let path = entry.path();
            // Ignore hidden directories (e.g. starting with .)
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
    let plugins_dir = get_api_plugins_dir(&install_path, &server_type)?;

    if !plugins_dir.exists() {
        fs::create_dir_all(&plugins_dir)
            .map_err(|e| format!("Failed to create plugins directory: {}", e))?;
    }

    let plugin_name = "DefaultPlugin".to_string();
    let plugin_dir = plugins_dir.join(&plugin_name);

    if plugin_dir.exists() {
        return Err("DefaultPlugin already exists".to_string());
    }

    fs::create_dir_all(&plugin_dir)
        .map_err(|e| format!("Failed to create plugin directory: {}", e))?;

    // Create plugin.json manifest
    let manifest_path = plugin_dir.join("plugin.json");
    let manifest_content = r#"{
  "name": "DefaultPlugin",
  "version": "1.0.0",
  "description": "Default ASA Server API plugin template. Example configuration for floating damage numbers custom size, color, and duration.",
  "author": "ServerManager",
  "minApiVersion": "1.0.0"
}"#;
    fs::write(&manifest_path, manifest_content)
        .map_err(|e| format!("Failed to write plugin manifest: {}", e))?;

    // Create config.json template showing float damage settings
    let config_path = plugin_dir.join("config.json");
    let config_content = r##"{
  "Settings": {
    "DamageNumbers": {
      "EnableCustomDamageNumbers": true,
      "TextSize": 1.5,
      "TextColorHex": "#FF0000",
      "DisplayDurationSeconds": 3.0
    }
  }
}"##;
    fs::write(&config_path, config_content)
        .map_err(|e| format!("Failed to write config template: {}", e))?;

    // Create dummy DLL so that the manager detects it as a valid installed plugin (if it doesn't exist)
    let dll_path = plugin_dir.join(format!("{}.dll", plugin_name));
    if !dll_path.exists() {
        fs::write(&dll_path, vec![0; 64])
            .map_err(|e| format!("Failed to create placeholder DLL: {}", e))?;
    }

    Ok(PluginInfo {
        id: plugin_name.clone(),
        name: plugin_name.clone(),
        version: Some("1.0.0".to_string()),
        description: Some("Default ASA Server API plugin template. Example configuration for floating damage numbers custom size, color, and duration.".to_string()),
        author: Some("ServerManager".to_string()),
        asa_version_compatible: Some("1.0.0".to_string()),
        enabled: true,
        install_path: plugin_dir,
    })
}

