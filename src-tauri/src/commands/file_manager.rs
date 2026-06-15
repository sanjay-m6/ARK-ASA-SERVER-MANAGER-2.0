use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use sysinfo::Disks;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub last_modified: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiskEntry {
    pub name: String,
    pub mount_point: String,
    pub total_space: u64,
    pub available_space: u64,
}


fn resolve_path(path: &str) -> PathBuf {
    let path_buf = PathBuf::from(path);
    if path_buf.is_absolute() {
        path_buf
    } else {
        // Check relative to current working directory
        if let Ok(current_dir) = std::env::current_dir() {
            let direct_path = current_dir.join(&path_buf);
            if direct_path.exists() {
                return direct_path;
            }
            // Check relative to parent directory (e.g., if running from src-tauri in dev)
            if let Some(parent) = current_dir.parent() {
                let parent_path = parent.join(&path_buf);
                if parent_path.exists() {
                    return parent_path;
                }
            }
        }
        path_buf
    }
}

#[tauri::command]
pub fn read_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let resolved = resolve_path(&path);
    let dir_path = resolved.as_path();
    if !dir_path.exists() {
        return Err(format!("Directory does not exist: {}", dir_path.display()));
    }

    let mut entries = Vec::new();
    let read_dir = fs::read_dir(dir_path).map_err(|e| e.to_string())?;

    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;

        let last_modified = metadata
            .modified()
            .unwrap_or_else(|_| std::time::SystemTime::now())
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        entries.push(FileEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(), // Keep original separators for now, Frontend can normalize
            is_dir: metadata.is_dir(),
            size: metadata.len(),
            last_modified,
        });
    }

    // Sort: Directories first, then files
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

#[tauri::command]
pub fn get_disks() -> Result<Vec<DiskEntry>, String> {
    let disks = Disks::new_with_refreshed_list();
    let mut result = Vec::new();

    for disk in &disks {
        result.push(DiskEntry {
            name: disk.name().to_string_lossy().to_string(),
            mount_point: disk.mount_point().to_string_lossy().to_string(),
            total_space: disk.total_space(),
            available_space: disk.available_space(),
        });
    }
    Ok(result)
}

#[tauri::command]
pub fn read_file_content(path: String) -> Result<String, String> {
    let resolved = resolve_path(&path);
    fs::read_to_string(&resolved).map_err(|e| format!("Failed to read file {}: {}", resolved.display(), e))
}

#[tauri::command]
pub fn write_file_content(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_directory(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_item(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_item(path: String) -> Result<(), String> {
    let path = Path::new(&path);
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn open_in_explorer(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let normalized = path.replace("/", "\\");
        let path_obj = Path::new(&normalized);
        if !path_obj.exists() {
            return Err(format!("Path does not exist: {}", normalized));
        }
        let mut cmd = Command::new("explorer");
        #[cfg(target_os = "windows")]
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        cmd.arg(&normalized)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        let path_obj = Path::new(&path);
        if !path_obj.exists() {
            return Err(format!("Path does not exist: {}", path));
        }
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        let path_obj = Path::new(&path);
        if !path_obj.exists() {
            return Err(format!("Path does not exist: {}", path));
        }
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_parent_directory(path: String) -> Result<String, String> {
    let path_buf = PathBuf::from(&path);
    match path_buf.parent() {
        Some(parent) => Ok(parent.to_string_lossy().to_string()),
        None => Ok(path),
    }
}
