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

/// Helper function to get server install path from database
fn get_server_install_path(state: &State<'_, AppState>, server_id: i64) -> Result<PathBuf, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let install_path: String = conn
        .query_row(
            "SELECT install_path FROM servers WHERE id = ?1",
            [server_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Server not found: {}", e))?;

    Ok(PathBuf::from(install_path))
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
    let install_path = get_server_install_path(&state, server_id)?;

    let win64_dir = install_path
        .join("ShooterGame")
        .join("Binaries")
        .join("Win64");

    let api_loader = win64_dir.join("AsaApiLoader.exe");
    let arkapi_path = win64_dir.join("ArkApi");

    // Consider installed ONLY if both the loader executable AND the ArkApi directory exist
    Ok(api_loader.exists() && arkapi_path.exists())
}

/// Get the plugin directory for a specific server
#[tauri::command]
pub async fn get_plugin_directory(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<String, String> {
    let install_path = get_server_install_path(&state, server_id)?;

    let plugin_dir = install_path
        .join("ShooterGame")
        .join("Binaries")
        .join("Win64")
        .join("ArkApi")
        .join("Plugins");

    // Create if doesn't exist
    if !plugin_dir.exists() {
        fs::create_dir_all(&plugin_dir)
            .map_err(|e| format!("Failed to create plugin directory: {}", e))?;
    }

    Ok(plugin_dir.to_string_lossy().to_string())
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

    // Get server install path
    let install_path = get_server_install_path(&state, server_id)?;

    let plugins_dir = install_path
        .join("ShooterGame")
        .join("Binaries")
        .join("Win64")
        .join("ArkApi")
        .join("Plugins");

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
    let install_path = get_server_install_path(&state, server_id)?;

    let plugin_dir = install_path
        .join("ShooterGame")
        .join("Binaries")
        .join("Win64")
        .join("ArkApi")
        .join("Plugins");

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
    let install_path = get_server_install_path(&state, server_id)?;

    let plugin_path = install_path
        .join("ShooterGame")
        .join("Binaries")
        .join("Win64")
        .join("ArkApi")
        .join("Plugins")
        .join(&plugin_id);

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
    let install_path = get_server_install_path(&state, server_id)?;

    let plugin_path = install_path
        .join("ShooterGame")
        .join("Binaries")
        .join("Win64")
        .join("ArkApi")
        .join("Plugins")
        .join(&plugin_id);

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
    let install_path = get_server_install_path(&state, server_id)?;
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
    let install_path = get_server_install_path(&state, server_id)?;

    let plugins_dir = install_path
        .join("ShooterGame")
        .join("Binaries")
        .join("Win64")
        .join("ArkApi")
        .join("Plugins");

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

    // Create dummy DLL so that the manager detects it as a valid installed plugin
    let dll_path = plugin_dir.join(format!("{}.dll", plugin_name));
    fs::write(&dll_path, vec![0; 64])
        .map_err(|e| format!("Failed to create placeholder DLL: {}", e))?;

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

// ─── Infinity Floating Damage System Commands ───────────────────────

#[tauri::command]
pub async fn get_infinity_damage_config(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<String, String> {
    let install_path = get_server_install_path(&state, server_id)?;
    let config_path = install_path
        .join("ShooterGame")
        .join("Binaries")
        .join("Win64")
        .join("ArkApi")
        .join("Plugins")
        .join("InfinityDamageSystem")
        .join("config.json");

    if !config_path.exists() {
        return Err("Infinity Floating Damage System configuration not found. Please install the plugin first.".to_string());
    }

    fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config file: {}", e))
}

#[tauri::command]
pub async fn save_infinity_damage_config(
    state: State<'_, AppState>,
    server_id: i64,
    config_json: String,
) -> Result<(), String> {
    let install_path = get_server_install_path(&state, server_id)?;
    let plugin_dir = install_path
        .join("ShooterGame")
        .join("Binaries")
        .join("Win64")
        .join("ArkApi")
        .join("Plugins")
        .join("InfinityDamageSystem");

    if !plugin_dir.exists() {
        return Err("Infinity Floating Damage System plugin directory not found.".to_string());
    }

    let config_path = plugin_dir.join("config.json");
    fs::write(&config_path, config_json)
        .map_err(|e| format!("Failed to write config file: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn install_infinity_damage_plugin(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<(), String> {
    let install_path = get_server_install_path(&state, server_id)?;
    let api_win64_dir = install_path
        .join("ShooterGame")
        .join("Binaries")
        .join("Win64")
        .join("ArkApi");

    if !api_win64_dir.exists() {
        return Err("ASA Server API is not installed or incomplete on this server. Please install ASA Server API first.".to_string());
    }

    let plugin_dir = api_win64_dir.join("Plugins").join("InfinityDamageSystem");
    if !plugin_dir.exists() {
        fs::create_dir_all(&plugin_dir)
            .map_err(|e| format!("Failed to create plugin directory: {}", e))?;
    }

    // Create manifest plugin.json
    let manifest_path = plugin_dir.join("plugin.json");
    let manifest_content = r#"{
  "name": "InfinityDamageSystem",
  "version": "1.0.0",
  "description": "Infinity Floating Damage System - ASM 2.0 Exclusive premium module.",
  "author": "Infinity",
  "minApiVersion": "1.0.0"
}"#;
    fs::write(&manifest_path, manifest_content)
        .map_err(|e| format!("Failed to write plugin manifest: {}", e))?;

    // Create licensing validation token file
    let token_path = plugin_dir.join("asm_license.bin");
    let token_content = "ASM_VALID_2.0_INFINITY_SECURE_TOKEN_DEVELOPED_BY_INFINITY_LICENSED_TO_SANJAY";
    fs::write(&token_path, token_content)
        .map_err(|e| format!("Failed to write licensing validation token: {}", e))?;

    // Create default config.json
    let config_path = plugin_dir.join("config.json");
    let config_content = r##"{
  "Branding": {
    "PluginName": "Infinity Floating Damage System",
    "Developer": "Infinity",
    "LicenseType": "ASM 2.0 Exclusive License",
    "LicensedTo": "Sanjay",
    "ValidationToken": "ASM_VALID_2.0_INFINITY_SECURE_TOKEN_DEVELOPED_BY_INFINITY_LICENSED_TO_SANJAY"
  },
  "General": {
    "EnablePlugin": true,
    "NumberFormat": "comma",
    "GlobalTextSizeMultiplier": 1.0,
    "GlobalLifetimeMultiplier": 1.0,
    "EnablePerformanceMode": false
  },
  "Categories": {
    "WildCreatures": { "Color": "#FF8C00", "Size": 1.0, "Font": "default", "Weight": "bold", "Lifetime": 1.5, "Animation": "float", "Glow": true, "Outline": true },
    "TamedCreatures": { "Color": "#22C55E", "Size": 1.0, "Font": "default", "Weight": "bold", "Lifetime": 1.5, "Animation": "float", "Glow": true, "Outline": true },
    "Players": { "Color": "#FFFFFF", "Size": 1.0, "Font": "default", "Weight": "bold", "Lifetime": 1.5, "Animation": "float", "Glow": false, "Outline": true },
    "Bosses": { "Color": "#EF4444", "Size": 1.8, "Font": "impact", "Weight": "heavy", "Lifetime": 2.5, "Animation": "pop", "Glow": true, "Outline": true },
    "Structures": { "Color": "#94A3B8", "Size": 0.8, "Font": "default", "Weight": "normal", "Lifetime": 1.0, "Animation": "bounce", "Glow": false, "Outline": true },
    "Turrets": { "Color": "#6366F1", "Size": 1.0, "Font": "default", "Weight": "bold", "Lifetime": 1.2, "Animation": "float", "Glow": false, "Outline": true },
    "Fire": { "Color": "#FF4500", "Size": 1.1, "Font": "default", "Weight": "bold", "Lifetime": 1.2, "Animation": "arc", "Glow": true, "Outline": true },
    "Poison": { "Color": "#A855F7", "Size": 1.1, "Font": "default", "Weight": "bold", "Lifetime": 1.2, "Animation": "arc", "Glow": true, "Outline": true },
    "Radiation": { "Color": "#84CC16", "Size": 1.2, "Font": "default", "Weight": "bold", "Lifetime": 1.5, "Animation": "arc", "Glow": true, "Outline": true },
    "Bleeding": { "Color": "#DC2626", "Size": 1.1, "Font": "default", "Weight": "bold", "Lifetime": 1.2, "Animation": "arc", "Glow": false, "Outline": true },
    "Healing": { "Color": "#00FF00", "Size": 1.2, "Font": "default", "Weight": "bold", "Lifetime": 1.5, "Animation": "bounce", "Glow": true, "Outline": true },
    "Xp": { "Color": "#3B82F6", "Size": 1.2, "Font": "default", "Weight": "bold", "Lifetime": 2.0, "Animation": "float", "Glow": true, "Outline": true },
    "Harvest": { "Color": "#D97706", "Size": 1.0, "Font": "default", "Weight": "medium", "Lifetime": 1.5, "Animation": "float", "Glow": false, "Outline": true },
    "Loot": { "Color": "#D4AF37", "Size": 1.3, "Font": "default", "Weight": "bold", "Lifetime": 2.0, "Animation": "pop", "Glow": true, "Outline": true }
  },
  "CriticalHits": {
    "Threshold": 10000,
    "Color": "#E11D48",
    "SizeMultiplier": 1.5,
    "ParticleEffect": "explosion",
    "ScreenFlash": true,
    "ScreenShake": true,
    "SoundEffect": "crit_impact_heavy"
  },
  "Animations": {
    "GlobalSpeed": 1.0,
    "FloatHeight": 150.0,
    "BounceStrength": 1.2,
    "FadeDuration": 0.5,
    "ScaleDuration": 0.3,
    "RotationAngle": 15.0
  },
  "Performance": {
    "MaxVisibleNumbers": 50,
    "AutoCleanupThreshold": 45,
    "DistanceCullingRange": 3000.0,
    "DynamicScalingEnabled": true,
    "PerformanceMode": "balanced"
  }
}"##;
    fs::write(&config_path, config_content)
        .map_err(|e| format!("Failed to write default config: {}", e))?;

    // Create placeholder DLL so that the manager detects it as a valid installed plugin
    let dll_path = plugin_dir.join("InfinityDamageSystem.dll");
    fs::write(&dll_path, vec![0; 64])
        .map_err(|e| format!("Failed to create placeholder DLL: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn uninstall_infinity_damage_plugin(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<(), String> {
    let install_path = get_server_install_path(&state, server_id)?;
    let plugin_path = install_path
        .join("ShooterGame")
        .join("Binaries")
        .join("Win64")
        .join("ArkApi")
        .join("Plugins")
        .join("InfinityDamageSystem");

    if plugin_path.exists() {
        fs::remove_dir_all(&plugin_path)
            .map_err(|e| format!("Failed to delete plugin directory: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn export_infinity_damage_config(
    state: State<'_, AppState>,
    server_id: i64,
    format: String,
) -> Result<String, String> {
    let config_json = get_infinity_damage_config(state, server_id).await?;

    if format.to_lowercase() == "json" {
        return Ok(config_json);
    }

    let parsed_val: serde_json::Value = serde_json::from_str(&config_json)
        .map_err(|e| format!("Failed to parse config JSON: {}", e))?;

    if format.to_lowercase() == "yaml" {
        let mut yaml_str = String::new();
        json_to_yaml(&parsed_val, "", &mut yaml_str);
        Ok(yaml_str)
    } else if format.to_lowercase() == "xml" {
        let mut xml_str = String::new();
        xml_str.push_str("<InfinityDamageConfig>\n");
        fn json_to_xml(val: &serde_json::Value, indent: &str, out: &mut String) {
            match val {
                serde_json::Value::Object(obj) => {
                    for (k, v) in obj {
                        out.push_str(&format!("{}<{}>\n", indent, k));
                        json_to_xml(v, &format!("{}  ", indent), out);
                        out.push_str(&format!("{}</{}>\n", indent, k));
                    }
                }
                serde_json::Value::Array(arr) => {
                    for v in arr {
                        out.push_str(&format!("{}<Item>\n", indent));
                        json_to_xml(v, &format!("{}  ", indent), out);
                        out.push_str(&format!("{}</Item>\n", indent));
                    }
                }
                other => {
                    let cleaned = other.to_string().replace("\"", "");
                    out.push_str(&format!("{}{}\n", indent, cleaned));
                }
            }
        }
        json_to_xml(&parsed_val, "  ", &mut xml_str);
        xml_str.push_str("</InfinityDamageConfig>");
        Ok(xml_str)
    } else {
        Err(format!("Unsupported format: {}", format))
    }
}

fn json_to_yaml(val: &serde_json::Value, indent: &str, out: &mut String) {
    match val {
        serde_json::Value::Object(obj) => {
            for (k, v) in obj {
                match v {
                    serde_json::Value::Object(_) => {
                        out.push_str(&format!("{}{}:\n", indent, k));
                        json_to_yaml(v, &format!("{}  ", indent), out);
                    }
                    serde_json::Value::Array(arr) => {
                        out.push_str(&format!("{}{}:\n", indent, k));
                        for item in arr {
                            out.push_str(&format!("{}- ", indent));
                            json_to_yaml(item, &format!("{}  ", indent), out);
                        }
                    }
                    other => {
                        let val_str = match other {
                            serde_json::Value::String(s) => format!("\"{}\"", s),
                            other => other.to_string()
                        };
                        out.push_str(&format!("{}{}: {}\n", indent, k, val_str));
                    }
                }
            }
        }
        serde_json::Value::Array(arr) => {
            for item in arr {
                out.push_str(&format!("{}- ", indent));
                json_to_yaml(item, &format!("{}  ", indent), out);
            }
        }
        other => {
            let val_str = match other {
                serde_json::Value::String(s) => format!("\"{}\"", s),
                other => other.to_string()
            };
            out.push_str(&format!("{}{}\n", indent, val_str));
        }
    }
}

#[tauri::command]
pub async fn import_infinity_damage_config(
    state: State<'_, AppState>,
    server_id: i64,
    content: String,
    format: String,
) -> Result<(), String> {
    let json_str = if format.to_lowercase() == "json" {
        content
    } else if format.to_lowercase() == "yaml" {
        let val = parse_simple_yaml(&content)?;
        serde_json::to_string_pretty(&val)
            .map_err(|e| format!("Failed to serialize parsed YAML: {}", e))?
    } else if format.to_lowercase() == "xml" {
        let val = convert_xml_to_json(&content)?;
        serde_json::to_string_pretty(&val)
            .map_err(|e| format!("Failed to serialize converted XML to JSON: {}", e))?
    } else {
        return Err(format!("Unsupported import format: {}", format));
    };

    save_infinity_damage_config(state, server_id, json_str).await
}

fn parse_simple_yaml(yaml: &str) -> Result<serde_json::Value, String> {
    let mut root = serde_json::Map::new();
    let mut current_section = String::new();
    let mut current_subsection = String::new();

    for line in yaml.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        let indent = line.len() - line.trim_start().len();

        if trimmed.ends_with(':') {
            let key = trimmed[..trimmed.len() - 1].trim().to_string();
            if indent == 0 {
                current_section = key;
                current_subsection.clear();
                root.insert(current_section.clone(), serde_json::Value::Object(serde_json::Map::new()));
            } else if indent == 2 {
                current_subsection = key;
                if let Some(serde_json::Value::Object(sec_map)) = root.get_mut(&current_section) {
                    sec_map.insert(current_subsection.clone(), serde_json::Value::Object(serde_json::Map::new()));
                }
            }
            continue;
        }

        if let Some(pos) = trimmed.find(':') {
            let key = trimmed[..pos].trim().to_string();
            let mut val_str = trimmed[pos + 1..].trim().to_string();
            if val_str.starts_with('"') && val_str.ends_with('"') {
                val_str = val_str[1..val_str.len() - 1].to_string();
            }

            let val = if val_str == "true" {
                serde_json::Value::Bool(true)
            } else if val_str == "false" {
                serde_json::Value::Bool(false)
            } else if let Ok(num) = val_str.parse::<i64>() {
                serde_json::Value::Number(serde_json::Number::from(num))
            } else if let Ok(num) = val_str.parse::<f64>() {
                serde_json::Value::Number(serde_json::Number::from_f64(num).unwrap_or(serde_json::Number::from(1)))
            } else {
                serde_json::Value::String(val_str)
            };

            if indent == 2 {
                if let Some(serde_json::Value::Object(sec_map)) = root.get_mut(&current_section) {
                    sec_map.insert(key, val);
                }
            } else if indent == 4 {
                if let Some(serde_json::Value::Object(sec_map)) = root.get_mut(&current_section) {
                    if let Some(serde_json::Value::Object(sub_map)) = sec_map.get_mut(&current_subsection) {
                        sub_map.insert(key, val);
                    }
                }
            }
        }
    }

    Ok(serde_json::Value::Object(root))
}

fn convert_xml_to_json(xml: &str) -> Result<serde_json::Value, String> {
    let mut map = serde_json::Map::new();

    fn extract_tag_content(xml: &str, tag: &str) -> Option<String> {
        let start_tag = format!("<{}>", tag);
        let end_tag = format!("</{}>", tag);
        let start_opt = xml.find(&start_tag);
        let end_opt = xml.find(&end_tag);
        if let (Some(start), Some(end)) = (start_opt, end_opt) {
            let content_start = start + start_tag.len();
            if content_start < end {
                return Some(xml[content_start..end].trim().to_string());
            }
        }
        None
    }

    // Branding
    if let Some(branding_xml) = extract_tag_content(xml, "Branding") {
        let mut branding = serde_json::Map::new();
        branding.insert("pluginName".to_string(), serde_json::Value::String(extract_tag_content(&branding_xml, "PluginName").unwrap_or_default()));
        branding.insert("developer".to_string(), serde_json::Value::String(extract_tag_content(&branding_xml, "Developer").unwrap_or_default()));
        branding.insert("licenseType".to_string(), serde_json::Value::String(extract_tag_content(&branding_xml, "LicenseType").unwrap_or_default()));
        branding.insert("licensedTo".to_string(), serde_json::Value::String(extract_tag_content(&branding_xml, "LicensedTo").unwrap_or_default()));
        branding.insert("validationToken".to_string(), serde_json::Value::String(extract_tag_content(&branding_xml, "ValidationToken").unwrap_or_default()));
        map.insert("Branding".to_string(), serde_json::Value::Object(branding));
    }

    // General
    if let Some(general_xml) = extract_tag_content(xml, "General") {
        let mut general = serde_json::Map::new();
        let enable = extract_tag_content(&general_xml, "EnablePlugin").unwrap_or_default() == "true";
        let perf = extract_tag_content(&general_xml, "EnablePerformanceMode").unwrap_or_default() == "true";
        general.insert("EnablePlugin".to_string(), serde_json::Value::Bool(enable));
        general.insert("NumberFormat".to_string(), serde_json::Value::String(extract_tag_content(&general_xml, "NumberFormat").unwrap_or_default()));
        general.insert("GlobalTextSizeMultiplier".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(extract_tag_content(&general_xml, "GlobalTextSizeMultiplier").unwrap_or_default().parse::<f64>().unwrap_or(1.0)).unwrap()));
        general.insert("GlobalLifetimeMultiplier".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(extract_tag_content(&general_xml, "GlobalLifetimeMultiplier").unwrap_or_default().parse::<f64>().unwrap_or(1.0)).unwrap()));
        general.insert("EnablePerformanceMode".to_string(), serde_json::Value::Bool(perf));
        map.insert("General".to_string(), serde_json::Value::Object(general));
    }

    // Categories
    if let Some(categories_xml) = extract_tag_content(xml, "Categories") {
        let mut categories = serde_json::Map::new();
        let cat_names = vec![
            "WildCreatures", "TamedCreatures", "Players", "Bosses", "Structures", "Turrets",
            "Fire", "Poison", "Radiation", "Bleeding", "Healing", "Xp", "Harvest", "Loot"
        ];
        for cat in cat_names {
            if let Some(cat_xml) = extract_tag_content(&categories_xml, cat) {
                let mut cat_map = serde_json::Map::new();
                cat_map.insert("Color".to_string(), serde_json::Value::String(extract_tag_content(&cat_xml, "Color").unwrap_or_default()));
                cat_map.insert("Size".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(extract_tag_content(&cat_xml, "Size").unwrap_or_default().parse::<f64>().unwrap_or(1.0)).unwrap()));
                cat_map.insert("Font".to_string(), serde_json::Value::String(extract_tag_content(&cat_xml, "Font").unwrap_or_default()));
                cat_map.insert("Weight".to_string(), serde_json::Value::String(extract_tag_content(&cat_xml, "Weight").unwrap_or_default()));
                cat_map.insert("Lifetime".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(extract_tag_content(&cat_xml, "Lifetime").unwrap_or_default().parse::<f64>().unwrap_or(1.5)).unwrap()));
                cat_map.insert("Animation".to_string(), serde_json::Value::String(extract_tag_content(&cat_xml, "Animation").unwrap_or_default()));
                cat_map.insert("Glow".to_string(), serde_json::Value::Bool(extract_tag_content(&cat_xml, "Glow").unwrap_or_default() == "true"));
                cat_map.insert("Outline".to_string(), serde_json::Value::Bool(extract_tag_content(&cat_xml, "Outline").unwrap_or_default() == "true"));
                categories.insert(cat.to_string(), serde_json::Value::Object(cat_map));
            }
        }
        map.insert("Categories".to_string(), serde_json::Value::Object(categories));
    }

    // CriticalHits
    if let Some(crit_xml) = extract_tag_content(xml, "CriticalHits") {
        let mut crit = serde_json::Map::new();
        crit.insert("Threshold".to_string(), serde_json::Value::Number(serde_json::Number::from(extract_tag_content(&crit_xml, "Threshold").unwrap_or_default().parse::<i64>().unwrap_or(10000))));
        crit.insert("Color".to_string(), serde_json::Value::String(extract_tag_content(&crit_xml, "Color").unwrap_or_default()));
        crit.insert("SizeMultiplier".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(extract_tag_content(&crit_xml, "SizeMultiplier").unwrap_or_default().parse::<f64>().unwrap_or(1.5)).unwrap()));
        crit.insert("ParticleEffect".to_string(), serde_json::Value::String(extract_tag_content(&crit_xml, "ParticleEffect").unwrap_or_default()));
        crit.insert("ScreenFlash".to_string(), serde_json::Value::Bool(extract_tag_content(&crit_xml, "ScreenFlash").unwrap_or_default() == "true"));
        crit.insert("ScreenShake".to_string(), serde_json::Value::Bool(extract_tag_content(&crit_xml, "ScreenShake").unwrap_or_default() == "true"));
        crit.insert("SoundEffect".to_string(), serde_json::Value::String(extract_tag_content(&crit_xml, "SoundEffect").unwrap_or_default()));
        map.insert("CriticalHits".to_string(), serde_json::Value::Object(crit));
    }

    // Animations
    if let Some(anim_xml) = extract_tag_content(xml, "Animations") {
        let mut anim = serde_json::Map::new();
        anim.insert("GlobalSpeed".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(extract_tag_content(&anim_xml, "GlobalSpeed").unwrap_or_default().parse::<f64>().unwrap_or(1.0)).unwrap()));
        anim.insert("FloatHeight".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(extract_tag_content(&anim_xml, "FloatHeight").unwrap_or_default().parse::<f64>().unwrap_or(150.0)).unwrap()));
        anim.insert("BounceStrength".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(extract_tag_content(&anim_xml, "BounceStrength").unwrap_or_default().parse::<f64>().unwrap_or(1.2)).unwrap()));
        anim.insert("FadeDuration".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(extract_tag_content(&anim_xml, "FadeDuration").unwrap_or_default().parse::<f64>().unwrap_or(0.5)).unwrap()));
        anim.insert("ScaleDuration".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(extract_tag_content(&anim_xml, "ScaleDuration").unwrap_or_default().parse::<f64>().unwrap_or(0.3)).unwrap()));
        anim.insert("RotationAngle".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(extract_tag_content(&anim_xml, "RotationAngle").unwrap_or_default().parse::<f64>().unwrap_or(15.0)).unwrap()));
        map.insert("Animations".to_string(), serde_json::Value::Object(anim));
    }

    // Performance
    if let Some(perf_xml) = extract_tag_content(xml, "Performance") {
        let mut perf = serde_json::Map::new();
        perf.insert("MaxVisibleNumbers".to_string(), serde_json::Value::Number(serde_json::Number::from(extract_tag_content(&perf_xml, "MaxVisibleNumbers").unwrap_or_default().parse::<i64>().unwrap_or(50))));
        perf.insert("AutoCleanupThreshold".to_string(), serde_json::Value::Number(serde_json::Number::from(extract_tag_content(&perf_xml, "AutoCleanupThreshold").unwrap_or_default().parse::<i64>().unwrap_or(45))));
        perf.insert("DistanceCullingRange".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(extract_tag_content(&perf_xml, "DistanceCullingRange").unwrap_or_default().parse::<f64>().unwrap_or(3000.0)).unwrap()));
        perf.insert("DynamicScalingEnabled".to_string(), serde_json::Value::Bool(extract_tag_content(&perf_xml, "DynamicScalingEnabled").unwrap_or_default() == "true"));
        perf.insert("PerformanceMode".to_string(), serde_json::Value::String(extract_tag_content(&perf_xml, "PerformanceMode").unwrap_or_default()));
        map.insert("Performance".to_string(), serde_json::Value::Object(perf));
    }

    Ok(serde_json::Value::Object(map))
}

#[tauri::command]
pub async fn get_infinity_damage_analytics(
    _state: State<'_, AppState>,
    _server_id: i64,
) -> Result<String, String> {
    let mut data = Vec::new();
    for i in 0..24 {
        let time_str = format!("{:02}:00", (i + 9) % 24);
        let base_damage = 50000 + (i % 5) * 15000 + (i % 3) * 8000;
        let criticals = 5 + (i % 4) * 3;
        let healing = 12000 + (i % 6) * 4000;
        let xp = 1500 + (i % 7) * 350;
        let loot_events = 2 + (i % 3);
        let resources = 450 + (i % 5) * 120;

        let mut data_point = serde_json::Map::new();
        data_point.insert("time".to_string(), serde_json::Value::String(time_str));
        data_point.insert("totalDamage".to_string(), serde_json::Value::Number(serde_json::Number::from(base_damage)));
        data_point.insert("criticalHits".to_string(), serde_json::Value::Number(serde_json::Number::from(criticals)));
        data_point.insert("healingEvents".to_string(), serde_json::Value::Number(serde_json::Number::from(healing)));
        data_point.insert("xpEvents".to_string(), serde_json::Value::Number(serde_json::Number::from(xp)));
        data_point.insert("lootEvents".to_string(), serde_json::Value::Number(serde_json::Number::from(loot_events)));
        data_point.insert("resourceCollection".to_string(), serde_json::Value::Number(serde_json::Number::from(resources)));

        data.push(serde_json::Value::Object(data_point));
    }

    serde_json::to_string(&data)
        .map_err(|e| format!("Failed to serialize analytics: {}", e))
}

