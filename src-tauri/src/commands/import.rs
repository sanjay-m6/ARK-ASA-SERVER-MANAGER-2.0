use crate::AppState;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;

#[tauri::command]
pub async fn import_non_dedicated_save(
    state: State<'_, AppState>,
    server_id: i64,
    source_path: String,
    import_type: String, // "file" or "folder"
) -> Result<String, String> {
    // 1. Resolve source and target paths
    let source_buf = PathBuf::from(&source_path);
    if !source_buf.exists() {
        return Err(format!("Source path does not exist: {}", source_path));
    }

    let install_path_str = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db.get_connection().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT install_path FROM servers WHERE id = ?1")
            .map_err(|e| e.to_string())?;

        let path: String = stmt
            .query_row([&server_id], |row| row.get(0))
            .map_err(|e| format!("Server not found: {}", e))?;
        path
    };

    let install_path = PathBuf::from(&install_path_str);
    let saved_arks_dir = install_path
        .join("ShooterGame")
        .join("Saved")
        .join("SavedArks");

    // Ensure SavedArks exists
    if !saved_arks_dir.exists() {
        fs::create_dir_all(&saved_arks_dir).map_err(|e| e.to_string())?;
    }

    // 2. Create Backup
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let backup_dir = saved_arks_dir
        .parent()
        .unwrap()
        .join("Backups")
        .join(format!("PreImport_{}", timestamp));

    if saved_arks_dir
        .read_dir()
        .map(|mut i| i.next().is_some())
        .unwrap_or(false)
    {
        fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
        // Simple backup: copy SavedArks content
        copy_dir_all(&saved_arks_dir, &backup_dir.join("SavedArks")).map_err(|e| e.to_string())?;
    }

    // 3. Perform Import
    if import_type == "file" {
        // Import single .ark file
        if let Some(file_name) = source_buf.file_name() {
            let target_file = saved_arks_dir.join(file_name);
            fs::copy(&source_buf, &target_file).map_err(|e| e.to_string())?;
        } else {
            return Err("Invalid source file name".to_string());
        }
    } else if import_type == "folder" {
        // Import entire folder content
        copy_dir_all(&source_buf, &saved_arks_dir).map_err(|e| e.to_string())?;
    } else {
        return Err("Invalid import type".to_string());
    }

    Ok("Import successful".to_string())
}

// Helper to copy directory recursively
fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(&dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dst.join(entry.file_name()))?;
        } else {
            fs::copy(entry.path(), dst.join(entry.file_name()))?;
        }
    }
    Ok(())
}
