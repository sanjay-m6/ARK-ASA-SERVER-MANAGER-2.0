use crate::AppState;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;

/// Maximum recursion depth for directory copies (safety net against infinite loops)
const MAX_COPY_DEPTH: u32 = 20;

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
        .ok_or_else(|| "Could not find parent directory for SavedArks".to_string())?
        .join("Backups")
        .join(format!("PreImport_{}", timestamp));

    if saved_arks_dir
        .read_dir()
        .map(|mut i| i.next().is_some())
        .unwrap_or(false)
    {
        fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
        let backup_target = backup_dir.join("SavedArks");
        copy_dir_safe(&saved_arks_dir, &backup_target)
            .map_err(|e| format!("Backup failed: {}", e))?;
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
        // Import entire folder content (with overlap protection)
        copy_dir_safe(&source_buf, &saved_arks_dir)
            .map_err(|e| format!("Import failed: {}", e))?;
    } else {
        return Err("Invalid import type".to_string());
    }

    Ok("Import successful".to_string())
}

/// Safely copy a directory tree with protection against recursive overlap.
///
/// Canonicalizes both paths and rejects copies where source contains destination
/// or destination contains source. During traversal, any entry that resolves
/// inside the destination is skipped. A hard depth limit prevents runaway recursion.
fn copy_dir_safe(src: &Path, dst: &Path) -> std::io::Result<()> {
    // Canonicalize source; destination may not exist yet, so resolve its parent
    let canon_src = fs::canonicalize(src)?;
    fs::create_dir_all(dst)?;
    let canon_dst = fs::canonicalize(dst)?;

    // CRITICAL: Reject overlapping paths to prevent infinite recursion
    if canon_src.starts_with(&canon_dst) || canon_dst.starts_with(&canon_src) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!(
                "Source and destination paths overlap — aborting to prevent infinite copy.\n  src: {}\n  dst: {}",
                canon_src.display(),
                canon_dst.display()
            ),
        ));
    }

    copy_dir_recursive_safe(&canon_src, &canon_dst, &canon_dst, 0)
}

/// Inner recursive copy with depth tracking and per-entry overlap checks.
fn copy_dir_recursive_safe(
    src: &Path,
    dst: &Path,
    canonical_dst_root: &Path,
    depth: u32,
) -> std::io::Result<()> {
    if depth > MAX_COPY_DEPTH {
        return Err(std::io::Error::other(
            format!(
                "Directory copy exceeded maximum depth of {} — aborting (possible circular structure)",
                MAX_COPY_DEPTH
            ),
        ));
    }

    fs::create_dir_all(dst)?;

    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let entry_path = entry.path();

        // Skip any entry that resolves inside the destination root (symlink safety)
        if let Ok(canon_entry) = fs::canonicalize(&entry_path) {
            if canon_entry.starts_with(canonical_dst_root) {
                println!(
                    "  ⚠️ Skipping overlapping entry: {}",
                    canon_entry.display()
                );
                continue;
            }
        }

        let target = dst.join(entry.file_name());
        let ty = entry.file_type()?;

        if ty.is_dir() {
            copy_dir_recursive_safe(&entry_path, &target, canonical_dst_root, depth + 1)?;
        } else {
            fs::copy(&entry_path, &target)?;
        }
    }

    Ok(())
}
