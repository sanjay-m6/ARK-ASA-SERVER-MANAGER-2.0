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

/// Check if ASA Server API is installed for a server
#[tauri::command]
pub async fn check_asa_api_installed(
    state: State<'_, AppState>,
    server_id: i64,
) -> Result<bool, String> {
    let install_path = get_server_install_path(&state, server_id)?;

    let arkapi_path = install_path
        .join("ShooterGame")
        .join("Binaries")
        .join("Win64")
        .join("ArkApi");

    Ok(arkapi_path.exists())
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

    // Check extraction - find root content
    // If archive contains a single folder, use that as plugin folder
    let entries: Vec<_> = fs::read_dir(&temp_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .collect();

    let source_dir = if entries.len() == 1 && entries[0].path().is_dir() {
        // Single folder inside - this is the plugin folder
        entries[0].path()
    } else {
        // Files are directly in temp_dir
        temp_dir.clone()
    };

    // Find DLL to get actual plugin name
    let mut dll_name: Option<String> = None;
    if let Ok(files) = fs::read_dir(&source_dir) {
        for entry in files.flatten() {
            if let Some(ext) = entry.path().extension() {
                if ext.to_string_lossy().to_lowercase() == "dll" {
                    dll_name = entry
                        .path()
                        .file_stem()
                        .map(|s| s.to_string_lossy().to_string());
                    break;
                }
            }
        }
    }

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
